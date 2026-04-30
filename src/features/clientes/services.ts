import { getClientes } from '@/lib/firestore-client'
import type { ClienteRecord } from './types'

export async function fetchClientes(status?: string): Promise<ClienteRecord[]> {
  const data = await getClientes(status ? { status } : {})
  return data as ClienteRecord[]
}
