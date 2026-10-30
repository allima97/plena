// Default "Principal" categories, seeded once for a brand-new account.
// The user can rename/remove any of these and add their own from the
// Categorias tab -- this list only matters the very first time the app
// opens with nothing saved yet.
//
// Ids são determinísticos (derivados do nome) porque o seed é enviado ao
// servidor com upsert: se dois dispositivos semeadarem ao mesmo tempo com o
// remoto vazio, os mesmos ids colidem e se sobrescrevem em vez de criar
// categorias duplicadas.

export function uid() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function seedSlug(nome) {
	return nome
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
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
	const receitas = RECEITA_PADRAO.map((nome) => ({ id: `seed-receita-${seedSlug(nome)}`, tipo: 'receita', nome, secundarios: [] }));
	const despesas = DESPESA_PADRAO.map((nome) => ({ id: `seed-despesa-${seedSlug(nome)}`, tipo: 'despesa', nome, secundarios: [] }));
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
