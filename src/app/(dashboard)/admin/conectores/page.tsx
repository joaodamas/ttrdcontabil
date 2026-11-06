'use client'

// Rota mantida em /admin/conectores (links e favoritos antigos), mas desde
// 2026-11-06 ela só tem a chave do Ambiente Nacional: os conectores de
// prefeitura (fiscal_conectores, liberação município a município) saíram com a
// decisão do dono de emitir só pelo Ambiente Nacional.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { getErrorMessage } from '@/lib/error-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { RefreshCw } from 'lucide-react'
import {
  fetchChaveNfseNacional,
  salvarChaveNfseNacional,
  type ChaveNfseNacional,
} from '@/features/admin/services'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAuth } from '@/contexts/auth-context'

export default function AdminAmbienteNacionalPage() {
  const [loading, setLoading] = useState(true)
  const { usuario } = useAuth()
  const [chaveNacional, setChaveNacional] = useState<ChaveNfseNacional | null | undefined>(undefined)
  const [salvandoChave, setSalvandoChave] = useState(false)
  const [confirmarLiberacao, setConfirmarLiberacao] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setChaveNacional(await fetchChaveNfseNacional())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function alterarChaveNacional(liberar: boolean) {
    setSalvandoChave(true)
    try {
      await salvarChaveNfseNacional(liberar, Boolean(chaveNacional), usuario?.nome ?? usuario?.email ?? 'Administrador')
      setChaveNacional({ ...(chaveNacional ?? {}), producaoLiberada: liberar })
      toast.success(liberar
        ? 'Emissão em produção pelo Ambiente Nacional liberada.'
        : 'Emissão em produção pelo Ambiente Nacional bloqueada.')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível alterar a liberação do Ambiente Nacional.'))
    } finally {
      setSalvandoChave(false)
      setConfirmarLiberacao(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ambiente Nacional"
        description="Liberação da emissão de NFS-e em produção pelo Ambiente Nacional (Sefin Nacional)."
        breadcrumbs={[{ label: 'Administração', href: '/admin' }, { label: 'Ambiente Nacional' }]}
        action={
          <Button variant="outline" size="cta" onClick={load} loading={loading}>
            <RefreshCw />
            Atualizar
          </Button>
        }
      />

      <Card className="border-border/65 bg-card/95 p-4 card-shadow">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              Ambiente Nacional (Sefin Nacional)
              {chaveNacional?.producaoLiberada
                ? <Badge variant="success">Produção liberada</Badge>
                : <Badge variant="secondary">Produção bloqueada</Badge>}
            </p>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Uma chave só para o escritório inteiro. Ligada, clientes com configuração fiscal em <strong>Produção</strong> emitem
              notas reais pelo Ambiente Nacional em qualquer município que tenha aderido ao convênio (a plataforma confere a adesão
              a cada emissão). Clientes em Homologação continuam emitindo só no ambiente de testes.
            </p>
            <p className="max-w-2xl text-sm text-muted-foreground">
              A plataforma emite só pelo Ambiente Nacional. Cliente de município que não usa o Emissor Nacional emite no portal da
              prefeitura, fora da plataforma.
            </p>
            {chaveNacional?.alteradoPorNome && (
              <p className="text-xs text-muted-foreground">Última alteração por {chaveNacional.alteradoPorNome}.</p>
            )}
          </div>
          <Switch
            checked={Boolean(chaveNacional?.producaoLiberada)}
            disabled={chaveNacional === undefined || salvandoChave}
            aria-label="Liberar emissão em produção pelo Ambiente Nacional"
            onCheckedChange={(ligar) => (ligar ? setConfirmarLiberacao(true) : void alterarChaveNacional(false))}
          />
        </div>
      </Card>

      <ConfirmDialog
        open={confirmarLiberacao}
        onOpenChange={setConfirmarLiberacao}
        title="Liberar emissão real pelo Ambiente Nacional?"
        description="A partir de agora, emitir NFS-e para clientes em Produção gera notas fiscais reais, com validade jurídica, em nome desses clientes. Cancelar exige evento de cancelamento."
        confirmLabel="Liberar produção"
        destructive
        onConfirm={() => alterarChaveNacional(true)}
      />
    </div>
  )
}
