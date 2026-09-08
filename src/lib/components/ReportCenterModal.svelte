<script>
	import Modal from './Modal.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import {
		appState,
		saveReportTemplate,
		updateReportTemplate,
		removeReportTemplate,
		addReportHistory,
		setReportSchedule
	} from '$lib/fin/store.svelte.js';
	import { filterForReport, exportCSV, exportPDF, downloadBlob, templateToJSON, validateImportedTemplate } from '$lib/fin/export.js';
	import { fmtDate, monthKey, monthLabel, todayISO } from '$lib/format.js';
	import { Download, FileDown } from 'lucide-svelte';

	let { open, onClose } = $props();

	function monthBounds(mKeyStr) {
		const [y, m] = mKeyStr.split('-').map(Number);
		const last = new Date(y, m, 0).getDate();
		const pad = (n) => String(n).padStart(2, '0');
		return { inicio: `${mKeyStr}-01`, fim: `${mKeyStr}-${pad(last)}` };
	}

	function defaultFilters() {
		const mKeyStr = monthKey(todayISO());
		const b = monthBounds(mKeyStr);
		return { dataInicio: b.inicio, dataFim: b.fim, contaId: 'all', categoriaId: 'all', tipo: 'all' };
	}

	let filters = $state(defaultFilters());
	let selectedMonth = $state(monthKey(todayISO()));
	let templateName = $state('');
	let editingTemplateId = $state(null);
	let confirmDeleteId = $state(null);
	let importError = $state('');

	function onMonthChange(value) {
		selectedMonth = value;
		const b = monthBounds(value);
		filters = { ...filters, dataInicio: b.inicio, dataFim: b.fim };
	}

	const rows = $derived(filterForReport(appState.transactions, filters));

	function submitTemplate() {
		if (!templateName.trim()) return;
		if (editingTemplateId) {
			updateReportTemplate(editingTemplateId, templateName.trim(), filters);
		} else {
			saveReportTemplate(templateName.trim(), filters);
		}
		templateName = '';
		editingTemplateId = null;
	}

	function useTemplate(tpl) {
		filters = { ...tpl.filtros };
	}

	function editTemplate(tpl) {
		editingTemplateId = tpl.id;
		templateName = tpl.nome;
		filters = { ...tpl.filtros };
	}

	function shareTemplate(tpl) {
		downloadBlob(templateToJSON(tpl), `${tpl.nome.replace(/\s+/g, '-').toLowerCase()}.json`, 'application/json');
	}

	async function importFile(e) {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file) return;
		importError = '';
		const text = await file.text();
		const result = validateImportedTemplate(text);
		if (result.error) {
			importError = result.error;
			return;
		}
		saveReportTemplate(result.nome, result.filtros);
	}

	async function doExport(format) {
		if (format === 'CSV') await exportCSV(rows, appState.categories, appState.accounts);
		else
			await exportPDF(rows, appState.categories, appState.accounts, {
				periodo: `Período: ${fmtDate(filters.dataInicio)} a ${fmtDate(filters.dataFim)}`,
				filtrosResumo: `Conta: ${filters.contaId === 'all' ? 'todas' : appState.accounts.find((a) => a.id === filters.contaId)?.nome || '—'} · Categoria: ${filters.categoriaId === 'all' ? 'todas' : appState.categories.find((c) => c.id === filters.categoriaId)?.nome || '—'} · Tipo: ${filters.tipo === 'all' ? 'receitas e despesas' : filters.tipo}`
			});
		addReportHistory({ formato: format, filtros: filters });
	}

	async function reExport(item) {
		filters = { ...item.filtros };
		const reRows = filterForReport(appState.transactions, item.filtros);
		if (item.formato === 'CSV') await exportCSV(reRows, appState.categories, appState.accounts);
		else await exportPDF(reRows, appState.categories, appState.accounts, {});
	}
</script>

<Modal {open} {onClose} eyebrow="centro de relatórios" title="Configurar exportação" subtitle="Escolha filtros, modelos e o agendamento mensal." maxWidth="720px">
	<div class="report-row">
		<label class="field" style="flex:1">
			<span>Usar modelo salvo</span>
			<select class="field-input" onchange={(e) => { const tpl = appState.reportTemplates.find((t) => t.id === e.target.value); if (tpl) useTemplate(tpl); e.target.value=''; }}>
				<option value="">Selecione um modelo...</option>
				{#each appState.reportTemplates as tpl (tpl.id)}
					<option value={tpl.id}>{tpl.nome}</option>
				{/each}
			</select>
		</label>
		<label class="btn btn-ghost import-btn">
			Importar JSON
			<input type="file" accept="application/json,.json" style="display:none" onchange={importFile} />
		</label>
	</div>
	{#if importError}<p class="import-error">{importError}</p>{/if}

	<div class="form-grid" style="margin-top:16px">
		<label class="field">
			<span>Mês de referência</span>
			<input class="field-input" type="month" value={selectedMonth} onchange={(e) => onMonthChange(e.target.value)} />
		</label>
		<label class="field">
			<span>Tipo de movimentação</span>
			<select class="field-input" bind:value={filters.tipo}>
				<option value="all">Receitas e despesas</option>
				<option value="receita">Somente receitas</option>
				<option value="despesa">Somente despesas</option>
			</select>
		</label>
		<label class="field">
			<span>Data inicial</span>
			<input class="field-input" type="date" bind:value={filters.dataInicio} />
		</label>
		<label class="field">
			<span>Data final</span>
			<input class="field-input" type="date" bind:value={filters.dataFim} />
		</label>
		<label class="field">
			<span>Conta</span>
			<select class="field-input" bind:value={filters.contaId}>
				<option value="all">Todas as contas</option>
				{#each appState.accounts as a (a.id)}
					<option value={a.id}>{a.nome}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span>Categoria</span>
			<select class="field-input" bind:value={filters.categoriaId}>
				<option value="all">Todas as categorias</option>
				{#each appState.categories as c (c.id)}
					<option value={c.id}>{c.nome}</option>
				{/each}
			</select>
		</label>
	</div>

	<p class="field-hint" style="margin-top:8px">{rows.length} lançamento(s) correspondem a estes filtros.</p>

	<div class="template-box">
		<div class="report-row">
			<input class="field-input" style="flex:1;min-width:180px" placeholder={editingTemplateId ? 'Editar nome do modelo' : 'Nome do modelo, ex.: Fechamento mensal'} bind:value={templateName} />
			<button class="btn" onclick={submitTemplate}>{editingTemplateId ? 'Atualizar modelo' : 'Salvar modelo'}</button>
		</div>
		{#if appState.reportTemplates.length}
			<div class="template-list">
				{#each appState.reportTemplates as tpl (tpl.id)}
					<div class="template-item">
						<p class="template-name">{tpl.nome}</p>
						<button class="chip-btn green" onclick={() => useTemplate(tpl)}>Usar</button>
						<button class="chip-btn blue" onclick={() => editTemplate(tpl)}>Editar</button>
						<button class="chip-btn purple" onclick={() => shareTemplate(tpl)}>Compartilhar</button>
						<button class="chip-btn red" onclick={() => (confirmDeleteId = tpl.id)}>Excluir</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="schedule-box">
		<div class="schedule-box-head">
			<div>
				<p class="stat-label">Exportação automática mensal</p>
				<p class="field-hint">Configuração local; a execução fora do navegador requer um serviço agendador.</p>
			</div>
			<input type="checkbox" checked={appState.reportSchedule.ativo} onchange={(e) => setReportSchedule({ ativo: e.target.checked })} />
		</div>
		<div class="form-grid" style="margin-top:12px">
			<select class="field-input" value={appState.reportSchedule.templateId ?? ''} onchange={(e) => setReportSchedule({ templateId: e.target.value || null })}>
				<option value="">Modelo do agendamento</option>
				{#each appState.reportTemplates as tpl (tpl.id)}
					<option value={tpl.id}>{tpl.nome}</option>
				{/each}
			</select>
			<input class="field-input" type="number" min="1" max="28" value={appState.reportSchedule.dia} oninput={(e) => setReportSchedule({ dia: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} aria-label="Dia do mês" />
			<input class="field-input" type="time" value={appState.reportSchedule.hora} oninput={(e) => setReportSchedule({ hora: e.target.value })} aria-label="Horário" />
		</div>
	</div>

	{#if appState.reportHistory.length}
		<div class="history-box">
			<p class="stat-label" style="margin-bottom:10px">Histórico de exportações</p>
			<div class="template-list">
				{#each appState.reportHistory.slice(0, 8) as item (item.id)}
					<div class="template-item">
						<span class="badge" class:badge-blue={item.formato === 'PDF'} class:badge-green={item.formato === 'CSV'}>{item.formato}</span>
						<p class="template-name">{new Date(item.criadoEm).toLocaleString('pt-BR')}</p>
						<button class="chip-btn blue" onclick={() => reExport(item)}>Baixar de novo</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#snippet footer()}
		<button class="btn btn-primary" onclick={() => doExport('PDF')}><FileDown size={16} /> Gerar PDF</button>
		<button class="btn" onclick={() => doExport('CSV')}><Download size={16} /> Baixar CSV</button>
		<button class="btn btn-ghost" onclick={onClose}>Cancelar</button>
	{/snippet}
</Modal>

<ConfirmDialog
	open={confirmDeleteId !== null}
	title="Excluir modelo?"
	message={`O modelo "${appState.reportTemplates.find((t) => t.id === confirmDeleteId)?.nome || ''}" será removido. Esta ação não pode ser desfeita.`}
	confirmLabel="Excluir modelo"
	cancelLabel="Manter modelo"
	onCancel={() => (confirmDeleteId = null)}
	onConfirm={() => {
		removeReportTemplate(confirmDeleteId);
		confirmDeleteId = null;
	}}
/>
