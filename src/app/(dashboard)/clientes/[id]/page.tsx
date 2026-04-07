import ClienteDetailPage from './page-client'

export const generateStaticParams = () => [{ id: 'placeholder' }]

export default function Page() {
  return <ClienteDetailPage />
}
