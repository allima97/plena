# Modelo Turismo opcional

Ao criar um controle de vendas, **Modelo** começa em **Em branco — criar meus próprios tipos**. Escolher **Turismo** apresenta 13 sugestões, com nomes, percentuais por faixa e passos de escalonamento. O usuário pode desmarcar tipos antes de confirmar, cancelar ou criar o controle em branco. Após importar, os tipos continuam editáveis nos formulários existentes.

O catálogo é estático e versionado. A criação não consulta nenhuma outra conta, não migra cadastros antigos e não copia vendas, objetivos, valores de metas, identificadores ou histórico de configurações. Somente as regras genéricas dos tipos selecionados são aplicadas ao mês atual do novo controle. Os valores das metas devem ser definidos pelo próprio usuário. Seguro viagem oferece 10% como sugestão ao ativar a meta específica; ela começa desativada e sem valor.

A API `POST /api/sales-templates/import` exige a identidade autenticada, verificação de origem e cabeçalho do proprietário. A conta não pode ser fornecida no corpo. O catálogo é reconstruído no servidor; percentuais arbitrários no pedido são rejeitados. Seção e tipos são inseridos em uma única transação, com IDs novos vinculados à seção e à conta. Repetir o mesmo pedido não duplica registros nem sobrescreve edições ou restaura tipos excluídos. Nomes de controles ativos duplicados são rejeitados.

Com sincronização ativa, o novo controle e seus tipos seguem o mesmo canal autenticado entre Plena e NextGoals. Sem vínculo, permanecem somente na conta do sistema em que foram criados. Não há criação automática na entrada do usuário.

Validação: testes unitários de catálogo, validação, isolamento entre contas, reenvio, exclusão e rollback; integração das duas APIs com autenticação real, banco SQLite isolado, seleção de tipos, sincronização em ambas as direções e rejeição de origens/identidades inválidas. A conferência visual usa dados fictícios e formulários reais dos dois projetos.
