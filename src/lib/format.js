const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function fmtMoney(v) {
	return BRL.format(v || 0);
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
