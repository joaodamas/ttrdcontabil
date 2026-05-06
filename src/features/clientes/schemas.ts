import { z } from 'zod'

export const clientesFiltroSchema = z.object({
  busca: z.string().optional().default(''),
  status: z.enum(['', 'all', 'ativo', 'inativo', 'suspenso'])
    .optional()
    .default('')
    .transform((value) => value === 'all' ? '' : value),
  page: z.number().int().positive().optional().default(1),
})
