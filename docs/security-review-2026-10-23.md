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

## Segunda revisão aprofundada (23/10/2026)

Revisados novamente autenticação, consumo concorrente dos códigos, escopo das consultas e exportações, entrada de documentos, reconciliação, renderização de campos importados, CSV, PWA e cópias locais. Incluídas as alterações recentes de LGPD/traduções e logout do Access já existentes nas branches, preservando-as.

| Falha confirmada / melhoria | Tratamento e limite |
| --- | --- |
| Fator antigo de derivação de senha abaixo da recomendação atual | PBKDF2-SHA256 elevado de 100 mil para 600 mil iterações, com atualização transparente e condicional dos hashes antigos e teste no runtime |
| Tentativas simultâneas de OTP de login podiam todas comparar o código antes de reservar uma tentativa | Reserva atômica antes do HMAC; apenas cinco comparações, incluindo a quinta correta. Vinte requisições simultâneas testadas; uso único e redefinição continuam protegidos |
| Campos de datas inválidas, moeda inválida e número da prestação podiam chegar sem escape ao HTML do NextGoals | Datas inválidas mostram travessão; moeda inválida usa BRL; números e título de exclusão escapados. Teste executa os formatadores e a renderização de confirmação com carga HTML |
| CSV do Plena podia transportar fórmulas em descrições/categorias/contas | Neutralização de prefixos de fórmula e controles iniciais, além de aspas/delimitadores; valores negativos numéricos continuam numéricos |
| Código de integração não participava do orçamento mensal de envio | Login e integração usam a mesma reserva atômica de cota; limite por usuário continua aplicado |
| Resposta de reconciliação iniciada antes da revogação podia ser importada depois dela | Revalidação do vínculo antes de importar o retorno remoto; teste desativa o vínculo durante a requisição e confirma que os dados recebidos não entram |
| Identificador de exclusão de vendas passava duas vezes por decodificação no NextGoals | Decodificação única na entrada do roteador, preservando a identidade do documento |
| Área de direitos no Plena precisava de controles visíveis | Aba Privacidade e LGPD com aviso, exportação, preparação de pedido por e-mail, explicação de revogação e consulta/encerramento de outras sessões |

As sessões são consultadas e revogadas exclusivamente pela identidade autenticada. A API não devolve identificadores, hashes ou tokens. A revogação mantém a sessão atual, verifica sua validade novamente na própria instrução SQL e não altera sessões de outra conta. Ela não apaga dados já baixados em dispositivos desconectados.

O formulário LGPD prepara um e-mail para **nxapps01@gmail.com**, sem enviá-lo automaticamente nem alegar que uma solicitação foi protocolada. Pedidos de eliminação/encerramento precisam considerar os dois sistemas e a retenção legal; não foi implementada uma exclusão unilateral capaz de restaurar dados pela sincronização.

### Verificação desta revisão

- Plena: 21 testes aprovados; NextGoals: 27 testes aprovados; testes adicionais da integração executam as duas APIs com sessão/JWT reais de teste e bancos isolados.
- Cenários incluem origem proibida, identidade trocada, conta distinta, exportação isolada, OTP concorrente, quinta tentativa correta, sessões de outro usuário preservadas, cargas HTML e CSV, revogação durante reconciliação e exclusão sincronizada.
- Auditorias de dependências nos dois projetos e na aplicação financeira secundária: zero alertas conhecidos na consulta desta revisão.
- A migração já existente `0008_sync_otps_attempts_check.sql` foi conferida com todas as migrações no banco de teste: preserva os registros e limita tentativas no banco. A pendência foi aplicada em produção pelo fluxo de migrações do Wrangler, com backup automático do D1.
- NextGoals: apresentação mobile de vendas ajustada para um card por venda, campo por linha, rótulo à esquerda e valor à direita, preservando filtros, busca e paginação.

### Limitações e ações operacionais pendentes

1. A revisão não certifica conformidade integral nem prova ausência de incidentes. Não houve auditoria das políticas/MFA do painel Cloudflare, contratos com fornecedores, rotinas de backup/restauração ou histórico de acessos administrativos.
2. O Plena usa senha mais código de e-mail e sessão com limite absoluto de 30 dias. O comentário antigo que limitava PBKDF2 a 100 mil iterações foi confrontado com o runtime instalado: 600 mil iterações funcionam na data/flags configuradas. PBKDF2-SHA256 foi elevado para 600 mil; hashes antigos são verificados e atualizados de forma condicional no próximo login, sem invalidar sessões ou exigir redefinição. Testes cobrem a migração e comparam um vetor de teste no workerd com a implementação nativa do Node. Novas senhas e redefinições já usam o fator maior.
3. A proteção do e-mail é essencial para ambos os sistemas. MFA da conta de e-mail/IdP e permissões administrativas precisam ser geridos pela nxapps. O NextGoals delega login ao Access; revogar suas sessões exige controles do Access, não a tabela de sessões do Plena.
4. Definir prazos concretos e bases legais por finalidade, procedimento de atendimento LGPD e resposta a incidentes. Eliminação pode ter ressalvas legais e deve alcançar cópias e integrações aplicáveis. A revogação interrompe novas sincronizações; não elimina automaticamente dados existentes nem desfaz entregas já concluídas.
5. Cópias financeiras locais e arquivos exportados continuam sendo dados pessoais: sair limpa este navegador, mas o servidor não pode garantir apagamento de cópias offline ou backups externos. Acesso físico a um aparelho desbloqueado continua sendo risco.

Referências complementares: [direitos dos titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares), [armazenamento de senhas — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) e [injeção de CSV — OWASP](https://owasp.org/www-community/attacks/CSV_Injection).
