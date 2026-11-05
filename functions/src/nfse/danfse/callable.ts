import * as admin from 'firebase-admin'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

import { assertCanAccessCliente } from '../../authz'
import { DanfseXmlInvalidoError } from './dados'
import { gerarESalvarDanfse } from './servico'

/**
 * gerarDanfse({ nfseId }) → { pdfUrl, pdfPath, reutilizado }
 *
 * Quem lê a NFS-e pode obter o DANFSe (é uma representação do XML que ele já
 * lê): perfil fiscal/financeiro/admin ou a tela 'fiscal' concedida — o mesmo
 * critério de canReadNfse() em firestore.rules e de nfse/ em storage.rules.
 * Antes bastava ler o cliente ('read'), e o perfil "leitura" baixava o PDF de
 * uma nota que as regras não o deixam ver. Escrita só pelo Admin SDK.
 */
export const gerarDanfse = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 60, memory: '512MiB', invoker: 'public' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    const { nfseId } = (request.data ?? {}) as { nfseId?: unknown }
    if (typeof nfseId !== 'string' || !nfseId.trim()) {
      throw new HttpsError('invalid-argument', 'nfseId obrigatório.')
    }

    const snap = await admin.firestore().collection('nfse_emitidas').doc(nfseId).get()
    if (!snap.exists) throw new HttpsError('not-found', 'NFS-e não encontrada.')
    await assertCanAccessCliente(request.auth.uid, snap.data()?.clienteId as string | undefined, 'nfse')

    try {
      const resultado = await gerarESalvarDanfse(nfseId)
      return { status: 'success', message: 'DANFSe disponível.', data: resultado }
    } catch (err) {
      if (err instanceof DanfseXmlInvalidoError) throw new HttpsError('failed-precondition', err.message)
      console.error('[gerarDanfse] falha ao gerar DANFSe', { nfseId, err })
      throw new HttpsError('internal', 'Não foi possível gerar o DANFSe. Tente novamente em instantes.')
    }
  },
)
