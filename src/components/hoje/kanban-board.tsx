'use client'

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Timestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { GripVertical, Users } from 'lucide-react'
import { cn, tsToDate } from '@/lib/utils'
import { updateDocument } from '@/lib/firestore-client'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { HojeTask, HojeUsuario } from '@/features/hoje/types'

type Grupo = 'atrasada' | 'hoje' | 'proximos'
type FilaItem = HojeTask & { grupo: Grupo; score: number }

const COLS: Array<{ grupo: Grupo; label: string; cor: string; header: string }> = [
  { grupo: 'atrasada', label: 'Atrasadas',   cor: 'border-destructive/30 bg-destructive/5', header: 'text-destructive' },
  { grupo: 'hoje',     label: 'Para hoje',   cor: 'border-warning/30 bg-warning/5',         header: 'text-warning'     },
  { grupo: 'proximos', label: 'Próximos 7d', cor: 'border-border bg-muted/20',              header: 'text-muted-foreground' },
]

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}
function isoTomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
function targetDateForGrupo(grupo: Grupo): string {
  if (grupo === 'atrasada') return isoToday()
  if (grupo === 'hoje')     return isoToday()
  return isoTomorrow()
}

function diasAtraso(data: Date | null) {
  if (!data) return 0
  const hoje = new Date()
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const inicioData = new Date(data.getFullYear(), data.getMonth(), data.getDate())
  return Math.max(0, Math.floor((inicioHoje.getTime() - inicioData.getTime()) / 86400000))
}

/* ── Sortable card ────────────────────────────────────────────────── */
function KanbanCard({
  item, selected, onToggle, usuarios, onAssign, isDragging = false,
}: {
  item: FilaItem
  selected: boolean
  onToggle: () => void
  usuarios: HojeUsuario[]
  onAssign: (id: string, uid: string, name: string) => void
  isDragging?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, over } = useSortable({ id: item.id })
  const prazo = tsToDate(item.dataPrazo)
  const atr = diasAtraso(prazo)
  const isOver = over?.id === item.id

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-2 px-3 py-2.5 transition-colors',
        isOver ? 'bg-primary/5' : 'hover:bg-muted/40'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none"
        aria-label="Arrastar"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <Link href={`/tarefas/${item.id}`} className="text-xs font-medium hover:underline leading-tight line-clamp-2">
          {item.titulo ?? 'Tarefa'}
        </Link>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.clienteNome ?? '—'}</p>
        {item.responsavelNome && (
          <p className="text-[10px] text-muted-foreground/70 truncate">{item.responsavelNome}</p>
        )}
        {atr > 0 && <p className="text-[11px] font-medium text-destructive">{atr}d atraso</p>}
        {item.prioridade && item.prioridade !== 'normal' && (
          <Badge variant={item.prioridade === 'urgente' ? 'destructive' : 'outline'} className="mt-1 text-[10px] py-0 h-4">
            {item.prioridade}
          </Badge>
        )}
        {!item.responsavelId && usuarios.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="mt-1 text-[10px] text-destructive border border-destructive/30 rounded px-1.5 py-0.5 hover:bg-destructive/10 flex items-center gap-1">
              <Users className="h-2.5 w-2.5" />atribuir
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {usuarios.map(u => (
                <DropdownMenuItem key={u.id} onClick={() => onAssign(item.id, u.id, u.nome ?? u.id)}>
                  {u.nome ?? u.id}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

/* ── Swimlane toggle ──────────────────────────────────────────────── */
function groupBySwimlane(items: FilaItem[]): Array<{ lane: string; items: FilaItem[] }> {
  const map = new Map<string, FilaItem[]>()
  for (const item of items) {
    const lane = item.responsavelNome ?? 'Sem responsável'
    const prev = map.get(lane) ?? []
    map.set(lane, [...prev, item])
  }
  return Array.from(map.entries()).map(([lane, items]) => ({ lane, items }))
}

/* ── Main board ───────────────────────────────────────────────────── */
interface KanbanBoardProps {
  fila: FilaItem[]
  selected: Set<string>
  toggle: (id: string) => void
  usuarios: HojeUsuario[]
  quickAssign: (id: string, uid: string, name: string) => Promise<void>
  swimlanes?: boolean
}

export function KanbanBoard({ fila, selected, toggle, usuarios, quickAssign, swimlanes = false }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const activeItem = useMemo(() => fila.find(f => f.id === activeId) ?? null, [fila, activeId])

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const draggedItem = fila.find(f => f.id === String(active.id))
    if (!draggedItem) return

    // Determine target column from over.id (could be a column id or card id)
    let targetGrupo: Grupo | null = null
    const overAsCol = COLS.find(c => c.grupo === String(over.id))
    if (overAsCol) {
      targetGrupo = overAsCol.grupo
    } else {
      const overItem = fila.find(f => f.id === String(over.id))
      if (overItem) targetGrupo = overItem.grupo
    }

    if (!targetGrupo || targetGrupo === draggedItem.grupo) return

    const isoDate = targetDateForGrupo(targetGrupo)
    const dataPrazo = Timestamp.fromDate(new Date(isoDate + 'T00:00:00'))
    try {
      await updateDocument('tarefas', draggedItem.id, { dataPrazo })
      toast.success(`Prazo ajustado para ${new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR')}`)
    } catch {
      toast.error('Não foi possível mover a tarefa.')
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={(e) => void handleDragEnd(e)}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {COLS.map(col => {
          const colItems = fila.filter(i => i.grupo === col.grupo)
          const lanes = swimlanes ? groupBySwimlane(colItems) : [{ lane: '', items: colItems }]

          return (
            <div key={col.grupo} className={cn('rounded-xl border overflow-hidden', col.cor)}>
              {/* Column header */}
              <div className={cn('flex items-center justify-between px-4 py-2.5 border-b', col.cor)}>
                <span className={cn('text-xs font-semibold uppercase tracking-wide', col.header)}>{col.label}</span>
                <span className={cn('text-xs font-bold tabular-nums', col.header)}>{colItems.length}</span>
              </div>

              {/* Drop zone for empty column */}
              <div id={col.grupo} className="min-h-[60px]">
                {colItems.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">Arraste para cá</p>
                ) : (
                  <div className="max-h-[520px] overflow-y-auto divide-y divide-border/50">
                    {lanes.map(({ lane, items }) => (
                      <div key={lane || 'all'}>
                        {swimlanes && lane && (
                          <div className="px-3 py-1.5 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/40">
                            {lane}
                          </div>
                        )}
                        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                          {items.map(item => (
                            <KanbanCard
                              key={item.id}
                              item={item}
                              selected={selected.has(item.id)}
                              onToggle={() => toggle(item.id)}
                              usuarios={usuarios}
                              onAssign={(id, uid, name) => void quickAssign(id, uid, name)}
                              isDragging={activeId === item.id}
                            />
                          ))}
                        </SortableContext>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <DragOverlay>
        {activeItem && (
          <div className="rounded-lg border bg-card shadow-lg px-3 py-2 text-xs font-medium opacity-90 max-w-[260px]">
            <p className="line-clamp-1">{activeItem.titulo ?? 'Tarefa'}</p>
            <p className="text-muted-foreground text-[11px] mt-0.5">{activeItem.clienteNome ?? '—'}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
