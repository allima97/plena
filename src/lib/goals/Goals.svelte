<script>
	import { appState, addGoal, updateGoal, removeGoal, addAporte } from '$lib/fin/store.svelte.js';
	import { fmtMoney, fmtDate, todayISO } from '$lib/format.js';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Plus, Target } from 'lucide-svelte';

	let showModal = $state(false);
	let editing = $state(null);
	let deleting = $state(null);
	let aportando = $state(null);
	let valorAporte = $state('');

	function blank() {
		return { nome: '', valorAlvo: '', prazo: '', observacao: '' };
	}
	let form = $state(blank());

	function openNew() {
		editing = null;
		form = blank();
		showModal = true;
	}
	function openEdit(goal) {
		editing = goal;
		form = { nome: goal.nome, valorAlvo: goal.valorAlvo, prazo: goal.prazo || '', observacao: goal.observacao || '' };
		showModal = true;
	}
	function submit(e) {
		e.preventDefault();
		if (!form.nome.trim() || !form.valorAlvo) return;
		const data = { nome: form.nome.trim(), valorAlvo: Number(form.valorAlvo), prazo: form.prazo || null, observacao: form.observacao };
		if (editing) updateGoal(editing.id, data);
		else addGoal(data);
		showModal = false;
	}

	function mesesRestantes(prazo) {
		if (!prazo) return null;
		const hoje = new Date(todayISO());
		const alvo = new Date(prazo);
		const meses = (alvo.getFullYear() - hoje.getFullYear()) * 12 + (alvo.getMonth() - hoje.getMonth());
		return Math.max(1, meses);
	}

	function sugestaoMensal(goal) {
		const restante = (goal.valorAlvo || 0) - (goal.valorAtual || 0);
		const meses = mesesRestantes(goal.prazo);
		if (!meses || restante <= 0) return null;
		return restante / meses;
	}

	function confirmarAporte() {
		if (!valorAporte || Number(valorAporte) <= 0) return;
		addAporte(aportando.id, Number(valorAporte));
		aportando = null;
		valorAporte = '';
	}
</script>

<div class="page-head">
	<div>
		<h1 class="font-display page-title">Objetivos</h1>
		<p class="page-sub">A mesma ideia do Rumo Financeiro (nextgoals), agora dentro do Plena.</p>
	</div>
	<button class="btn btn-primary" onclick={openNew}><Plus size={16} /> Novo objetivo</button>
</div>

<div class="grid-cards">
	{#each appState.goals as goal (goal.id)}
		{@const pct = Math.min(100, Math.round(((goal.valorAtual || 0) / (goal.valorAlvo || 1)) * 100))}
		{@const sugestao = sugestaoMensal(goal)}
		<div class="card goal-card">
			<div style="display:flex;align-items:center;gap:10px">
				<span class="type-icon income"><Target size={16} /></span>
				<div style="flex:1;min-width:0">
					<p class="stat-label" style="margin:0">{goal.nome}</p>
					{#if goal.prazo}<p class="movement-meta" style="margin:2px 0 0">até {fmtDate(goal.prazo)}</p>{/if}
				</div>
			</div>
			<p class="font-display stat-value" style="margin-top:14px">{fmtMoney(goal.valorAtual || 0)}</p>
			<p class="stat-sub">de {fmtMoney(goal.valorAlvo)}</p>
			<div class="goal-progress-track">
				<div class="goal-progress-fill" style="width:{pct}%"></div>
			</div>
			<p class="stat-sub">{pct}% concluído{sugestao ? ` · sugestão: ${fmtMoney(sugestao)}/mês` : ''}</p>
			<div class="actions-row" style="margin-top:14px">
				<button class="btn sm" onclick={() => { aportando = goal; valorAporte = ''; }}>Registrar aporte</button>
				<button class="btn btn-ghost sm" onclick={() => openEdit(goal)}>Editar</button>
				<button class="btn btn-danger sm" onclick={() => (deleting = goal)}>Excluir</button>
			</div>
		</div>
	{:else}
		<p class="empty">Nenhum objetivo cadastrado ainda.</p>
	{/each}
</div>

<Modal open={showModal} onClose={() => (showModal = false)} title={editing ? 'Editar objetivo' : 'Novo objetivo'} maxWidth="480px">
	<form onsubmit={submit} class="movement-form">
		<label class="field"><span>Nome do objetivo</span><input class="field-input" required placeholder="Ex.: Viagem, carro, reserva de emergência" bind:value={form.nome} /></label>
		<div class="form-grid">
			<label class="field"><span>Valor alvo (R$)</span><input class="field-input" type="number" step="0.01" required bind:value={form.valorAlvo} /></label>
			<label class="field"><span>Prazo (opcional)</span><input class="field-input" type="date" bind:value={form.prazo} /></label>
		</div>
		<label class="field"><span>Observação</span><textarea class="field-input" rows="2" bind:value={form.observacao}></textarea></label>
		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">Salvar</button>
			<button type="button" class="btn btn-ghost" onclick={() => (showModal = false)}>Cancelar</button>
		</div>
	</form>
</Modal>

<Modal open={aportando !== null} onClose={() => (aportando = null)} title="Registrar aporte" subtitle={aportando?.nome} maxWidth="380px">
	<div class="movement-form">
		<label class="field"><span>Valor (R$)</span><input class="field-input" type="number" step="0.01" bind:value={valorAporte} /></label>
		<div class="modal-footer">
			<button class="btn btn-primary" onclick={confirmarAporte}>Registrar</button>
			<button class="btn btn-ghost" onclick={() => (aportando = null)}>Cancelar</button>
		</div>
	</div>
</Modal>

<ConfirmDialog
	open={deleting !== null}
	title="Excluir objetivo?"
	message={`"${deleting?.nome}" e seu histórico de aportes serão removidos.`}
	confirmLabel="Excluir"
	onCancel={() => (deleting = null)}
	onConfirm={() => {
		removeGoal(deleting.id);
		deleting = null;
	}}
/>
