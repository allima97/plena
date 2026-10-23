<script>
  /**
   * SyncSettings.svelte
   *
   * Painel de controle do sincronismo Plena ↔ Nextgoals.
   * Encapsula todo o fluxo de ativação (OTP) e desativação com confirmação.
   *
   * Uso:
   *   import SyncSettings from '$lib/components/SyncSettings.svelte';
   *   <SyncSettings />
   */

  import { onMount } from 'svelte';
  import { appState } from '$lib/fin/store.svelte.js';

  // ── Estado
  let status = $state(null);         // null=carregando, objeto após fetch
  let loading = $state(true);
  let error = $state('');

  // Fluxo de ativação
  let step = $state('idle');         // 'idle' | 'sent' | 'done'
  let otp = $state('');
  let activating = $state(false);
  let consentChecked = $state(false);

  // Fluxo de desativação
  let disabling = $state(false);
  let disableConsentChecked = $state(false);
  let showDisableConfirm = $state(false);

  // ── Coleções que sincronizam (exibição)
  const SYNCED_COLLECTIONS = [
    'Objetivos (goals)',
    'Recursos e movimentações',
    'Parcelas e amortizações',
    'Categorias de objetivos',
    'Vendas e planos de vendas',
    'Tipos e controles de vendas',
  ];

  const NEVER_SYNCED = [
    'Finanças pessoais (contas, transações, categorias)',
    'Patrimônio',
    'Orçamentos e alertas',
    'Relatórios e histórico',
    'Configurações pessoais',
  ];

  // ── Carrega o status ao montar
  onMount(loadStatus);

  async function loadStatus() {
    loading = true;
    error = '';
    try {
      const r = await fetch('/api/sync/status', {headers:{'X-Plena-Owner':appState.user?.email || ''}});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      status = await r.json();
    } catch (e) {
      error = 'Não foi possível carregar o status do sync.';
    } finally {
      loading = false;
    }
  }

  // ── Ativação: passo 1 — solicita OTP
  async function requestOtp() {
    if (!consentChecked) return;
    activating = true;
    error = '';
    try {
      const r = await fetch('/api/sync/initiate', { method: 'POST', headers:{'content-type':'application/json','X-Plena-Owner':appState.user?.email || ''}, body:JSON.stringify({confirm:true}) });
      const body = await r.json();
      if (!r.ok) { error = body.error || 'Erro ao solicitar código.'; return; }
      step = 'sent';
    } catch (e) {
      error = 'Falha de conexão ao solicitar código.';
    } finally {
      activating = false;
    }
  }

  // ── Ativação: passo 2 — verifica OTP
  async function verifyOtp() {
    if (otp.length !== 6) return;
    activating = true;
    error = '';
    try {
      const r = await fetch('/api/sync/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Plena-Owner':appState.user?.email || '' },
        body: JSON.stringify({ code: otp }),
      });
      const body = await r.json();
      if (!r.ok) { error = body.error || 'Código incorreto ou expirado.'; return; }
      step = 'done';
      await loadStatus();
    } catch (e) {
      error = 'Falha de conexão ao verificar código.';
    } finally {
      activating = false;
    }
  }

  // ── Desativação
  async function disableSync() {
    if (!disableConsentChecked) return;
    disabling = true;
    error = '';
    try {
      const r = await fetch('/api/sync/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Plena-Owner':appState.user?.email || '' },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await r.json();
      if (!r.ok) { error = body.error || 'Erro ao desativar sync.'; return; }
      showDisableConfirm = false;
      disableConsentChecked = false;
      await loadStatus();
    } catch (e) {
      error = 'Falha de conexão ao desativar sync.';
    } finally {
      disabling = false;
    }
  }

  function resetActivationFlow() {
    step = 'idle';
    otp = '';
    consentChecked = false;
    error = '';
  }
</script>

<div class="sync-settings">
  <h2 class="sync-title">Sincronismo com Nextgoals</h2>

  {#if loading}
    <p class="sync-loading">Carregando…</p>

  {:else if error && !status}
    <p class="sync-error">{error}</p>
    <button class="btn-secondary" onclick={loadStatus}>Tentar novamente</button>

  {:else if status?.linked && status?.enabled}
    <!-- ── SYNC ATIVO ───────────────────────────────────────────────── -->
    <div class="sync-badge sync-badge--active">✓ Sync ativo com Nextgoals</div>

    <dl class="sync-meta">
      <dt>E-mail vinculado</dt>
      <dd>{status.nextgoals_user_id}</dd>

      <dt>Ativado em</dt>
      <dd>{new Date(status.created_at).toLocaleString('pt-BR')}</dd>

      {#if status.last_sync_at}
        <dt>Última sincronização</dt>
        <dd>{new Date(status.last_sync_at).toLocaleString('pt-BR')}</dd>
      {/if}

      {#if status.last_sync_error}
        <dt>Último erro</dt>
        <dd class="sync-error-text">{status.last_sync_error}</dd>
      {/if}
    </dl>

    {#if !showDisableConfirm}
      <button class="btn-danger-outline" onclick={() => { showDisableConfirm = true; disableConsentChecked = false; }}>
        Desativar sincronismo…
      </button>
    {:else}
      <!-- Confirmação de desativação -->
      <div class="sync-warning-box">
        <p class="sync-warning-title">⚠️ Atenção antes de desativar</p>
        <ul>
          <li>Após desativar, alterações no Plena <strong>não</strong> serão refletidas no Nextgoals e vice-versa.</li>
          <li>Os dados existentes nos dois sistemas <strong>não serão apagados</strong> — eles simplesmente deixam de se atualizar mutuamente.</li>
          <li>Para reativar, será necessário confirmar por e-mail novamente.</li>
        </ul>
        <label class="sync-consent">
          <input type="checkbox" bind:checked={disableConsentChecked} />
          Entendi as consequências e quero desativar o sincronismo.
        </label>

        {#if error}<p class="sync-error">{error}</p>{/if}

        <div class="sync-actions">
          <button class="btn-danger"
            disabled={!disableConsentChecked || disabling}
            onclick={disableSync}>
            {disabling ? 'Desativando…' : 'Desativar sync'}
          </button>
          <button class="btn-secondary"
            onclick={() => { showDisableConfirm = false; error = ''; }}>
            Cancelar
          </button>
        </div>
      </div>
    {/if}

  {:else if status?.linked && !status?.enabled}
    <!-- ── SYNC PAUSADO ─────────────────────────────────────────────── -->
    <div class="sync-badge sync-badge--disabled">● Sync desativado</div>
    <p class="sync-hint">Reative a sincronização abaixo para voltar a compartilhar dados com o Nextgoals.</p>
    <button class="btn-primary" onclick={resetActivationFlow}>Reativar sincronismo…</button>

  {:else}
    <!-- ── SEM SYNC ─────────────────────────────────────────────────── -->

    {#if step === 'done'}
      <div class="sync-badge sync-badge--active">✓ Sync ativado com sucesso!</div>
      <p class="sync-hint">A partir de agora, suas alterações em Objetivos e Vendas serão refletidas automaticamente no Nextgoals.</p>

    {:else if step === 'sent'}
      <!-- Passo 2: digitar OTP -->
      <div class="sync-step-box">
        <p>Enviamos um código de 6 dígitos para <strong>{status?.owner ?? 'seu e-mail'}</strong>.</p>
        <p>Digite-o abaixo para confirmar a ativação:</p>

        <input
          class="sync-otp-input"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="000000"
          bind:value={otp}
          onkeydown={(e) => e.key === 'Enter' && verifyOtp()}
        />

        {#if error}<p class="sync-error">{error}</p>{/if}

        <div class="sync-actions">
          <button class="btn-primary"
            disabled={otp.length !== 6 || activating}
            onclick={verifyOtp}>
            {activating ? 'Verificando…' : 'Confirmar código'}
          </button>
          <button class="btn-secondary" onclick={resetActivationFlow}>Cancelar</button>
        </div>

        <button class="btn-link" onclick={requestOtp} disabled={activating}>
          Reenviar código
        </button>
      </div>

    {:else}
      <!-- Passo 1: apresentação + consentimento -->
      <p class="sync-intro">
        Vincule sua conta ao <strong>Nextgoals</strong> para que seus objetivos e dados de vendas
        fiquem automaticamente sincronizados entre os dois sistemas.
      </p>

      <div class="sync-info-grid">
        <div class="sync-info-block">
          <h3>✅ O que sincroniza</h3>
          <ul>
            {#each SYNCED_COLLECTIONS as col}
              <li>{col}</li>
            {/each}
          </ul>
        </div>

        <div class="sync-info-block">
          <h3>🚫 O que NÃO sincroniza</h3>
          <ul>
            {#each NEVER_SYNCED as col}
              <li>{col}</li>
            {/each}
          </ul>
        </div>
      </div>

      <div class="sync-warning-box">
        <p class="sync-warning-title">⚠️ Leia antes de ativar</p>
        <ul>
          <li>Qualquer alteração em objetivos ou vendas no Plena será <strong>imediatamente refletida no Nextgoals</strong>, e vice-versa.</li>
          <li>Isso inclui <strong>exclusões</strong>: deletar um objetivo em um sistema o remove do outro.</li>
          <li>Você pode desativar o sync a qualquer momento nas configurações.</li>
        </ul>
      </div>

      <label class="sync-consent">
        <input type="checkbox" bind:checked={consentChecked} />
        Entendi que alterações em um sistema afetarão o outro e desejo ativar a sincronização.
      </label>

      {#if error}<p class="sync-error">{error}</p>{/if}

      <button
        class="btn-primary"
        disabled={!consentChecked || activating}
        onclick={requestOtp}>
        {activating ? 'Verificando conta…' : 'Ativar sincronismo com Nextgoals'}
      </button>
    {/if}
  {/if}
</div>

<style>
  .sync-settings {
    max-width: 560px;
  }

  .sync-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 1rem;
  }

  .sync-loading, .sync-hint, .sync-intro {
    color: var(--text-secondary, #6b7280);
    font-size: 0.9rem;
    margin: 0 0 0.75rem;
  }

  .sync-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }
  .sync-badge--active  { background: #d1fae5; color: #065f46; }
  .sync-badge--disabled { background: #f3f4f6; color: #6b7280; }

  .sync-meta {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 1rem;
    font-size: 0.85rem;
    margin: 0 0 1.25rem;
  }
  .sync-meta dt { color: var(--text-secondary, #6b7280); }
  .sync-meta dd { margin: 0; word-break: break-all; }
  .sync-error-text { color: #dc2626; font-size: 0.8rem; }

  .sync-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin: 0.75rem 0 1rem;
  }
  .sync-info-block h3 {
    font-size: 0.85rem;
    font-weight: 600;
    margin: 0 0 0.4rem;
  }
  .sync-info-block ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.8rem;
    color: var(--text-secondary, #4b5563);
  }
  .sync-info-block li { margin-bottom: 0.2rem; }

  .sync-warning-box {
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 8px;
    padding: 0.875rem 1rem;
    margin: 0 0 1rem;
  }
  .sync-warning-title {
    font-weight: 600;
    font-size: 0.875rem;
    margin: 0 0 0.5rem;
  }
  .sync-warning-box ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.82rem;
  }
  .sync-warning-box li { margin-bottom: 0.3rem; }

  .sync-consent {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.85rem;
    margin: 0.75rem 0 1rem;
    cursor: pointer;
  }
  .sync-consent input { margin-top: 0.15rem; flex-shrink: 0; }

  .sync-step-box {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: 0.9rem;
  }

  .sync-otp-input {
    width: 140px;
    padding: 0.6rem 0.75rem;
    font-size: 1.4rem;
    letter-spacing: 6px;
    text-align: center;
    border: 1px solid #d1d5db;
    border-radius: 8px;
  }
  .sync-otp-input:focus { outline: 2px solid #6366f1; border-color: transparent; }

  .sync-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .sync-error {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 0;
  }

  /* Botões — herdam as variáveis do tema do Plena quando disponíveis */
  .btn-primary {
    padding: 0.5rem 1.25rem;
    background: var(--accent, #6366f1);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-primary:hover:not(:disabled) { opacity: 0.88; }

  .btn-secondary {
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .btn-secondary:hover { background: #f9fafb; }

  .btn-danger {
    padding: 0.5rem 1.25rem;
    background: #dc2626;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-danger:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-danger:hover:not(:disabled) { background: #b91c1c; }

  .btn-danger-outline {
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid #dc2626;
    color: #dc2626;
    border-radius: 8px;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .btn-danger-outline:hover { background: #fef2f2; }

  .btn-link {
    background: none;
    border: none;
    color: var(--accent, #6366f1);
    font-size: 0.82rem;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    align-self: flex-start;
  }
  .btn-link:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (max-width: 480px) {
    .sync-info-grid { grid-template-columns: 1fr; }
  }
</style>
