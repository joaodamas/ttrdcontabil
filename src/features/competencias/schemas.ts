import { z } from 'zod'

export const competenciasFiltroSchema = z.object({
  mes: z.number().int().min(1).max(12).nullable(),
  ano: z.number().int().min(2000).max(2100).nullable(),
  status: z.string().optional().default(''),
  clienteId: z.string().optional().default(''),
  page: z.number().int().positive().optional().default(1),
})
