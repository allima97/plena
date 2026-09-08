import { loadLocal, saveLocal, fetchRemoteState, apiPut, apiRemove } from './persist.js';
import { seedCategories, uid } from './seed.js';
import { todayISO } from '../format.js';

let accounts = $state([]);
let categories = $state([]);
let transactions = $state([]);
let goals = $state([]);
let reportTemplates = $state([]);
let reportHistory = $state([]);
let reportSchedule = $state({ ativo: false, templateId: null, dia: 5, hora: '08:00' });
let alertThresholds = $state({ um: 1, tres: 3, sete: 7 });
let mode = $state(/** @type {'loading'|'api'|'local'} */ ('loading'));
let ready = $state(false);

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
	get goals() {
		return goals;
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
	get mode() {
		return mode;
	},
	get ready() {
		return ready;
	}
};

function snapshot() {
	return {
		finAccounts: accounts,
		finCategories: categories,
		finTransactions: transactions,
		goals,
		reportTemplates,
		reportHistory,
		reportSchedule,
		alertThresholds
	};
}

function persistLocalSnapshot() {
	saveLocal(snapshot());
}

export async function boot() {
	const local = loadLocal();
	if (local) {
		accounts = local.finAccounts || [];
		categories = local.finCategories || [];
		transactions = local.finTransactions || [];
		goals = local.goals || [];
		reportTemplates = local.reportTemplates || [];
		reportHistory = local.reportHistory || [];
		reportSchedule = local.reportSchedule || { ativo: false, templateId: null, dia: 5, hora: '08:00' };
		alertThresholds = local.alertThresholds || { um: 1, tres: 3, sete: 7 };
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
		goals = remote.goals || goals;
		reportTemplates = remote.reportTemplates || reportTemplates;
		reportHistory = remote.reportHistory || reportHistory;
		reportSchedule = remote.reportSchedule || reportSchedule;
		alertThresholds = remote.alertThresholds || alertThresholds;
	}
	mode = 'api';
	persistLocalSnapshot();
}

function write(collection, id, data) {
	persistLocalSnapshot();
	if (mode === 'api') apiPut(collection, id, data);
}

function erase(collection, id) {
	persistLocalSnapshot();
	if (mode === 'api') apiRemove(collection, id);
}

// ---- categorias --------------------------------------------------------

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
	// Guard against month-length overflow (e.g. dia 31 + 1 mês em mês de 30 dias):
	// Date() já rola para o mês seguinte sozinho, o que é o comportamento aceitável aqui.
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

/**
 * Cria um lançamento único, um parcelamento (N parcelas mensais) ou uma
 * série recorrente (N meses), gerando desde já todas as ocorrências futuras.
 * @param {object} base dados comuns (tipo, valor, data, descricao, categoriaId, subcategoriaId, contaId, formaPagamento)
 * @param {'unica'|'parcelado'|'recorrente'} schedule
 * @param {number} count parcelas (parcelado) ou meses a gerar (recorrente)
 */
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

export function setPaymentStatus(id, status) {
	updateTransaction(id, { statusPagamento: status });
}

/** @param {string} seriesId @param {'pausar'|'retomar'|'cancelar'} action */
export function manageSeries(seriesId, action) {
	const novoStatus = action === 'pausar' ? 'pausada' : action === 'retomar' ? 'ativa' : 'cancelada';
	transactions = transactions.map((t) =>
		t.seriesId === seriesId && t.statusPagamento !== 'pago' ? { ...t, seriesStatus: novoStatus } : t
	);
	transactions.filter((t) => t.seriesId === seriesId).forEach((t) => write('finTransactions', t.id, t));
}

/** Edita todas as ocorrências futuras (não pagas) de uma série de uma vez, sem tocar no histórico já pago. */
export function editSeries(seriesId, data) {
	transactions = transactions.map((t) =>
		t.seriesId === seriesId && t.statusPagamento !== 'pago' ? { ...t, ...data, id: t.id, seriesId: t.seriesId } : t
	);
	transactions.filter((t) => t.seriesId === seriesId).forEach((t) => write('finTransactions', t.id, t));
}

export function seriesOf(seriesId) {
	return transactions.filter((t) => t.seriesId === seriesId).sort((a, b) => a.data.localeCompare(b.data));
}

// ---- objetivos (metas) — mesma ideia do Rumo Financeiro (nextgoals) ------

export function addGoal(data) {
	const goal = { id: uid(), valorAtual: 0, aportes: [], ...data };
	goals = [...goals, goal];
	write('goals', goal.id, goal);
	return goal;
}

export function updateGoal(id, data) {
	const idx = goals.findIndex((g) => g.id === id);
	if (idx === -1) return;
	const updated = { ...goals[idx], ...data, id };
	goals = goals.map((g, i) => (i === idx ? updated : g));
	write('goals', id, updated);
}

export function removeGoal(id) {
	goals = goals.filter((g) => g.id !== id);
	erase('goals', id);
}

export function addAporte(goalId, valor, data = todayISO()) {
	const goal = goals.find((g) => g.id === goalId);
	if (!goal) return;
	const aporte = { id: uid(), valor: Number(valor) || 0, data };
	const updated = {
		...goal,
		aportes: [...(goal.aportes || []), aporte],
		valorAtual: (goal.valorAtual || 0) + aporte.valor
	};
	goals = goals.map((g) => (g.id === goalId ? updated : g));
	write('goals', goalId, updated);
}

export function goalById(id) {
	return goals.find((g) => g.id === id) || null;
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
