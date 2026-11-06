'use client'

import { useState } from 'react'
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldOff, Upload, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CertificadoUpload } from '@/components/fiscal/certificado-upload'
import { statusCertificado, type SituacaoCertificado } from '@/lib/certificado-status'
import { cn, formatCpfCnpj } from '@/lib/utils'

const SITUACAO: Record<SituacaoCertificado, { rotulo: string; variant: 'success' | 'warning' | 'destructive' | 'secondary'; icone: typeof ShieldCheck; cor: string }> = {
  valido:   { rotulo: 'Válido',            variant: 'success',     icone: ShieldCheck, cor: 'text-success' },
  vencendo: { rotulo: 'Vence em breve',    variant: 'warning',     icone: ShieldAlert, cor: 'text-warning' },
  vencido:  { rotulo: 'Vencido',           variant: 'destructive', icone: ShieldAlert, cor: 'text-destructive' },
  invalido: { rotulo: 'Inválido',          variant: 'destructive', icone: ShieldAlert, cor: 'text-destructive' },
  ausente:  { rotulo: 'Não enviado',       variant: 'secondary',   icone: ShieldOff,   cor: 'text-muted-foreground' },
}

interface Props {
  clienteId: string
  /** `clientes_fiscal.credenciais` (só os campos públicos do certificado são lidos). */
  credenciais: Record<string, unknown> | null | undefined
  cnpjCliente?: unknown
  /** admin/fiscal: pode enviar/substituir o A1 (callable uploadCertificado). */
  podeEnviar: boolean
  onEnviado?: () => void
  className?: string
}

/**
 * Cartão de STATUS do certificado A1: titular, CNPJ, vencimento (alerta com
 * ≤ 30 dias ou vencido) e válido/inválido. O formulário de envio só aparece
 * ao clicar em "Enviar/Substituir certificado" — antes a aba Fiscal abria com
 * um upload vazio no topo mesmo com o certificado já enviado.
 */
export function CertificadoStatusCard({ clienteId, credenciais, cnpjCliente, podeEnviar, onEnviado, className }: Props) {
  const [enviando, setEnviando] = useState(false)
  const st = statusCertificado(credenciais, cnpjCliente)
  const info = SITUACAO[st.situacao]
  const Icone = info.icone
  const ausente = st.situacao === 'ausente'
  const c = credenciais ?? {}

  const alerta =
    st.situacao === 'vencido' ? `Certificado vencido${st.diasRestantes !== undefined ? ` há ${Math.abs(st.diasRestantes)} dia${Math.abs(st.diasRestantes) === 1 ? '' : 's'}` : ''} — a NFS-e não é emitida até enviar um novo.`
    : st.situacao === 'vencendo' ? (st.diasRestantes === 0 ? 'O certificado vence hoje — providencie a renovação.' : `O certificado vence em ${st.diasRestantes} dia${st.diasRestantes === 1 ? '' : 's'} — providencie a renovação.`)
    : st.situacao === 'invalido' ? 'O certificado enviado não foi aceito na validação. Envie um certificado válido.'
    : null

  return (
    <Card className={cn('border-border/70 shadow-none', className)} data-testid="certificado-status">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icone className={cn('h-4 w-4', info.cor)} />
          Certificado digital A1
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={info.variant}>{info.rotulo}</Badge>
          {podeEnviar && !enviando ? (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setEnviando(true)}>
              <Upload className="h-3.5 w-3.5" />
              {ausente ? 'Enviar certificado' : 'Substituir certificado'}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {ausente ? (
          <p className="text-sm text-muted-foreground">
            Nenhum certificado enviado. Sem o A1 do cliente a NFS-e não é emitida.
            {!podeEnviar ? ' O envio é feito pelo administrador ou pela equipe fiscal.' : ''}
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div className="min-w-0 sm:col-span-3">
              <dt className="text-xs text-muted-foreground">Titular</dt>
              <dd className="mt-0.5 break-words font-medium">{st.titular ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">CNPJ</dt>
              <dd className="mt-0.5 font-mono text-sm font-medium">{st.cnpj ? formatCpfCnpj(st.cnpj) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Vencimento</dt>
              <dd className={cn('mt-0.5 font-medium tabular-nums', st.situacao === 'vencido' && 'text-destructive', st.situacao === 'vencendo' && 'text-warning')}>
                {st.vencimento ? st.vencimento.toLocaleDateString('pt-BR') : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Validação</dt>
              <dd className="mt-0.5 font-medium">{c.certValido === false ? 'Inválido' : c.certValido === true ? 'Válido' : '—'}</dd>
            </div>
          </dl>
        )}

        {alerta ? (
          <p role="alert" className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', st.situacao === 'vencendo' ? 'border-warning/30 bg-warning/8 text-warning' : 'border-destructive/30 bg-destructive/5 text-destructive')}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{alerta}
          </p>
        ) : null}
        {st.outroCnpj ? (
          <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            O CNPJ do certificado não é o CNPJ do cliente.
          </p>
        ) : null}

        {podeEnviar && enviando ? (
          <div className="rounded-lg border border-dashed p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {ausente ? 'Enviar certificado (.pfx)' : 'Substituir certificado (.pfx)'}
              </p>
              <Button size="icon-sm" variant="ghost" aria-label="Fechar envio de certificado" onClick={() => setEnviando(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <CertificadoUpload
              clienteId={clienteId}
              somenteFormulario
              onUploaded={() => { setEnviando(false); onEnviado?.() }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
