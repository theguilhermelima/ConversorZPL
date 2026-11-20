# Readers (leitores)

Esta pasta contém componentes que **leem o modelo convertido e o apresentam
visualmente**. Não é aqui que o texto ZPL é interpretado; essa função pertence
a `../zpl-parser.ts`.

## O que entra e o que sai

O parser fornece `ConvertedLabel`, que contém:

- `width` e `height`: dimensões em pontos ZPL;
- `elements`: retângulos, textos, códigos de barras, QR Codes e gráficos;
- `hasGraphic`: indicador de presença de gráfico.

Um reader recebe esses dados e os transforma em uma representação visual. Os
readers não devem duplicar a conversão dos comandos ZPL nem manter uma segunda
cópia do código-fonte.

## `readSVG.tsx`

`ReadSVG({ label })` é atualmente o único leitor. É um componente React usado
para cada etiqueta em `../index.tsx`.

1. Cria o elemento `<svg>` e define `viewBox`, largura e altura a partir de
   `label`.
2. Desenha um retângulo branco como fundo.
3. Percorre `label.elements` e seleciona o desenho pelo campo discriminador
   `type`:
   - `rectangle`: `<rect>` com preenchimento/borda;
   - `text`: `<text>` com posição, tamanho e cor;
   - `barcode`: barras `<rect>` e o valor legível abaixo;
   - `qrcode`: matriz de módulos `<rect>` com a zona silenciosa branca;
   - `graphic`: `<image>` usando o `href` que o parser produziu.
4. Marca o SVG com `data-export-label`. Impressão e exportação usam esse
   atributo para encontrar as etiquetas já renderizadas.

O componente renderiza SVG na página; não gera um arquivo SVG para download.
Os componentes não fazem download nem chamam a caixa de impressão — essas
ações são responsabilidade dos geradores.

## Como adicionar um reader

Crie um componente ou módulo nesta pasta quando uma nova representação visual
for necessária. Receba `ConvertedLabel` ou `ConvertedDocument` por props,
percorra `elements` e trate explicitamente cada variante de `LabelElement`.
Conecte o reader em `../index.tsx`.

Se a nova saída precisar gerar ou baixar arquivos, coloque a operação e seus
efeitos colaterais em `../generators/`; use o reader como apresentação, não
como local para interpretação ZPL ou download.

## Limites compartilhados

`LabelElement` e os tipos `ConvertedLabel`/`ConvertedDocument` são definidos
em `../zpl-parser.ts`. Mudanças nesses tipos afetam todos os readers e
generators; atualize cada consumidor quando adicionar uma nova variante.
