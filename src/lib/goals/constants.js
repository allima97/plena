// Mesmos tipos de objetivo do Rumo Financeiro (nextgoals), portados 1:1.
export const GOAL_TYPES = {
	financiamento: { label: 'Financiamento', icon: 'loan' },
	imovel: { label: 'Imóvel', icon: 'home' },
	viagem: { label: 'Viagem', icon: 'travel' },
	carro: { label: 'Automóvel', icon: 'car' },
	casamento: { label: 'Casamento', icon: 'rings' },
	estudos: { label: 'Estudos', icon: 'gradcap' },
	outro: { label: 'Outro objetivo', icon: 'flag' }
};

export const GOAL_TYPE_OPTIONS = Object.entries(GOAL_TYPES).map(([value, meta]) => ({ value, ...meta }));

export const AMORT_TIPOS = ['Redução do Prazo', 'Redução da Prestação', 'Quitação Saldo Devedor'];

export const RESOURCE_GROUPS = [
	{ value: 'outros', label: 'Outros recursos' },
	{ value: 'reserva', label: 'Fundo de reserva' }
];
