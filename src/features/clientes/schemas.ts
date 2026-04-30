import { z } from 'zod'

export const clientesFiltroSchema = z.object({
  busca: z.string().optional().default(''),
  status: z.enum(['', 'ativo', 'inativo', 'suspenso']).optional().default(''),
  page: z.number().int().positive().optional().default(1),
})
