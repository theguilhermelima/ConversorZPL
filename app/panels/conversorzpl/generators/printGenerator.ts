import type { ConvertedDocument } from '../zpl-parser'
import { DEFAULT_PRINTER_DPI } from './generatorUtils'

function dotsToMillimeters(dots: number) {
  return `${((dots / DEFAULT_PRINTER_DPI) * 25.4).toFixed(3)}mm`
}

export function printGenerator(convertedDocument: ConvertedDocument) {
  if (convertedDocument.labels.length === 0) {
    throw new Error('Não há etiquetas convertidas para imprimir.')
  }

  const previewLabels = window.document.querySelectorAll('[data-export-label]')
  if (previewLabels.length !== convertedDocument.labels.length) {
    throw new Error('A prévia SVG ainda não está sincronizada com o código ZPL.')
  }

  window.document.querySelector('[data-print-generator-style]')?.remove()

  const firstLabel = convertedDocument.labels[0]
  const printStyle = window.document.createElement('style')
  printStyle.dataset.printGeneratorStyle = ''
  // Define uma página física para cada etiqueta, em vez de usar o tamanho A4 padrão.
  printStyle.textContent = [
    `@page { size: ${dotsToMillimeters(firstLabel.width)} ${dotsToMillimeters(firstLabel.height)}; margin: 0; }`,
    ...convertedDocument.labels.map((label, index) => {
      const pageName = `zplLabel${index}`
      const width = dotsToMillimeters(label.width)
      const height = dotsToMillimeters(label.height)
      return [
        `@page ${pageName} { size: ${width} ${height}; margin: 0; }`,
        `@media print { .label-page:nth-of-type(${index + 1}) { page: ${pageName}; width: ${width}; height: ${height}; } }`,
        `@media print { .label-page:nth-of-type(${index + 1}) .label-svg { width: ${width} !important; height: ${height} !important; max-width: none !important; max-height: none !important; } }`,
      ].join('\n')
    }),
  ].join('\n')
  window.document.head.append(printStyle)

  const cleanup = () => {
    printStyle.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup, { once: true })

  try {
    window.print()
  } catch (error) {
    cleanup()
    throw error
  }
}
