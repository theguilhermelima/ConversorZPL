'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Code2, FileDown, Moon, Printer, RotateCw, ScanLine, Sun } from 'lucide-react'
import { convertZpl, type ConvertedDocument } from './zpl-parser'
import { jpegGenerator } from './generators/jpegGenerator'
import { pdfGenerator } from './generators/pdfGenerator'
import { printGenerator } from './generators/printGenerator'
import { ReadSVG } from './readers/readSVG'
import { ZplFileUpload } from './upload/ZplFileUpload'
import './style.css'

// Este exemplo fictício é o texto inicial do editor; edite-o para testar o conversor.
const sampleZpl = `^XA
^PW1000
^LL1500
^FO30,30^GB940,1440,3^FS
^FO30,30^GB940,120,120^FS
^CF0,48
^FR
^FO70,108^FDSHOP EXPRESS | ETIQUETA DE ENVIO^FS
^FS

^CF0,34
^FO75,210^FDPEDIDO #EX-2048-7319^FS
^FO75,270^GB850,3,3^FS
^CF0,30
^FO75,335^FDDESTINATARIO^FS
^CF0,42
^FO75,395^FDMarina Exemplo^FS
^CF0,26
^FO75,445^FDRua das Flores, 123^FS
^FO75,485^FDBairro Modelo - Cidade Ficticia/BR^FS
^FO75,525^FDCEP 00000-000^FS
^FO75,585^GB850,3,3^FS

^CF0,28
^FO75,645^FDENVIO PADRAO^FS
^CF0,24
^FO75,690^FDPedido ficticio para demonstracao^FS
^FO75,735^FDVolume: 1 de 1^FS

^FO735,615^BQN,2,5^FDLA,https://theguilhermelima.github.io/theguilhermelima/^FS
^CF0,20
^FO705,825^FDESCANEIE PARA ACESSAR O LINK^FS
^FO75,885^GB850,3,3^FS

^CF0,28
^FO75,940^FDRASTREIO / CODIGO DE BARRAS^FS
^BY1,2,110
^FO90,1000^BCN,110,Y,N,N^FDhttps://theguilhermelima.github.io/theguilhermelima/^FS
^CF0,22
^FO75,1195^FDLOJA EXEMPLO - ETIQUETA FICTICIA^FS
^FO75,1245^FDPedido EX-2048-7319 | Obrigado pela compra!^FS
^XZ`

export default function ConversorZplPanel() {
  // zplCode é a entrada; convertedDocument é o modelo que a prévia e os geradores usam.
  const [zplCode, setZplCode] = useState(sampleZpl)
  const [isDark, setIsDark] = useState(false)
  const [lastLoaded, setLastLoaded] = useState('atualização automática')
  const [reloadVersion, setReloadVersion] = useState(0)
  const [convertedDocument, setConvertedDocument] = useState<ConvertedDocument>({ labels: [], warnings: [] })
  const [isConverting, setIsConverting] = useState(true)
  const [fileError, setFileError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState<'pdf' | 'jpeg' | null>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setIsDark(prefersDark)
    document.documentElement.classList.toggle('dark', prefersDark)
    document.documentElement.classList.toggle('light', !prefersDark)
  }, [])

  // Converte após uma pequena pausa ao digitar e ignora resultados de conversões antigas.
  useEffect(() => {
    let isCurrent = true
    setIsConverting(true)
    const timeout = window.setTimeout(() => {
      void convertZpl(zplCode)
        .then((document) => {
          if (isCurrent) {
            setConvertedDocument(document)
            setIsConverting(false)
          }
        })
        .catch(() => {
          if (isCurrent) {
            setConvertedDocument({ labels: [], warnings: ['Não foi possível interpretar este conteúdo ZPL.'] })
            setIsConverting(false)
          }
        })
    }, 120)

    return () => {
      isCurrent = false
      window.clearTimeout(timeout)
    }
  }, [zplCode, reloadVersion])

  const lineCount = zplCode.split('\n').length

  function handleLoad() {
    setReloadVersion((version) => version + 1)
    setLastLoaded(`carregado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)
  }

  function handleThemeToggle() {
    const nextIsDark = !isDark
    setIsDark(nextIsDark)
    document.documentElement.classList.toggle('dark', nextIsDark)
    document.documentElement.classList.toggle('light', !nextIsDark)
  }

  // A página só encaminha a etiqueta ao gerador e mostra qualquer erro ao usuário.
  function handlePrint() {
    setExportError(null)
    try {
      printGenerator(convertedDocument)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Não foi possível abrir a impressão.')
    }
  }

  async function handleDownload(format: 'pdf' | 'jpeg') {
    setExportError(null)
    setIsExporting(format)

    try {
      if (format === 'pdf') await pdfGenerator(convertedDocument)
      else await jpegGenerator(convertedDocument)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : `Não foi possível gerar o arquivo ${format.toUpperCase()}.`)
    } finally {
      setIsExporting(null)
    }
  }

  return (
    <main className="workbench-shell" data-theme={isDark ? 'dark' : 'light'}>
      <header className="workbench-header">
        <h1>Conversor <span>ZPL</span></h1>
        <button
          className="theme-toggle"
          type="button"
          onClick={handleThemeToggle}
          aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
          title={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
        >
          {isDark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
        </button>
      </header>
      <div className="workbench-container">

        <section className="workspace" aria-label="Conversor de código ZPL para SVG">
          <div className="work-panel">
            <div className="panel-heading">
              <div>
                <div className="panel-title-row"><Code2 aria-hidden="true" /><h2>Código ZPL</h2></div>
                <p>Cole ou importe o código da sua etiqueta</p>
              </div>
              <div className="panel-actions">
                <ZplFileUpload
                  onFileLoaded={(content, filename) => {
                    setZplCode(content)
                    setLastLoaded(filename)
                  }}
                  onError={setFileError}
                />
                <span className="panel-meta">{lineCount} {lineCount === 1 ? 'linha' : 'linhas'}</span>
              </div>
            </div>
            <div className="editor-frame">
              <div className="editor-gutter" aria-hidden="true" ref={gutterRef}>
                {Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
              </div>
              {/* O textarea controla zplCode; cada mudança dispara a conversão acima. */}
              <textarea
                className="zpl-editor"
                aria-label="Código ZPL da etiqueta"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onScroll={(event) => {
                  if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop
                }}
                value={zplCode}
                onChange={(event) => {
                  setZplCode(event.target.value)
                  setFileError(null)
                  setLastLoaded('atualização automática')
                }}
              />
            </div>
          </div>

          <div className="load-control">
            <span className="load-label">CARREGAR</span>
            <button className="load-button" type="button" onClick={handleLoad} aria-label="Carregar novamente o código ZPL na prévia SVG" title="Carregar código na prévia">
              <ArrowRight aria-hidden="true" />
            </button>
            <span className="load-hint">{lastLoaded}</span>
          </div>

          <div className="work-panel preview-panel">
            <div className="panel-heading">
              <div>
                <div className="panel-title-row"><ScanLine aria-hidden="true" /><h2>Prévia SVG</h2></div>
                <p>Prévia SVG de cada etiqueta encontrada</p>
              </div>
              <span className="preview-badge"><Check aria-hidden="true" /> SVG{convertedDocument.labels.length > 1 ? ` · ${convertedDocument.labels.length} etiquetas` : ''}</span>
            </div>
            <div className="preview-stage">
              {convertedDocument.labels.length > 0 ? (
                // Cada etiqueta do modelo convertido é desenhada pelo leitor SVG.
                convertedDocument.labels.map((label, index) => (
                  <div className="label-page" key={`label-${index}`}>
                    <ReadSVG label={label} />
                    <div className="canvas-dimensions">
                      {convertedDocument.labels.length > 1 ? `Etiqueta ${index + 1} · ` : ''}
                      {label.width} × {label.height} pontos
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-preview">
                  <div className="empty-icon"><RotateCw aria-hidden="true" /></div>
                  <strong>{isConverting ? 'Lendo código ZPL…' : 'Aguardando código ZPL'}</strong>
                  <span>{isConverting ? 'Decodificando textos e gráficos da etiqueta.' : 'Cole ou importe o código no painel ao lado para gerar a prévia.'}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="workbench-footer">
          <p>O SVG é atualizado automaticamente enquanto você digita.</p>
          <span className="footer-divider" aria-hidden="true" />
          <p>Texto, caixas, imagens Z64, Code 128 e QR Code</p>
        </footer>
        <div className="export-actions" aria-label="Imprimir ou exportar etiquetas">
          <button
            className="export-button"
            type="button"
            onClick={handlePrint}
            disabled={isConverting || convertedDocument.labels.length === 0 || isExporting !== null}
          >
            <Printer aria-hidden="true" />
            Imprimir
          </button>
          <button
            className="export-button"
            type="button"
            onClick={() => void handleDownload('pdf')}
            disabled={isConverting || convertedDocument.labels.length === 0 || isExporting !== null}
          >
            <FileDown aria-hidden="true" />
            {isExporting === 'pdf' ? 'Gerando PDF…' : 'Gerar PDF'}
          </button>
          {/* <button
            className="export-button"
            type="button"
            onClick={() => void handleDownload('jpeg')}
            disabled={isConverting || convertedDocument.labels.length === 0 || isExporting !== null}
          >
            <ImageDown aria-hidden="true" />
            {isExporting === 'jpeg' ? 'Gerando JPEG…' : 'Gerar JPEG'}
          </button> */}
        </div>
        {exportError && <p className="conversion-warning" role="alert">{exportError}</p>}
        {(convertedDocument.warnings.length > 0 || fileError) && (
          <p className="conversion-warning" role="status">
            {[...convertedDocument.warnings, ...(fileError ? [fileError] : [])].join(' ')}
          </p>
        )}
      </div>
    </main>
  )
}
