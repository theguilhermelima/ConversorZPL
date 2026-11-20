# Generators (geradores)

Esta pasta contém as ações que levam uma etiqueta convertida até uma saída:
impressão ou download. O nome de cada módulo indica seu destino. Os geradores
**não interpretam ZPL**: recebem `ConvertedDocument` e usam o modelo e/ou a
prévia produzida por `../readers/readSVG.tsx`.

## Fluxo que os geradores recebem

```text
textarea (zplCode)
  -> convertZpl(zplCode)
  -> convertedDocument (labels + warnings)
  -> SVGs com data-export-label na página
  -> gerador escolhido
```

O estado `convertedDocument` é criado em `../index.tsx`. Os handlers dos
botões passam esse mesmo objeto para cada gerador. Isso significa que os
geradores não devem buscar o texto diretamente do textarea nem converter
comandos novamente.

## Arquivos

### `printGenerator.ts`

Exporta `printGenerator(convertedDocument)`.

- Verifica que existem etiquetas e que o número de SVGs marcados com
  `data-export-label` corresponde ao número de labels.
- Cria regras CSS temporárias `@page` com a dimensão física de cada etiqueta.
- Converte pontos em milímetros usando `DEFAULT_PRINTER_DPI`.
- Chama `window.print()`. As regras gerais `@media print` de
  `../style.css` ocultam o editor, rodapé e botões para imprimir apenas as
  etiquetas, uma por página.
- Remove as regras temporárias no evento `afterprint` ou quando `print()`
  lança erro.

O DPI padrão é 203, comum em impressoras térmicas. Ajuste essa referência se o
destino usar outra resolução. A caixa de diálogo e o driver ainda controlam
opções como dispositivo, orientação, margens ou escala.

### `pdfGenerator.ts`

Exporta `pdfGenerator(convertedDocument)`. As especificações da saída estão no
próprio arquivo: `PDF_PRINT_DENSITY_DPMM = 8` e
`PDF_PRINT_QUALITY = 'grayscale'`. Chama `rasterizeLabelsForPdf`, cria um PDF
com uma página por etiqueta e inicia o download `etiquetas-zpl.pdf`. Cada SVG é
rasterizado em escala 1:1, apropriada para 8 dpmm (aproximadamente 203 dpi),
convertido para grayscale e compactado com DEFLATE antes de entrar no PDF. O
tamanho físico das páginas também é calculado com 8 dpmm. Assim o PDF usa
imagens grayscale com filtro Flate, em vez de imagens JPEG RGB em 3x. O
conteúdo continua raster, não vetorial nem texto selecionável. Imagens
rasterizadas idênticas são reutilizadas entre páginas, em vez de gravadas
repetidamente no arquivo.

### `jpegGenerator.ts`

Exporta `jpegGenerator(convertedDocument)`. Rasteriza os SVGs, compõe uma
imagem branca única com as etiquetas alinhadas verticalmente e baixa
`etiquetas-zpl.jpg`. Etiquetas múltiplas não viram arquivos separados.

### `generatorUtils.ts`

Compartilha lógica utilizada pelos geradores de imagem/PDF:

1. Confere se existem labels e se a prévia SVG está sincronizada.
2. Encontra os SVGs usando `data-export-label`.
3. Serializa cada SVG, carrega-o como imagem e desenha-o em um `canvas` com
   fundo branco.
4. Para JPEG, codifica o canvas como JPEG; para PDF, converte os pixels em
   grayscale e os compacta com DEFLATE.
5. Para PDF, escreve os objetos de imagem, páginas e tabela de referências do
   documento.
6. `downloadFile` cria um link temporário para iniciar o download.

O JPEG trabalha até 3x de escala; o PDF usa escala 1:1 para evitar pixels sem
ganho de detalhe na saída em 203 dpi. Ambos são limitados a 8192 pixels em
cada dimensão e 32 milhões de pixels por etiqueta. A folha JPEG também limita
a maior dimensão a 12000 pixels e a área a 40 milhões de pixels. Esses limites
evitam canvases excessivamente grandes; etiquetas ou lotes muito grandes
podem ser reduzidos ou falhar se a memória do navegador não for suficiente.

## Erros e integração

Os geradores lançam erros explícitos quando não existem etiquetas, quando a
prévia ainda não corresponde ao documento, ou quando canvas/serialização não
consegue criar a saída. `../index.tsx` captura essas falhas e mostra uma
mensagem na interface.

Para criar outro destino, por exemplo PNG ou uma impressora específica:

1. Crie um módulo com nome claro, como `pngGenerator.ts`.
2. Receba `ConvertedDocument` como parâmetro.
3. Reutilize `rasterizeLabels` se a saída puder partir do SVG já renderizado;
   evite duplicar essa rotina.
4. Use uma implementação específica quando o formato exigir algo além do
   modelo atual.
5. Importe e conecte o gerador ao botão/handler em `../index.tsx`.
6. Atualize este README e o README principal com formato, limitações e passos
   para validação.

Se a saída exigir novos dados que o modelo ainda não tem, primeiro avalie uma
alteração em `../zpl-parser.ts` e `LabelElement`; não tente recuperar esses
dados por meio de busca textual no textarea.
