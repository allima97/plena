<script>
	import { appState, addAccount, updateAccount, removeAccount, restoreAccount } from '$lib/fin/store.svelte.js';
	import { currentMonthKey, faturaDoCartao, limiteUtilizadoCartao, nextMonthKey, saldoContaAte } from '$lib/fin/derived.js';
	import { fmtMoney, todayISO } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';
	import { page } from '$app/state';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import RowActionsModal from '$lib/components/RowActionsModal.svelte';
	import { Plus, Wallet, CreditCard, Landmark, Pencil, Trash2 } from 'lucide-svelte';

	const PALETTE = ['grad-red', 'grad-purple', 'grad-blue', 'grad-dark', 'grad-orange', 'grad-green'];
	const PALETTE_LABELS = { 'grad-red': 'Vermelho', 'grad-purple': 'Roxo', 'grad-blue': 'Azul', 'grad-dark': 'Escuro', 'grad-orange': 'Laranja', 'grad-green': 'Verde' };

	let showModal = $state(false);
	let editing = $state(null);
	let deleting = $state(null);
	let rowActions = $state({ open: false, title: '', subtitle: '', actions: [] });
	let highlightId = $state(null);

	// Vindo de um alerta de cartão (?open=<id>): rola até o cartão exato e destaca por um instante,
	// em vez de mandar o usuário procurar qual é entre vários -- mesmo padrão de Movimentações/Categorias.
	let openedFromAlert = false;
	$effect(() => {
		if (openedFromAlert) return;
		const id = page.url.searchParams.get('open');
		if (!id) return;
		const acc = appState.accounts.find((a) => a.id === id);
		if (acc) {
			openedFromAlert = true;
			highlightId = acc.id;
			queueMicrotask(() => document.getElementById(`acc-${acc.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
			setTimeout(() => { if (highlightId === acc.id) highlightId = null; }, 2400);
		}
	});
	function openAccountActions(acc) {
		rowActions = {
			open: true,
			title: acc.nome,
			subtitle: acc.tipo === 'cartao' ? 'Cartão de crédito' : 'Conta corrente',
			actions: [
				{ label: 'Editar', icon: Pencil, onClick: () => openEdit(acc) },
				{ label: 'Excluir', icon: Trash2, variant: 'danger', onClick: () => (deleting = acc) }
			]
		};
	}

	function blank() {
		return { nome: '', tipo: 'conta', banco: '', saldoInicial: 0, limite: 0, fechamento: '', cor: '' };
	}
	let form = $state(blank());

	function openNew() {
		editing = null;
		form = { ...blank(), cor: PALETTE[appState.accounts.length % PALETTE.length] };
		showModal = true;
	}
	function openEdit(acc) {
		editing = acc;
		form = { nome: acc.nome, tipo: acc.tipo, banco: acc.banco || '', saldoInicial: acc.saldoInicial || 0, limite: acc.limite || 0, fechamento: acc.fechamento || '', cor: acc.cor || PALETTE[appState.accounts.indexOf(acc) % PALETTE.length] };
		showModal = true;
	}
	function submit(e) {
		e.preventDefault();
		if (!form.nome.trim()) return;
		const data = {
			...form,
			saldoInicial: Number(form.saldoInicial) || 0,
			limite: Number(form.limite) || 0,
			fechamento: form.tipo === 'cartao' && form.fechamento ? Math.min(28, Math.max(1, Number(form.fechamento))) : null,
			cor: form.cor || null
		};
		if (editing) updateAccount(editing.id, data);
		else addAccount(data);
		showModal = false;
	}

	function saldoAtual(acc) {
		// Saldo real de hoje: nunca inclui lançamento com data futura (parcela/recorrência já
		// pré-gerada) -- ver saldoContaAte em derived.js.
		return saldoContaAte(appState.transactions, acc, todayISO());
	}

	const startDay = $derived(appState.settings.monthStartDay || 1);

	function faturaAtual(acc) {
		return faturaDoCartao(appState.transactions, acc, currentMonthKey(startDay), startDay);
	}

	function proximaFatura(acc) {
		return faturaDoCartao(appState.transactions, acc, nextMonthKey(currentMonthKey(startDay)), startDay);
	}

	// Compra -> Fatura -> Pagamento (UX 2.0 - Fase 5): o número que o usuário realmente quer saber
	// não é só a fatura nem só o limite, é quanto ainda dá pra usar sem estourar. Usa TODAS as
	// compras ainda não pagas (não só a fatura do mês corrente) -- ver limiteUtilizadoCartao.
	function limiteUtilizado(acc) {
		return limiteUtilizadoCartao(appState.transactions, acc);
	}
	function disponivelCartao(acc) {
		return (Number(acc.limite) || 0) - limiteUtilizado(acc);
	}

	const cartoes = $derived(appState.accounts.filter((a) => a.tipo === 'cartao'));

	// Vindo da busca global (?open=<id>): abre direto o resumo/ações dessa conta, uma única vez.
	let openedFromSearch = false;
	$effect(() => {
		if (openedFromSearch) return;
		const id = page.url.searchParams.get('open');
		if (!id) return;
		const acc = appState.accounts.find((a) => a.id === id);
		if (acc) {
			openedFromSearch = true;
			openAccountActions(acc);
		}
	});
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">Gestão de contas</p>
		<h1 class="font-display page-title">Seu dinheiro, organizado.</h1>
		<p class="page-sub">Contas correntes, cartões e limites em um único lugar para você ter clareza do todo.</p>
	</div>
	<button class="btn btn-primary" onclick={openNew}><Plus size={16} /> Nova conta</button>
</div>

<div class="account-grid">
	{#each appState.accounts as acc, i (acc.id)}
		{@const grad = acc.cor || PALETTE[i % PALETTE.length]}
		<div
			id={`acc-${acc.id}`}
			class="account-tile {grad}"
			class:highlight={highlightId === acc.id}
			role="button"
			tabindex="0"
			onclick={() => openAccountActions(acc)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					openAccountActions(acc);
				}
			}}
		>
			<div class="tile-decor-wrap">
				<div class="tile-decor d1"></div>
				<div class="tile-decor d2"></div>
			</div>
			<div class="account-tile-head">
				<div class="account-tile-bank">
					<span class="account-icon">{#if acc.tipo === 'cartao'}<CreditCard size={17} />{:else}<Landmark size={17} />{/if}</span>
					<div style="min-width:0">
						<p class="account-tile-name">{acc.nome}</p>
						<p class="account-tile-type">{acc.tipo === 'cartao' ? 'Cartão de crédito' : 'Conta corrente'}</p>
					</div>
				</div>
			</div>
			<div class="account-tile-body">
				<p class="account-tile-label">{acc.tipo === 'cartao' ? 'Fatura atual' : 'Saldo disponível'}</p>
				<p class="account-tile-value privacy-value">{fmtMoney(acc.tipo === 'cartao' ? faturaAtual(acc) : saldoAtual(acc))}</p>
			</div>
			<p class="account-tile-foot">
				{#if acc.tipo === 'cartao'}
					Limite <span class="privacy-value">{fmtMoney(acc.limite)}</span> · Disponível <span class="privacy-value">{fmtMoney(disponivelCartao(acc))}</span>
				{:else if i === 0}
					Principal
				{:else}
					Atualizado agora
				{/if}
			</p>
			{#if acc.tipo === 'cartao'}
				<p class="account-tile-next">
					{acc.fechamento ? `Vence dia ${acc.fechamento} · ` : ''}Próxima fatura <span class="privacy-value">{fmtMoney(proximaFatura(acc))}</span>
				</p>
			{/if}
		</div>
	{/each}

	<button type="button" class="account-tile add-tile" onclick={openNew}>
		<div>
			<div class="add-tile-icon"><Plus size={20} /></div>
			<p class="add-tile-title">Adicionar outra conta</p>
			<p class="add-tile-sub">Banco ou cartão de crédito</p>
		</div>
	</button>
</div>

{#if cartoes.length}
	<div class="card">
		<div class="page-head" style="margin-bottom:16px">
			<div>
				<p class="page-eyebrow" style="margin-bottom:2px">Resumo dos cartões</p>
				<p class="font-display" style="margin:0;font-size:18px">Limite utilizado</p>
			</div>
		</div>
		<div class="card-usage-list">
			{#each cartoes as acc, i (acc.id)}
				{@const grad = acc.cor || PALETTE[(appState.accounts.indexOf(acc)) % PALETTE.length]}
				{@const pct = acc.limite ? Math.min(100, Math.round((limiteUtilizado(acc) / acc.limite) * 100)) : 0}
				<div class="card-usage-item">
					<div class="card-usage-top">
						<span style="display:flex;align-items:center"><span class="card-usage-dot {grad}"></span>{acc.nome}</span>
					</div>
					<p class="card-usage-value privacy-value">{fmtMoney(limiteUtilizado(acc))}</p>
					<p class="card-usage-sub">de <span class="privacy-value">{fmtMoney(acc.limite)}</span></p>
					<div class="usage-track"><div class="usage-fill {grad}" style="width:{pct}%"></div></div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<Modal open={showModal} onClose={() => (showModal = false)} title={editing ? 'Editar conta' : 'Nova conta'} maxWidth="480px">
	<form onsubmit={submit} class="movement-form">
		<label class="field"><span>Nome</span><input class="field-input" required bind:value={form.nome} /></label>
		<div class="form-grid">
			<label class="field">
				<span>Tipo</span>
				<select class="field-input" bind:value={form.tipo}>
					<option value="conta">Conta</option>
					<option value="cartao">Cartão de crédito</option>
				</select>
			</label>
			<label class="field"><span>Banco / bandeira</span><input class="field-input" bind:value={form.banco} /></label>
		</div>
		{#if form.tipo === 'cartao'}
			<div class="form-grid">
				<label class="field"><span>Limite</span><input class="field-input" type="number" step="0.01" bind:value={form.limite} /></label>
				<label class="field">
					<span>Dia de vencimento</span>
					<input class="field-input" type="number" min="1" max="28" placeholder="ex: 21" bind:value={form.fechamento} />
				</label>
			</div>
		{:else}
			<label class="field"><span>Saldo inicial</span><input class="field-input" type="number" step="0.01" bind:value={form.saldoInicial} /></label>
		{/if}
		<label class="field">
			<span>Cor</span>
			<div class="color-swatch-row">
				{#each PALETTE as opt (opt)}
					<button
						type="button"
						class="color-swatch {opt}"
						class:selected={form.cor === opt}
						onclick={() => (form.cor = opt)}
						aria-label={PALETTE_LABELS[opt]}
						title={PALETTE_LABELS[opt]}
					></button>
				{/each}
			</div>
		</label>
		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">Salvar</button>
			<button type="button" class="btn btn-ghost" onclick={() => (showModal = false)}>Cancelar</button>
		</div>
	</form>
</Modal>

<RowActionsModal
	open={rowActions.open}
	onClose={() => (rowActions = { ...rowActions, open: false })}
	title={rowActions.title}
	subtitle={rowActions.subtitle}
	actions={rowActions.actions}
/>

<ConfirmDialog
	open={deleting !== null}
	title="Excluir conta?"
	message={`"${deleting?.nome}" será removida. Os lançamentos já feitos continuam existindo, sem conta vinculada.`}
	confirmLabel="Excluir"
	onCancel={() => (deleting = null)}
	onConfirm={() => {
		const snapshot = { ...deleting };
		removeAccount(deleting.id);
		showToast({ message: `Conta "${snapshot.nome}" excluída.`, actionLabel: 'DESFAZER', onAction: () => restoreAccount(snapshot) });
		deleting = null;
	}}
/>
