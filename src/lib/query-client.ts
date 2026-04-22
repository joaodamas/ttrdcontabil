import { QueryClient } from '@tanstack/react-query'

/**
 * QueryClient singleton com configuração otimizada para o perfil de uso do TTRD.
 *
 * staleTime 5 min  — dados de listas (clientes, serviços) podem ficar em cache
 *                    antes de um refetch silencioso em background.
 * gcTime    10 min — mantém dados inativas por até 10 min antes de liberar memória.
 * retry     1      — em caso de erro de rede, tenta mais uma vez antes de expor
 *                    o estado de erro ao usuário.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 min
      gcTime:    10 * 60 * 1000,  // 10 min
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})
