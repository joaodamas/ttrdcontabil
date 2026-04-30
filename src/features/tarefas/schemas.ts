import { z } from 'zod'

export const tarefasFiltroSchema = z.object({
  status: z.string().optional().default(''),
  prioridade: z.string().optional().default(''),
  responsavelId: z.string().optional().default(''),
  clienteId: z.string().optional().default(''),
  competenciaId: z.string().optional().default(''),
  page: z.number().int().positive().optional().default(1),
})
