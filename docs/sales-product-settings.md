# Comissões e metas por produto

O cadastro em **Tipos de venda** concentra o nome, os três percentuais de comissão e a opção **Possui meta específica?**, que começa em **Não**. Ao escolher Sim, o valor mensal passa a ser visível e obrigatório. Escolher Não salva o valor como `null`, mesmo se um valor havia sido preenchido antes.

**Metas mensais** configura somente a meta, a supermeta e a base geral da comissão. As faixas de comissão continuam seguindo o atingimento da meta mensal do controle, pelo total vendido. A meta específica acompanha o produto e não muda essa regra.

## Preservação e integração

- Os tipos recebem `monthlySettings[YYYY-MM]` com `rates`, `hasTarget` e `target`. O documento é salvo e sincronizado como uma unidade.
- A configuração explícita do produto para o mês tem prioridade. Sem ela, os percentuais e metas já existentes no plano mensal continuam valendo.
- Para meses ainda sem configuração, são usados os últimos valores do produto registrados até aquele mês. Configurações de meses futuros não alteram os meses anteriores.
- Salvar metas gerais preserva os percentuais e metas por produto existentes nos planos antigos. Nenhuma migração de registros financeiros é executada.
- Plena e NextGoals usam a mesma resolução e validação; a integração testa gravação e leitura em ambos os sentidos, preservação do mês anterior e rejeição de percentuais inválidos.

Validação: testes dos modelos e APIs, integração em bancos isolados, build e conferência de interface para Não/Sim, valores preservados ao alternar, cadastro e edição de configurações existentes.
