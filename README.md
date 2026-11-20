# Conversor ZPL

Aplicação web para colar ou importar código ZPL, visualizar etiquetas em SVG e
imprimir ou exportar o resultado como PDF e JPEG. A interpretação do ZPL e as
saídas são processadas no navegador.

## Começar

Requisitos: Node.js e pnpm (o projeto declara `pnpm@12.3.4`).

```bash
pnpm install
pnpm dev
```

Abra o endereço local exibido no terminal (normalmente
`http://localhost:3000`). Outros comandos disponíveis:

```bash
pnpm build
pnpm start
pnpm exec tsc --noEmit
```

## Mapa do projeto

```text
app/
  layout.tsx                 Metadados da página e layout HTML
  page.tsx                   Monta os painéis da página
  globals.css                Estilos globais e Tailwind
  panels/
    conversorzpl/
      index.tsx              Painel ZPL: editor, estado e coordenação
      style.css              Interface, prévia e regras de impressão
      zpl-parser.ts          ZPL -> modelo ConvertedDocument
      upload/
        ZplFileUpload.tsx    Seleção, leitura e limite de tamanho do arquivo
      readers/
        README.md            Explica os leitores
        readSVG.tsx          Modelo convertido -> prévia SVG React
      generators/
        README.md            Explica os geradores
        printGenerator.ts    Abre a impressão do navegador
        pdfGenerator.ts      Baixa um PDF
        jpegGenerator.ts     Baixa um JPEG
        generatorUtils.ts    Rasterização e utilitários compartilhados
IDEIAS.md                    Sugestões de futuras melhorias
```

## O caminho dos dados

O textarea não guarda os dados em um arquivo ou banco de dados. O texto fica na
memória do estado React `zplCode`, definido no componente
`ConversorZplPanel`, em `app/panels/conversorzpl/index.tsx`. Ao fechar ou
atualizar a página, o conteúdo digitado/importado não é persistido pela aplicação.

O caminho completo é:

```text
ZPL inicial, digitação ou arquivo .zpl/.txt
  -> estado zplCode em app/panels/conversorzpl/index.tsx
  -> useEffect espera 120 ms após a última alteração
  -> convertZpl(zplCode), em app/panels/conversorzpl/zpl-parser.ts
  -> estado convertedDocument: { labels, warnings }
  -> ├─ ReadSVG -> SVG exibido na prévia
     ├─ printGenerator -> janela de impressão
     ├─ pdfGenerator -> arquivo etiquetas-zpl.pdf
     └─ jpegGenerator -> arquivo etiquetas-zpl.jpg
```

### Entrada e edição

`ConversorZplPanel` inicia `zplCode` com um exemplo ZPL. O `<textarea>` é
controlado por esse estado: cada evento `onChange` substitui o valor do estado
pelo texto digitado. O botão **Importar** abre um campo de arquivo que aceita
`.zpl` e `.txt`. O componente `ZplFileUpload` lê o arquivo como texto e passa o
conteúdo para o estado `zplCode`, exatamente como a edição manual.

O componente `ZplFileUpload` em
`app/panels/conversorzpl/upload/ZplFileUpload.tsx` contém o
campo de arquivo, o botão, a leitura e a validação. Aceita arquivos de até
**4.000.000 bytes** (4 MB decimais); arquivos maiores são recusados antes da
leitura. Ao concluir, passa o conteúdo e o nome do arquivo para
`ConversorZplPanel`, que atualiza `zplCode` e `lastLoaded`. Erros são enviados ao
estado `fileError` da página. O conteúdo é mantido no navegador; não há envio
do ZPL a um serviço remoto nesta etapa.

### Estados importantes da tela

| Estado/valor | Para que serve |
| --- | --- |
| `zplCode` | Fonte ZPL exibida no textarea; é o dado original da edição/importação. |
| `convertedDocument` | Resultado mais recente de `convertZpl`: etiquetas e avisos. Alimenta a prévia e os geradores. |
| `reloadVersion` | Contador usado pelo botão **Carregar** para pedir uma nova conversão sem mudar o texto. |
| `isConverting` | Indica que a conversão está agendada/em andamento e controla os botões de saída. |
| `fileError` | Mensagem de erro ao importar ou ler o arquivo. |
| `exportError` / `isExporting` | Mensagem e estado de andamento dos geradores PDF/JPEG. |
| `lastLoaded` | Status da última importação ou do botão **Carregar**; não contém o ZPL. |
| `isDark` | Tema visual atual; não altera o conteúdo nem a conversão. |

### Conversão e modelo intermediário

O mesmo painel observa `zplCode` com um `useEffect`. Após 120 ms sem novas
alterações, chama `convertZpl(zplCode)`. Se o texto mudar antes disso, o timer
anterior é cancelado. Se uma conversão antiga terminar depois de uma nova
edição, seu resultado é descartado.

O botão **Carregar** incrementa `reloadVersion` e força o mesmo `useEffect` a
converter novamente o conteúdo já guardado em `zplCode`. A contagem de linhas
também é calculada a partir desse estado. O gutter numérico acompanha o scroll
do textarea.

O parser não cria SVG, PDF ou JPEG. Ele interpreta o subconjunto de comandos
ZPL que conhece e devolve uma estrutura intermediária:

- `ConvertedDocument`: o conjunto `{ labels, warnings }`.
- `ConvertedLabel`: largura e altura em pontos ZPL, elementos e indicação de
  presença de gráfico.
- `LabelElement`: elemento identificado pelo campo `type`: `text`,
  `rectangle`, `barcode`, `qrcode` ou `graphic`.

`convertedDocument`, também estado React de `ConversorZplPanel`, é a fonte de dados
para a prévia e para os três botões de saída. É mantido em memória; não
substitui nem apaga o ZPL original em `zplCode`.

O exemplo inicial em `app/panels/conversorzpl/index.tsx` é uma etiqueta fictícia
de envio.
Seu código Code 128 e QR Code contêm o mesmo endereço:
`https://theguilhermelima.github.io/theguilhermelima/`.

### Prévia SVG

`app/panels/conversorzpl/readers/readSVG.tsx` exporta o componente `ReadSVG`.
O painel chama esse componente para cada `ConvertedLabel`. Ele converte os tipos do modelo em
elementos SVG correspondentes: `<text>`, `<rect>`, `<image>` e grupos de barras
do código de barras e do QR Code.

O SVG recebe um `viewBox` com as dimensões da etiqueta e um fundo branco. O
elemento tem o atributo `data-export-label`: os geradores usam esse marcador
para localizar a prévia que será impressa ou rasterizada.

### Impressão, PDF e JPEG

Os geradores ficam em `app/panels/conversorzpl/generators/`; nenhum deles
interpreta comandos ZPL novamente.

- **Imprimir:** `printGenerator` valida que a prévia corresponde às etiquetas,
  aplica regras CSS `@page` com o tamanho físico calculado para cada etiqueta
  e chama `window.print()`. A conversão de pontos para milímetros usa a
  resolução padrão de 203 dpi. O navegador ou o driver da impressora ainda
  pode oferecer opções próprias de escala e papel.
- **PDF:** `pdfGenerator` rasteriza cada SVG em escala 1:1, converte os pixels
  para grayscale e os compacta com DEFLATE, criando uma página por etiqueta.
  Essa escala corresponde à densidade de 8 dpmm (aproximadamente 203 dpi),
  definida por `PDF_PRINT_DENSITY_DPMM` em `pdfGenerator.ts`. A qualidade
  `grayscale` também é definida nesse arquivo e determina o espaço de cor PDF.
  O conteúdo continua raster (não vetorial nem texto selecionável), mas a
  imagem grayscale compactada evita a ampliação RGB 3x; imagens idênticas
  entre páginas também são armazenadas uma única vez no arquivo.
- **JPEG:** `jpegGenerator` rasteriza cada SVG e compõe todas as etiquetas em
  uma imagem branca, empilhadas verticalmente, com um pequeno espaço entre
  elas.
- **Utilitários:** `generatorUtils.ts` localiza os SVGs, rasteriza-os em
  `canvas`, cria o PDF e inicia downloads. O rasterizador limita dimensões e
  número de pixels para não criar canvases excessivamente grandes.

O JPEG e o PDF precisam da prévia já renderizada na página. Durante a
conversão, ou sem etiquetas válidas, os botões ficam desabilitados. A
densidade do PDF pode ser ajustada em `PDF_PRINT_DENSITY_DPMM`, em
`pdfGenerator.ts`. A impressão do navegador usa `DEFAULT_PRINTER_DPI`, em
`generatorUtils.ts`.

### Layout e estilos

- `app/layout.tsx` define idioma, título, descrição e cor do tema do navegador.
- `app/globals.css` importa os estilos globais e Tailwind.
- `app/panels/conversorzpl/style.css` controla editor, temas claro/escuro, layout
  responsivo e o modo de impressão, que oculta controles e preserva as
  etiquetas.
- `app/page.tsx` monta o painel `ConversorZplPanel`. Outros painéis podem ser
  adicionados em `app/panels/` e conectados por esta página.

## O que o parser reconhece

O parser é um conversor para pré-visualização, não uma implementação completa
da linguagem ZPL. Entre os comandos tratados estão:

| Comando | Uso implementado |
| --- | --- |
| `^XA`, `^XZ` | Início e término de uma etiqueta |
| `^FX` | Comentário, ignorado |
| `^FO`, `^FT` | Posição dos próximos elementos |
| `^PW`, `^LL` | Largura e comprimento explícitos |
| `^CF`, `^A?` | Tamanho de fonte aproximado |
| `^FD`, `^FS` | Conteúdo dos campos e fim/reset de estado do campo |
| `^GB` | Caixas/retângulos |
| `^FR` | Texto/forma em modo reverso (branco) |
| `^BY`, `^BC` | Parâmetros e barras Code 128 |
| `^BQ` | QR Code (`^FD` com payload e nível de correção) |
| `~DG`, `^XG`, `^ID` | Gráfico Z64, referência/escalonamento e remoção |

O texto Code 128 é limitado a caracteres imprimíveis ASCII. O parser não
reconhece todos os modos e subconjuntos possíveis do padrão de código de
barras. Gráficos `^GF` não são renderizados e produzem um aviso. Comandos fora
do subconjunto implementado podem ser ignorados; confira os avisos abaixo da
prévia.

O `^BC` atual é desenhado como Code 128 subset B, com os caracteres
imprimíveis ASCII. O texto legível é desenhado abaixo das barras. Fontes ZPL
não são carregadas: texto é exibido com Arial/Helvetica e tamanho aproximado.
Comandos de rotação, alinhamento, formatação avançada e outros tipos de código
de barras não estão cobertos por essa prévia.

As dimensões são tratadas como pontos da etiqueta. `^PW` e `^LL` substituem
largura e altura, respectivamente. Sem essas dimensões, o parser calcula os
limites pelos elementos; para etiquetas sem gráficos aplica os mínimos de
800 × 1200 pontos e acrescenta margem ao conteúdo. Para etiquetas com
gráficos, usa o limite ocupado pelo conteúdo. Uma etiqueta sem dimensões
explícitas pode, portanto, não ter o tamanho físico exato do rolo. Etiquetas
sem elementos são descartadas.

Gráficos Z64 são descompactados e transformados em imagens usando APIs do
navegador. O parser limita os dados descompactados a 5.000.000 bytes e a
imagem a 20.000.000 pixels. Por esse motivo, apesar de retornar um modelo de
dados, `convertZpl` não é atualmente uma função independente de
navegador/Node.js.

O parser devolve avisos junto com as etiquetas, por exemplo quando falta
`^XA`, quando uma referência de gráfico não encontra seus dados ou quando o
conteúdo contém `^GF`. A interface mostra esses avisos abaixo da prévia. Uma
falha inesperada na Promise da conversão é substituída por uma mensagem
genérica na tela; falhas de importação e de exportação têm seus próprios
estados de erro.

## Como continuar o desenvolvimento

1. Leia `app/panels/conversorzpl/zpl-parser.ts` para entender e estender a
   interpretação dos comandos e o modelo `ConvertedDocument`.
2. Leia `app/panels/conversorzpl/readers/README.md` para alterar ou criar
   consumidores visuais do modelo.
3. Leia `app/panels/conversorzpl/generators/README.md` para criar novas saídas
   e downloads.
4. Anote ideias futuras em `IDEIAS.md`; as sugestões não estão implementadas
   apenas por estarem listadas.

Ao adicionar suporte a um comando, atualize também este README e inclua uma
etiqueta de exemplo para testar o resultado.
