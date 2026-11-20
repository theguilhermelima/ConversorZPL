import type { ConvertedDocument } from '../zpl-parser'
import {
  createPdf,
  downloadFile,
  rasterizeLabelsForPdf,
  type PdfPrintQuality,
} from './generatorUtils'

// 8 pontos de impressão por milímetro equivalem a aproximadamente 203 dpi.
const PDF_PRINT_DENSITY_DPMM = 8
const PDF_PRINT_QUALITY: PdfPrintQuality = 'grayscale'

export async function pdfGenerator(convertedDocument: ConvertedDocument) {
  // O fluxo é: rasterizar o SVG, montar as páginas PDF e iniciar o download.
  const labels = await rasterizeLabelsForPdf(convertedDocument, PDF_PRINT_DENSITY_DPMM)
  const pdf = await createPdf(labels, PDF_PRINT_QUALITY)
  downloadFile(pdf, 'etiquetas-zpl.pdf')
}
