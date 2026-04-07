export const dynamic = 'force-dynamic'

import { requireAuth } from '@/lib/auth'
import { NfseEmissaoForm } from '@/components/fiscal/nfse-emissao-form'

export default async function EmitirNfsePage() {
  await requireAuth()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Emitir NFS-e</h2>
        <p className="text-sm text-muted-foreground">
          Preencha os dados para emitir uma nota fiscal de serviços.
        </p>
      </div>

      <NfseEmissaoForm />
    </div>
  )
}
