import { loadLocal, saveLocal, fetchRemoteState, apiPut, apiRemove, fetchMe } from './persist.js';
import { seedCategories, uid } from './seed.js';
import { todayISO } from '../format.js';

let accounts = $state([]);
let categories = $state([]);
let transactions = $state([]);
let reportTemplates = $state([]);
let reportHistory = $state([]);
let reportSchedule = $state({ ativo: false, templateId: null, dia: 5, hora: '08:00' });
let alertThresholds = $state({ um: 1, tres: 3, sete: 7 });

// ---- objetivos (mesmo modelo de dados do Rumo Financeiro / nextgoals) ----
let goals = $state([]);
let resources = $state([]);
let resourceMoves = $state([]);
let goalCategories = $state([]);
let installments = $state([]);
let amortizations = $state([]);

// ---- patrimonio (fase 4: investimentos manuais + historico mensal de patrimonio liquido) ----
let patrimonyItems = $state([]);
let patrimonySnapshots = $state([]);

// ---- score financeiro: historico mensal (fase P2.6) ----
let scoreSnapshots = $state([]);

let mode = $state(/** @type {'loading'|'api'|'local'} */ ('loading'));
let syncStatus = $state(/** @type {'synced'|'saving'|'error'} */ ('synced'));
let pendingWrites = 0;
let lastFailedOp = /** @type {{collection:string,id:string,data?:any,remove?:boolean}|null} */ (null);
let ready = $state(false);
let user = $state(/** @type {{email:string,name:string|null,logoutUrl:string|null}|null} */ (null));

export const appState = {
	get accounts() {
		return accounts;
	},
	get categories() {
		return categories;
	},
	get transactions() {
		return transactions;
	},
	get reportTemplates() {
		return reportTemplates;
	},
	get reportHistory() {
		return reportHistory;
	},
	get reportSchedule() {
		return reportSchedule;
	},
	get alertThresholds() {
		return alertThresholds;
	},
	get goals() {
		return goals;
	},
	get resources() {
		return resources;
	},
	get resourceMoves() {
		return resourceMoves;
	},
	get goalCategories() {
		return goalCategories;
	},
	get installments() {
		return installments;
	},
	get amortizations() {
		return amortizations;
	},
	get patrimonyItems() {
		return patrimonyItems;
	},
	get patrimonySnapshots() {
		return patrimonySnapshots;
	},
	get scoreSnapshots() {
		return scoreSnapshots;
	},
	get mode() {
		return mode;
	},
	get syncStatus() {
		return syncStatus;
	},
	get ready() {
		return ready;
	},
	get user() {
		return user;
	}
};

function snapshot() {
	return {
		finAccounts: accounts,
		finCategories: categories,
		finTransactions: transactions,
		reportTemplates,
		reportHistory,
		reportSchedule,
		alertThresholds,
		goals,
		resources,
		resourceMoves,
		goalCategories,
		installments,
		amortizations,
		patrimonyItems,
		patrimonySnapshots,
		scoreSnapshots
	};
}

function persistLocalSnapshot() {
	saveLocal(snapshot());
}

export async function boot() {
	fetchMe().then((me) => (user = me));
	const local = loadLocal();
	if (local) {
		accounts = local.finAccounts || [];
		categories = local.finCategories || [];
		transactions = local.finTransactions || [];
		reportTemplates = local.reportTemplates || [];
		reportHistory = local.reportHistory || [];
		reportSchedule = local.reportSchedule || { ativo: false, templateId: null, dia: 5, hora: '08:00' };
		alertThresholds = local.alertThresholds || { um: 1, tres: 3, sete: 7 };
		goals = local.goals || [];
		resources = local.resources || [];
		resourceMoves = local.resourceMoves || [];
		goalCategories = local.goalCategories || [];
		installments = local.installments || [];
		amortizations = local.amortizations || [];
		patrimonyItems = local.patrimonyItems || [];
		patrimonySnapshots = local.patrimonySnapshots || [];
		scoreSnapshots = local.scoreSnapshots || [];
	}
	ready = true;

	const remote = await fetchRemoteState();
	if (!remote) {
		mode = 'local';
		if (!categories.length) {
			categories = seedCategories();
			persistLocalSnapshot();
		}
		return;
	}

	if (!remote.finCategories.length && !remote.finAccounts.length && !remote.finTransactions.length) {
		const seedCats = categories.length ? categories : seedCategories();
		const seedAccounts = accounts;
		const seedTx = transactions;
		await Promise.all([
			...seedCats.map((c) => apiPut('finCategories', c.id, c)),
			...seedAccounts.map((a) => apiPut('finAccounts', a.id, a)),
			...seedTx.map((t) => apiPut('finTransactions', t.id, t))
		]);
		accounts = seedAccounts;
		categories = seedCats;
		transactions = seedTx;
	} else {
		accounts = remote.finAccounts || [];
		categories = remote.finCategories || [];
		transactions = remote.finTransactions || [];
	}
	reportTemplates = remote.reportTemplates || reportTemplates;
	reportHistory = remote.reportHistory || reportHistory;
	reportSchedule = remote.reportSchedule || reportSchedule;
	alertThresholds = remote.alertThresholds || alertThresholds;
	goals = remote.goals || goals;
	resources = remote.resources || resources;
	resourceMoves = remote.resourceMoves || resourceMoves;
	goalCategories = remote.goalCategories || goalCategories;
	installments = remote.installments || installments;
	amortizations = remote.amortizations || amortizations;
	patrimonyItems = remote.patrimonyItems || patrimonyItems;
	patrimonySnapshots = remote.patrimonySnapshots || patrimonySnapshots;
	scoreSnapshots = remote.scoreSnapshots || scoreSnapshots;
	mode = 'api';
	persistLocalSnapshot();
}

function afterSync(ok, opIfFailed) {
	pendingWrites = Math.max(0, pendingWrites - 1);
	if (!ok) lastFailedOp = opIfFailed;
	syncStatus = pendingWrites > 0 ? 'saving' : lastFailedOp ? 'error' : 'synced';
}

function write(collection, id, data) {
	persistLocalSnapshot();
	if (mode !== 'api') return;
	pendingWrites++;
	syncStatus = 'saving';
	apiPut(collection, id, data).then((ok) => afterSync(ok, { collection, id, data }));
}

function erase(collection, id) {
	persistLocalSnapshot();
	if (mode !== 'api') return;
	pendingWrites++;
	syncStatus = 'saving';
	apiRemove(collection, id).then((ok) => afterSync(ok, { collection, id, remove: true }));
}

/** Repete a última escrita/remoção que falhou (botão "Tentar novamente" do indicador de sincronização). */
export function retrySync() {
	if (!lastFailedOp) return;
	const op = lastFailedOp;
	lastFailedOp = null;
	pendingWrites++;
	syncStatus = 'saving';
	const promise = op.remove ? apiRemove(op.collection, op.id) : apiPut(op.collection, op.id, op.data);
	promise.then((ok) => afterSync(ok, op));
}

// ---- categorias (financeiras: receita/despesa) ---------------------------

export function addCategory(tipo, nome) {
	const cat = { id: uid(), tipo, nome: nome.trim(), secundarios: [] };
	categories = [...categories, cat];
	write('finCategories', cat.id, cat);
	return cat;
}

export function renameCategory(id, nome) {
	const cat = categories.find((c) => c.id === id);
	if (!cat) return;
	cat.nome = nome.trim();
	categories = [...categories];
	write('finCategories', id, cat);
}

export function removeCategory(id) {
	categories = categories.filter((c) => c.id !== id);
	erase('finCategories', id);
}

export function addSubcategory(categoriaId, nome) {
	const cat = categories.find((c) => c.id === categoriaId);
	if (!cat) return null;
	const sub = { id: uid(), nome: nome.trim() };
	cat.secundarios = [...cat.secundarios, sub];
	categories = [...categories];
	write('finCategories', categoriaId, cat);
	return sub;
}

export function renameSubcategory(categoriaId, subId, nome) {
	const cat = categories.find((c) => c.id === categoriaId);
	const sub = cat && cat.secundarios.find((s) => s.id === subId);
	if (!sub) return;
	sub.nome = nome.trim();
	categories = [...categories];
	write('finCategories', categoriaId, cat);
}

export function removeSubcategory(categoriaId, subId) {
	const cat = categories.find((c) => c.id === categoriaId);
	if (!cat) return;
	cat.secundarios = cat.secundarios.filter((s) => s.id !== subId);
	categories = [...categories];
	write('finCategories', categoriaId, cat);
}

export function categoryById(id) {
	return categories.find((c) => c.id === id) || null;
}

export function subcategoryName(categoriaId, subId) {
	const cat = categoryById(categoriaId);
	const sub = cat && cat.secundarios.find((s) => s.id === subId);
	return sub ? sub.nome : '';
}

// ---- contas --------------------------------------------------------------

export function addAccount(data) {
	const acc = { id: uid(), ...data };
	accounts = [...accounts, acc];
	write('finAccounts', acc.id, acc);
	return acc;
}

export function updateAccount(id, data) {
	const idx = accounts.findIndex((a) => a.id === id);
	if (idx === -1) return;
	const updated = { ...accounts[idx], ...data, id };
	accounts = accounts.map((a, i) => (i === idx ? updated : a));
	write('finAccounts', id, updated);
}

export function removeAccount(id) {
	accounts = accounts.filter((a) => a.id !== id);
	erase('finAccounts', id);
}

export function accountById(id) {
	return accounts.find((a) => a.id === id) || null;
}

// ---- lançamentos -----------------------------------------------------------

function addMonthsISO(iso, months) {
	const [y, m, d] = iso.split('-').map(Number);
	const date = new Date(y, m - 1 + months, d);
	const pad = (n) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addTransaction(data) {
	const tx = {
		statusPagamento: 'pendente',
		seriesId: null,
		seriesKind: null,
		seriesStatus: null,
		parcelaAtual: null,
		parcelaTotal: null,
		...data,
		id: uid()
	};
	transactions = [...transactions, tx];
	write('finTransactions', tx.id, tx);
	return tx;
}

export function addTransactionSeries(base, schedule, count) {
	if (schedule === 'unica') {
		return [addTransaction(base)];
	}
	const seriesId = uid();
	const total = Math.max(1, Number(count) || 1);
	const created = [];
	for (let i = 0; i < total; i++) {
		const tx = addTransaction({
			...base,
			data: addMonthsISO(base.data, i),
			seriesId,
			seriesKind: schedule,
			seriesStatus: 'ativa',
			parcelaAtual: i + 1,
			parcelaTotal: schedule === 'parcelado' ? total : null
		});
		created.push(tx);
	}
	return created;
}

export function updateTransaction(id, data) {
	const idx = transactions.findIndex((t) => t.id === id);
	if (idx === -1) return;
	const updated = { ...transactions[idx], ...data, id };
	transactions = transactions.map((t, i) => (i === idx ? updated : t));
	write('finTransactions', id, updated);
}

export function removeTransaction(id) {
	transactions = transactions.filter((t) => t.id !== id);
	erase('finTransactions', id);
}

/** Reinsere um lançamento removido (mesmo id e dados), usado pelo "desfazer" do toast de exclusão. */
export function restoreTransaction(tx) {
	transactions = [...transactions, tx];
	write('finTransactions', tx.id, tx);
}

export function setPaymentStatus(id, status) {
	updateTransaction(id, { statusPagamento: status });
}

export function manageSeries(seriesId, action) {
	const novoStatus = action === 'pausar' ? 'pausada' : action === 'retomar' ? 'ativa' : 'cancelada';
	transactions = transactions.map((t) =>
		t.seriesId === seriesId && t.statusPagamento !== 'pago' ? { ...t, seriesStatus: novoStatus } : t
	);
	transactions.filter((t) => t.seriesId === seriesId).forEach((t) => write('finTransactions', t.id, t));
}

export function editSeries(seriesId, data) {
	transactions = transactions.map((t) =>
		t.seriesId === seriesId && t.statusPagamento !== 'pago' ? { ...t, ...data, id: t.id, seriesId: t.seriesId } : t
	);
	transactions.filter((t) => t.seriesId === seriesId).forEach((t) => write('finTransactions', t.id, t));
}

export function seriesOf(seriesId) {
	return transactions.filter((t) => t.seriesId === seriesId).sort((a, b) => a.data.localeCompare(b.data));
}

// ---- transferências entre contas -----------------------------------------
// Duas transações (despesa na origem, receita no destino) ligadas por
// transferId e marcadas com isTransferencia, para não distorcer receitas e
// despesas nos relatórios (ver totals()/byCategory() em derived.js), embora
// cada perna continue afetando o saldo da sua própria conta normalmente.

export function addTransfer({ contaOrigemId, contaDestinoId, valor, data, descricao }) {
	const contaOrigem = accountById(contaOrigemId);
	const contaDestino = accountById(contaDestinoId);
	const transferId = uid();
	const base = {
		valor: Number(valor) || 0,
		data,
		categoriaId: '',
		subcategoriaId: '',
		formaPagamento: null,
		statusPagamento: 'pago',
		isTransferencia: true,
		transferId
	};
	const saida = addTransaction({
		...base,
		tipo: 'despesa',
		contaId: contaOrigemId,
		descricao: descricao?.trim() || `Transferência para ${contaDestino?.nome || 'outra conta'}`
	});
	const entrada = addTransaction({
		...base,
		tipo: 'receita',
		contaId: contaDestinoId,
		descricao: descricao?.trim() || `Transferência de ${contaOrigem?.nome || 'outra conta'}`
	});
	return { saida, entrada };
}

export function transferPairOf(transferId) {
	return transactions.filter((t) => t.transferId === transferId);
}

export function removeTransfer(transferId) {
	transferPairOf(transferId).forEach((t) => removeTransaction(t.id));
}

// ---- relatórios: modelos, histórico e agendamento ------------------------

export function saveReportTemplate(nome, filtros) {
	const tpl = { id: uid(), nome: nome.trim(), filtros };
	reportTemplates = [...reportTemplates, tpl];
	write('reportTemplates', tpl.id, tpl);
	return tpl;
}

export function updateReportTemplate(id, nome, filtros) {
	const idx = reportTemplates.findIndex((t) => t.id === id);
	if (idx === -1) return;
	const updated = { ...reportTemplates[idx], nome: nome.trim(), filtros };
	reportTemplates = reportTemplates.map((t, i) => (i === idx ? updated : t));
	write('reportTemplates', id, updated);
}

export function removeReportTemplate(id) {
	reportTemplates = reportTemplates.filter((t) => t.id !== id);
	erase('reportTemplates', id);
	if (reportSchedule.templateId === id) setReportSchedule({ ...reportSchedule, templateId: null, ativo: false });
}

export function addReportHistory(entry) {
	const item = { id: uid(), criadoEm: new Date().toISOString(), ...entry };
	reportHistory = [item, ...reportHistory].slice(0, 30);
	write('reportHistory', item.id, item);
	return item;
}

export function setReportSchedule(schedule) {
	reportSchedule = { ...reportSchedule, ...schedule };
	persistLocalSnapshot();
	if (mode === 'api') apiPut('reportSchedule', 'singleton', reportSchedule);
}

export function setAlertThresholds(thresholds) {
	alertThresholds = { ...alertThresholds, ...thresholds };
	persistLocalSnapshot();
	if (mode === 'api') apiPut('alertThresholds', 'singleton', alertThresholds);
}

// ============================================================================
// ---- objetivos (Rumo Financeiro / nextgoals, portado por completo) --------
// ============================================================================

export function addGoal(data) {
	const g = { id: uid(), createdAt: new Date().toISOString(), archived: false, ...data };
	goals = [...goals, g];
	write('goals', g.id, g);
	return g;
}

export function updateGoal(id, patch) {
	const idx = goals.findIndex((g) => g.id === id);
	if (idx === -1) return;
	const updated = { ...goals[idx], ...patch, id };
	goals = goals.map((g, i) => (i === idx ? updated : g));
	write('goals', id, updated);
}

/** Apaga o objetivo e tudo que pertence a ele: recursos, movimentações, prestações e amortizações. */
export function removeGoal(id) {
	const resIds = resources.filter((r) => r.goalId === id).map((r) => r.id);
	const moveIds = resourceMoves.filter((m) => resIds.includes(m.resourceId)).map((m) => m.id);
	const instIds = installments.filter((i) => i.goalId === id).map((i) => i.id);
	const amortIds = amortizations.filter((a) => a.goalId === id).map((a) => a.id);

	goals = goals.filter((g) => g.id !== id);
	resources = resources.filter((r) => r.goalId !== id);
	resourceMoves = resourceMoves.filter((m) => !resIds.includes(m.resourceId));
	installments = installments.filter((i) => i.goalId !== id);
	amortizations = amortizations.filter((a) => a.goalId !== id);

	erase('goals', id);
	resIds.forEach((rid) => erase('resources', rid));
	moveIds.forEach((mid) => erase('resourceMoves', mid));
	instIds.forEach((iid) => erase('installments', iid));
	amortIds.forEach((aid) => erase('amortizations', aid));
}

export function goalById(id) {
	return goals.find((g) => g.id === id) || null;
}

// ---- recursos (potes de dinheiro dentro de um objetivo) -------------------

export function addResource(goalId, data, initialBalance = 0) {
	const r = { id: uid(), goalId, createdAt: new Date().toISOString(), name: data.name, group: data.group || 'outros' };
	resources = [...resources, r];
	write('resources', r.id, r);
	const initial = Number(initialBalance) || 0;
	if (initial !== 0) {
		addResourceMove(r.id, goalId, { date: todayISO(), description: 'Saldo inicial', amount: initial });
	}
	return r;
}

export function updateResource(id, patch) {
	const idx = resources.findIndex((r) => r.id === id);
	if (idx === -1) return;
	const updated = { ...resources[idx], ...patch, id };
	resources = resources.map((r, i) => (i === idx ? updated : r));
	write('resources', id, updated);
}

export function removeResource(id) {
	const moveIds = resourceMoves.filter((m) => m.resourceId === id).map((m) => m.id);
	resources = resources.filter((r) => r.id !== id);
	resourceMoves = resourceMoves.filter((m) => m.resourceId !== id);
	erase('resources', id);
	moveIds.forEach((mid) => erase('resourceMoves', mid));
}

export function addResourceMove(resourceId, goalId, data) {
	const m = { id: uid(), resourceId, goalId, categoryId: null, ...data };
	resourceMoves = [...resourceMoves, m];
	write('resourceMoves', m.id, m);
	return m;
}

export function updateResourceMove(id, patch) {
	const idx = resourceMoves.findIndex((m) => m.id === id);
	if (idx === -1) return;
	const updated = { ...resourceMoves[idx], ...patch, id };
	resourceMoves = resourceMoves.map((m, i) => (i === idx ? updated : m));
	write('resourceMoves', id, updated);
}

export function removeResourceMove(id) {
	resourceMoves = resourceMoves.filter((m) => m.id !== id);
	erase('resourceMoves', id);
}

// ---- categorias de movimentações de objetivo (separado das categorias financeiras) ----

export function addGoalCategory(name, countsInPace = true) {
	const c = { id: uid(), name, countsInPace: countsInPace !== false };
	goalCategories = [...goalCategories, c];
	write('goalCategories', c.id, c);
	return c;
}

/** Resolve um nome digitado para o id de uma categoria já existente (case-insensitive), criando se necessário. */
export function resolveGoalCategoryId(name) {
	const trimmed = (name || '').trim();
	if (!trimmed) return null;
	const existing = goalCategories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
	return existing ? existing.id : addGoalCategory(trimmed, true).id;
}

export function goalCategoryName(id) {
	const c = goalCategories.find((x) => x.id === id);
	return c ? c.name : '';
}

// ---- prestações (financiamento) -------------------------------------------

export function addInstallment(goalId, data) {
	const i = { id: uid(), goalId, ...data };
	installments = [...installments, i];
	write('installments', i.id, i);
	adjustRemainingTerm(goalId, -1);
	return i;
}

/** Ajusta "parcelas restantes atualmente" do objetivo (quando o usuário rastreia esse número à
 * mão, por causa de amortizações de prazo que fogem da conta simples parcelas pagas − prazo
 * inicial) sempre que uma prestação é lançada (-1) ou removida (+1, sem passar do prazo inicial). */
function adjustRemainingTerm(goalId, delta) {
	const goal = goals.find((g) => g.id === goalId);
	if (!goal || goal.remainingTermMonths == null) return;
	const max = Number(goal.initialTermMonths) > 0 ? Number(goal.initialTermMonths) : Infinity;
	const next = Math.min(max, Math.max(0, Number(goal.remainingTermMonths) + delta));
	updateGoal(goalId, { remainingTermMonths: next });
}

export function updateInstallment(id, patch) {
	const idx = installments.findIndex((i) => i.id === id);
	if (idx === -1) return;
	const updated = { ...installments[idx], ...patch, id };
	installments = installments.map((i, k) => (k === idx ? updated : i));
	write('installments', id, updated);
}

export function removeInstallment(id) {
	const goalId = installments.find((i) => i.id === id)?.goalId;
	installments = installments.filter((i) => i.id !== id);
	erase('installments', id);
	if (goalId) adjustRemainingTerm(goalId, 1);
}

// ---- amortizações extras (fora do financiamento) --------------------------

export function addAmortization(goalId, data) {
	const a = { id: uid(), goalId, ...data };
	amortizations = [...amortizations, a];
	write('amortizations', a.id, a);
	return a;
}

export function updateAmortization(id, patch) {
	const idx = amortizations.findIndex((a) => a.id === id);
	if (idx === -1) return;
	const updated = { ...amortizations[idx], ...patch, id };
	amortizations = amortizations.map((a, i) => (i === idx ? updated : a));
	write('amortizations', id, updated);
}

export function removeAmortization(id) {
	amortizations = amortizations.filter((a) => a.id !== id);
	erase('amortizations', id);
}

// ---- patrimonio (fase 4: ativos rastreados manualmente + historico mensal) ----

export function addPatrimonyItem(data) {
	const p = { id: uid(), createdAt: new Date().toISOString(), ...data };
	patrimonyItems = [...patrimonyItems, p];
	write('patrimonyItems', p.id, p);
	return p;
}

export function updatePatrimonyItem(id, patch) {
	const idx = patrimonyItems.findIndex((p) => p.id === id);
	if (idx === -1) return;
	const updated = { ...patrimonyItems[idx], ...patch, id };
	patrimonyItems = patrimonyItems.map((p, i) => (i === idx ? updated : p));
	write('patrimonyItems', id, updated);
}

export function removePatrimonyItem(id) {
	patrimonyItems = patrimonyItems.filter((p) => p.id !== id);
	erase('patrimonyItems', id);
}

/** Grava (ou substitui) o retrato do patrimônio líquido do mês `mKey` -- id determinístico
 * para nunca duplicar snapshot do mesmo mês, só atualizar o mais recente conforme o usuário usa o app. */
export function upsertPatrimonySnapshot(mKey, data) {
	const idx = patrimonySnapshots.findIndex((s) => s.id === mKey);
	const updated = { id: mKey, mKey, ...data };
	if (idx === -1) {
		patrimonySnapshots = [...patrimonySnapshots, updated];
	} else {
		if (JSON.stringify(patrimonySnapshots[idx]) === JSON.stringify(updated)) return;
		patrimonySnapshots = patrimonySnapshots.map((s, i) => (i === idx ? updated : s));
	}
	write('patrimonySnapshots', mKey, updated);
}

/** Grava (ou substitui) o retrato do score financeiro do mês `mKey` -- mesmo padrão
 * determinístico de upsertPatrimonySnapshot, para construir o histórico organicamente. */
export function upsertScoreSnapshot(mKey, data) {
	const idx = scoreSnapshots.findIndex((s) => s.id === mKey);
	const updated = { id: mKey, mKey, ...data };
	if (idx === -1) {
		scoreSnapshots = [...scoreSnapshots, updated];
	} else {
		if (JSON.stringify(scoreSnapshots[idx]) === JSON.stringify(updated)) return;
		scoreSnapshots = scoreSnapshots.map((s, i) => (i === idx ? updated : s));
	}
	write('scoreSnapshots', mKey, updated);
}
