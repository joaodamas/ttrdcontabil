'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CompetenciaForm } from '@/components/competencias/competencia-form'

function NovaCompetenciaContent() {
  const searchParams = useSearchParams()
  const clienteId = searchParams.get('clienteId') ?? undefined
  return <CompetenciaForm initialData={clienteId ? { clienteId } : undefined} />
}

export default function Page() {
  return (
    <Suspense>
      <NovaCompetenciaContent />
    </Suspense>
  )
}
