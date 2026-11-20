import type {
  ConvertedDocument,
  ConvertedLabel,
} from '../zpl-parser'

export type RasterizedLabel = {
  blob: Blob
  pixelWidth: number
  pixelHeight: number
  pageWidth: number
  pageHeight: number
}

export type GrayscaleRasterizedLabel = {
  compressedPixels: Uint8Array
  pixelWidth: number
  pixelHeight: number
  pageWidth: number
  pageHeight: number
}

export type PdfPrintQuality = 'grayscale'

export const DEFAULT_PRINTER_DPI = 203

const RASTER_SCALE = 3
const MAX_RASTER_DIMENSION = 8192
const MAX_RASTER_PIXELS = 32_000_000

// Limita a escala para evitar canvas maiores do que o navegador consegue processar.
function getRasterScale(label: ConvertedLabel, targetScale = RASTER_SCALE) {
  if (!Number.isFinite(label.width) || !Number.isFinite(label.height) || label.width <= 0 || label.height <= 0) {
    throw new Error('As dimensões da etiqueta não permitem gerar este arquivo.')
  }

  return Math.min(
    targetScale,
    MAX_RASTER_DIMENSION / Math.max(label.width, label.height),
    Math.sqrt(MAX_RASTER_PIXELS / (label.width * label.height)),
  )
}

function getPreviewSvgElements(convertedDocument: ConvertedDocument) {
  if (convertedDocument.labels.length === 0) {
    throw new Error('Não há etiquetas convertidas para exportar.')
  }

  // Os geradores usam o SVG já mostrado na tela, e conferem que há um por etiqueta.
  const svgElements = Array.from(window.document.querySelectorAll<SVGSVGElement>('[data-export-label]'))
  if (svgElements.length !== convertedDocument.labels.length) {
    throw new Error('A prévia SVG ainda não está sincronizada com o código ZPL.')
  }

  return svgElements
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível rasterizar uma etiqueta SVG.'))
    image.src = url
  })
}

async function renderLabelToCanvas(
  svgElement: SVGSVGElement,
  label: ConvertedLabel,
  targetScale: number,
) {
  // JPEG e PDF partem do mesmo SVG; a escala escolhida muda conforme o formato.
  const scale = getRasterScale(label, targetScale)
  const canvas = window.document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(label.width * scale))
  canvas.height = Math.max(1, Math.floor(label.height * scale))

  const context = canvas.getContext(
    '2d',
    targetScale === 1 ? { willReadFrequently: true } : undefined,
  )
  if (!context) {
    canvas.width = 0
    canvas.height = 0
    throw new Error('Não foi possível preparar a imagem da etiqueta.')
  }

  const svgBlob = new Blob([new XMLSerializer().serializeToString(svgElement)], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    const image = await loadImage(svgUrl)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } catch (error) {
    canvas.width = 0
    canvas.height = 0
    throw error
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('O navegador não conseguiu gerar a imagem JPEG.'))
    }, 'image/jpeg', quality)
  })
}

export async function rasterizeLabels(convertedDocument: ConvertedDocument): Promise<RasterizedLabel[]> {
  const svgElements = getPreviewSvgElements(convertedDocument)
  const rasterizedLabels: RasterizedLabel[] = []

  for (const [index, label] of convertedDocument.labels.entries()) {
    const canvas = await renderLabelToCanvas(svgElements[index], label, RASTER_SCALE)

    try {
      rasterizedLabels.push({
        blob: await canvasToJpeg(canvas, 0.95),
        pixelWidth: canvas.width,
        pixelHeight: canvas.height,
        pageWidth: (label.width * 72) / DEFAULT_PRINTER_DPI,
        pageHeight: (label.height * 72) / DEFAULT_PRINTER_DPI,
      })
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  }

  return rasterizedLabels
}

async function compressGrayscalePixels(pixels: Uint8Array) {
  // DEFLATE reduz o tamanho dos pixels em cinza antes de gravá-los no PDF.
  if (typeof CompressionStream === 'undefined') {
    throw new Error('Este navegador não oferece suporte à compactação necessária para gerar o PDF.')
  }

  const buffer = new ArrayBuffer(pixels.byteLength)
  new Uint8Array(buffer).set(pixels)
  const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function rasterizeLabelsForPdf(
  convertedDocument: ConvertedDocument,
  densityDpmm: number,
): Promise<GrayscaleRasterizedLabel[]> {
  if (!Number.isFinite(densityDpmm) || densityDpmm <= 0) {
    throw new Error('A densidade de impressão do PDF precisa ser maior que zero.')
  }

  const svgElements = getPreviewSvgElements(convertedDocument)
  const rasterizedLabels: GrayscaleRasterizedLabel[] = []

  for (const [index, label] of convertedDocument.labels.entries()) {
    const canvas = await renderLabelToCanvas(svgElements[index], label, 1)

    try {
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Não foi possível ler os pixels da etiqueta para gerar o PDF.')

      // O PDF guarda um valor de cinza por pixel, em vez de três canais RGB.
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
      const grayscale = new Uint8Array(canvas.width * canvas.height)

      for (let pixel = 0, channel = 0; pixel < grayscale.length; pixel += 1, channel += 4) {
        grayscale[pixel] = (rgba[channel] * 77 + rgba[channel + 1] * 150 + rgba[channel + 2] * 29) >> 8
      }

      rasterizedLabels.push({
        compressedPixels: await compressGrayscalePixels(grayscale),
        pixelWidth: canvas.width,
        pixelHeight: canvas.height,
        pageWidth: (label.width * 72) / (densityDpmm * 25.4),
        pageHeight: (label.height * 72) / (densityDpmm * 25.4),
      })
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  }

  return rasterizedLabels
}

export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  window.document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function encodePdfText(value: string) {
  return new TextEncoder().encode(value)
}

function concatenateBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return result
}

export function createPdf(
  rasterizedLabels: GrayscaleRasterizedLabel[],
  quality: PdfPrintQuality,
) {
  const pageCount = rasterizedLabels.length
  const colorSpaces: Record<PdfPrintQuality, string> = {
    grayscale: '/DeviceGray',
  }
  const uniqueImages: GrayscaleRasterizedLabel[] = []
  const imageIndexesByHash = new Map<string, number[]>()
  const labelImageIndexes: number[] = []

  // Se duas páginas tiverem a mesma imagem, o PDF grava a imagem só uma vez.
  for (const label of rasterizedLabels) {
    let hash = 2166136261
    for (const byte of label.compressedPixels) {
      hash = Math.imul(hash ^ byte, 16777619)
    }

    const key = `${label.pixelWidth}x${label.pixelHeight}:${label.compressedPixels.length}:${hash >>> 0}`
    const candidates = imageIndexesByHash.get(key) ?? []
    let imageIndex = candidates.find((candidate) => {
      const pixels = uniqueImages[candidate].compressedPixels
      return pixels.every((byte, index) => byte === label.compressedPixels[index])
    })

    if (imageIndex === undefined) {
      imageIndex = uniqueImages.length
      uniqueImages.push(label)
      candidates.push(imageIndex)
      imageIndexesByHash.set(key, candidates)
    }

    labelImageIndexes.push(imageIndex)
  }

  const firstPageObject = 3 + uniqueImages.length
  const pageObjectNumbers = rasterizedLabels.map((_, index) => firstPageObject + index * 2)
  const objects: Uint8Array[][] = [
    [encodePdfText('<< /Type /Catalog /Pages 2 0 R >>')],
    [
      encodePdfText(
        `<< /Type /Pages /Kids [${pageObjectNumbers.map((pageObject) => `${pageObject} 0 R`).join(' ')}] /Count ${pageCount} >>`,
      ),
    ],
  ]

  for (const label of uniqueImages) {
    objects.push([
      encodePdfText(
        `<< /Type /XObject /Subtype /Image /Width ${label.pixelWidth} /Height ${label.pixelHeight} /ColorSpace ${colorSpaces[quality]} /BitsPerComponent 8 /Filter /FlateDecode /Length ${label.compressedPixels.length} >>\nstream\n`,
      ),
      label.compressedPixels,
      encodePdfText('\nendstream'),
    ])
  }

  for (const [index, label] of rasterizedLabels.entries()) {
    const pageObject = pageObjectNumbers[index]
    const imageObject = 3 + labelImageIndexes[index]
    const contentObject = pageObject + 1
    const content = encodePdfText(
      `q\n${label.pageWidth.toFixed(2)} 0 0 ${label.pageHeight.toFixed(2)} 0 0 cm\n/Im0 Do\nQ`,
    )

    objects.push([
      encodePdfText(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${label.pageWidth.toFixed(2)} ${label.pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
      ),
    ])
    objects.push([
      encodePdfText(`<< /Length ${content.length} >>\nstream\n`),
      content,
      encodePdfText('\nendstream'),
    ])
  }

  const chunks: Uint8Array[] = [
    new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]),
  ]
  const offsets = [0]
  let byteLength = chunks[0].length

  for (const [index, objectChunks] of objects.entries()) {
    offsets.push(byteLength)
    const object = concatenateBytes([
      encodePdfText(`${index + 1} 0 obj\n`),
      ...objectChunks,
      encodePdfText('\nendobj\n'),
    ])
    chunks.push(object)
    byteLength += object.length
  }

  const xrefOffset = byteLength
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  ].join('')
  chunks.push(encodePdfText(xref))

  return new Blob([concatenateBytes(chunks)], { type: 'application/pdf' })
}
