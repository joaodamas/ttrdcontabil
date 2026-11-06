'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import {
  AVISO_ANTES_MS,
  CHAVE_MOTIVO_SAIDA,
  CHAVE_ULTIMA_ATIVIDADE,
  LIMITE_INATIVIDADE_MS,
  MOTIVO_INATIVIDADE,
  estadoInatividade,
  lerUltimaAtividade,
} from '@/lib/sessao-inatividade'

const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
const GRAVAR_NO_MAXIMO_A_CADA_MS = 15_000
const VERIFICAR_A_CADA_MS = 15_000
const ID_TOAST = 'aviso-inatividade'

function ler(): number {
  try {
    return lerUltimaAtividade(window.localStorage.getItem(CHAVE_ULTIMA_ATIVIDADE), Date.now())
  } catch {
    return Date.now()
  }
}

function gravar(t: number) {
  try {
    window.localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(t))
  } catch {
    // Storage bloqueado: cada aba conta sozinha (fallback em memória abaixo).
  }
}

/**
 * Encerra a sessão após 30 min sem atividade em nenhuma aba (ver
 * src/lib/sessao-inatividade.ts). Avisa 1 min antes. `ativo` = o perfil
 * logado é admin/fiscal.
 */
export function useLogoutInatividade(ativo: boolean, logout: () => Promise<void>) {
  const logoutRef = useRef(logout)
  useEffect(() => {
    logoutRef.current = logout
  }, [logout])

  useEffect(() => {
    if (!ativo) return
    let memoria = Date.now()
    let ultimaGravacao = 0
    let saindo = false
    gravar(memoria)

    const registrar = () => {
      const agora = Date.now()
      memoria = agora
      if (agora - ultimaGravacao < GRAVAR_NO_MAXIMO_A_CADA_MS) return
      ultimaGravacao = agora
      gravar(agora)
      toast.dismiss(ID_TOAST)
    }

    const verificar = () => {
      if (saindo) return
      const ultima = Math.max(ler(), memoria)
      const estado = estadoInatividade(Date.now(), ultima)
      if (estado === 'aviso') {
        toast.warning('Sua sessão vai ser encerrada em 1 minuto por inatividade.', {
          id: ID_TOAST,
          duration: AVISO_ANTES_MS,
          action: { label: 'Continuar conectado', onClick: () => { ultimaGravacao = 0; registrar() } },
        })
      } else if (estado === 'expirado') {
        saindo = true
        toast.dismiss(ID_TOAST)
        try { window.sessionStorage.setItem(CHAVE_MOTIVO_SAIDA, MOTIVO_INATIVIDADE) } catch {}
        void logoutRef.current()
      }
    }

    for (const ev of EVENTOS) window.addEventListener(ev, registrar, { passive: true })
    // Voltar para a aba depois de horas: confere na hora, antes de qualquer clique.
    const aoVoltar = () => { if (document.visibilityState === 'visible') verificar() }
    document.addEventListener('visibilitychange', aoVoltar)
    const timer = window.setInterval(verificar, VERIFICAR_A_CADA_MS)
    return () => {
      for (const ev of EVENTOS) window.removeEventListener(ev, registrar)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.clearInterval(timer)
    }
  }, [ativo])
}

export { LIMITE_INATIVIDADE_MS }
