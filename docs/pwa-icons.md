# Ícones do PWA

O manifesto público continua em `/manifest.webmanifest`, com a mesma identidade,
escopo e URL inicial. A resposta escolhe a arte pelo User-Agent e usa
`Vary: User-Agent` e `Cache-Control: no-cache` para revalidar a variante correta.
Não é necessário login para obter o manifesto ou os ícones.

| Sistema | Arquivos em `static/icons/` | Uso |
| --- | --- | --- |
| macOS | `pwa-macos-{192,512,1024}-v2.png` | Fundo opaco até as bordas, margem em torno da arte e máscara aplicada pelo sistema. |
| Windows | `pwa-windows-{192,512}-v2.png` | Ícone com exterior transparente, declarado como `any`. |
| Android | `pwa-android-{192,512,1024}-v2.png` | Arte central com margem para a máscara adaptativa, sem selo Android. |
| iPhone/iPad | `pwa-ios-{152,167,180,192,512,1024}-v2.png` | Imagem opaca e quadrada, sem selo Safari; links Apple Touch em 152, 167 e 180 px. |

`static/apple-touch-icon.png` também contém a versão iOS de 180 px para o
fallback da Apple. Os nomes `v2` evitam reutilizar o endereço dos ícones antigos.
O sistema pode conservar o ícone de uma instalação existente; depois de publicar,
se ele não atualizar, remova apenas o atalho/app instalado e adicione-o novamente.

A detecção depende da identificação enviada pelo navegador. Um iPad que se
identifique como Mac recebe a variante macOS no manifesto, mas continua com os
links Apple Touch específicos no HTML.

Referências: [Safari 17.2 e ícones de web apps](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/),
[zona segura dos ícones adaptativos](https://web.dev/articles/maskable-icon).

## Produção das artes

As quatro artes foram adaptadas da imagem de referência enviada nesta solicitação
com a ferramenta integrada `image_gen`. As versões menores são apenas reduções
para os tamanhos de instalação. Os textos da prancha e os selos de sistema não
fazem parte da marca instalada. Prompts usados:

### macOS

Use case: precise-object-edit. Asset type: production PWA macOS maskable icon. Input image is an edit target sheet of four logos. Extract and faithfully reproduce ONLY the upper-left green and gold 3D financial growth artwork (gold target, arrow, leaves, coins and rising bars). Remove the rounded square tile border and outside background, all text, and shadows around the tile. Deliver one square 1024x1024 opaque full-bleed icon with a smooth deep emerald background extending to all four edges, NO rounded corners. Center the complete financial artwork at about 56% of the canvas width and height, leaving generous green padding; every leaf, arrow feather, bar and coin fits inside a central circle of diameter 76% of canvas. Keep recognizable composition, proportions, colors, and detail of upper-left icon. No labels, no typography, no OS badges. This file is to be masked by macOS automatically; do not pre-mask.

### Windows

Use case: precise-object-edit. Asset type: production Windows PWA icon. Input image is an edit target sheet of four logos. Extract and faithfully reproduce ONLY the UPPER-RIGHT Windows green and gold flat financial growth icon. Deliver one centered rounded-square green icon with the target, gold arrow, green leaves, gold coins and rising bars exactly as the reference. Transparent exterior around the rounded-square tile; tile occupies 84% of square image, with consistent clear margins on every side. No text, no captions, no OS badges, no other tiles, no background texture. Preserve original upper-right flat illustration style. Square output, 1024x1024.

### Android

Use case: precise-object-edit. Asset type: production Android PWA maskable icon. Input image is an edit target sheet of four logos. Reproduce the financial growth artwork from LOWER-LEFT Android variant: target, arrow, leaves, coins, green rising chart. Remove the Android badge, circular surround, grey border and text. Deliver a square 1024x1024 opaque full-bleed deep emerald background with NO rounded corners or circle outline. Center the entire flat green and gold financial artwork within central 56% of image width/height; all essential artwork fits inside central circle of diameter 76% canvas. Generous uniform green padding. The operating system will apply its own circular/adaptive mask. No badge, no letters, no text.

### iOS

Use case: precise-object-edit. Asset type: production iPhone apple-touch-icon. Input image is an edit target sheet of four logos. Faithfully reproduce ONLY the LOWER-RIGHT green and gold financial growth artwork (target, arrow, leaves, coins, rising chart), with the SAME outlined illustration style. REMOVE the Safari browser badge entirely and reconstruct the coins and bars it covered. Remove all captions and surrounding texture. Deliver a square opaque full-bleed deep emerald background without rounded corners (iOS applies its own rounding). Complete artwork centered at about 70% of canvas width/height with comfortable margins, no clipping. No letters, no badges, no other logos. Square 1024x1024.
