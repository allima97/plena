// Infraestrutura de idiomas do Plena (Configurações > Língua).
//
// IMPORTANTE -- estado atual: só a "casca" do app (menu lateral, barra superior e a própria
// tela de Configurações) está de fato traduzida pros idiomas abaixo. As demais telas
// (Movimentações, Objetivos, Relatórios, Contas, Categorias, Patrimônio, Simulador e todos os
// modais) ainda têm o texto direto em português no template -- traduzir tudo isso é um projeto
// bem maior (centenas de textos espalhados por dezenas de arquivos) que fica como próximo passo;
// esta base (dicionário + t()) já está pronta pra receber essas chaves conforme forem migradas.
import { appState } from './fin/store.svelte.js';

export const LANGUAGE_OPTIONS = [
	{ code: 'pt-BR', label: 'Português (Brasil)' },
	{ code: 'en', label: 'English' }
];

const DEFAULT_LANG = 'pt-BR';

const dict = {
	'pt-BR': {
		nav_inicio: 'Início',
		nav_visaoGeral: 'Visão geral',
		nav_dinheiro: 'Dinheiro',
		nav_movimentacoes: 'Movimentações',
		nav_contas: 'Contas e cartões',
		nav_categorias: 'Categorias',
		nav_planejamento: 'Planejamento',
		nav_objetivos: 'Objetivos',
		nav_simulador: 'E se...?',
		nav_patrimonioGrupo: 'Patrimônio',
		nav_patrimonio: 'Patrimônio',
		nav_analise: 'Análise',
		nav_relatorios: 'Relatórios',
		nav_sistema: 'Sistema',
		nav_configuracoes: 'Configurações',
		nav_sair: 'Sair',
		nav_fecharMenu: 'Fechar menu',
		nav_maisOpcoes: 'Mais opções',
		nav_mais: 'Mais',
		nav_novoLancamento: 'Novo lançamento',
		nav_cliqueSair: 'clique para sair',
		nav_loginNaoConfigurado: 'Login não configurado',
		brand_tag: 'finanças pessoais',
		app_carregando: 'Carregando…',

		topbar_buscar: 'Buscar',
		topbar_ocultarValores: 'Ocultar valores',
		topbar_exibirValores: 'Exibir valores',
		topbar_notificacoes: 'Notificações',
		topbar_configuracoes: 'Configurações',

		sync_salvando: 'Salvando…',
		sync_erro: 'Alteração não sincronizada',
		sync_tentarNovamente: 'Tentar novamente',
		sync_sincronizado: 'Sincronizado',
		sync_salvoNavegador: 'Salvo neste navegador',
		sync_carregando: 'Carregando…',

		sair_confirmarTitulo: 'Sair do Plena?',
		sair_confirmarMsg: 'Você vai precisar entrar de novo pra acessar suas contas.',
		sair_confirmarBotao: 'Sair',

		settings_eyebrow: 'Sistema',
		settings_title: 'Configurações.',
		settings_sub: 'Preferências gerais do Plena.',
		settings_salvar: 'Salvar',
		settings_cancelar: 'Cancelar',
		settings_ok: 'Entendi',

		settings_tab_geral: 'Geral',
		settings_tab_layout: 'Layout',
		settings_tab_lingua: 'Língua',
		settings_tab_backup: 'Exportar/Importar',
		settings_tab_apagar: 'Apagar dados',

		settings_geral_titulo: 'Preferências gerais',
		settings_geral_sub: 'Como o Plena se comporta pra você.',
		settings_geral_paginaInicial: 'Página inicial',
		settings_geral_moedaPadrao: 'Moeda padrão do sistema',
		settings_geral_diaMes: 'O mês começa no dia',
		settings_geral_diaMesDica:
			'Usado em todo o app (Dashboard, Relatórios, faturas, ritmo dos objetivos) pra agrupar lançamentos por "mês financeiro" em vez do mês de calendário. Deixe 1 pra manter o mês de calendário normal.',
		settings_geral_confirmarSaida: 'Pedir confirmação antes de sair da conta',

		settings_layout_titulo: 'Aparência',
		settings_layout_sub: 'Tema e cores do app.',
		settings_layout_tema: 'Tema',
		settings_layout_temaClaro: 'Claro',
		settings_layout_temaEscuro: 'Escuro',
		settings_layout_corPrimaria: 'Cor primária',
		settings_layout_padrao: 'Padrão',
		settings_layout_corLancamentos: 'Cor dos lançamentos',
		settings_layout_corEntradas: 'Entradas',
		settings_layout_corSaidas: 'Saídas',

		settings_lingua_titulo: 'Idioma',
		settings_lingua_sub: 'Idioma do menu, da barra superior e desta tela de Configurações.',
		settings_lingua_idioma: 'Idioma do sistema',

		settings_backup_titulo: 'Exportar e importar',
		settings_backup_sub:
			'Baixe um arquivo com todos os seus dados pra guardar onde quiser -- Google Drive, Dropbox, ou localmente no celular/computador, pelo próprio menu de compartilhar do seu aparelho.',
		settings_backup_criar: 'Criar backup',
		settings_backup_restaurar: 'Restaurar backup',
		settings_backup_confirmarTitulo: 'Restaurar este backup?',
		settings_backup_confirmarMsg: 'Isso substitui TODOS os dados atuais pelos do arquivo. Essa ação não pode ser desfeita.',
		settings_backup_confirmarBotao: 'Restaurar',
		settings_backup_restaurando: 'Restaurando…',
		settings_backup_erroTitulo: 'Não deu pra abrir esse arquivo',

		settings_apagar_titulo: 'Apagar dados',
		settings_apagar_avisoBackup: 'Essas ações não podem ser desfeitas. Faça um backup antes, na aba Exportar/Importar.',
		settings_apagar_movimentos: 'Apagar todos os movimentos',
		settings_apagar_movimentosDesc: 'Remove todos os lançamentos de Movimentações. Contas e categorias continuam.',
		settings_apagar_categorias: 'Apagar todas as categorias',
		settings_apagar_categoriasDesc: 'Remove todas as categorias cadastradas.',
		settings_apagar_categoriasBloqueadas: 'Bloqueado: existem lançamentos usando alguma categoria. Apague os movimentos primeiro.',
		settings_apagar_tudo: 'Apagar todos os dados',
		settings_apagar_tudoDesc: 'Remove contas, categorias, movimentos, objetivos e patrimônio. Suas preferências continuam.',
		settings_apagar_botao: 'Apagar',
		settings_apagar_confirmarTitulo: 'Tem certeza?',
		settings_apagar_confirmarMsg: 'Essa ação é irreversível. Recomendamos fazer um backup antes de continuar.',
		settings_apagar_confirmarBotao: 'Sim, apagar',

		settings_toast_salvo: '✓ Preferências salvas.',
		settings_toast_restaurado: '✓ Backup restaurado.',
		settings_toast_movimentosApagados: '✓ Movimentos apagados.',
		settings_toast_categoriasApagadas: '✓ Categorias apagadas.',
		settings_toast_tudoApagado: '✓ Todos os dados foram apagados.',
		settings_erro_categoriasBloqueadas: 'Não foi possível: ainda há movimentos usando categorias.'
	},
	en: {
		nav_inicio: 'Home',
		nav_visaoGeral: 'Overview',
		nav_dinheiro: 'Money',
		nav_movimentacoes: 'Transactions',
		nav_contas: 'Accounts & cards',
		nav_categorias: 'Category management',
		nav_planejamento: 'Planning',
		nav_objetivos: 'Goals',
		nav_simulador: 'What if...?',
		nav_patrimonioGrupo: 'Net worth',
		nav_patrimonio: 'Net worth',
		nav_analise: 'Analysis',
		nav_relatorios: 'Reports',
		nav_sistema: 'System',
		nav_configuracoes: 'Settings',
		nav_sair: 'Sign out',
		nav_fecharMenu: 'Close menu',
		nav_maisOpcoes: 'More options',
		nav_mais: 'More',
		nav_novoLancamento: 'New entry',
		nav_cliqueSair: 'click to sign out',
		nav_loginNaoConfigurado: 'Login not configured',
		brand_tag: 'personal finance',
		app_carregando: 'Loading…',

		topbar_buscar: 'Search',
		topbar_ocultarValores: 'Hide amounts',
		topbar_exibirValores: 'Show amounts',
		topbar_notificacoes: 'Notifications',
		topbar_configuracoes: 'Settings',

		sync_salvando: 'Saving…',
		sync_erro: 'Change not synced',
		sync_tentarNovamente: 'Try again',
		sync_sincronizado: 'Synced',
		sync_salvoNavegador: 'Saved in this browser',
		sync_carregando: 'Loading…',

		sair_confirmarTitulo: 'Sign out of Plena?',
		sair_confirmarMsg: "You'll need to sign in again to access your accounts.",
		sair_confirmarBotao: 'Sign out',

		settings_eyebrow: 'System',
		settings_title: 'Settings.',
		settings_sub: 'General Plena preferences.',
		settings_salvar: 'Save',
		settings_cancelar: 'Cancel',
		settings_ok: 'Got it',

		settings_tab_geral: 'General',
		settings_tab_layout: 'Layout',
		settings_tab_lingua: 'Language',
		settings_tab_backup: 'Export/Import',
		settings_tab_apagar: 'Delete data',

		settings_geral_titulo: 'General preferences',
		settings_geral_sub: 'How Plena behaves for you.',
		settings_geral_paginaInicial: 'Home page',
		settings_geral_moedaPadrao: 'System default currency',
		settings_geral_diaMes: 'The month starts on day',
		settings_geral_diaMesDica:
			'Used across the whole app (Dashboard, Reports, invoices, goal pace) to group entries into a "financial month" instead of the calendar month. Leave it at 1 to keep the regular calendar month.',
		settings_geral_confirmarSaida: 'Ask for confirmation before signing out',

		settings_layout_titulo: 'Appearance',
		settings_layout_sub: 'Theme and colors for the app.',
		settings_layout_tema: 'Theme',
		settings_layout_temaClaro: 'Light',
		settings_layout_temaEscuro: 'Dark',
		settings_layout_corPrimaria: 'Primary color',
		settings_layout_padrao: 'Default',
		settings_layout_corLancamentos: 'Transaction colors',
		settings_layout_corEntradas: 'Income',
		settings_layout_corSaidas: 'Expenses',

		settings_lingua_titulo: 'Language',
		settings_lingua_sub: 'Language for the menu, top bar and this Settings screen.',
		settings_lingua_idioma: 'System language',

		settings_backup_titulo: 'Export and import',
		settings_backup_sub:
			'Download a file with all your data to keep wherever you like -- Google Drive, Dropbox, or locally on your phone/computer, through your device\'s own share menu.',
		settings_backup_criar: 'Create backup',
		settings_backup_restaurar: 'Restore backup',
		settings_backup_confirmarTitulo: 'Restore this backup?',
		settings_backup_confirmarMsg: 'This replaces ALL current data with what is in the file. This action cannot be undone.',
		settings_backup_confirmarBotao: 'Restore',
		settings_backup_restaurando: 'Restoring…',
		settings_backup_erroTitulo: "Couldn't open that file",

		settings_apagar_titulo: 'Delete data',
		settings_apagar_avisoBackup: 'These actions cannot be undone. Make a backup first, in the Export/Import tab.',
		settings_apagar_movimentos: 'Delete all transactions',
		settings_apagar_movimentosDesc: 'Removes every entry in Transactions. Accounts and categories stay.',
		settings_apagar_categorias: 'Delete all categories',
		settings_apagar_categoriasDesc: 'Removes every category you have.',
		settings_apagar_categoriasBloqueadas: 'Blocked: some transactions still use a category. Delete transactions first.',
		settings_apagar_tudo: 'Delete all data',
		settings_apagar_tudoDesc: 'Removes accounts, categories, transactions, goals and net worth. Your preferences stay.',
		settings_apagar_botao: 'Delete',
		settings_apagar_confirmarTitulo: 'Are you sure?',
		settings_apagar_confirmarMsg: 'This action is irreversible. We recommend making a backup before continuing.',
		settings_apagar_confirmarBotao: 'Yes, delete',

		settings_toast_salvo: '✓ Preferences saved.',
		settings_toast_restaurado: '✓ Backup restored.',
		settings_toast_movimentosApagados: '✓ Transactions deleted.',
		settings_toast_categoriasApagadas: '✓ Categories deleted.',
		settings_toast_tudoApagado: '✓ All data has been deleted.',
		settings_erro_categoriasBloqueadas: 'Not possible: there are still transactions using categories.'
	}
};

/** Traduz `key` pro idioma atual (Configurações > Língua), caindo pro português se o idioma ou
 * a chave não existirem -- nunca quebra a tela, só devolve a própria chave como último recurso. */
export function t(key) {
	const lang = appState.settings.language || DEFAULT_LANG;
	return dict[lang]?.[key] ?? dict[DEFAULT_LANG]?.[key] ?? key;
}
