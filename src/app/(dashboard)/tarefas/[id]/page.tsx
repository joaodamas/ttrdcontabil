import TarefaDetalhePage from './page-client'

export const generateStaticParams = () => [{ id: 'placeholder' }]

export default function Page() {
  return <TarefaDetalhePage />
}
