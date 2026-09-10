<script>
	import {
		appState,
		setSettings,
		exportBackup,
		validateBackup,
		restoreBackup,
		canClearCategories,
		clearAllMovements,
		clearAllCategories,
		clearAllData
	} from '$lib/fin/store.svelte.js';
	import { CURRENCY_OPTIONS } from '$lib/currency.js';
	import { LANGUAGE_OPTIONS, t } from '$lib/i18n.js';
	import { showToast } from '$lib/toast.svelte.js';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Save, Download, Upload, Trash2, ShieldAlert } from 'lucide-svelte';

	const SECOES = [
		{ id: 'geral', label: () => t('settings_tab_geral') },
		{ id: 'layout', label: () => t('settings_tab_layout') },
		{ id: 'lingua', label: () => t('settings_tab_lingua') },
		{ id: 'backup', label: () => t('settings_tab_backup') },
		{ id: 'apagar', label: () => t('settings_tab_apagar') }
	];
	let secaoAtiva = $state('geral');

	// Rotas disponíveis pra "Página inicial" -- mesmas do menu lateral (routes/+layout.svelte),
	// menos a própria tela de Configurações (não faz sentido abrir o app direto nela).
	const PAGINAS_INICIAIS = [
		{ value: '/', label: () => t('nav_visaoGeral') },
		{ value: '/movimentacoes', label: () => t('nav_movimentacoes') },
		{ value: '/contas', label: () => t('nav_contas') },
		{ value: '/categorias', label: () => t('nav_categorias') },
		{ value: '/objetivos', label: () => t('nav_objetivos') },
		{ value: '/simulador', label: () => t('nav_simulador') },
		{ value: '/patrimonio', label: () => t('nav_patrimonio') },
		{ value: '/relatorios', label: () => t('nav_relatorios') }
	];

	function fromSettings(s) {
		return {
			moedaPadrao: s.moedaPadrao || 'BRL',
			homePage: s.homePage || '/',
			monthStartDay: s.monthStartDay || 1,
			confirmExitApp: !!s.confirmExitApp,
			theme: s.theme || 'light',
			primaryColor: s.primaryColor || '',
			incomeColor: s.incomeColor || '',
			expenseColor: s.expenseColor || '',
			language: s.language || 'pt-BR'
		};
	}

	let form = $state(fromSettings(appState.settings));

	// Mantém o formulário em dia se a configuração mudar por fora (outro dispositivo
	// sincronizando), sem sobrescrever o que o usuário está digitando nesta tela.
	let dirty = $state(false);
	$effect(() => {
		if (dirty) return;
		form = fromSettings(appState.settings);
	});

	function salvar() {
		setSettings({
			...form,
			monthStartDay: Math.min(28, Math.max(1, Number(form.monthStartDay) || 1))
		});
		dirty = false;
		showToast({ message: t('settings_toast_salvo') });
	}

	function marcarSujo() {
		dirty = true;
	}

	// ---- Exportar / Importar --------------------------------------------------

	let fileInput = $state(null);
	let importPending = $state(null); // { data } aguardando confirmação, ou { error }
	let restaurando = $state(false);

	function onBackupFile(e) {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const result = validateBackup(String(reader.result || ''));
			importPending = result;
		};
		reader.readAsText(file);
		e.target.value = '';
	}

	async function confirmarImportacao() {
		if (!importPending?.data) return;
		restaurando = true;
		try {
			await restoreBackup(importPending.data);
			showToast({ message: t('settings_toast_restaurado') });
		} finally {
			restaurando = false;
			importPending = null;
		}
	}

	// ---- Apagar dados -----------------------------------------------------------

	let confirmando = $state(null); // 'tudo' | 'movimentos' | 'categorias' | null
	const categoriasBloqueadas = $derived(!canClearCategories());

	function executarApagar() {
		if (confirmando === 'movimentos') {
			clearAllMovements();
			showToast({ message: t('settings_toast_movimentosApagados') });
		} else if (confirmando === 'categorias') {
			const ok = clearAllCategories();
			showToast({ message: ok ? t('settings_toast_categoriasApagadas') : t('settings_erro_categoriasBloqueadas') });
		} else if (confirmando === 'tudo') {
			clearAllData();
			showToast({ message: t('settings_toast_tudoApagado') });
		}
		confirmando = null;
	}
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">{t('settings_eyebrow')}</p>
		<h1 class="font-display page-title">{t('settings_title')}</h1>
		<p class="page-sub">{t('settings_sub')}</p>
	</div>
</div>

<div class="period-tabs" style="margin-bottom:20px">
	{#each SECOES as s (s.id)}
		<button type="button" class:active={secaoAtiva === s.id} onclick={() => (secaoAtiva = s.id)}>{s.label()}</button>
	{/each}
</div>

{#if secaoAtiva === 'geral'}
	<div class="card" style="max-width:560px">
		<p class="stat-label" style="margin:0 0 4px">{t('settings_geral_titulo')}</p>
		<p class="movement-meta" style="margin:0 0 18px">{t('settings_geral_sub')}</p>

		<label class="field">
			<span>{t('settings_geral_paginaInicial')}</span>
			<select class="field-input" bind:value={form.homePage} onchange={marcarSujo}>
				{#each PAGINAS_INICIAIS as p (p.value)}
					<option value={p.value}>{p.label()}</option>
				{/each}
			</select>
		</label>

		<label class="field">
			<span>{t('settings_geral_moedaPadrao')}</span>
			<select class="field-input" bind:value={form.moedaPadrao} onchange={marcarSujo}>
				{#each CURRENCY_OPTIONS as opt (opt.code)}
					<option value={opt.code}>{opt.label}</option>
				{/each}
			</select>
		</label>

		<label class="field">
			<span>{t('settings_geral_diaMes')}</span>
			<input class="field-input" type="number" min="1" max="28" step="1" bind:value={form.monthStartDay} oninput={marcarSujo} />
			<span class="field-hint">{t('settings_geral_diaMesDica')}</span>
		</label>

		<label class="checkbox-row" style="margin-top:6px">
			<input type="checkbox" bind:checked={form.confirmExitApp} onchange={marcarSujo} />
			{t('settings_geral_confirmarSaida')}
		</label>

		<div class="modal-footer" style="margin-top:18px">
			<button type="button" class="btn btn-primary" onclick={salvar}><Save size={16} /> {t('settings_salvar')}</button>
		</div>
	</div>
{:else if secaoAtiva === 'layout'}
	<div class="card" style="max-width:560px">
		<p class="stat-label" style="margin:0 0 4px">{t('settings_layout_titulo')}</p>
		<p class="movement-meta" style="margin:0 0 18px">{t('settings_layout_sub')}</p>

		<label class="field">
			<span>{t('settings_layout_tema')}</span>
			<div class="goal-type-grid" style="grid-template-columns:1fr 1fr">
				<button type="button" class="goal-type-btn" class:active={form.theme === 'light'} onclick={() => { form.theme = 'light'; marcarSujo(); }}>
					{t('settings_layout_temaClaro')}
				</button>
				<button type="button" class="goal-type-btn" class:active={form.theme === 'dark'} onclick={() => { form.theme = 'dark'; marcarSujo(); }}>
					{t('settings_layout_temaEscuro')}
				</button>
			</div>
		</label>

		<div class="form-grid">
			<label class="field">
				<span>{t('settings_layout_corPrimaria')}</span>
				<div class="color-field-row">
					<input type="color" value={form.primaryColor || '#4a78db'} oninput={(e) => { form.primaryColor = e.target.value; marcarSujo(); }} />
					<button type="button" class="btn btn-ghost sm" onclick={() => { form.primaryColor = ''; marcarSujo(); }}>{t('settings_layout_padrao')}</button>
				</div>
			</label>
		</div>

		<p class="stat-label" style="margin:18px 0 4px">{t('settings_layout_corLancamentos')}</p>
		<div class="form-grid">
			<label class="field">
				<span>{t('settings_layout_corEntradas')}</span>
				<div class="color-field-row">
					<input type="color" value={form.incomeColor || '#23a768'} oninput={(e) => { form.incomeColor = e.target.value; marcarSujo(); }} />
					<button type="button" class="btn btn-ghost sm" onclick={() => { form.incomeColor = ''; marcarSujo(); }}>{t('settings_layout_padrao')}</button>
				</div>
			</label>
			<label class="field">
				<span>{t('settings_layout_corSaidas')}</span>
				<div class="color-field-row">
					<input type="color" value={form.expenseColor || '#e06b5f'} oninput={(e) => { form.expenseColor = e.target.value; marcarSujo(); }} />
					<button type="button" class="btn btn-ghost sm" onclick={() => { form.expenseColor = ''; marcarSujo(); }}>{t('settings_layout_padrao')}</button>
				</div>
			</label>
		</div>

		<div class="modal-footer" style="margin-top:18px">
			<button type="button" class="btn btn-primary" onclick={salvar}><Save size={16} /> {t('settings_salvar')}</button>
		</div>
	</div>
{:else if secaoAtiva === 'lingua'}
	<div class="card" style="max-width:560px">
		<p class="stat-label" style="margin:0 0 4px">{t('settings_lingua_titulo')}</p>
		<p class="movement-meta" style="margin:0 0 18px">{t('settings_lingua_sub')}</p>

		<label class="field">
			<span>{t('settings_lingua_idioma')}</span>
			<select class="field-input" bind:value={form.language} onchange={marcarSujo}>
				{#each LANGUAGE_OPTIONS as opt (opt.code)}
					<option value={opt.code}>{opt.label}</option>
				{/each}
			</select>
		</label>

		<div class="modal-footer" style="margin-top:18px">
			<button type="button" class="btn btn-primary" onclick={salvar}><Save size={16} /> {t('settings_salvar')}</button>
		</div>
	</div>
{:else if secaoAtiva === 'backup'}
	<div class="card" style="max-width:560px">
		<p class="stat-label" style="margin:0 0 4px">{t('settings_backup_titulo')}</p>
		<p class="movement-meta" style="margin:0 0 18px">{t('settings_backup_sub')}</p>

		<div class="modal-footer" style="justify-content:flex-start;gap:12px">
			<button type="button" class="btn" onclick={exportBackup}><Download size={16} /> {t('settings_backup_criar')}</button>
			<button type="button" class="btn" onclick={() => fileInput?.click()}><Upload size={16} /> {t('settings_backup_restaurar')}</button>
			<input bind:this={fileInput} type="file" accept="application/json,.json" style="display:none" onchange={onBackupFile} />
		</div>
	</div>
{:else if secaoAtiva === 'apagar'}
	<div class="card" style="max-width:560px; border-color:var(--expense-soft)">
		<p class="stat-label" style="margin:0 0 4px"><ShieldAlert size={15} color="var(--expense)" style="vertical-align:-2px;margin-right:6px" />{t('settings_apagar_titulo')}</p>
		<p class="movement-meta" style="margin:0 0 18px">{t('settings_apagar_avisoBackup')}</p>

		<div class="danger-row">
			<div>
				<p class="insight-row-title" style="margin:0">{t('settings_apagar_movimentos')}</p>
				<p class="insight-row-desc" style="margin:2px 0 0">{t('settings_apagar_movimentosDesc')}</p>
			</div>
			<button type="button" class="btn btn-danger" onclick={() => (confirmando = 'movimentos')}><Trash2 size={15} /> {t('settings_apagar_botao')}</button>
		</div>

		<div class="danger-row">
			<div>
				<p class="insight-row-title" style="margin:0">{t('settings_apagar_categorias')}</p>
				<p class="insight-row-desc" style="margin:2px 0 0">
					{categoriasBloqueadas ? t('settings_apagar_categoriasBloqueadas') : t('settings_apagar_categoriasDesc')}
				</p>
			</div>
			<button type="button" class="btn btn-danger" disabled={categoriasBloqueadas} onclick={() => (confirmando = 'categorias')}>
				<Trash2 size={15} /> {t('settings_apagar_botao')}
			</button>
		</div>

		<div class="danger-row" style="border-bottom:none">
			<div>
				<p class="insight-row-title" style="margin:0">{t('settings_apagar_tudo')}</p>
				<p class="insight-row-desc" style="margin:2px 0 0">{t('settings_apagar_tudoDesc')}</p>
			</div>
			<button type="button" class="btn btn-danger" onclick={() => (confirmando = 'tudo')}><Trash2 size={15} /> {t('settings_apagar_botao')}</button>
		</div>
	</div>
{/if}

<ConfirmDialog
	open={!!confirmando}
	title={t('settings_apagar_confirmarTitulo')}
	message={t('settings_apagar_confirmarMsg')}
	confirmLabel={t('settings_apagar_confirmarBotao')}
	cancelLabel={t('settings_cancelar')}
	onConfirm={executarApagar}
	onCancel={() => (confirmando = null)}
/>

<ConfirmDialog
	open={!!importPending}
	title={importPending?.error ? t('settings_backup_erroTitulo') : t('settings_backup_confirmarTitulo')}
	message={importPending?.error || t('settings_backup_confirmarMsg')}
	confirmLabel={importPending?.error ? t('settings_ok') : restaurando ? t('settings_backup_restaurando') : t('settings_backup_confirmarBotao')}
	cancelLabel={t('settings_cancelar')}
	danger={!importPending?.error}
	onConfirm={importPending?.error ? () => (importPending = null) : confirmarImportacao}
	onCancel={() => (importPending = null)}
/>

<style>
	.color-field-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.color-field-row input[type='color'] {
		width: 44px;
		height: 40px;
		padding: 2px;
		border-radius: 10px;
		border: 1px solid var(--border-strong);
		background: var(--card);
		cursor: pointer;
	}
	.btn.sm {
		min-height: 32px;
		padding: 0 12px;
		font-size: 12px;
	}
	.danger-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px 0;
		border-bottom: 1px solid var(--border-soft);
	}
</style>
