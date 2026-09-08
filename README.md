# Plena — controle financeiro

App independente de controle financeiro (receitas, despesas, contas/cartões,
categorias, relatórios) com uma seção de **Objetivos**, que reaproveita a
ideia do app [nextgoals](https://github.com/) (Rumo Financeiro), agora no
mesmo visual do Plena.

Feito em SvelteKit 5 (runes), sem framework de UI — CSS próprio em
`src/app.css`, com os tokens de cor/tipografia extraídos do design de
referência (mockup em financedash-hbw5sto3.manus.space).

## Rodar localmente

```bash
npm install
npm run dev -- --open
```

Sem um backend publicado, os dados ficam salvos no `localStorage` do
navegador (chave `plena-state-v1`). Quando existir uma API própria em
`/api/plena/state` (mesmo padrão usado no nextgoals/financas-app, com um
Worker + D1 da Cloudflare), o app passa a sincronizar por ali automaticamente
— não precisa mudar nada no código, `src/lib/fin/persist.js` já tenta a API
primeiro e cai para o `localStorage` se ela não responder.

## Build

```bash
npm run build
```

Gera um site estático em `build/` (adapter-static), pronto para publicar em
Cloudflare Pages, Netlify, Vercel etc. — ou atrás de um Worker próprio, como
os outros apps da família (nextgoals).

## Banco de dados (D1) — sincronizar entre aparelhos

Sem banco, o Plena funciona sozinho salvando no `localStorage` do navegador
(ok para uso num só aparelho). Para sincronizar entre celular, computador
etc., ligue um banco D1 da Cloudflare — o app já sabe usá-lo assim que ele
existir, sem mudar nada no código.

Passo a passo, uma vez só:

```bash
npm install -g wrangler   # se ainda não tiver
wrangler login

# cria o banco (uma vez só)
wrangler d1 create plena-db
# copie o "database_id" que aparecer e cole em wrangler.jsonc, no lugar de
# COLE_AQUI_O_DATABASE_ID_DEPOIS_DO_WRANGLER_D1_CREATE

# cria a tabela no banco remoto (o que o site publicado usa)
wrangler d1 execute plena-db --remote --file=schema.sql
```

Depois disso, `git push` (o deploy no Cloudflare já está configurado com
`wrangler.jsonc` apontando pro binding `DB`) — o Worker publicado passa a
ler/gravar em `/api/plena/state` e `/api/<coleção>/<id>`, e o app troca
sozinho de "Salvo neste navegador" para "Salvo no banco de dados" (veja o
rodapé da barra lateral).

**Sobre segurança:** por enquanto essas rotas ficam abertas — quem souber a
URL do site consegue ler/gravar os dados, sem login. Se quiser travar isso,
dá pra colocar o mesmo esquema de login do nextgoals (Cloudflare Access,
"Entrar com o Google") na frente do domínio inteiro; é só pedir.

Para testar localmente contra o banco (em vez de só localStorage):

```bash
wrangler d1 execute plena-db --file=schema.sql   # tabela no banco local
npm run build
wrangler dev
```

## Estrutura

```
src/
  app.css              → design system (cores, tipografia, componentes)
  lib/
    fin/
      store.svelte.js  → estado global (contas, categorias, lançamentos,
                          objetivos, modelos de relatório, agendamento,
                          alertas) com runas do Svelte 5
      persist.js        → localStorage + API remota (2 camadas)
      derived.js         → cálculos derivados (totais, comprometido no mês,
                          vencimentos próximos, séries pausadas)
      export.js          → exportação em CSV e PDF (jsPDF), modelos de
                          relatório e histórico
      seed.js             → categorias padrão para uma conta nova
    components/          → Modal, ConfirmDialog, NewMovementModal,
                          ReportCenterModal, MovementRow (usados em várias
                          seções)
    sections/             → Dashboard, Movements, Accounts, Categories,
                          Reports (uma por item do menu)
    goals/                → Goals.svelte (seção Objetivos)
  routes/                 → uma rota por seção (/, /movimentacoes, /contas,
                          /categorias, /relatorios, /objetivos)
```

## Funcionalidades de lançamentos

- Lançamento único, parcelado (N parcelas mensais) ou recorrente (N meses),
  com geração automática de todas as ocorrências futuras já na criação.
- Editar, pausar, retomar ou cancelar uma série inteira (afeta só as
  ocorrências futuras ainda não pagas — o histórico já pago não muda).
- Editar uma ocorrência/parcela individual sem afetar o resto da série.
- Marcar cada lançamento como pago/pendente (clique no selo de status).
- Filtros por tipo de série, status da série, pago/pendente e data exata.
- Resumo do total comprometido em parcelas/recorrências no mês atual.
- Alertas na dashboard para vencimentos em 1/3/7 dias (prazos
  configuráveis pelo usuário) e para séries pausadas.

## Centro de relatórios (dentro de Movimentações e Relatórios)

- Filtros por período, conta, categoria e tipo de movimentação.
- Exportação em CSV e em PDF, com os mesmos filtros nos dois formatos.
- Modelos de relatório: salvar, editar, excluir (com confirmação),
  usar, compartilhar (exporta um `.json`) e importar (com validação e
  mensagem amigável se o arquivo estiver num formato inválido).
- Histórico das últimas exportações, com opção de baixar de novo.
- Agendamento de exportação mensal (dia + horário) usando um modelo salvo —
  a dashboard mostra a data da próxima exportação configurada. A execução
  automática em si (fora do navegador) ainda depende de um serviço externo
  de agendamento; por enquanto isso guarda a preferência e mostra o aviso
  na tela.

## Objetivos

Seção própria com o motor completo do Rumo Financeiro (nextgoals), portado
para o design do Plena e sincronizado no mesmo banco D1:

- 7 tipos de objetivo (financiamento, imóvel, viagem, carro, casamento,
  estudos, outro), cada um com nome, valor alvo, prazo e observações.
- Recursos (potes) por objetivo — o saldo de cada recurso é sempre
  calculado a partir do extrato de lançamentos, nunca guardado direto.
- Lançamentos (aportes/retiradas) por recurso, com categoria própria de
  objetivos; categorias marcadas para o ritmo entram no cálculo do ritmo
  médio mensal geral.
- Objetivos do tipo financiamento ganham uma aba de prestações (valor,
  amortização, juros, seguros, taxas, saldo devedor etc., com atalho que
  pré-preenche a partir da última prestação lançada) e de amortizações
  extras (redução de prazo, redução da prestação, quitação do saldo
  devedor).
- Métricas: acumulado, ritmo médio mensal, mês/valor recomendado, projeção
  de conclusão (ou data de conclusão, se já atingido), status e barra de
  progresso colorida (verde/amarelo/vermelho conforme o ritmo).
- Criar, editar, arquivar/reativar e excluir objetivos, recursos,
  lançamentos, prestações e amortizações, todos com confirmação antes de
  excluir.

Fora desta primeira leva: os gráficos de composição de prestação, a tabela
mês a mês de encargos/abatimentos e o tour guiado do nextgoals ainda não
foram portados.
