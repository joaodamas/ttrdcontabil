import { z } from 'zod'

export const financeiroBaseFiltroSchema = z.object({
  clienteId: z.string().optional().default(''),
  competenciaId: z.string().optional().default(''),
})
