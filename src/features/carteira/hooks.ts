import { useQuery } from '@tanstack/react-query'
import { fetchCarteiraSnapshot } from './services'

export function useCarteira() {
  return useQuery({
    queryKey: ['carteira', 'snapshot'],
    queryFn: () => fetchCarteiraSnapshot(),
  })
}
