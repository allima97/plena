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
	import SyncSettings from '$lib/components/SyncSettings.svelte';
	import PrivacySettings from '$lib/components/PrivacySettings.svelte';
	import { Save, Download, Upload, Trash2, ShieldAlert, CircleHelp } from 'lucide-svelte';
	import { downloadBlob } from '$lib/fin/export.js';

	const SECOES = [
		{ id: 'geral', label: () => t('settings_tab_geral') },
		{ id: 'layout', label: () => t('settings_tab_layout') },
		{ id: 'lingua', label: () => t('settings_tab_lingua') },
		{ id: 'backup', label: () => t('settings_tab_backup') },
		{ id: 'apagar', label: () => t('settings_tab_apagar') },
		{ id: 'integracoes', label: () => t('settings_tab_integracoes') },
		{ id: 'privacidade', label: () => t('settings_tab_privacidade') }
	];
	let secaoAtiva = $state('geral');
	let ajudaBackupAberta = $state(false);

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

	// ---- Criar backup (servidor + navigator.share para mobile) ------------------

	let criandoBackup = $state(false);
	let ultimoBackup = $state(/** @type {string|null} */ (null));
	$effect(() => {
		try { ultimoBackup = localStorage.getItem('plena_last_backup'); } catch {}
	});

	async function criarBackup() {
		criandoBackup = true;
		try {
			const today = new Date().toISOString().slice(0, 10);
			const filename = `plena-backup-${today}.json`;
			let content;

			// Tenta exportar do servidor (D1 — dados canônicos)
			try {
				const res = await fetch('/api/privacy/export');
				if (!res.ok) throw new Error('server');
				content = await res.text();
			} catch {
				// Offline ou erro: usa snapshot local
				exportBackup();
				try { localStorage.setItem('plena_last_backup', new Date().toISOString()); } catch {}
				ultimoBackup = new Date().toISOString();
				showToast({ message: 'Backup local criado!' });
				return;
			}

			const file = new File([content], filename, { type: 'application/json' });

			// navigator.share: no celular abre o menu de compartilhamento nativo
			// (Google Drive, iCloud, WhatsApp, E-mail, etc.)
			if (navigator.share) {
				try {
					await navigator.share({ files: [file], title: 'Backup Plena' });
				} catch (e) {
					if (e?.name === 'AbortError') return; // usuário cancelou
					// TypeError = tipo de arquivo não suportado pelo share; outros erros inesperados
					downloadBlob(content, filename, 'application/json');
				}
			} else {
				downloadBlob(content, filename, 'application/json');
			}

			try { localStorage.setItem('plena_last_backup', new Date().toISOString()); } catch {}
			ultimoBackup = new Date().toISOString();
			showToast({ message: 'Backup criado com sucesso!' });
		} finally {
			criandoBackup = false;
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

<div class="period-tabs settings-tabs-desktop" style="margin-bottom:20px">
	{#each SECOES as s (s.id)}
		<button type="button" class:active={secaoAtiva === s.id} onclick={() => (secaoAtiva = s.id)}>{s.label()}</button>
	{/each}
</div>
<div class="settings-tab-select">
	<select bind:value={secaoAtiva} aria-label="Seção de configurações">
		{#each SECOES as s (s.id)}
			<option value={s.id}>{s.label()}</option>
		{/each}
	</select>
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
		<p class="stat-label" style="margin:0 0 4px">
			{t('settings_backup_titulo')}
			<button class="sync-help-btn" onclick={() => (ajudaBackupAberta = !ajudaBackupAberta)} aria-label="Ajuda sobre backup" title="Como funciona o backup">
				<CircleHelp size={13} />
			</button>
		</p>
		{#if ajudaBackupAberta}
		<div class="backup-help-panel">
			<p><strong>Backup manual:</strong> Clique em "Criar backup" para baixar seus dados como arquivo JSON. No celular, o menu de compartilhamento permite salvar direto no Google Drive, iCloud ou enviar por WhatsApp.</p>
			<p><strong>Backup automático:</strong> Uma cópia é salva automaticamente na nuvem todo dia às 03h (horário de Brasília). Os últimos 30 backups são mantidos — sem precisar fazer nada.</p>
		</div>
		{/if}
		<p class="movement-meta" style="margin:0 0 16px">{t('settings_backup_sub')}</p>

		{#if ultimoBackup}
			{@const diasAtras = Math.floor((Date.now() - new Date(ultimoBackup).getTime()) / 86_400_000)}
			<div class="backup-status" class:backup-aviso={diasAtras > 7}>
				<span>{#if diasAtras === 0}✓ Backup feito hoje{:else}Último backup: há {diasAtras} {diasAtras === 1 ? 'dia' : 'dias'}{/if}</span>
				{#if diasAtras > 7}<span class="backup-aviso-texto">Recomendamos backup semanal</span>{/if}
			</div>
		{:else}
			<div class="backup-status backup-aviso">
				<span>Nenhum backup local encontrado</span>
			</div>
		{/if}

		<div class="backup-actions">
			<button type="button" class="btn btn-primary" onclick={criarBackup} disabled={criandoBackup}>
				<Download size={16} /> {criandoBackup ? 'Aguarde…' : t('settings_backup_criar')}
			</button>
			<button type="button" class="btn" onclick={() => fileInput?.click()}>
				<Upload size={16} /> {t('settings_backup_restaurar')}
			</button>
			<input bind:this={fileInput} type="file" accept="application/json,.json" style="display:none" onchange={onBackupFile} />
		</div>

		<p class="field-hint" style="margin-top:14px">
			📱 No celular, o arquivo pode ser salvo direto no <strong>Google Drive</strong> ou <strong>iCloud</strong> pelo menu de compartilhamento que aparece automaticamente.
		</p>
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
{:else if secaoAtiva === 'integracoes'}
	<div class="card" style="max-width:560px">
		<SyncSettings />
	</div>
{:else if secaoAtiva === 'privacidade'}
	<PrivacySettings onManageIntegration={() => secaoAtiva = 'integracoes'} />
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
	.sync-help-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		cursor: pointer;
		color: var(--text-muted);
		padding: 0 0 0 4px;
		vertical-align: middle;
		border-radius: 50%;
		transition: color .15s;
	}
	.sync-help-btn:hover { color: var(--accent); }
	.backup-help-panel {
		background: var(--bg-secondary, hsl(220 14% 96%));
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 12px 14px;
		margin-bottom: 14px;
		font-size: .85rem;
		line-height: 1.6;
		color: var(--text-secondary);
	}
	.backup-help-panel p { margin: 0 0 8px; }
	.backup-help-panel p:last-child { margin: 0; }
	.backup-status {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--income, #23a768) 12%, transparent);
		color: var(--income, #23a768);
		font-size: 13px;
		font-weight: 500;
	}
	.backup-status.backup-aviso {
		background: color-mix(in srgb, var(--expense, #e06b5f) 10%, transparent);
		color: var(--expense, #e06b5f);
	}
	.backup-aviso-texto {
		margin-left: auto;
		font-size: 11px;
		opacity: 0.85;
	}
	/* Dropdown de seção — só aparece em mobile */
	.settings-tab-select {
		display: none;
		margin-bottom: 20px;
	}
	.settings-tab-select select {
		width: 100%;
		appearance: none;
		-webkit-appearance: none;
		background: var(--card, #fff) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 14px center;
		box-shadow: 0 1px 4px rgba(43,61,70,.08);
		border: none;
		border-radius: 999px;
		padding: 0 40px 0 18px;
		height: 40px;
		font-size: 13px;
		font-weight: 700;
		color: var(--ink);
		cursor: pointer;
		outline: none;
	}
	@media (max-width: 768px) {
		.settings-tabs-desktop { display: none; }
		.settings-tab-select { display: block; }
	}
	.backup-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 16px;
	}
	.backup-actions .btn {
		flex: 1 1 auto;
		min-width: 140px;
	}
	@media (max-width: 768px) {
		.backup-actions {
			flex-direction: column;
		}
		.backup-actions .btn {
			width: 100%;
			justify-content: center;
		}
	}
</style>
