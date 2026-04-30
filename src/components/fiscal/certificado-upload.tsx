'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, ShieldCheck, ShieldAlert, Upload } from 'lucide-react'
import { getFirebaseApp } from '@/lib/firebase'

export interface CertInfo {
  titular:     string
  vencimento:  string   // ISO date string
  valido:      boolean
  storagePath: string
}

interface Props {
  clienteId: string
  certInfo?: CertInfo | null
  onUploaded?: (info: CertInfo) => void
}

export function CertificadoUpload({ clienteId, certInfo, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false)
  const [senha, setSenha] = useState('')
  const [file, setFile]   = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file)  { toast.error('Selecione o arquivo .pfx.'); return }
    if (!senha) { toast.error('Informe a senha do certificado.'); return }

    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const bytes  = new Uint8Array(buffer)
      let binary   = ''
      bytes.forEach(b => (binary += String.fromCharCode(b)))
      const pfxBase64 = btoa(binary)

      const functions = getFunctions(getFirebaseApp(), 'southamerica-east1')
      const upload    = httpsCallable<Record<string, unknown>, CertInfo & { sucesso: boolean }>(
        functions, 'uploadCertificado'
      )
      const result = await upload({ clienteId, pfxBase64, senha })
      toast.success(`Certificado de ${result.data.titular} enviado com sucesso!`)

      setFile(null)
      setSenha('')
      if (inputRef.current) inputRef.current.value = ''
      onUploaded?.(result.data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar certificado.'
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  const vencDate = certInfo?.vencimento ? new Date(certInfo.vencimento) : null

  return (
    <div className="space-y-4">
      {/* Status do certificado atual */}
      {certInfo ? (
        <div className="flex items-start gap-3 p-3 rounded-md border bg-muted/30">
          {certInfo.valido
            ? <ShieldCheck className="w-5 h-5 text-success mt-0.5 shrink-0" />
            : <ShieldAlert className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          }
          <div className="text-sm min-w-0">
            <p className="font-medium truncate">{certInfo.titular}</p>
            <p className="text-muted-foreground text-xs">
              Vencimento: {vencDate?.toLocaleDateString('pt-BR') ?? '—'}
              <Badge
                variant={certInfo.valido ? 'default' : 'destructive'}
                className="ml-2 text-xs"
              >
                {certInfo.valido ? 'Válido' : 'Vencido'}
              </Badge>
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">Nenhum certificado cadastrado.</p>
      )}

      {/* Formulário de upload */}
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_200px] gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Arquivo .pfx / .p12</Label>
            <Input
              ref={inputRef}
              type="file"
              accept=".pfx,.p12"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="cursor-pointer"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Senha do Certificado</Label>
            <Input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="Senha"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUpload}
          disabled={uploading || !file}
        >
          {uploading
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Upload className="w-4 h-4 mr-2" />
          }
          {certInfo ? 'Atualizar Certificado' : 'Enviar Certificado'}
        </Button>
      </div>
    </div>
  )
}
