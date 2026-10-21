<script>
	import {
		appState,
		setPaymentStatus,
		removeTransaction,
		restoreTransaction,
		transferPairOf,
		manageSeries
	} from '$lib/fin/store.svelte.js';
	import {
		currentMonthKey,
		faturaDoCartao,
		limiteUtilizadoCartao,
		nextMonthKey,
		saldoContaAte
	} from '$lib/fin/derived.js';
	import { fmtMoney, financialMonthKey, monthLabel, todayISO } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';
	import MovementRow from '$lib/components/MovementRow.svelte';
	import NewMovementModal from '$lib/components/NewMovementModal.svelte';
	import { X, Plus, MoreHorizontal, CreditCard, Landmark } from 'lucide-svelte';

	let { acc, open, onClose, onOpenActions } = $props();

	const PALETTE = ['grad-red', 'grad-purple', 'grad-blue', 'grad-dark', 'grad-orange', 'grad-green'];

	let quickFilter = $state('all');
	let monthFilter = $state('all');
	let modal = $state({ open: false, mode: 'create', transaction: null });

	const startDay = $derived(appState.settings.monthStartDay || 1);
	const grad = $derived(acc?.cor || PALETTE[appState.accounts.indexOf(acc) % PALETTE.length] || 'grad-purple');

	// Stats
	const saldoAtual = $derived(acc ? saldoContaAte(appState.transactions, acc, todayISO()) : 0);
	const faturaAtual = $derived(
		acc ? faturaDoCartao(appState.transactions, acc, currentMonthKey(startDay), startDay) : 0
	);
	const proximaFatura = $derived(
		acc
			? faturaDoCartao(
					appState.transactions,
					acc,
					nextMonthKey(currentMonthKey(startDay)),
					startDay
				)
			: 0
	);
	const limiteUsado = $derived(acc ? limiteUtilizadoCartao(appState.transactions, acc) : 0);
	const disponivel = $derived((Number(acc?.limite) || 0) - limiteUsado);

	// Meses disponíveis só desta conta
	const mesesDisponiveis = $derived.by(() => {
		if (!acc) return [];
		const set = new Set(
			appState.transactions
				.filter((t) => t.contaId === acc.id)
				.map((t) => financialMonthKey(t.data, startDay))
		);
		set.add(currentMonthKey(startDay));
		return [...set].sort().reverse();
	});

	// Transações filtradas desta conta
	const filtered = $derived(
		appState.transactions
			.filter((t) => t.contaId === acc?.id)
			.filter((t) => monthFilter === 'all' || financialMonthKey(t.data, startDay) === monthFilter)
			.filter((t) => {
				if (quickFilter === 'receita') return t.tipo === 'receita';
				if (quickFilter === 'despesa') return t.tipo === 'despesa';
				if (quickFilter === 'pendente') return t.statusPagamento === 'pendente';
				return true;
			})
			.sort((a, b) => b.data.localeCompare(a.data))
	);

	// Agrupamento por data
	const MES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
	function yesterdayISO() {
		const d = new Date();
		d.setDate(d.getDate() - 1);
		const pad = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}
	function dateGroupLabel(iso) {
		if (iso === todayISO()) return 'Hoje';
		if (iso === yesterdayISO()) return 'Ontem';
		const [, m, d] = iso.split('-');
		return `${d} ${MES_ABBR[Number(m) - 1]}`;
	}
	const groupedFiltered = $derived.by(() => {
		const groups = [];
		let current = null;
		for (const t of filtered) {
			if (!current || current.date !== t.data) {
				current = { date: t.data, label: dateGroupLabel(t.data), items: [] };
				groups.push(current);
			}
			current.items.push(t);
		}
		return groups;
	});

	// Reset filtros ao trocar de conta
	$effect(() => {
		if (acc) {
			quickFilter = 'all';
			monthFilter = 'all';
		}
	});

	function handleDelete(tx) {
		if (tx.isTransferencia && tx.transferId) {
			const pair = transferPairOf(tx.transferId).map((t) => ({ ...t }));
			pair.forEach((t) => removeTransaction(t.id));
			showToast({
				message: 'Transferência excluída.',
				actionLabel: 'DESFAZER',
				onAction: () => pair.forEach((t) => restoreTransaction(t))
			});
			return;
		}
		const snapshot = { ...tx };
		removeTransaction(tx.id);
		showToast({
			message: `Lançamento "${tx.descricao || 'sem descrição'}" excluído.`,
			actionLabel: 'DESFAZER',
			onAction: () => restoreTransaction(snapshot)
		});
	}

	function togglePayment(t) {
		setPaymentStatus(t.id, t.statusPagamento === 'pago' ? 'pendente' : 'pago');
	}

	function openEditOccurrence(t) {
		modal = { open: true, mode: 'edit-occurrence', transaction: t };
	}
	function openEditSeries(t) {
		modal = { open: true, mode: 'edit-series', transaction: t };
	}
	function duplicateTransaction(t) {
		modal = {
			open: true,
			mode: 'create',
			transaction: {
				tipo: t.tipo,
				valor: t.valor,
				data: todayISO(),
				descricao: t.descricao,
				categoriaId: t.categoriaId,
				subcategoriaId: t.subcategoriaId,
				contaId: t.contaId,
				formaPagamento: t.formaPagamento
			}
		};
	}
	function openNew() {
		modal = {
			open: true,
			mode: 'create',
			transaction: { contaId: acc?.id }
		};
	}
	function closeModal() {
		modal = { ...modal, open: false };
	}
</script>

{#if open && acc}
	<div
		class="atd-backdrop"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		role="presentation"
		tabindex="-1"
	>
		<div
			class="atd-panel"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-label={`Lançamentos de ${acc.nome}`}
		>
			<!-- Cabeçalho com gradiente da conta -->
			<div class="atd-header {grad}">
				<div class="tile-decor-wrap">
					<div class="tile-decor d1"></div>
					<div class="tile-decor d2"></div>
				</div>
				<div class="atd-header-top">
					<div class="atd-header-info">
						<span class="atd-header-icon">
							{#if acc.tipo === 'cartao'}<CreditCard size={18} />{:else}<Landmark size={18} />{/if}
						</span>
						<div>
							<p class="atd-header-name">{acc.nome}</p>
							<p class="atd-header-type">{acc.tipo === 'cartao' ? 'Cartão de crédito' : 'Conta corrente'}</p>
						</div>
					</div>
					<div class="atd-header-btns">
						<button
							type="button"
							class="atd-icon-btn"
							onclick={() => { onClose(); onOpenActions(acc); }}
							aria-label="Ações da conta"
							title="Editar / Arquivar / Excluir"
						>
							<MoreHorizontal size={18} />
						</button>
						<button type="button" class="atd-icon-btn" onclick={onClose} aria-label="Fechar">
							<X size={18} />
						</button>
					</div>
				</div>

				<!-- Stats da conta -->
				{#if acc.tipo === 'cartao'}
					<div class="atd-stats">
						<div class="atd-stat">
							<p class="atd-stat-label">Fatura atual</p>
							<p class="atd-stat-value privacy-value">{fmtMoney(faturaAtual)}</p>
						</div>
						<div class="atd-stat">
							<p class="atd-stat-label">Próxima fatura</p>
							<p class="atd-stat-value privacy-value">{fmtMoney(proximaFatura)}</p>
						</div>
						<div class="atd-stat">
							<p class="atd-stat-label">Disponível</p>
							<p class="atd-stat-value privacy-value">{fmtMoney(disponivel)}</p>
						</div>
						{#if acc.limite}
							<div class="atd-stat">
								<p class="atd-stat-label">Limite total</p>
								<p class="atd-stat-value privacy-value">{fmtMoney(acc.limite)}</p>
							</div>
						{/if}
					</div>
				{:else}
					<div class="atd-stats">
						<div class="atd-stat">
							<p class="atd-stat-label">Saldo disponível</p>
							<p class="atd-stat-value privacy-value">{fmtMoney(saldoAtual)}</p>
						</div>
					</div>
				{/if}
			</div>

			<!-- Filtros -->
			<div class="atd-filters">
				<div class="atd-quick-filters">
					<button class="quick-filter-chip" class:active={quickFilter === 'all'} onclick={() => (quickFilter = 'all')}>Todos</button>
					<button class="quick-filter-chip" class:active={quickFilter === 'receita'} onclick={() => (quickFilter = 'receita')}>Receitas</button>
					<button class="quick-filter-chip" class:active={quickFilter === 'despesa'} onclick={() => (quickFilter = 'despesa')}>Despesas</button>
					<button class="quick-filter-chip" class:active={quickFilter === 'pendente'} onclick={() => (quickFilter = 'pendente')}>Pendentes</button>
				</div>
				<select class="atd-month-select" bind:value={monthFilter}>
					<option value="all">Todos os meses</option>
					{#each mesesDisponiveis as m}
						<option value={m}>{monthLabel(m)}</option>
					{/each}
				</select>
			</div>

			<!-- Lista de lançamentos -->
			<div class="atd-list">
				{#if filtered.length === 0}
					<p class="atd-empty">Nenhum lançamento encontrado nesta conta.</p>
				{:else}
					{#each groupedFiltered as g (g.date)}
						<div class="movement-date-group">
							<p class="movement-date-heading">{g.label}</p>
							{#each g.items as t (t.id)}
								<MovementRow
									{t}
									categoria={appState.categories.find((c) => c.id === t.categoriaId)}
									subcategoria={appState.categories
										.find((c) => c.id === t.categoriaId)
										?.secundarios?.find((s) => s.id === t.subcategoriaId)?.nome}
									conta={appState.accounts.find((a) => a.id === t.contaId)}
									onTogglePayment={togglePayment}
									onEditOccurrence={openEditOccurrence}
									onDelete={handleDelete}
								/>
							{/each}
						</div>
					{/each}
				{/if}
			</div>

			<!-- Footer: novo lançamento -->
			<div class="atd-footer">
				<button type="button" class="btn btn-primary" onclick={openNew}>
					<Plus size={16} /> Novo lançamento
				</button>
			</div>
		</div>
	</div>
{/if}

<NewMovementModal
	open={modal.open}
	mode={modal.mode}
	transaction={modal.transaction}
	onClose={closeModal}
	onDuplicate={duplicateTransaction}
	onDelete={handleDelete}
	onEditSeries={openEditSeries}
	onManageSeries={manageSeries}
/>

<style>
	.atd-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: stretch;
		justify-content: flex-end;
		background: rgba(23, 33, 43, 0.45);
		backdrop-filter: blur(3px);
	}

	.atd-panel {
		width: 100%;
		max-width: 520px;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--card);
		box-shadow: -8px 0 40px rgba(0, 0, 0, 0.18);
		overflow: hidden;
		animation: atd-slide-in 0.22s ease;
	}

	@keyframes atd-slide-in {
		from { transform: translateX(100%); opacity: 0; }
		to   { transform: translateX(0);    opacity: 1; }
	}

	/* Header com gradiente */
	.atd-header {
		position: relative;
		padding: 20px 20px 16px;
		flex: none;
		overflow: hidden;
	}
	.atd-header-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		position: relative;
		z-index: 1;
	}
	.atd-header-info {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.atd-header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: rgba(255,255,255,0.18);
		border-radius: 10px;
		flex: none;
		color: #fff;
	}
	.atd-header-name {
		margin: 0;
		font-size: 18px;
		font-weight: 800;
		color: #fff;
		line-height: 1.2;
	}
	.atd-header-type {
		margin: 2px 0 0;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(255,255,255,0.7);
	}
	.atd-header-btns {
		display: flex;
		gap: 4px;
		flex: none;
		position: relative;
		z-index: 1;
	}
	.atd-icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border: none;
		background: rgba(255,255,255,0.15);
		border-radius: 10px;
		color: #fff;
		cursor: pointer;
		transition: background 0.15s;
	}
	.atd-icon-btn:hover {
		background: rgba(255,255,255,0.28);
	}

	/* Stats dentro do header */
	.atd-stats {
		display: flex;
		gap: 20px;
		flex-wrap: wrap;
		margin-top: 16px;
		position: relative;
		z-index: 1;
	}
	.atd-stat-label {
		margin: 0 0 2px;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(255,255,255,0.65);
	}
	.atd-stat-value {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
		color: #fff;
		font-family: var(--font-display, inherit);
	}

	/* Filtros */
	.atd-filters {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border-soft);
		flex-wrap: wrap;
		flex: none;
	}
	.atd-quick-filters {
		display: flex;
		gap: 4px;
		flex: 1;
		flex-wrap: wrap;
	}
	.atd-month-select {
		font-size: 12px;
		font-weight: 600;
		padding: 6px 10px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--ink);
		cursor: pointer;
		flex: none;
	}

	/* Lista */
	.atd-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px 0;
	}
	.atd-empty {
		padding: 48px 24px;
		text-align: center;
		color: var(--ink-muted);
		font-size: 14px;
	}

	/* Footer */
	.atd-footer {
		padding: 12px 16px;
		border-top: 1px solid var(--border-soft);
		flex: none;
	}
	.atd-footer .btn {
		width: 100%;
		justify-content: center;
	}

	/* Mobile: vira bottom sheet */
	@media (max-width: 600px) {
		.atd-backdrop {
			align-items: flex-end;
			justify-content: center;
		}
		.atd-panel {
			max-width: 100%;
			height: 92dvh;
			border-radius: 22px 22px 0 0;
			box-shadow: 0 -8px 40px rgba(0,0,0,0.18);
			animation: atd-slide-up 0.24s ease;
		}
		@keyframes atd-slide-up {
			from { transform: translateY(100%); opacity: 0; }
			to   { transform: translateY(0);    opacity: 1; }
		}
	}
</style>
