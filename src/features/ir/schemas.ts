import { z } from 'zod'

export const irFiltroSchema = z.object({
  anoBase: z.number().int().min(2000).max(2100),
  status: z.string().optional().default(''),
  page: z.number().int().positive().optional().default(1),
})
