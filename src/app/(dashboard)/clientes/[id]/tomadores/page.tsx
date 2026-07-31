import CarteiraTomadoresPage from './page-client'

// Rota dinâmica em export estático: o id real é lido do pathname no cliente
// (getPathSegmentAfter) — mesmo padrão de /clientes/[id]/fiscal.
export const generateStaticParams = () => [{ id: 'placeholder' }]

export default function Page() {
  return <CarteiraTomadoresPage />
}
