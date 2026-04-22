'use client'

import { useState, useCallback, useRef } from 'react'
import {
  collection, query, getDocs, startAfter, limit as fsLimit,
  type QueryConstraint, type DocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface UsePaginatedQueryOptions {
  /** Nome da coleção Firestore. */
  col: string
  /** Constraints base (where, orderBy). Não inclua limit() — é gerenciado pelo hook. */
  constraints: QueryConstraint[]
  /** Quantidade de documentos por página. Padrão: 20. */
  pageSize?: number
}

interface UsePaginatedQueryResult<T> {
  data:       Array<T & { id: string }>
  loading:    boolean
  error:      Error | null
  page:       number
  hasNext:    boolean
  hasPrev:    boolean
  nextPage:   () => Promise<void>
  prevPage:   () => Promise<void>
  reload:     () => Promise<void>
}

/**
 * Paginação cursor-based para coleções Firestore.
 * Usa `startAfter(lastDoc)` para navegar de forma eficiente sem carregar todos os docs.
 *
 * @example
 * const { data, loading, hasNext, nextPage, hasPrev, prevPage } = usePaginatedQuery({
 *   col: 'clientes',
 *   constraints: [orderBy('razaoSocial'), where('status', '==', 'ativo')],
 *   pageSize: 20,
 * })
 */
export function usePaginatedQuery<T = Record<string, unknown>>({
  col,
  constraints,
  pageSize = 20,
}: UsePaginatedQueryOptions): UsePaginatedQueryResult<T> {
  const [data,    setData]    = useState<Array<T & { id: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<Error | null>(null)
  const [page,    setPage]    = useState(1)
  const [hasNext, setHasNext] = useState(false)

  // Stack of "last document of each page" for backward navigation
  const cursors = useRef<DocumentSnapshot[]>([])

  const fetchPage = useCallback(async (cursor?: DocumentSnapshot) => {
    setLoading(true)
    setError(null)
    try {
      const pageConstraints: QueryConstraint[] = [
        ...constraints,
        ...(cursor ? [startAfter(cursor)] : []),
        fsLimit(pageSize + 1), // fetch one extra to detect if there's a next page
      ]
      const snap = await getDocs(query(collection(db, col), ...pageConstraints))
      const docs = snap.docs

      setHasNext(docs.length > pageSize)
      const visible = docs.slice(0, pageSize)
      setData(visible.map((d) => ({ id: d.id, ...(d.data() as T) })))

      // Save the last visible doc as cursor for next page
      const lastVisible = visible[visible.length - 1]
      if (lastVisible) {
        cursors.current[page - 1] = lastVisible
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col, JSON.stringify(constraints.map(String)), pageSize, page])

  const reload = useCallback(async () => {
    cursors.current = []
    setPage(1)
    await fetchPage(undefined)
  }, [fetchPage])

  const nextPage = useCallback(async () => {
    const cursor = cursors.current[page - 1]
    setPage((p) => p + 1)
    await fetchPage(cursor)
  }, [fetchPage, page])

  const prevPage = useCallback(async () => {
    if (page <= 1) return
    const newPage = page - 1
    setPage(newPage)
    const cursor = newPage > 1 ? cursors.current[newPage - 2] : undefined
    await fetchPage(cursor)
  }, [fetchPage, page])

  // Initial load
  useState(() => { fetchPage(undefined) })

  return {
    data,
    loading,
    error,
    page,
    hasNext,
    hasPrev: page > 1,
    nextPage,
    prevPage,
    reload,
  }
}
