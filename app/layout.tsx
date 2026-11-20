import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Conversor ZPL | Etiquetas fictícias',
  description: 'Cole ou importe arquivos ZPL para visualizar etiquetas, códigos de barras, QR Codes e gráficos Z64 em uma prévia SVG.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5f7fa',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="light">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
