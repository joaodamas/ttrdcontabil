"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validarCertificado = exports.uploadCertificado = exports.emitirNfse = void 0;
/**
 * Cloud Functions para emissão de NFS-e
 */
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const router_1 = require("./municipios/router");
const signer_1 = require("./xml/signer");
const db = () => admin.firestore();
// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getConfigFiscal(clienteId) {
    const snap = await db().collection('clientes_fiscal')
        .where('clienteId', '==', clienteId)
        .limit(1)
        .get();
    if (snap.empty)
        throw new https_1.HttpsError('not-found', 'Configuração fiscal do cliente não encontrada. Configure em Clientes → Fiscal.');
    return { clienteId, ...snap.docs[0].data() };
}
async function getCliente(clienteId) {
    const doc = await db().collection('clientes').doc(clienteId).get();
    if (!doc.exists)
        throw new https_1.HttpsError('not-found', 'Cliente não encontrado.');
    return { id: doc.id, ...doc.data() };
}
async function getCertificado(clienteId, config) {
    const path = config.credenciais?.certificadoStoragePath;
    if (!path)
        return undefined;
    const bucket = (0, storage_1.getStorage)().bucket();
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists)
        return undefined;
    const [buffer] = await file.download();
    return {
        pfxBase64: buffer.toString('base64'),
        senha: config.credenciais?.certificadoSenha ?? '',
    };
}
// ─── Function: emitirNfse ─────────────────────────────────────────────────────
exports.emitirNfse = (0, https_1.onCall)({ region: 'southamerica-east1', timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Autenticação necessária.');
    const input = request.data;
    if (!input.clienteId)
        throw new https_1.HttpsError('invalid-argument', 'clienteId obrigatório.');
    if (!input.tomador)
        throw new https_1.HttpsError('invalid-argument', 'Dados do tomador obrigatórios.');
    if (!input.servico)
        throw new https_1.HttpsError('invalid-argument', 'Dados do serviço obrigatórios.');
    // Busca configurações
    const [config, cliente] = await Promise.all([
        getConfigFiscal(input.clienteId),
        getCliente(input.clienteId),
    ]);
    if (!config.municipioIbge)
        throw new https_1.HttpsError('failed-precondition', 'Código IBGE do município não configurado.');
    if (!config.inscricaoMunicipal)
        throw new https_1.HttpsError('failed-precondition', 'Inscrição municipal não configurada.');
    const prestador = {
        cnpj: cliente.cpfCnpj.replace(/\D/g, ''),
        inscricaoMunicipal: config.inscricaoMunicipal,
        razaoSocial: cliente.razaoSocial,
        municipioIbge: config.municipioIbge,
    };
    // Busca certificado (se necessário)
    const cert = await getCertificado(input.clienteId, config);
    // Emite via roteador de municípios
    const resultado = await (0, router_1.rotearEmissao)(input, config, prestador, cert);
    // Persiste resultado no Firestore
    const now = firestore_1.Timestamp.now();
    if (resultado.sucesso) {
        await db().collection('nfse_emitidas').add({
            clienteId: input.clienteId,
            clienteNome: cliente.razaoSocial,
            competenciaId: input.competenciaId ?? null,
            rascunhoId: input.rascunhoId ?? null,
            tomadorNome: input.tomador.razaoSocial,
            tomadorCpfCnpj: input.tomador.cpfCnpj,
            descricaoServico: input.servico.discriminacao,
            codigoServico: input.servico.codigoServico,
            valorServico: input.servico.valorServico,
            aliquota: input.servico.aliquota ?? config.aliquotaPadrao ?? null,
            issRetido: input.servico.issRetido,
            numeroNfse: resultado.numeroNfse ?? null,
            codigoVerificacao: resultado.codigoVerificacao ?? null,
            xmlNfse: resultado.xmlNfse ?? null,
            municipioIbge: config.municipioIbge,
            municipioNome: config.municipioEmissor,
            status: 'emitida',
            dataEmissao: now,
            criadoEm: now,
            criadoPorId: request.auth.uid,
            ambienteEmissao: config.ambienteEmissao,
        });
        // Remove rascunho se existia
        if (input.rascunhoId) {
            await db().collection('nfse_rascunhos').doc(input.rascunhoId).update({
                status: 'emitida',
                atualizadoEm: now,
            });
        }
    }
    else {
        // Registra tentativa com falha
        await db().collection('nfse_erros').add({
            clienteId: input.clienteId,
            clienteNome: cliente.razaoSocial,
            erro: resultado.erro,
            detalhes: resultado.detalhes ?? null,
            input: JSON.stringify(input),
            criadoEm: now,
            criadoPorId: request.auth.uid,
        });
    }
    return resultado;
});
// ─── Function: uploadCertificado ──────────────────────────────────────────────
exports.uploadCertificado = (0, https_1.onCall)({ region: 'southamerica-east1', timeoutSeconds: 30 }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Autenticação necessária.');
    const { clienteId, pfxBase64, senha } = request.data;
    if (!clienteId || !pfxBase64 || !senha) {
        throw new https_1.HttpsError('invalid-argument', 'clienteId, pfxBase64 e senha são obrigatórios.');
    }
    // Valida certificado antes de salvar
    let info;
    try {
        info = (0, signer_1.validarCertificado)(pfxBase64, senha);
    }
    catch {
        throw new https_1.HttpsError('invalid-argument', 'Certificado inválido ou senha incorreta.');
    }
    if (!info.valido) {
        throw new https_1.HttpsError('invalid-argument', `Certificado vencido em ${info.vencimento.toLocaleDateString('pt-BR')}.`);
    }
    // Salva no Storage
    const path = `certificados/${clienteId}.pfx.b64`;
    const bucket = (0, storage_1.getStorage)().bucket();
    const file = bucket.file(path);
    await file.save(Buffer.from(pfxBase64), {
        contentType: 'application/octet-stream',
        metadata: { titularCertificado: info.titular },
    });
    // Atualiza config fiscal com referência + senha
    const snap = await db().collection('clientes_fiscal')
        .where('clienteId', '==', clienteId)
        .limit(1)
        .get();
    if (!snap.empty) {
        await snap.docs[0].ref.update({
            'credenciais.certificadoStoragePath': path,
            'credenciais.certificadoSenha': senha,
            'credenciais.certTitular': info.titular,
            'credenciais.certVencimento': info.vencimento.toISOString(),
            'credenciais.certValido': info.valido,
            atualizadoEm: firestore_1.Timestamp.now(),
        });
    }
    return {
        sucesso: true,
        titular: info.titular,
        vencimento: info.vencimento.toISOString(),
        valido: info.valido,
        storagePath: path,
    };
});
// ─── Function: validarCertificado ─────────────────────────────────────────────
exports.validarCertificado = (0, https_1.onCall)({ region: 'southamerica-east1', timeoutSeconds: 15 }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Autenticação necessária.');
    const { pfxBase64, senha } = request.data;
    if (!pfxBase64 || !senha)
        throw new https_1.HttpsError('invalid-argument', 'pfxBase64 e senha são obrigatórios.');
    try {
        const info = (0, signer_1.validarCertificado)(pfxBase64, senha);
        return { valido: info.valido, titular: info.titular, vencimento: info.vencimento.toISOString() };
    }
    catch {
        throw new https_1.HttpsError('invalid-argument', 'Certificado inválido ou senha incorreta.');
    }
});
//# sourceMappingURL=emitir.js.map