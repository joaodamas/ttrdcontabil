import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { FieldValue } from 'firebase-admin/firestore'
import { SYSTEM_ACTOR, writeAuditLog } from '../audit'
import { DEFAULT_TENANT_ID } from '../tenant'
import { dispatchWhatsappJob, queueWhatsappJob } from './core'
import { twilioSecrets } from './secrets'

const db = () => admin.firestore()

/** Máximo de tentativas de envio antes de um job de cobrança WhatsApp ser dado como esgotado. */
const MAX_TENTATIVAS = 5

/** Tamanho da página do varrimento de lançamentos cobráveis. */
const LANCAMENTOS_POR_PAGINA = 200

/** Teto de tempo do ciclo, abaixo do timeoutSeconds (300) do onSchedule. */
const ORCAMENTO_CICLO_MS = 240000

function toMillis(ts: FirebaseFirestore.Timestamp | undefined | null): number {
  return ts?.toDate?.().getTime() ?? 0
}

export const agendarCobrancasWhatsapp = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async () => {
    // ARMADILHA: a versão anterior lia 150 lançamentos QUAISQUER do tenant e só
    // depois filtrava receita/pendente em memória. Sem orderBy o Firestore
    // devolve por __name__, e os IDs são 'ttrd_<ano>_<mes>_<servico>' — ou seja,
    // os mais antigos primeiro. Em ~2 meses os 150 slots ficariam ocupados por
    // lançamentos de janeiro já pagos e a régua passaria a enfileirar ZERO
    // jobs, sem erro nenhum, para sempre. O filtro tem de ser do servidor e a
    // varredura tem de percorrer a base inteira por cursor.
    //
    // `orderBy('dataVencimento')` deixa de fora documentos sem vencimento —
    // que são inelegíveis de qualquer forma ("Lançamento sem vencimento").
    const inicio = Date.now()
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined
    let avaliados = 0
    let interrompido = false

    for (;;) {
      let query = db()
        .collection('lancamentos')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .where('tipo', '==', 'receita')
        .where('status', 'in', ['pendente', 'atrasado'])
        .orderBy('dataVencimento', 'asc')
        .limit(LANCAMENTOS_POR_PAGINA)
      if (cursor) query = query.startAfter(cursor)

      const snap = await query.get()
      if (snap.empty) break

      for (const doc of snap.docs) {
        avaliados++
        try {
          await queueWhatsappJob(doc.id)
        } catch {
          // Inelegível não deve interromper o lote.
        }
      }

      cursor = snap.docs[snap.docs.length - 1]
      if (snap.size < LANCAMENTOS_POR_PAGINA) break
      if (Date.now() - inicio > ORCAMENTO_CICLO_MS) {
        interrompido = true
        break
      }
    }

    if (interrompido) {
      // Melhor um alerta explícito do que um timeout mudo: se isso aparecer, a
      // base cresceu além do que um ciclo horário consegue varrer.
      console.warn('[whatsapp][regua-incompleta]', JSON.stringify({ avaliados, motivo: 'orçamento de tempo do ciclo esgotado' }))
    }
  }
)

async function tentarDespacho(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const tentativasAntes = Number(doc.data().attemptCount ?? 0)
  try {
    // `origem: 'fila'` é o que faz o dispatch RETER a etapa que exige aprovação
    // e devolver cancelamento/adiamento sem lançar — jogar erro aqui viraria
    // 'falhou' e apagaria o desfecho correto que ele acabou de gravar.
    await dispatchWhatsappJob(doc.id, { origem: 'fila' })
  } catch (error) {
    // O dispatch registra attemptCount/nextRetryAt quando a falha é no envio.
    // Se o erro veio antes disso (leitura do job, revalidação), esse registro
    // não existe e o job ficaria em 'falhou' com nextRetryAt nulo — a fila
    // ignora esse caso no filtro e ele nunca mais é tocado nem esgota.
    const atual = (await doc.ref.get()).data() ?? {}
    const dispatchRegistrouTentativa = Number(atual.attemptCount ?? 0) > tentativasAntes
    await doc.ref.set({
      status: 'falhou',
      detalhes: String((error as Error)?.message ?? 'Falha ao processar fila.'),
      attemptCount: dispatchRegistrouTentativa ? Number(atual.attemptCount ?? 0) : tentativasAntes + 1,
      nextRetryAt: atual.nextRetryAt ?? admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)),
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
}

async function marcarJobEsgotado(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data()
  const motivo = `Retentativas esgotadas (${MAX_TENTATIVAS}) para o job de cobrança WhatsApp.`

  await doc.ref.set({
    status: 'esgotado',
    detalhes: motivo,
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true })

  const contexto = {
    jobId: doc.id,
    lancamentoId: data.lancamentoId ?? null,
    clienteId: data.clienteId ?? null,
    etapa: data.etapa ?? null,
    attemptCount: data.attemptCount ?? null,
    motivo,
  }
  console.error('[whatsapp][fila-esgotada]', JSON.stringify(contexto))

  await writeAuditLog({
    tenantId: String(data.tenantId ?? DEFAULT_TENANT_ID),
    actor: SYSTEM_ACTOR,
    entidade: 'whatsapp_jobs',
    entidadeId: doc.id,
    acao: 'esgotado',
    dadosAntes: null,
    dadosDepois: { ...contexto, severidade: 'alta' },
    origem: 'scheduler',
  })
}

export const processarFilaWhatsapp = onSchedule(
  {
    schedule: '*/10 * * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 300,
    secrets: twilioSecrets,
  },
  async () => {
    const agora = Date.now()

    // Duas queries por igualdade de status (sem orderBy) para não depender de
    // um índice composto novo em `whatsapp_jobs` — hoje só há índices de
    // campo único nessa coleção e este arquivo não pode alterar
    // firestore.indexes.json. A ordenação por data é feita em memória sobre
    // o resultado (já limitado a 50 por status).
    const [agendadosSnap, falhouSnap] = await Promise.all([
      db()
        .collection('whatsapp_jobs')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .where('status', '==', 'agendado')
        .limit(50)
        .get(),
      db()
        .collection('whatsapp_jobs')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .where('status', '==', 'falhou')
        .limit(50)
        .get(),
    ])

    const agendados = [...agendadosSnap.docs].sort(
      (a, b) => toMillis(a.data().scheduledFor) - toMillis(b.data().scheduledFor)
    )
    for (const doc of agendados) {
      const scheduledFor = doc.data().scheduledFor?.toDate?.() as Date | undefined
      if (!scheduledFor || scheduledFor.getTime() > agora) continue
      await tentarDespacho(doc)
    }

    const falhados = [...falhouSnap.docs].sort(
      (a, b) => toMillis(a.data().nextRetryAt) - toMillis(b.data().nextRetryAt)
    )
    for (const doc of falhados) {
      const data = doc.data()
      const attemptCount = Number(data.attemptCount ?? 0)

      if (attemptCount >= MAX_TENTATIVAS) {
        await marcarJobEsgotado(doc)
        continue
      }

      const nextRetryAt = data.nextRetryAt?.toDate?.() as Date | undefined
      if (!nextRetryAt || nextRetryAt.getTime() > agora) continue
      await tentarDespacho(doc)
    }
  }
)
