# Entrada de valores monetários

Os campos monetários usam pontuação brasileira, teclado decimal no celular e duas casas decimais ao perder o foco. Não há conversão automática dos últimos dígitos em centavos: `3400` representa R$ 3.400,00, e `3400,50` representa R$ 3.400,50.

- Digitação e colagem aceitam `3.400,50`, `3400,50` e `R$ 3.400,50`.
- O ponto decimal é aceito quando não pode ser confundido com agrupamento brasileiro: `3400.50` é aceito; `3.400` representa 3.400 reais.
- Campos vazios opcionais, valores negativos quando permitidos, limites e obrigatoriedade são preservados. Valores inválidos ou com mais de duas casas decimais não podem ser salvos.
- A apresentação muda ao sair do campo para preservar a posição do cursor durante a edição. O modelo, os documentos enviados à API e a sincronização continuam usando números, nunca texto formatado.
- Percentuais, quantidades, datas e taxas de câmbio mantêm os seus formatos e precisões específicos.

A implementação compartilhada é `money-input.js`, com a ação Svelte e a inicialização dos campos dinâmicos do NextGoals. Os testes cobrem centavos, agrupamento, números negativos, valores inválidos, limites e atualização do modelo.
