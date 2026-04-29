'use client'

import { useState, useEffect, useCallback } from 'react'
import { Timestamp } from 'firebase/firestore'
import { getUsuarios } from '@/lib/firestore-client'
import { formatDate , tsToDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { UsuarioForm, TELAS_LIST } from '@/components/admin/usuario-form'
import { Loader2, Shield } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const PERFIL_LABELS: Record<string, string> = {
  admin:       'Admin',
  operacional: 'Operacional',
  fiscal:      'Fiscal',
  financeiro:  'Financeiro',
  leitura:     'Leitura',
}

const PERFIL_COLORS: Record<string, string> = {
  admin:       'bg-amber-100 text-amber-800 border-amber-200',
  operacional: 'bg-blue-100 text-blue-800 border-blue-200',
  fiscal:      'bg-purple-100 text-purple-800 border-purple-200',
  financeiro:  'bg-green-100 text-green-800 border-green-200',
  leitura:     'bg-gray-100 text-gray-700 border-gray-200',
}

type UsuarioRow = {
  id: string
  nome?: string
  email?: string
  perfil?: string
  ativo?: boolean
  telas?: string[]
  ultimoAcesso?: Timestamp
}

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([])
  const [loading, setLoading]   = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    getUsuarios()
      .then((data) => setUsuarios(data as UsuarioRow[]))
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Usuários</h2>
          <p className="text-sm text-muted-foreground">
            {usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''} cadastrado{usuarios.length !== 1 ? 's' : ''}
          </p>
        </div>
        <UsuarioForm onSaved={load} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">E-mail</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Perfil</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Acesso</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Último Acesso</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usuarios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => {
                  const perfilKey = u.perfil ?? 'leitura'
                  const telaCount = u.telas?.length ?? null
                  const totalTelas = TELAS_LIST.length

                  return (
                    <tr key={u.id} className="hover:bg-muted/30 transition-colors">
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
