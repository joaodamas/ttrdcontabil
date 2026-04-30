import { orderBy, where, type QueryConstraint } from 'firebase/firestore'
import { listDocuments } from '@/lib/firestore-client'
import type { IrDeclaracaoRecord, IrFilters } from './types'

export async function fetchIrDeclaracoes(filters: IrFilters): Promise<IrDeclaracaoRecord[]> {
  const constraints: QueryConstraint[] = [
    where('anoBase', '==', filters.anoBase),
    ...(filters.status ? [where('status', '==', filters.status)] : []),
    orderBy('clienteNome', 'asc'),
  ]
  const data = await listDocuments('ir_declaracoes', constraints)
  return data as IrDeclaracaoRecord[]
}
