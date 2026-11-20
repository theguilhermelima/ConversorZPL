import QRCode from 'qrcode'

// O parser transforma ZPL em elementos simples; leitores e geradores usam esse modelo.
export type LabelElement =
  | {
      type: 'rectangle'
      x: number
      y: number
      width: number
      height: number
      fill: string
      stroke: string
      strokeWidth: number
    }
  | {
      type: 'text'
      x: number
      y: number
      value: string
      size: number
      fill: string
      anchor?: 'start' | 'middle'
    }
  | {
      type: 'barcode'
      x: number
      y: number
      height: number
      width: number
      value: string
      bars: Array<{ x: number; width: number }>
      fill: string
    }
  | {
      type: 'qrcode'
      x: number
      y: number
      size: number
      moduleSize: number
      quietZoneModules: number
      modules: boolean[][]
      fill: string
    }
  | {
      type: 'graphic'
      x: number
      y: number
      width: number
      height: number
      href: string
    }

export type ConvertedLabel = {
  width: number
  height: number
  elements: LabelElement[]
  hasGraphic: boolean
}

export type ConvertedDocument = {
  labels: ConvertedLabel[]
  warnings: string[]
}

type LabelBuilder = {
  elements: LabelElement[]
  explicitWidth: number | null
  explicitHeight: number | null
  maxX: number
  maxY: number
  hasGraphic: boolean
}

type GraphicResource = {
  bytesPerRow: number
  width: number
  height: number
  href: string
}

const MAX_GRAPHIC_BYTES = 5_000_000
const MAX_GRAPHIC_PIXELS = 20_000_000

// Padrões de barras do Code 128; cada número indica a largura de uma barra ou espaço.
const CODE128_PATTERNS = `212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112`.split(' ')

function encodeCode128(value: string, moduleWidth: number) {
  const values = Array.from(value, (character) => character.charCodeAt(0) - 32)
  if (values.some((character) => character < 0 || character > 94)) return null

  const checksum = (104 + values.reduce((sum, character, index) => sum + character * (index + 1), 0)) % 103
  const patterns = [CODE128_PATTERNS[104], ...values.map((character) => CODE128_PATTERNS[character]), CODE128_PATTERNS[checksum], CODE128_PATTERNS[106]]
  const bars: Array<{ x: number; width: number }> = []
  let cursor = 0
  let isBar = true

  for (const pattern of patterns) {
    for (const run of pattern) {
      const runWidth = Number(run) * moduleWidth
      if (isBar) bars.push({ x: cursor, width: runWidth })
      cursor += runWidth
      isBar = !isBar
    }
  }

  return { bars, width: cursor }
}

function getQrErrorCorrectionLevel(value?: string) {
  switch (value?.toUpperCase()) {
    case 'L':
      return 'L'
    case 'Q':
      return 'Q'
    case 'H':
      return 'H'
    default:
      return 'M'
  }
}

function resourceKey(filename: string) {
  return filename.trim().split(':').pop()?.toUpperCase() ?? ''
}

// Z64 guarda gráficos comprimidos; primeiro recuperamos os bytes originais.
async function inflateGraphic(encoded: string, expectedBytes: number) {
  if (expectedBytes <= 0 || expectedBytes > MAX_GRAPHIC_BYTES) {
    throw new Error('O tamanho informado para o gráfico está fora do limite suportado.')
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador não oferece suporte à descompactação Z64.')
  }

  const binary = window.atob(encoded.replace(/\s/g, ''))
  const compressed = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    compressed[index] = binary.charCodeAt(index)
  }

  const compressedBuffer = new ArrayBuffer(compressed.length)
  new Uint8Array(compressedBuffer).set(compressed)
  const stream = new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream('deflate'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > expectedBytes || totalBytes > MAX_GRAPHIC_BYTES) {
        await reader.cancel()
        throw new Error('O gráfico descompactado excede o tamanho declarado.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  if (totalBytes !== expectedBytes) {
    throw new Error('O tamanho do gráfico descompactado não corresponde ao declarado no ZPL.')
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

// Converte os bits do gráfico ZPL em PNG para o SVG conseguir mostrá-lo.
function createGraphicDataUrl(bytes: Uint8Array, bytesPerRow: number, width: number, height: number) {
  if (width * height > MAX_GRAPHIC_PIXELS) {
    throw new Error('A resolução do gráfico excede o limite suportado.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar a imagem do gráfico.')

  const imageData = context.createImageData(width, height)
  const pixels = imageData.data

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * bytesPerRow
    for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex += 1) {
      const value = bytes[rowOffset + byteIndex]
      for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
        const x = byteIndex * 8 + bitIndex
        const intensity = value & (0x80 >> bitIndex) ? 0 : 255
        const pixelOffset = (y * width + x) * 4
        pixels[pixelOffset] = intensity
        pixels[pixelOffset + 1] = intensity
        pixels[pixelOffset + 2] = intensity
        pixels[pixelOffset + 3] = 255
      }
    }
  }

  context.putImageData(imageData, 0, 0)
  const dataUrl = canvas.toDataURL('image/png')
  canvas.width = 0
  canvas.height = 0
  return dataUrl
}

function createLabel(): LabelBuilder {
  return {
    elements: [],
    explicitWidth: null,
    explicitHeight: null,
    maxX: 0,
    maxY: 0,
    hasGraphic: false,
  }
}

function finishLabel(label: LabelBuilder | null): ConvertedLabel | null {
  if (!label || label.elements.length === 0) return null

  // Usa o tamanho declarado no ZPL; se não houver, calcula pelos elementos desenhados.
  const defaultWidth = label.hasGraphic ? label.maxX : Math.max(800, Math.ceil(label.maxX + 50))
  const defaultHeight = label.hasGraphic ? label.maxY : Math.max(1200, Math.ceil(label.maxY + 50))

  return {
    width: label.explicitWidth ?? Math.max(1, defaultWidth),
    height: label.explicitHeight ?? Math.max(1, defaultHeight),
    elements: label.elements,
    hasGraphic: label.hasGraphic,
  }
}

export async function convertZpl(source: string): Promise<ConvertedDocument> {
  const labels: ConvertedLabel[] = []
  const warnings: string[] = []
  const graphics = new Map<string, GraphicResource>()
  let currentLabel: LabelBuilder | null = null
  let x = 0
  let y = 0
  let fontHeight = 30
  let fontWidth = 30
  let reverse = false
  let barcodeMode = false
  let barcodeHeight = 100
  let moduleWidth = 2
  let qrMode = false
  let qrMagnification = 3
  let graphicDefinitions = 0
  let missingGraphics = 0

  const ensureLabel = () => {
    if (!currentLabel) currentLabel = createLabel()
    return currentLabel
  }

  // Guarda o limite ocupado pelos elementos para calcular o tamanho sem ^PW e ^LL.
  const trackBounds = (label: LabelBuilder, right: number, bottom: number) => {
    label.maxX = Math.max(label.maxX, right)
    label.maxY = Math.max(label.maxY, bottom)
  }

  const finishCurrentLabel = () => {
    const finished = finishLabel(currentLabel)
    if (finished) labels.push(finished)
    currentLabel = null
  }

  // Lê os comandos na ordem em que aparecem; alguns, como ^FO e ^CF, ajustam o estado atual.
  const tokens = source.matchAll(/~DG([^,\s]+),(\d+),(\d+),:Z64:([A-Za-z0-9+/=\s]+):([A-F0-9]{4})|\^([A-Z][A-Z0-9])([^^~]*)/gi)

  for (const match of tokens) {
    if (match[1]) {
      graphicDefinitions += 1
      const filename = match[1]
      const expectedBytes = Number.parseInt(match[2], 10)
      const bytesPerRow = Number.parseInt(match[3], 10)
      const key = resourceKey(filename)

      try {
        if (!bytesPerRow || expectedBytes % bytesPerRow !== 0) {
          throw new Error('As dimensões declaradas para o gráfico são inválidas.')
        }
        const height = expectedBytes / bytesPerRow
        const width = bytesPerRow * 8
        if (width * height > MAX_GRAPHIC_PIXELS) {
          throw new Error('A resolução do gráfico excede o limite suportado.')
        }
        const bytes = await inflateGraphic(match[4], expectedBytes)
        const href = createGraphicDataUrl(bytes, bytesPerRow, width, height)
        graphics.set(key, { bytesPerRow, width, height, href })
      } catch (error) {
        graphics.delete(key)
        const detail = error instanceof Error ? ` ${error.message}` : ''
        warnings.push(`Não foi possível ler o gráfico Z64 “${filename}”.${detail}`)
      }
      continue
    }

    const command = match[6]
    const parameters = match[7].trim()

    if (command === 'XA') {
      // ^XA inicia uma etiqueta e volta os parâmetros ao padrão.
      finishCurrentLabel()
      currentLabel = createLabel()
      x = 0
      y = 0
      fontHeight = 30
      fontWidth = 30
      reverse = false
      barcodeMode = false
      barcodeHeight = 100
      moduleWidth = 2
      qrMode = false
      qrMagnification = 3
      continue
    }

    if (command === 'XZ') {
      finishCurrentLabel()
      continue
    }

    if (command === 'FX') continue

    if (command === 'FO' || command === 'FT') {
      const values = parameters.split(',').map((part) => Number.parseInt(part, 10))
      x = Number.isFinite(values[0]) ? values[0] : 0
      y = Number.isFinite(values[1]) ? values[1] : 0
      continue
    }

    if (command === 'PW') {
      const value = Number.parseInt(parameters, 10)
      if (value > 0) ensureLabel().explicitWidth = value
      continue
    }

    if (command === 'LL') {
      const value = Number.parseInt(parameters, 10)
      if (value > 0) ensureLabel().explicitHeight = value
      continue
    }

    if (command === 'CF') {
      const values = parameters.split(',')
      const nextHeight = Number.parseInt(values[1], 10)
      const nextWidth = Number.parseInt(values[2], 10)
      if (nextHeight > 0) fontHeight = nextHeight
      if (nextWidth > 0) fontWidth = nextWidth
      else if (nextHeight > 0) fontWidth = nextHeight
      continue
    }

    if (command.startsWith('A') && command.length === 2) {
      const values = parameters.split(',')
      const nextHeight = Number.parseInt(values[1], 10)
      const nextWidth = Number.parseInt(values[2], 10)
      if (nextHeight > 0) fontHeight = nextHeight
      if (nextWidth > 0) fontWidth = nextWidth
      else if (nextHeight > 0) fontWidth = nextHeight
      continue
    }

    if (command === 'BY') {
      const values = parameters.split(',').map((part) => Number.parseFloat(part))
      if (values[0] > 0) moduleWidth = values[0]
      if (values[2] > 0) barcodeHeight = values[2]
      continue
    }

    if (command === 'FR') {
      reverse = true
      continue
    }

    if (command === 'BC') {
      barcodeMode = true
      qrMode = false
      const values = parameters.split(',')
      const commandHeight = Number.parseInt(values[0], 10) || Number.parseInt(values[1], 10)
      if (commandHeight > 0) barcodeHeight = commandHeight
      continue
    }

    if (command === 'BQ') {
      // ^BQ faz com que o próximo ^FD seja interpretado como conteúdo de QR Code.
      barcodeMode = false
      qrMode = true
      const magnification = Number.parseInt(parameters.split(',')[2], 10)
      qrMagnification = Number.isFinite(magnification) ? Math.min(10, Math.max(1, magnification)) : 3
      continue
    }

    if (command === 'GB') {
      const values = parameters.split(',').map((part) => Number.parseFloat(part))
      const width = values[0] || 0
      const height = values[1] || 0
      const thickness = values[2] || 0
      if (width > 0 && height > 0) {
        const label = ensureLabel()
        const fillColor = reverse ? '#ffffff' : '#111827'
        const isFilled = thickness >= Math.min(width, height)
        label.elements.push({
          type: 'rectangle',
          x,
          y,
          width,
          height,
          fill: isFilled ? fillColor : 'none',
          stroke: isFilled ? 'none' : fillColor,
          strokeWidth: isFilled ? 0 : Math.max(1, thickness),
        })
        trackBounds(label, x + width, y + height)
      }
      continue
    }

    if (command === 'XG') {
      const values = parameters.split(',')
      const key = resourceKey(values[0] ?? '')
      const graphic = graphics.get(key)
      if (!graphic) {
        missingGraphics += 1
        continue
      }

      const scaleX = Math.min(10, Math.max(1, Number.parseInt(values[1], 10) || 1))
      const scaleY = Math.min(10, Math.max(1, Number.parseInt(values[2], 10) || 1))
      const label = ensureLabel()
      const width = graphic.width * scaleX
      const height = graphic.height * scaleY
      label.elements.push({ type: 'graphic', x, y, width, height, href: graphic.href })
      label.hasGraphic = true
      trackBounds(label, x + width, y + height)
      continue
    }

    if (command === 'ID') {
      graphics.delete(resourceKey(parameters.split(',')[0] ?? ''))
      continue
    }

    if (command === 'FD') {
      // ^FD pode virar texto, barras ou QR, conforme o último comando de campo lido.
      const value = parameters.trim()
      if (!value) continue
      const label = ensureLabel()
      const fill = reverse ? '#ffffff' : '#111827'

      if (qrMode) {
        // O prefixo do QR informa correção e modo; o conteúdo a codificar vem depois da vírgula.
        const qrField = /^([LMQH])[AM],([\s\S]*)$/i.exec(value)
        const qrValue = qrField ? qrField[2] : value

        try {
          const qrCode = QRCode.create(qrValue, {
            errorCorrectionLevel: getQrErrorCorrectionLevel(qrField?.[1]),
          })
          const modules = Array.from({ length: qrCode.modules.size }, (_, row) =>
            Array.from({ length: qrCode.modules.size }, (_, column) => qrCode.modules.get(row, column) === 1),
          )
          const quietZoneModules = 4
          const size = (modules.length + quietZoneModules * 2) * qrMagnification

          label.elements.push({
            type: 'qrcode',
            x,
            y,
            size,
            moduleSize: qrMagnification,
            quietZoneModules,
            modules,
            fill,
          })
          trackBounds(label, x + size, y + size)
        } catch (error) {
          const detail = error instanceof Error ? ` ${error.message}` : ''
          warnings.push(`Não foi possível gerar o QR Code da etiqueta.${detail}`)
        }
      } else if (barcodeMode) {
        const encoded = encodeCode128(value, moduleWidth)
        if (encoded) {
          label.elements.push({ type: 'barcode', x, y, height: barcodeHeight, width: encoded.width, value, bars: encoded.bars, fill })
          trackBounds(label, x + encoded.width, y + barcodeHeight + 28)
        } else {
          warnings.push('Um código de barras contém caracteres fora do conjunto imprimível do Code 128.')
          label.elements.push({ type: 'text', x, y: y + fontHeight, value, size: fontHeight, fill })
          trackBounds(label, x + value.length * fontWidth, y + fontHeight)
        }
      } else {
        const lines = value.split('\\&')
        lines.forEach((line, index) => {
          const lineY = y + fontHeight + index * fontHeight * 1.2
          label.elements.push({ type: 'text', x, y: lineY, value: line, size: fontHeight, fill })
          trackBounds(label, x + Math.max(fontWidth, line.length * fontWidth * 0.62), lineY + fontHeight * 0.2)
        })
      }
      continue
    }

    if (command === 'FS') {
      // ^FS encerra o campo e limpa modos temporários, como reverso e códigos.
      reverse = false
      barcodeMode = false
      qrMode = false
    }
  }

  finishCurrentLabel()

  if (!/\^XA\b/i.test(source)) warnings.push('Não encontramos o início ^XA. Confira se o conteúdo é um código ZPL.')
  if (/~DG/i.test(source) && graphicDefinitions === 0) {
    warnings.push('O arquivo contém gráficos, mas não encontramos dados Z64 válidos para decodificá-los.')
  }
  if (missingGraphics > 0) {
    warnings.push('Algumas imagens ^XG referenciadas não foram encontradas ou não puderam ser decodificadas.')
  }
  if (/\^GF/i.test(source)) {
    warnings.push('Este arquivo contém gráficos ^GF, que ainda não são compatíveis com a prévia.')
  }

  return { labels, warnings: [...new Set(warnings)] }
}
