// Um formatador por código de moeda (BRL, EUR, USD...), montado sob demanda e reaproveitado --
// fmtMoney(valor) continua formatando em R$ como sempre; passar a moeda de um objetivo estrangeiro
// (ver lib/currency.js) formata no símbolo certo (€, US$...) sem mexer nos ~100 outros usos do app.
const formatters = new Map();
function formatterFor(currency) {
	const code = currency || 'BRL';
	if (!formatters.has(code)) {
		let fmt;
		try {
			fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code });
		} catch {
			// código de moeda inválido/não suportado pelo Intl -- cai pra BRL em vez de quebrar a tela
			fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
		}
		formatters.set(code, fmt);
	}
	return formatters.get(code);
}

export function fmtMoney(v, currency = 'BRL') {
	return formatterFor(currency).format(v || 0);
}

/** @param {string} iso yyyy-mm-dd */
export function fmtDate(iso) {
	if (!iso) return '';
	const [y, m, d] = iso.split('-');
	return `${d}/${m}/${y}`;
}

export function todayISO() {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @param {string} iso yyyy-mm-dd */
export function monthKey(iso) {
	return iso ? iso.slice(0, 7) : '';
}

/**
 * "Mês financeiro" (yyyy-mm) de uma data, respeitando um dia de início custom (Configurações >
 * Geral > "O mês começa no dia"). Com startDay = 1 se comporta exatamente como monthKey (mês de
 * calendário). Com, por exemplo, startDay = 5: o dia 10/09 cai no mês financeiro "2026-09", mas o
 * dia 03/09 ainda pertence ao mês financeiro anterior ("2026-08"), já que o mês de setembro só
 * "começa" no dia 5.
 * @param {string} iso yyyy-mm-dd
 * @param {number} [startDay] 1-28
 */
export function financialMonthKey(iso, startDay = 1) {
	if (!iso) return '';
	const start = Math.min(Math.max(Number(startDay) || 1, 1), 28);
	if (start <= 1) return monthKey(iso);
	const [y, m, d] = iso.split('-').map(Number);
	if (d >= start) return `${y}-${String(m).padStart(2, '0')}`;
	const prev = new Date(y, m - 2, 1); // dia 1 do mês civil anterior
	return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

/** @param {string} iso yyyy-mm-dd */
export function yearKey(iso) {
	return iso ? iso.slice(0, 4) : '';
}

const MESES = [
	'Janeiro',
	'Fevereiro',
	'Março',
	'Abril',
	'Maio',
	'Junho',
	'Julho',
	'Agosto',
	'Setembro',
	'Outubro',
	'Novembro',
	'Dezembro'
];

/** @param {string} monthKeyStr yyyy-mm */
export function monthLabel(monthKeyStr) {
	const [y, m] = monthKeyStr.split('-');
	return `${MESES[Number(m) - 1]} de ${y}`;
}
