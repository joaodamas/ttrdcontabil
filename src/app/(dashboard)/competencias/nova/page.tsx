'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { CompetenciaForm } from '@/components/competencias/competencia-form'

function NovaCompetenciaContent() {
  const searchParams = useSearchParams()
  const clienteId = searchParams.get('clienteId') ?? undefined
  return <CompetenciaForm initialData={clienteId ? { clienteId } : undefined} />
}

export default function Page() {
  return (
    <>
      <PageHeader
        title="Nova competência"
        breadcrumbs={[{ label: 'Competências', href: '/competencias' }, { label: 'Nova competência' }]}
      />
      <Suspense>
        <NovaCompetenciaContent />
      </Suspense>
    </>
  )
}
