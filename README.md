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

**Sobre segurança:** as rotas `/api/*` já exigem login (ver seção
"Login com Google" logo abaixo) — sem ele configurado, a API responde 401 e
o app cai sozinho para o `localStorage`.

Para testar localmente contra o banco (em vez de só localStorage):

```bash
wrangler d1 execute plena-db --file=schema.sql   # tabela no banco local
npm run build
wrangler dev
```

## 🔐 Login com Google (Cloudflare Access)

Igual ao nextgoals: quem cuida do "Entrar com o Google" é o **Cloudflare
Access** (Zero Trust) — ele fica na frente do site inteiro, e entrega ao
Worker um crachá assinado (JWT) dizendo quem é. O Worker (em
`src/hooks.server.js` + `src/lib/server/access.js`) só confere esse crachá
nas rotas `/api/*`; nunca lida com senha nem com a conta do Google
diretamente. Por segurança é "fechado por padrão": enquanto
`TEAM_DOMAIN`/`POLICY_AUD` não estiverem configurados em `wrangler.jsonc`,
a API responde 401 para todo mundo (não fica aberta enquanto isso).

Como o Plena é de uso pessoal (só você), não existe tabela de usuários nem
separação de dados por conta — o login aqui é só o "cadeado" na porta,
impedindo que outra pessoa acesse a URL. Isso é mais simples do que o
esquema multiusuário do nextgoals, de propósito.

Passo a passo, uma vez só (você já tem o Zero Trust configurado por causa
do nextgoals, então é só o passo 3 em diante que é novo):

1. Zero Trust já está ativado na sua conta (feito quando você configurou o
   nextgoals) — não precisa repetir.
2. O Google como método de login também já está configurado (idem).
3. **Crie uma Application nova, só para o Plena**: **Zero Trust → Access →
   Applications → Add an application → Self-hosted**. Aponte o domínio para
   onde o Worker do Plena está publicado (o mesmo domínio do
   `wrangler deploy`, ex.: `plena.allima97.workers.dev` ou um domínio
   próprio, se você configurar um depois). Na política de acesso, escolha
   **Login Methods: Google** com regra **Emails** apontando só para o seu
   e-mail (diferente do nextgoals, aqui não precisa ser "Everyone", já que é
   um app de uma pessoa só).
4. **Pegue a "Application Audience (AUD) Tag"** dessa Application nova (
   aparece na tela de visão geral dela, ou em **Additional settings**) e
   cole em `wrangler.jsonc`, em `vars.POLICY_AUD`, no lugar do placeholder
   `COLOQUE_AQUI_O_AUD_TAG_DA_APPLICATION_DO_PLENA`. O `TEAM_DOMAIN` já está
   preenchido (é o mesmo do nextgoals).
5. `git push` (ou `wrangler deploy`) de novo depois de editar o
   `wrangler.jsonc` — as variáveis em `vars` só valem a partir do próximo
   deploy.

Depois disso, abrir a URL do Plena vai pedir login com Google antes de
mostrar qualquer coisa, e o rodapé da barra lateral deve trocar para "Salvo
no banco de dados" assim que você entrar. Um ícone com suas iniciais aparece
no topo direito — clicar nele sai da conta.

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
