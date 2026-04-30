import { z } from 'zod'

export const fechamentoFiltroSchema = z.object({
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2000).max(2100),
  regime: z.string().optional().default(''),
})
