'use client'
import { ClienteForm } from '@/components/clientes/cliente-form'
import { PageHeader } from '@/components/layout/page-header'

export default function Page() {
  return (
    <>
      <PageHeader
        title="Novo cliente"
        breadcrumbs={[{ label: 'Clientes', href: '/clientes' }, { label: 'Novo cliente' }]}
      />
      <ClienteForm />
    </>
  )
}
