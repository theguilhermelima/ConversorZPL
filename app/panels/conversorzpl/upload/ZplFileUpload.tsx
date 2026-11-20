'use client'

import { useRef, type ChangeEvent } from 'react'
import { Upload } from 'lucide-react'

// Limite de tamanho para arquivos ZPL/TXT importados: 4 MB decimais.
const MAX_ZPL_FILE_SIZE = 8_000_000

type ZplFileUploadProps = {
  onFileLoaded: (content: string, filename: string) => void
  onError: (message: string | null) => void
}

export function ZplFileUpload({ onFileLoaded, onError }: ZplFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    try {
      // Confere o tamanho antes de ler o arquivo e enviar o texto para o editor.
      if (file.size > MAX_ZPL_FILE_SIZE) {
        onError('O arquivo deve ter no máximo 4 MB.')
        return
      }

      // O editor recebe o conteúdo e o nome; a página então converte o novo ZPL.
      onFileLoaded(await file.text(), file.name)
      onError(null)
    } catch {
      onError('Não foi possível ler este arquivo de texto.')
    } finally {
      input.value = ''
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        className="file-input-hidden"
        type="file"
        accept=".zpl,.txt,text/plain"
        aria-label="Selecionar arquivo de texto ZPL"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
      />
      <button className="import-button" type="button" onClick={() => fileInputRef.current?.click()}>
        <Upload aria-hidden="true" />
        Importar
      </button>
    </>
  )
}
