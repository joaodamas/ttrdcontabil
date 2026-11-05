import ClienteDetailPage from './page-client'

export const generateStaticParams = () => [{ id: 'placeholder' }]
export const dynamicParams = false

export default function Page() {
  return <ClienteDetailPage />
}
