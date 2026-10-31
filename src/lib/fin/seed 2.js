// Default "Principal" categories, seeded once for a brand-new account.
// The user can rename/remove any of these and add their own from the
// Categorias tab -- this list only matters the very first time the app
// opens with nothing saved yet.

export function uid() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const RECEITA_PADRAO = ['Salário', 'Ajuda de Custo', 'Rendimentos', 'Adiantamento', 'Férias', '13º Salário'];

const DESPESA_PADRAO = [
	'Água',
	'Luz',
	'Telefone',
	'Celular',
	'TV a Cabo',
	'Internet',
	'Mercado',
	'Cartão de Crédito',
	'Empréstimo',
	'Financiamento',
	'Aluguel',
	'Transporte',
	'Saúde',
	'Educação',
	'Lazer'
];

export function seedCategories() {
	const receitas = RECEITA_PADRAO.map((nome) => ({ id: uid(), tipo: 'receita', nome, secundarios: [] }));
	const despesas = DESPESA_PADRAO.map((nome) => ({ id: uid(), tipo: 'despesa', nome, secundarios: [] }));
	return [...receitas, ...despesas];
}

export const FORMAS_PAGAMENTO_PADRAO = [
	'PIX',
	'Cartão de Crédito',
	'Débito em Conta',
	'Boleto Bancário',
	'Dinheiro',
	'Transferência'
];
