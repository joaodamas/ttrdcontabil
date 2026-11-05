'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { MailCheck, MoreHorizontal, Power, PowerOff, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getErrorMessage } from '@/lib/error-message'
import { atualizarUsuarioAdmin, excluirUsuarioAdmin, reenviarConviteAdmin } from '@/features/admin/services'
import type { UsuarioAdmin } from '@/features/admin/types'

type Confirmacao = 'desativar' | 'excluir' | null

/**
 * Ações de um usuário na lista: reenviar convite (e-mail de definir senha),
 * desativar/reativar e excluir. Tudo pelas Cloud Functions — elas travam o
 * último admin e a autoexclusão; aqui só escondemos o que não faz sentido.
 */
export function UsuarioAcoes({ usuario, ehProprio, onChanged }: {
  usuario: UsuarioAdmin
  ehProprio: boolean
  onChanged: () => void
}) {
  const [confirmar, setConfirmar] = useState<Confirmacao>(null)
  const [ocupado, setOcupado] = useState(false)
  const ativo = usuario.ativo !== false
  const nome = usuario.nome || usuario.email || 'este usuário'

  async function executar(acao: () => Promise<unknown>, sucesso: string, falha: string) {
    setOcupado(true)
    try {
      await acao()
      toast.success(sucesso)
      onChanged()
    } catch (err) {
      console.error('[usuarios] ação', err)
      toast.error(getErrorMessage(err, falha))
    } finally {
      setOcupado(false)
      setConfirmar(null)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={ocupado}
          aria-label={`Mais ações para ${nome}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {ativo && (
            <DropdownMenuItem
              onClick={() => void executar(
                async () => reenviarConviteAdmin(usuario.id),
                `Link para definir a senha enviado para ${usuario.email ?? 'o e-mail do usuário'}.`,
                'Não foi possível reenviar o convite.',
              )}
            >
              <MailCheck className="h-3.5 w-3.5 mr-2" />Reenviar convite / redefinir senha
            </DropdownMenuItem>
          )}
          {!ehProprio && (
            ativo ? (
              <DropdownMenuItem onClick={() => setConfirmar('desativar')}>
                <PowerOff className="h-3.5 w-3.5 mr-2" />Desativar
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => void executar(
                  () => atualizarUsuarioAdmin(usuario.id, { ativo: true }),
                  `${nome} reativado. O login volta a funcionar com a senha atual.`,
                  'Não foi possível reativar o usuário.',
                )}
              >
                <Power className="h-3.5 w-3.5 mr-2" />Reativar
              </DropdownMenuItem>
            )
          )}
          {!ehProprio && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmar('excluir')}>
                <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmar === 'desativar'}
        onOpenChange={(v) => !v && setConfirmar(null)}
        title={`Desativar ${nome}?`}
        description="O login é bloqueado e as sessões abertas caem na hora. Os registros feitos por este usuário continuam. Dá para reativar depois."
        confirmLabel="Desativar"
        destructive
        onConfirm={() => executar(
          () => atualizarUsuarioAdmin(usuario.id, { ativo: false }),
          `${nome} desativado.`,
          'Não foi possível desativar o usuário.',
        )}
      />
      <ConfirmDialog
        open={confirmar === 'excluir'}
        onOpenChange={(v) => !v && setConfirmar(null)}
        title={`Excluir ${nome}?`}
        description="Apaga o perfil e a conta de login. Não dá para desfazer — para só bloquear o acesso, use Desativar. Tarefas e registros antigos mantêm o nome gravado."
        confirmLabel="Excluir definitivamente"
        destructive
        onConfirm={() => executar(
          () => excluirUsuarioAdmin(usuario.id),
          `${nome} excluído.`,
          'Não foi possível excluir o usuário.',
        )}
      />
    </>
  )
}
