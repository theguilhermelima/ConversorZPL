import type { ConvertedDocument } from '../zpl-parser'
import { downloadFile, rasterizeLabels } from './generatorUtils'

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível compor a imagem JPEG das etiquetas.'))
    }
    image.src = url
  })
}

async function createJpegSheet(images: Array<{ blob: Blob; pixelWidth: number; pixelHeight: number }>) {
  // Coloca as etiquetas em uma única imagem vertical e reduz a escala se ela ficar grande demais.
  const gap = 48
  const sourceWidth = Math.max(...images.map((image) => image.pixelWidth))
  const sourceHeight = images.reduce((total, image) => total + image.pixelHeight, gap * (images.length - 1))
  const scale = Math.min(1, 12000 / Math.max(sourceWidth, sourceHeight), Math.sqrt(40_000_000 / (sourceWidth * sourceHeight)))
  const canvas = window.document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(sourceWidth * scale))
  canvas.height = Math.max(1, Math.floor(sourceHeight * scale))

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar o arquivo JPEG.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  let y = 0

  for (const imageData of images) {
    const image = await loadImage(imageData.blob)
    const width = imageData.pixelWidth * scale
    const height = imageData.pixelHeight * scale
    context.drawImage(image, (canvas.width - width) / 2, y, width, height)
    y += height + gap * scale
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0
      canvas.height = 0
      if (blob) resolve(blob)
      else reject(new Error('O navegador não conseguiu gerar a imagem JPEG.'))
    }, 'image/jpeg', 0.95)
  })
}

export async function jpegGenerator(convertedDocument: ConvertedDocument) {
  const labels = await rasterizeLabels(convertedDocument)
  const jpeg = await createJpegSheet(labels)
  downloadFile(jpeg, 'etiquetas-zpl.jpg')
}
