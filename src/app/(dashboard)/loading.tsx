/**
 * Skeleton de transição entre telas.
 *
 * Sem este arquivo, o App Router não tem fronteira de Suspense nesta seção: ao
 * clicar num item do menu, nada acontece na tela até o chunk da rota baixar E a
 * árvore montar. O usuário fica olhando a tela ANTERIOR por algumas centenas de
 * milissegundos e ela troca de uma vez — o que se lê como travamento, mesmo
 * quando o tempo é curto.
 *
 * Com a fronteira, o esqueleto aparece no mesmo frame do clique. O tempo total
 * não muda; a percepção muda inteira, porque a interface responde na hora.
 *
 * Fica em (dashboard)/ de propósito: um único arquivo cobre todas as telas
 * filhas que não tenham skeleton próprio.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      {/* Cabeçalho da página */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-md bg-muted" />
          <div className="h-4 w-40 rounded bg-muted/70" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-muted" />
      </div>

      {/* Faixa de indicadores */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="h-3 w-24 rounded bg-muted/70" />
            <div className="h-8 w-20 rounded-md bg-muted" />
            <div className="h-3 w-full rounded bg-muted/50" />
          </div>
        ))}
      </div>

      {/* Corpo: tabela ou lista */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="h-4 w-40 rounded bg-muted/70" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="h-8 w-8 shrink-0 rounded-md bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-1/3 rounded bg-muted" />
                <div className="h-3 w-1/4 rounded bg-muted/50" />
              </div>
              <div className="hidden h-6 w-20 rounded-full bg-muted/70 sm:block" />
              <div className="hidden h-6 w-16 rounded-full bg-muted/50 md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
