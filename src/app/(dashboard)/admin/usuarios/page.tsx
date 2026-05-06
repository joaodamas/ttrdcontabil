'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDate , tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TableEmptyState } from '@/components/ui/empty-state'
import { UsuarioForm, TELAS_LIST } from '@/components/admin/usuario-form'
import { Loader2, Shield, UsersRound } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { fetchUsuariosAdmin } from '@/features/admin/services'
import type { UsuarioAdmin } from '@/features/admin/types'

const PERFIL_LABELS: Record<string, string> = {
  admin:       'Admin',
  operacional: 'Operacional',
  fiscal:      'Fiscal',
  financeiro:  'Financeiro',
  leitura:     'Leitura',
}

const PERFIL_COLORS: Record<string, string> = {
  admin:       'bg-warning/10 text-warning border-warning/25',
  operacional: 'bg-info/10 text-info border-info/20',
  fiscal:      'bg-primary/10 text-foreground/70 border-primary/20',
  financeiro:  'bg-success/10 text-success border-success/20',
  leitura:     'bg-muted text-muted-foreground border-border',
}

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [loading, setLoading]   = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetchUsuariosAdmin()
      .then(setUsuarios)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    queueMicrotask(() => { void load() })
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="surface-subtle flex items-center justify-between border px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold">Usuários</h2>
          <p className="text-sm text-muted-foreground">
            {usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''} cadastrado{usuarios.length !== 1 ? 's' : ''}
          </p>
        </div>
        <UsuarioForm onSaved={load} />
      </div>

      <Card className="border-border/65 bg-card/95 card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left section-label">Nome</th>
                <th className="px-4 py-3 text-left section-label">E-mail</th>
                <th className="px-4 py-3 text-left section-label">Perfil</th>
                <th className="px-4 py-3 text-left section-label">Acesso</th>
                <th className="px-4 py-3 text-left section-label">Status</th>
                <th className="px-4 py-3 text-left section-label">Último Acesso</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usuarios.length === 0 ? (
                <TableEmptyState
                  colSpan={7}
                  icon={UsersRound}
                  title="Nenhum usuário cadastrado"
                  description="Crie pelo menos dois usuários por perfil principal antes de liberar o ambiente."
                />
              ) : (
                usuarios.map((u) => {
                  const perfilKey = u.perfil ?? 'leitura'
                  const telaCount = u.telas?.length ?? null
                  const totalTelas = TELAS_LIST.length

                  return (
                    <tr key={u.id} className="transition-colors hover:bg-muted/35">
                      <td className="px-4 py-3 font-medium">{u.nome}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PERFIL_COLORS[perfilKey] ?? PERFIL_COLORS.leitura}`}>
                          {PERFIL_LABELS[perfilKey] ?? perfilKey}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {telaCount !== null ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-default">
                                <Shield className="w-3.5 h-3.5" />
                                {telaCount}/{totalTelas} telas
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-64">
                              <p className="text-xs font-medium mb-1">Telas habilitadas:</p>
                              <p className="text-xs text-muted-foreground">
                                {u.telas?.map((k) => TELAS_LIST.find((t) => t.key === k)?.label ?? k).join(', ') || 'Nenhuma'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">Padrão do perfil</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.ativo ? 'default' : 'secondary'}>
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {u.ultimoAcesso ? formatDate(tsToDate(u.ultimoAcesso)) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <UsuarioForm usuario={u} onSaved={load} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
