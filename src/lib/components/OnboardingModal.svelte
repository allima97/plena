<script>
	import { goto } from '$app/navigation';
	import { WalletCards, Target, ReceiptText, ArrowRight } from 'lucide-svelte';

	let { open, onClose } = $props();
	let step = $state(0);

	const steps = [
		{
			icon: WalletCards,
			eyebrow: 'Passo 1 de 3',
			title: 'Onde está seu dinheiro?',
			body: 'Cadastre suas contas e cartões para o Plena calcular seu saldo real e quanto você pode gastar com segurança.',
			cta: 'Cadastrar minhas contas',
			href: '/contas'
		},
		{
			icon: Target,
			eyebrow: 'Passo 2 de 3',
			title: 'O que você quer alcançar?',
			body: 'Reserva de emergência, uma viagem, quitar uma dívida -- crie um objetivo e acompanhe o progresso mês a mês.',
			cta: 'Criar meu primeiro objetivo',
			href: '/objetivos'
		},
		{
			icon: ReceiptText,
			eyebrow: 'Passo 3 de 3',
			title: 'Como está sua vida financeira?',
			body: 'Registre receitas e despesas para o Plena mostrar sua saúde financeira e o que fazer a seguir.',
			cta: 'Registrar um lançamento',
			href: '/movimentacoes'
		}
	];

	const current = $derived(steps[step]);
	const isLast = $derived(step === steps.length - 1);

	function markDone() {
		try {
			localStorage.setItem('plena_onboarding_done', '1');
		} catch {
			/* localStorage indisponível -- segue sem persistir a preferência */
		}
	}

	function skip() {
		markDone();
		onClose();
	}

	function next() {
		if (isLast) {
			skip();
		} else {
			step += 1;
		}
	}

	function goAndFinish(href) {
		markDone();
		onClose();
		goto(href);
	}
</script>

{#if open}
	<div class="modal-backdrop onboarding-backdrop" role="presentation">
		<div class="modal-card onboarding-card" role="dialog" aria-modal="true" aria-label="Bem-vindo ao Plena">
			<div class="onboarding-dots">
				{#each steps as _, i (i)}
					<span class="onboarding-dot" class:active={i === step}></span>
				{/each}
			</div>
			<div class="onboarding-icon"><current.icon size={26} /></div>
			<p class="modal-eyebrow onboarding-eyebrow">{current.eyebrow}</p>
			<h2 class="font-display onboarding-title">{current.title}</h2>
			<p class="onboarding-body">{current.body}</p>
			<div class="onboarding-actions">
				<button class="btn btn-primary onboarding-cta" onclick={() => goAndFinish(current.href)}>
					{current.cta} <ArrowRight size={16} />
				</button>
				<button class="btn btn-ghost sm" onclick={next}>{isLast ? 'Concluir' : 'Ver o próximo passo'}</button>
			</div>
			<button type="button" class="onboarding-skip" onclick={skip}>Pular apresentação</button>
		</div>
	</div>
{/if}
