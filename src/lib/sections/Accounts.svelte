<script>
	import { appState, addAccount, updateAccount, removeAccount } from '$lib/fin/store.svelte.js';
	import { fmtMoney } from '$lib/format.js';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Plus, Wallet, CreditCard } from 'lucide-svelte';

	let showModal = $state(false);
	let editing = $state(null);
	let deleting = $state(null);

	function blank() {
		return { nome: '', tipo: 'conta', banco: '', saldoInicial: 0, limite: 0 };
	}
	let form = $state(blank());

	function openNew() {
		editing = null;
		form = blank();
		showModal = true;
	}
	function openEdit(acc) {
		editing = acc;
		form = { nome: acc.nome, tipo: acc.tipo, banco: acc.banco || '', saldoInicial: acc.saldoInicial || 0, limite: acc.limite || 0 };
		showModal = true;
	}
	function submit(e) {
		e.preventDefault();
		if (!form.nome.trim()) return;
		const data = { ...form, saldoInicial: Number(form.saldoInicial) || 0, limite: Number(form.limite) || 0 };
		if (editing) updateAccount(editing.id, data);
		else addAccount(data);
		showModal = false;
	}

	function saldoAtual(acc) {
		const receitas = appState.transactions.filter((t) => t.contaId === acc.id && t.tipo === 'receita').reduce((s, t) => s + (Number(t.valor) || 0), 0);
		const despesas = appState.transactions.filter((t) => t.contaId === acc.id && t.tipo === 'despesa').reduce((s, t) => s + (Number(t.valor) || 0), 0);
		return (acc.saldoInicial || 0) + receitas - despesas;
	}
</script>

<div class="page-head">
	<div>
		<h1 class="font-display page-title">Contas e cartões</h1>
		<p class="page-sub">{appState.accounts.length} conta(s) cadastrada(s)</p>
	</div>
	<button class="btn btn-primary" onclick={openNew}><Plus size={16} /> Nova conta</button>
</div>

<div class="grid-cards">
	{#each appState.accounts as acc (acc.id)}
		<div class="stat-card">
			<div style="display:flex;align-items:center;gap:10px">
				<span class="type-icon income">{#if acc.tipo === 'cartao'}<CreditCard size={16} />{:else}<Wallet size={16} />{/if}</span>
				<div>
					<p class="stat-label" style="margin:0">{acc.nome}</p>
					<p class="movement-meta" style="margin:2px 0 0">{acc.banco || (acc.tipo === 'cartao' ? 'Cartão de crédito' : 'Conta')}</p>
				</div>
			</div>
			<p class="font-display stat-value">{fmtMoney(acc.tipo === 'cartao' ? acc.limite : saldoAtual(acc))}</p>
			<p class="stat-sub">{acc.tipo === 'cartao' ? 'Limite' : 'Saldo atual'}</p>
			<div class="actions-row" style="margin-top:14px">
				<button class="btn btn-ghost sm" onclick={() => openEdit(acc)}>Editar</button>
				<button class="btn btn-danger sm" onclick={() => (deleting = acc)}>Excluir</button>
			</div>
		</div>
	{:else}
		<p class="empty">Nenhuma conta cadastrada ainda.</p>
	{/each}
</div>

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
			<label class="field"><span>Limite</span><input class="field-input" type="number" step="0.01" bind:value={form.limite} /></label>
		{:else}
			<label class="field"><span>Saldo inicial</span><input class="field-input" type="number" step="0.01" bind:value={form.saldoInicial} /></label>
		{/if}
		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">Salvar</button>
			<button type="button" class="btn btn-ghost" onclick={() => (showModal = false)}>Cancelar</button>
		</div>
	</form>
</Modal>

<ConfirmDialog
	open={deleting !== null}
	title="Excluir conta?"
	message={`"${deleting?.nome}" será removida. Os lançamentos já feitos continuam existindo, sem conta vinculada.`}
	confirmLabel="Excluir"
	onCancel={() => (deleting = null)}
	onConfirm={() => {
		removeAccount(deleting.id);
		deleting = null;
	}}
/>
