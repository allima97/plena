<script>
  import { onMount } from 'svelte';
  import { Download, FileText, Mail, ShieldCheck, LogOut } from 'lucide-svelte';
  import { t } from '$lib/i18n.js';
  import { appState } from '$lib/fin/store.svelte.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  let { onManageIntegration } = $props();
  let sessions = $state([]);
  let loading = $state(true);
  let busy = $state(false);
  let confirming = $state(false);
  let message = $state('');
  let error = $state('');
  let requestType = $state('Acesso e informações sobre meus dados');
  const otherSessions = $derived(sessions.filter(s => !s.current).length);
  const requestLink = $derived('mailto:nxapps01@gmail.com?subject=' + encodeURIComponent('LGPD — Plena — ' + requestType) + '&body=' + encodeURIComponent('Olá, nxapps.\n\nQuero solicitar: ' + requestType + '.\nConta no Plena: ' + (appState.user?.email || '') + '\n\nDetalhes do pedido e sistemas envolvidos (Plena e/ou NextGoals):\n\n'));
  const formatDate = value => new Date(value).toLocaleString('pt-BR');
  onMount(loadSessions);
  async function loadSessions() {
    loading = true;
    error = '';
    try {
      const r = await fetch('/api/privacy/sessions', { cache: 'no-store', headers: { 'X-Plena-Owner': appState.user?.email || '' } });
      if (!r.ok) throw new Error();
      sessions = (await r.json()).sessions;
    } catch { error = 'Não foi possível consultar as sessões. Tente novamente.'; }
    finally { loading = false; }
  }
  async function revokeOthers() {
    confirming = false;
    busy = true;
    message = '';
    error = '';
    try {
      const r = await fetch('/api/privacy/sessions', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Plena-Owner': appState.user?.email || '' }, body: JSON.stringify({ confirm: true }) });
      if (!r.ok) throw new Error();
      message = 'As outras sessões foram encerradas. Este acesso continua ativo.';
      await loadSessions();
    } catch { error = 'Não foi possível encerrar as outras sessões. Tente novamente.'; }
    finally { busy = false; }
  }
</script>

<div class="privacy-grid">
  <section class="card">
    <h2><ShieldCheck size={20} /> {t('settings_tab_privacidade')}</h2>
    <p>Você controla seus dados no Plena. A responsável é a <strong>nxapps</strong>, pelo contato <a href="mailto:nxapps01@gmail.com">nxapps01@gmail.com</a>.</p>
    <p>Usamos os dados da conta para autenticação e os registros que você cadastra para oferecer o controle financeiro, de objetivos e de vendas. O aviso detalha armazenamento, fornecedores, compartilhamento e seus direitos.</p>
    <div class="privacy-actions">
      <a class="btn" href="/privacidade" data-sveltekit-reload><FileText size={16} /> {t('settings_priv_politica')}</a>
      <a class="btn btn-primary" href="/api/privacy/export" download><Download size={16} /> {t('settings_priv_baixar')}</a>
    </div>
    <p class="field-hint">A exportação contém os dados da sua conta salvos no Plena e o registro da autorização da integração. Ela exige login. Guarde o arquivo em local seguro.</p>
  </section>

  <section class="card">
    <h2>Seus direitos e solicitações</h2>
    <p>Solicite acesso, correção, informações sobre compartilhamento, portabilidade quando aplicável, oposição ou eliminação, conforme as condições da LGPD. A exclusão de registros no aplicativo não encerra sua conta.</p>
    <label class="field"><span>O que você deseja solicitar?</span>
      <select class="field-input" bind:value={requestType}>
        <option>Acesso e informações sobre meus dados</option>
        <option>Correção dos meus dados</option>
        <option>Informações sobre compartilhamento</option>
        <option>Portabilidade dos meus dados</option>
        <option>Oposição ao tratamento de dados</option>
        <option>Eliminação de dados e encerramento da conta</option>
      </select>
    </label>
    <a class="btn" href={requestLink}><Mail size={16} /> Preparar solicitação por e-mail</a>
    <p class="field-hint">Abre seu aplicativo de e-mail; o pedido só será enviado quando você confirmar o envio nele. Informe os sistemas envolvidos. Nunca envie senha ou código de acesso. Poderemos confirmar sua identidade e informar eventuais obrigações legais de conservação.</p>
  </section>

  <section class="card">
    <h2>{t('settings_priv_integracaoTitulo')}</h2>
    <p>Quando autorizada, a integração compartilha objetivos, recursos, parcelas, amortizações, categorias de objetivos e vendas. Finanças pessoais, patrimônio, relatórios e configurações do Plena ficam fora dessa integração.</p>
    <button class="btn" onclick={onManageIntegration}>Ver autorização e desativar integração</button>
    <p class="field-hint">A desativação interrompe as novas sincronizações. As cópias já existentes nos dois sistemas permanecem; para eliminá-las, inclua ambos no seu pedido.</p>
  </section>

  <section class="card">
    <h2>Sessões de acesso</h2>
    <p>Os acessos do Plena expiram em até 30 dias. Em aparelhos compartilhados, use Sair ao terminar: isso encerra a sessão atual e remove a cópia financeira local deste navegador.</p>
    {#if loading}<p role="status">Consultando sessões…</p>
    {:else if !error}
      <p><strong>{sessions.length}</strong> sessão(ões) ativa(s), sendo <strong>{otherSessions}</strong> em outros acessos.</p>
      {#each sessions as session}
        <div class="privacy-session"><strong>{session.current ? 'Este acesso' : 'Outro acesso'}</strong><span>Última atividade: {formatDate(session.lastSeenAt)}</span><span>Expira em: {formatDate(session.expiresAt)}</span></div>
      {/each}
      <button class="btn" disabled={busy || otherSessions === 0} onclick={() => confirming = true}><LogOut size={16} /> Encerrar outras sessões</button>
      <p class="field-hint">Os outros acessos precisarão entrar novamente ao consultar o servidor. Dados já baixados em aparelhos fora de conexão não podem ser apagados remotamente.</p>
    {/if}
    {#if error}<p role="alert">{error}</p><button class="btn" onclick={loadSessions}>Tentar novamente</button>{/if}
    {#if message}<p role="status">{message}</p>{/if}
  </section>
</div>
<ConfirmDialog open={confirming} title="Encerrar as outras sessões?" message="Os outros acessos ao Plena serão encerrados. Este acesso continuará ativo." confirmLabel="Encerrar outras sessões" onConfirm={revokeOthers} onCancel={() => confirming = false} />
<style>
  .privacy-grid { display:grid; gap:18px; max-width:680px; }
  h2 { display:flex; align-items:center; gap:10px; font-size:17px; margin:0 0 12px; }
  p { font-size:13px; line-height:1.7; overflow-wrap:anywhere; }
  a:not(.btn) { color:var(--primary); }
  .privacy-actions { display:flex; flex-wrap:wrap; gap:10px; margin:16px 0; }
  .btn { text-decoration:none; height:auto; white-space:normal; }
  .privacy-session { display:grid; gap:5px; padding:12px 0; margin-bottom:8px; border-top:1px solid var(--border-soft); font-size:12px; color:var(--ink-soft); }
  .field-hint { margin:12px 0 0; }
  @media(max-width:480px) { .privacy-actions { flex-direction:column; } .privacy-actions .btn { justify-content:center; } }
</style>
