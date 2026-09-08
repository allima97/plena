import { fmtDate, fmtMoney } from '../format.js';

/** Filtra lançamentos pelos filtros do centro de relatórios. */
export function filterForReport(transactions, filters) {
	return transactions.filter((t) => {
		if (filters.dataInicio && t.data < filters.dataInicio) return false;
		if (filters.dataFim && t.data > filters.dataFim) return false;
		if (filters.contaId && filters.contaId !== 'all' && t.contaId !== filters.contaId) return false;
		if (filters.categoriaId && filters.categoriaId !== 'all' && t.categoriaId !== filters.categoriaId) return false;
		if (filters.tipo && filters.tipo !== 'all' && t.tipo !== filters.tipo) return false;
		return true;
	});
}

function csvEscape(value) {
	const s = String(value ?? '');
	return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, categories, accounts) {
	const header = [
		'Data',
		'Tipo',
		'Categoria',
		'Subcategoria',
		'Conta',
		'Forma de pagamento',
		'Descrição',
		'Valor',
		'Status',
		'Série'
	];
	const lines = [header.join(';')];
	for (const t of rows) {
		const cat = categories.find((c) => c.id === t.categoriaId);
		const sub = cat?.secundarios?.find((s) => s.id === t.subcategoriaId);
		const acc = accounts.find((a) => a.id === t.contaId);
		const serie = t.seriesId
			? `${t.seriesKind === 'parcelado' ? 'Parcelado' : 'Recorrente'} (${t.parcelaAtual}${t.parcelaTotal ? '/' + t.parcelaTotal : ''}) — ${t.seriesStatus}`
			: '';
		lines.push(
			[
				fmtDate(t.data),
				t.isTransferencia ? 'Transferência' : t.tipo === 'receita' ? 'Receita' : 'Despesa',
				cat?.nome || '',
				sub?.nome || '',
				acc?.nome || '',
				t.formaPagamento || '',
				t.descricao || '',
				(Number(t.valor) || 0).toFixed(2).replace('.', ','),
				t.statusPagamento === 'pago' ? 'Pago' : 'Pendente',
				serie
			]
				.map(csvEscape)
				.join(';')
		);
	}
	return lines.join('\r\n');
}

export function downloadBlob(content, filename, mime) {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportCSV(rows, categories, accounts, filenamePrefix = 'plena-movimentacoes') {
	const csv = toCSV(rows, categories, accounts);
	downloadBlob('﻿' + csv, `${filenamePrefix}-${Date.now()}.csv`, 'text/csv;charset=utf-8');
}

export async function exportPDF(rows, categories, accounts, meta, filenamePrefix = 'plena-relatorio') {
	const { jsPDF } = await import('jspdf');
	const doc = new jsPDF({ unit: 'pt', format: 'a4' });
	const marginX = 40;
	let y = 50;

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(18);
	doc.text('Plena — Relatório de movimentações', marginX, y);
	y += 22;

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(10);
	doc.setTextColor(90, 100, 108);
	if (meta?.periodo) {
		doc.text(meta.periodo, marginX, y);
		y += 14;
	}
	if (meta?.filtrosResumo) {
		doc.text(meta.filtrosResumo, marginX, y);
		y += 18;
	}

	const receitas = rows.filter((r) => r.tipo === 'receita' && !r.isTransferencia).reduce((s, r) => s + (Number(r.valor) || 0), 0);
	const despesas = rows.filter((r) => r.tipo === 'despesa' && !r.isTransferencia).reduce((s, r) => s + (Number(r.valor) || 0), 0);
	doc.setTextColor(23, 33, 43);
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(11);
	doc.text(`Receitas: ${fmtMoney(receitas)}    Despesas: ${fmtMoney(despesas)}    Saldo: ${fmtMoney(receitas - despesas)}`, marginX, y);
	y += 22;

	doc.setDrawColor(220, 226, 224);
	doc.line(marginX, y, 555, y);
	y += 16;

	doc.setFontSize(9);
	const colX = { data: marginX, tipo: 95, cat: 145, desc: 260, conta: 400, valor: 555 };
	doc.setFont('helvetica', 'bold');
	doc.text('Data', colX.data, y);
	doc.text('Tipo', colX.tipo, y);
	doc.text('Categoria', colX.cat, y);
	doc.text('Descrição', colX.desc, y);
	doc.text('Conta', colX.conta, y);
	doc.text('Valor', colX.valor, y, { align: 'right' });
	y += 6;
	doc.line(marginX, y, 555, y);
	y += 12;

	doc.setFont('helvetica', 'normal');
	for (const t of rows) {
		if (y > 780) {
			doc.addPage();
			y = 50;
		}
		const cat = categories.find((c) => c.id === t.categoriaId);
		const acc = accounts.find((a) => a.id === t.contaId);
		doc.text(fmtDate(t.data), colX.data, y);
		doc.text(t.isTransferencia ? 'Transferência' : t.tipo === 'receita' ? 'Receita' : 'Despesa', colX.tipo, y);
		doc.text((cat?.nome || '').slice(0, 20), colX.cat, y);
		doc.text((t.descricao || '').slice(0, 28), colX.desc, y);
		doc.text((acc?.nome || '').slice(0, 16), colX.conta, y);
		doc.setTextColor(t.tipo === 'receita' ? 35 : 224, t.tipo === 'receita' ? 167 : 107, t.tipo === 'receita' ? 104 : 95);
		doc.text(fmtMoney(t.valor), colX.valor, y, { align: 'right' });
		doc.setTextColor(23, 33, 43);
		y += 16;
	}

	doc.save(`${filenamePrefix}-${Date.now()}.pdf`);
}

export function templateToJSON(template) {
	return JSON.stringify({ nome: template.nome, filtros: template.filtros }, null, 2);
}

export function validateImportedTemplate(raw) {
	let data;
	try {
		data = JSON.parse(raw);
	} catch {
		return { error: 'Arquivo inválido: não é um JSON legível.' };
	}
	if (!data || typeof data !== 'object') return { error: 'Arquivo inválido: formato inesperado.' };
	if (typeof data.nome !== 'string' || !data.nome.trim()) return { error: 'Arquivo inválido: falta o nome do modelo.' };
	if (!data.filtros || typeof data.filtros !== 'object') return { error: 'Arquivo inválido: faltam os filtros do modelo.' };
	return { nome: data.nome.trim(), filtros: data.filtros };
}
