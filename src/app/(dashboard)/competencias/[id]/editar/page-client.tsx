'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { getDocument } from '@/lib/firestore-client'
import { CompetenciaForm } from '@/components/competencias/competencia-form'
import { Loader2 } from 'lucide-react'
export default function Page() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<any>(null)
  useEffect(() => { getDocument<any>('competencias', id).then(setData) }, [id])
  if (!data) return <div className="flex h-40 items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
  return <CompetenciaForm initialData={data} />
}
