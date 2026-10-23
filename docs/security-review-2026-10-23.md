# Revisão de segurança — Plena e NextGoals

Data: 23/10/2026. Responsável: nxapps · nxapps01@gmail.com.

## Escopo e evidências

Revisão do código de autenticação, autorização das APIs, sincronização, cópias locais, renderização HTML, dependências e transparência de privacidade. Testes usam identidades fictícias, SQLite em memória, JWTs de teste e e-mail simulado. Os testes de ataques e gravações usaram apenas dados fictícios; a conferência em produção usou navegação e leitura de respostas, sem exclusões reais. A alteração remota de schema é aditiva: `privacy_consents`.

A verificação remota por contagem encontrou zero documentos sem dono e zero proprietários com identidade fora do formato normalizado nos dois bancos. Isso descreve o estado consultado, não comprova ausência de incidentes passados.

## Correções

| Ponto encontrado | Correção e verificação |
| --- | --- |
| NextGoals permitia gravações sem validar origem ou identidade da aba | Origem obrigatória, bloqueio de cross-site, tipo JSON e cabeçalho da identidade conferidos antes de gravar; testes rejeitam 403/409/415 |
| Primeiro cadastro do NextGoals poderia reivindicar dados antigos sem dono | Reivindicação só para a conta configurada explicitamente; teste comprova que uma nova conta não recebe os registros |
| Cópias locais eram exibidas antes de validar a conta no NextGoals, incluindo a tela financeira secundária | Primeira exibição depende da autenticação; cópia secundária separada por conta; indisponibilidade da autenticação não abre a cópia de outra pessoa |
| Identificadores eram interpolados em atributos HTML do NextGoals | Escape de atributos e validação de identificadores em API e sincronização; chaves de protótipo e estruturas excessivas rejeitadas |
| JWT sem expiração não era expressamente rejeitado | Exige expiração e e-mail válido, assinatura RS256, emissor e audiência; teste inclui JWT expirado, audiência incorreta e ausência de expiração |
| Corpos JSON sem limite uniforme | Limite por bytes antes de acumular o corpo, 256 KiB para documentos e 8 MiB para snapshots autenticados entre serviços; rejeição 413 |
| Proteção de scripts/cabeçalhos incompleta | CSP com nonce no NextGoals e suporte nativo do SvelteKit no Plena, sem handlers de script embutidos; bloqueio de enquadramento, sniffing, envio de referrer e cache privado das APIs |
| Cópias pessoais permaneciam após sair ou voltar pelo histórico | Limpeza dos caches locais financeiros após logout, invalidação entre abas e nova verificação ao voltar pelo histórico; falha de logout no servidor é informada |
| Confirmação da integração não tinha registro de versão e havia corrida nas tentativas do OTP | Confirmação exigida no servidor, hash com chave e contexto de conta, reserva atômica das cinco tentativas, limitação atômica de envio, eliminação do código consumido e registro de autorização/revogação |
| Redefinição de senha e sessões pendentes | Redefinição invalida sessões e desafios na mesma transação; criação de sessão verifica o hash atual da conta |
| Transparência e portabilidade | Aviso de privacidade com responsável/contato e exportação autenticada de registros da própria conta; exportações não incluem senhas, tokens nem códigos |
| Dependência vulnerável na tela financeira secundária | Override de cookie para a versão corrigida, mantendo o SvelteKit existente; auditoria npm sem alertas conhecidos após a correção |

## Validação automatizada

- Plena: 19 testes aprovados, incluindo senha + OTP, cookies, uso único, limite de tentativas, redefinição e revogação.
- NextGoals: 26 testes aprovados, incluindo JWT, origem, troca de conta, limites, injeção, exportação e nonce.
- Integração real entre as duas APIs em ambiente isolado: ativação, reconciliação, exclusões, conta distinta, exportação e proteção contra troca de conta/origem.
- Auditorias npm dos dois projetos e da tela financeira secundária: zero alertas conhecidos. Isso não garante ausência de vulnerabilidades desconhecidas.
- Builds e empacotamento aprovados. Interface autenticada, formulários sem gravação, integração ativa e avisos de privacidade conferidos no navegador. Requisições remotas sem sessão/segredo retornaram 401 nas APIs e exportações; o aviso do Plena ficou acessível sem login.
- O endereço público de referência para o aviso é https://plena.nxapps.com.br/privacidade. O aviso do NextGoals também está disponível dentro do ambiente protegido por Access.

## LGPD: operação que a nxapps precisa manter

As correções reforçam a segurança técnica; não certificam conformidade integral com a LGPD.

1. Atender e registrar pedidos recebidos em nxapps01@gmail.com. Verificar identidade de forma proporcional, sem pedir senha, token ou código de login.
2. Definir e documentar prazos concretos de retenção, inclusive backups, logs da Cloudflare, dados de contas encerradas e registros de autorização. A expiração de um token impede seu uso; não é uma política completa de retenção.
3. Para pedidos de eliminação, confirmar a conta e o alcance do pedido, desativar a integração nos dois lados e considerar documentos, cópias locais, tombstones, sessões, desafios e backups. Evitar que uma cópia sincronizada restaure dados eliminados. Não executar exclusões reais durante uma auditoria.
4. Formalizar as bases legais e responsabilidades por finalidade, contratos com fornecedores, transferências internacionais e procedimento de resposta a incidentes.
5. Revisar as regras do Cloudflare Access, MFA, acessos administrativos, chaves compartilhadas, backups e restauração periodicamente. As verificações criptográficas no código não substituem a revisão das políticas da conta Cloudflare.
6. Restringir acesso de operadores aos bancos, logs e segredos. Nunca colocar credenciais em repositórios, arquivos públicos ou mensagens. Não rotacionar o segredo de integração em apenas um sistema.

Referências oficiais: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), [Guia de segurança da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-de-seguranca-para-agentes-de-tratamento-de-pequeno-porte) e [validação de JWT no Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
