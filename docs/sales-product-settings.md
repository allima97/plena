# Comissões e metas por produto

**Tipos de venda** configura os três percentuais gerais, dois passos escalonáveis opcionais e **Possui meta específica?**, que começa em **Não**. Escolher **Sim** revela a comissão específica do produto (%) e a meta mensal em reais, ambas obrigatórias. Escolher Não remove a meta e a comissão específica, sem alterar os percentuais gerais.

## Comissão geral e complemento do produto

As metas mensais e por produto usam o **total vendido, antes das taxas**. A base de comissão continua sendo a configurada no controle: bruto ou líquido.

Antes de atingir a meta do produto, é paga somente a comissão geral. Quando o acumulado do produto alcança a sua meta, o mês inteiro é recalculado com o complemento `máximo(0, comissão específica − comissão geral)`.

Para um produto de 10%, numa venda de R$ 100 sem taxas:

| Comissão geral | Complemento do produto | Total |
| --- | --- | --- |
| 0,80% = R$ 0,80 | 9,20% = R$ 9,20 | R$ 10,00 |
| 1,15% = R$ 1,15 | 8,85% = R$ 8,85 | R$ 10,00 |
| 1,35% = R$ 1,35 | 8,65% = R$ 8,65 | R$ 10,00 |

O KPI **Comissão das vendas** mostra somente a parcela geral. O KPI **Comissão · [produto]** mostra somente o complemento e permanece visível com **R$ 0,00 enquanto a meta específica não tiver sido atingida**. Uma correção ou exclusão de venda que reduza o acumulado abaixo da meta zera esse KPI. No desktop, a linha apresenta **Valor diário necessário → Comissão das vendas → Comissão do produto**, em três colunas iguais; no mobile, os cards ficam empilhados. A tabela identifica a comissão total (geral + complemento); componentes arredondados sempre somam exatamente esse total.

**Metas por tipo** aparece imediatamente abaixo da meta do mês. Produtos existentes sem comissão específica configurada mantêm seus cálculos anteriores: não se presume 10% nem se altera a configuração do usuário.

## Dois passos escalonáveis independentes

Os campos aparecem entre os percentuais: **Meta não batida | Escalonável antes | Meta batida | Escalonável após | Supermeta**. Cada campo informa quantos pontos percentuais de avanço na meta são necessários para acrescentar **0,01 ponto percentual** à comissão. Só passos completos são contados.

Com percentuais 0,80% / 1,15% / 1,35% e passo 1 nos dois campos:

- Até 80% da meta: mínimo de 0,80% de comissão.
- 81% → 0,81%; 82% → 0,82%; 99% → 0,99%.
- Em 100%: salta para o percentual de Meta batida, 1,15%.
- 101% → 1,16%; 102% → 1,17%; 120% ou mais → teto de 1,35%.

Com passo 2 antes: 80% → 0,80%, 81% → 0,80%, 82% → 0,81%. Com passo 2 após: 100% → 1,15%, 101% → 1,15%, 102% → 1,16%. Os dois campos são independentes; vazio mantém a regra fixa daquela fase. O teto configurado em Supermeta nunca é ultrapassado.

## Preservação e integração

Os tipos recebem `monthlySettings[YYYY-MM]` com `rates`, `hasTarget`, `target` e, quando configurados, `productRate`, `scaleStepBelow` e `scaleStepAbove`. O documento completo é salvo e sincronizado. **Metas mensais** continua configurando apenas meta, supermeta e base da comissão.

A configuração explícita do produto para o mês tem prioridade. Sem ela, vale a configuração mais próxima do produto — preferindo a mais recente anterior e, na falta dela, a mais antiga posterior — de modo que **a comissão geral cadastrada uma vez vale para todos os meses, anteriores e posteriores**, sem recadastro. Tipos que nunca usaram a tela de tipo herdam os percentuais do plano mensal mais próximo. Não há migração de registros financeiros.

Meses sem metas cadastradas também calculam comissões: um plano em memória sem meta resolve a configuração mais próxima de cada tipo e mantém as vendas na faixa **Meta não batida**, de modo que vendas de meses anteriores à criação do controle exibem percentual e valor em vez de **A configurar**.

Ao editar um tipo, **Aplicar alteração em** define o alcance da gravação: **Alterar todos os meses** regrava cada mês já configurado, **Alterar só este mês** grava apenas o mês em edição e **Alterar deste mês em diante** regrava o mês atual e os meses posteriores já configurados, preservando o histórico anterior. Meses nunca editados continuam seguindo a configuração mais próxima em qualquer dos escopos.

Os testes cobrem os exemplos, limites exatos, passos fracionários/independentes, teto, mudança de faixa, arredondamento em centavos, legado, isolamento entre meses/controles e APIs. A integração em bancos isolados verifica sincronização nos dois sentidos e rejeição de comissões/passos inválidos.
