'use client'

import { useState, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'

import { getUsuarios } from '@/lib/firestore-client'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { UsuarioForm } from '@/components/admin/usuario-form'
import { Loader2 } from 'lucide-react'

const PERFIL_LABELS: Record<string, string> = {
  admin: 'Admin',
  operacional: 'Operacional',
  fiscal: 'Fiscal',
  financeiro: 'Financeiro',
  leitura: 'Leitura',
}

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getUsuarios()
      .then((data) => setUsuarios(data as Array<Record<string, unknown>>))
      .finally(() => setLoading(false))
  }, [])

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
        <UsuarioForm />
      </div>

      <Card>
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">E-mail</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Perfil</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Último Acesso
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => {
                  const ultimoAcesso = u.ultimoAcesso as Timestamp | undefined
                  return (
                    <tr key={u.id as string} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{u.nome as string}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email as string}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {PERFIL_LABELS[u.perfil as string] ?? (u.perfil as string)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.ativo ? 'default' : 'secondary'}>
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {ultimoAcesso ? formatDate(ultimoAcesso.toDate()) : '—'}
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
