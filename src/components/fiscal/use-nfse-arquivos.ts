'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { getErrorMessage } from '@/lib/error-message'
import {
  baixarXmlNfse,
  gerarDanfse,
  pdfProntoDaNota,
  temXmlNfse,
} from '@/features/fiscal/nfse-arquivos'

type Nota = Record<string, unknown>

/**
 * Ações de arquivo da NFS-e (XML e DANFSe) com estado de carregamento por nota.
 * `aoGerarPdf` permite recarregar a tela depois que o servidor grava o pdfUrl.
 */
export function useNfseArquivos(aoGerarPdf?: () => void) {
  const [gerandoPdfId, setGerandoPdfId] = useState<string | null>(null)

  const baixarXml = useCallback((nota: Nota) => {
    try {
      baixarXmlNfse(nota)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível baixar o XML da NFS-e.'))
    }
  }, [])

  const abrirDanfse = useCallback(async (nota: Nota) => {
    const id = nota.id as string
    const pronto = pdfProntoDaNota(nota)
    if (pronto) {
      window.open(pronto, '_blank', 'noopener,noreferrer')
      return
    }
    if (!temXmlNfse(nota)) {
      toast.error('Esta NFS-e não tem o XML oficial gravado; não é possível gerar o DANFSe.')
      return
    }

    // A aba é aberta ainda dentro do clique: aberta depois do await, o
    // navegador a trataria como pop-up e bloquearia.
    const janela = window.open('', '_blank')
    if (janela) {
      janela.document.title = 'Gerando DANFSe…'
      janela.document.body.textContent = 'Gerando o DANFSe da NFS-e, aguarde…'
      janela.document.body.style.font = '14px system-ui, sans-serif'
      janela.document.body.style.padding = '24px'
    }
    setGerandoPdfId(id)
    try {
      const url = await gerarDanfse(id)
      if (janela && !janela.closed) {
        janela.opener = null
        janela.location.replace(url)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      aoGerarPdf?.()
    } catch (err) {
      janela?.close()
      toast.error(getErrorMessage(err, 'Não foi possível gerar o DANFSe. Tente novamente em instantes.'))
    } finally {
      setGerandoPdfId(null)
    }
  }, [aoGerarPdf])

  return { baixarXml, abrirDanfse, gerandoPdfId }
}
