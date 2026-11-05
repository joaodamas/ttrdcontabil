/**
 * Trigger: usuarios/{uid} → usuarios_diretorio/{uid}
 *
 * `usuarios` passou a ser listável só por administrador (o doc tem e-mail,
 * perfil e telas de todo mundo). Os seletores de responsável (tarefas,
 * competências, IR, Hoje) só precisam de id e nome — leem esta projeção, que as
 * regras liberam para qualquer usuário ativo do tenant e ninguém grava pelo
 * navegador.
 *
 * Grava só quando nome/ativo/tenant mudam: o login atualiza ultimoAcesso a cada
 * entrada e não deve gerar escrita aqui. Para popular os perfis que já
 * existiam antes do trigger: scripts/sincronizar-diretorio-usuarios.mjs.
 */
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

export function projecaoDiretorio(dados: Record<string, unknown>) {
  return {
    nome: typeof dados.nome === 'string' && dados.nome.trim() ? dados.nome.trim() : null,
    ativo: dados.ativo !== false,
    tenantId: typeof dados.tenantId === 'string' ? dados.tenantId : null,
  }
}

export const sincronizarDiretorioUsuario = onDocumentWritten(
  { document: 'usuarios/{uid}', region: 'southamerica-east1' },
  async (event) => {
    const uid = event.params.uid
    const ref = admin.firestore().collection('usuarios_diretorio').doc(uid)
    const depois = event.data?.after
    if (!depois?.exists) {
      await ref.delete()
      return
    }
    const nova = projecaoDiretorio(depois.data() ?? {})
    const antes = event.data?.before
    if (antes?.exists) {
      const velha = projecaoDiretorio(antes.data() ?? {})
      const igual = velha.nome === nova.nome && velha.ativo === nova.ativo && velha.tenantId === nova.tenantId
      if (igual) return
    }
    await ref.set({ ...nova, atualizadoEm: FieldValue.serverTimestamp() })
  },
)
