// Moedas suportadas no Plena. A moeda padrão do sistema (contas, extrato, cálculos gerais)
// fica em Configurações; um objetivo individual pode divergir dela (ex.: guardar Euros pra
// uma viagem enquanto o resto do app roda em R$) -- ver GoalFormModal.svelte.
export const CURRENCY_OPTIONS = [
	{ code: 'BRL', label: 'Real (R$)' },
	{ code: 'USD', label: 'Dólar americano (US$)' },
	{ code: 'EUR', label: 'Euro (€)' },
	{ code: 'GBP', label: 'Libra esterlina (£)' },
	{ code: 'ARS', label: 'Peso argentino (AR$)' },
	{ code: 'CHF', label: 'Franco suíço (CHF)' },
	{ code: 'JPY', label: 'Iene japonês (¥)' }
];

export function currencyLabel(code) {
	const found = CURRENCY_OPTIONS.find((c) => c.code === code);
	return found ? found.label : code || 'Real (R$)';
}
