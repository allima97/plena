import { validId } from '$lib/server/security.js';
import { salesRecordDeleted, enforceSalesDeletions } from '$lib/server/sales-delete.js';
import { validateSale, validatePlan, validateSaleType } from '$lib/goals/sales.js';
import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { claimLegacyData, dataOwner } from '$lib/server/data-owner.js';
import { syncRecordStatements, runSyncStatements, readSyncRecords } from '$lib/server/sync-records.js';
import { isSyncable, triggerSyncToNextgoals } from '$lib/server/sync.js';

export const prerender = false;

const MAX_DOCUMENT_BYTES = 256 * 1024;
const KNOWN_COLLECTIONS = [
	'finAccounts', 'finCategories', 'finTransactions', 'reportTemplates', 'reportHistory',
	'reportSchedule', 'alertThresholds', 'settings', 'goals', 'resources', 'resourceMoves',
	'goalCategories', 'installments', 'amortizations', 'patrimonyItems', 'patrimonySnapshots',
	'patrimonyItemMoves', 'scoreSnapshots', 'budgetGlobal', 'purchaseInstallments', 'sales',
	'salesPlans', 'salesTypes', 'salesSections'
];

function validDocumentId(id) {
	return validId(id);
}

async function readLimitedJson(request) {
	const contentLength = request.headers.get('content-length');
	if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_DOCUMENT_BYTES)) {
		return { tooLarge: true };
	}
	const reader = request.body?.getReader();
	if (!reader) return { invalid: true };
	const chunks = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_DOCUMENT_BYTES) {
				await reader.cancel();
				return { tooLarge: true };
			}
			chunks.push(value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return { data: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
	} catch {
		return { invalid: true };
	} finally {
		reader.releaseLock();
	}
}

function checkCollection(collection) {
	return KNOWN_COLLECTIONS.includes(collection);
}

/** PUT /api/:collection/:id — grava ou substitui um documento do usuário. */
export async function PUT({ locals, params, request, platform }) {
	const db = env.DB;
	if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
	const owner = dataOwner(locals);
	if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
	if (!checkCollection(params.collection)) return json({ error: 'Coleção desconhecida' }, { status: 400 });
	if (!validDocumentId(params.id)) return json({ error: 'Identificador inválido' }, { status: 400 });

	const parsed = await readLimitedJson(request);
	if (parsed.tooLarge) return json({ error: 'document_too_large' }, { status: 413 });
	if (parsed.invalid || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
		return json({ error: 'Dados inválidos.' }, { status: 400 });
	}
	const data = parsed.data;
	try {
		if (data.id !== undefined && data.id !== params.id) throw new Error('Identificador do documento inválido.');
		if (params.collection === 'sales') validateSale(data);
		if (params.collection === 'salesTypes') {
			validateSaleType(data);
			if (data.id !== params.id) throw new Error('Tipo inválido.');
		}
		if (params.collection === 'salesPlans') {
			validatePlan(data);
			if (data.id !== params.id) throw new Error('Mês da configuração inválido.');
		}
	} catch (error) {
		return json({ error: error.message || 'Dados inválidos.' }, { status: 400 });
	}

	if (await salesRecordDeleted(db, owner, params.collection, params.id, data))
		return json({ error: 'Este controle, tipo ou registro foi excluído. Atualize a tela para continuar.' }, { status: 409 });
	await claimLegacyData(db, owner, env);
	const updatedAt = Date.now();
	if (['salesSections', 'salesTypes', 'sales', 'salesPlans'].includes(params.collection)) {
		await runSyncStatements(db, syncRecordStatements(db, owner, 'owner_email', { collection: params.collection, id: params.id, data, updatedAt }));
	} else {
	await db.prepare(
		'INSERT INTO documents (owner_email, collection, id, data, updated_at) VALUES (?, ?, ?, ?, ?) ' +
			'ON CONFLICT(owner_email, collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
	).bind(owner, params.collection, params.id, JSON.stringify(data), updatedAt).run();
	}

	if (params.collection === 'salesPlans') await enforceSalesDeletions(db, owner, 'owner_email');
	// Dispara sync para o Nextgoals em background (não bloqueia a resposta).
	// A escrita local já foi confirmada acima — o sync é best-effort.
	if (isSyncable(params.collection)) {
		const syncPromise = triggerSyncToNextgoals(db, owner, 'PUT', params.collection, params.id, data, env, updatedAt);
		// Usa waitUntil quando disponível para que o Worker não seja encerrado
		// antes de o fetch de sync completar.
		if (platform?.ctx) platform.ctx.waitUntil(syncPromise);
		else await syncPromise;
	}

	return json({ ok: true });
}

/** DELETE /api/:collection/:id — remove somente o documento do usuário logado. */
export async function DELETE({ locals, params, platform }) {
	const db = env.DB;
	if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
	const owner = dataOwner(locals);
	if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
	if (!checkCollection(params.collection)) return json({ error: 'Coleção desconhecida' }, { status: 400 });
	if (!validDocumentId(params.id)) return json({ error: 'Identificador inválido' }, { status: 400 });

	await claimLegacyData(db, owner, env);
	if (params.collection === 'salesPlans') {
		// Uma meta mensal só pode ser excluída enquanto o mês não tem vendas.
		const records = (await readSyncRecords(db, owner, 'owner_email', ['sales', 'salesPlans'])).filter((record) => !record.deleted);
		const plan = records.find((record) => record.collection === 'salesPlans' && record.id === params.id);
		const month = plan?.data?.month || params.id.split(':').at(-1);
		const sectionId = plan?.data?.sectionId || 'default';
		const hasSales = records.some((record) => record.collection === 'sales' && (record.data.sectionId || 'default') === sectionId && typeof record.data.date === 'string' && record.data.date.slice(0, 7) === month);
		if (hasSales) return json({ error: 'O mês tem vendas. Exclua as vendas antes de excluir a meta.' }, { status: 409 });
	}
	const deletedAt = Date.now();
	if (isSyncable(params.collection)) {
		await runSyncStatements(db, syncRecordStatements(db, owner, 'owner_email', { collection: params.collection, id: params.id, deleted: true, updatedAt: deletedAt }));
	} else {
		await db.batch([
			db.prepare('DELETE FROM documents WHERE owner_email = ? AND collection = ? AND id = ?').bind(owner, params.collection, params.id),
			db.prepare('INSERT INTO sync_tombstones(owner, collection, id, deleted_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner, collection, id) DO UPDATE SET deleted_at = excluded.deleted_at WHERE excluded.deleted_at > sync_tombstones.deleted_at').bind(owner, params.collection, params.id, deletedAt),
		]);
	}

	// Dispara sync em background
	if (isSyncable(params.collection)) {
		const syncPromise = triggerSyncToNextgoals(db, owner, 'DELETE', params.collection, params.id, null, env, deletedAt);
		if (platform?.ctx) platform.ctx.waitUntil(syncPromise);
		else await syncPromise;
	}

	return json({ ok: true });
}
