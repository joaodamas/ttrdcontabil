import { z } from 'zod'

export const bulkReassignSchema = z.object({
  responsavelId: z.string().min(1, 'Responsavel obrigatorio'),
})

export const bulkDateSchema = z.object({
  date: z.string().min(1, 'Data obrigatoria'),
})
