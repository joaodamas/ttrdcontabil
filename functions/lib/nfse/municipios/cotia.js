"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CotiaConector = void 0;
/**
 * Conector Cotia — GIAP / "Nota Fiscal Cotiana" (Oracle APEX)
 * Portal: https://nfse.cotia.sp.gov.br/
 * Autenticação: login + senha do portal (token de sessão)
 * Não possui ambiente de homologação separado.
 */
const axios_1 = __importDefault(require("axios"));
function fmt(n) { return n.toFixed(2); }
class CotiaConector {
    async emitir(input, config, prestador) {
        try {
            const login = config.credenciais?.giaplogin;
            const senha = config.credenciais?.giapSenha;
            if (!login || !senha) {
                return { sucesso: false, erro: 'Login e senha do portal Cotia não configurados.' };
            }
            const baseUrl = 'https://nfse.cotia.sp.gov.br/ords/cotia';
            // 1. Autenticar e obter token de sessão
            const authResp = await axios_1.default.post(`${baseUrl}/auth/login`, { login, senha }, {
                timeout: 15000,
            });
            const sessionToken = authResp.data.token;
            if (!sessionToken)
                return { sucesso: false, erro: 'Falha na autenticação no portal de Cotia.' };
            // 2. Emitir NFS-e
            const payload = {
                prestador: {
                    inscricaoMunicipal: prestador.inscricaoMunicipal,
                    cnpj: prestador.cnpj.replace(/\D/g, ''),
                },
                tomador: {
                    cpfCnpj: input.tomador.cpfCnpj.replace(/\D/g, ''),
                    razaoSocial: input.tomador.razaoSocial,
                    email: input.tomador.email ?? '',
                },
                servico: {
                    discriminacao: input.servico.discriminacao,
                    codigoServico: input.servico.codigoServico,
                    valorServico: fmt(input.servico.valorServico),
                    aliquota: fmt(input.servico.aliquota ?? config.aliquotaPadrao ?? 0),
                    issRetido: input.servico.issRetido,
                },
                optanteSimplesNacional: config.optanteSimples,
            };
            const emitResp = await axios_1.default.post(`${baseUrl}/nfse/emitir`, payload, {
                headers: { Authorization: `Bearer ${sessionToken}` },
                timeout: 30000,
            });
            const data = emitResp.data;
            if (!data.sucesso && !data.numeroNfse) {
                return { sucesso: false, erro: String(data.mensagem ?? 'Erro na emissão em Cotia') };
            }
            return {
                sucesso: true,
                numeroNfse: String(data.numeroNfse ?? data.numero ?? ''),
                xmlNfse: data.xml,
            };
        }
        catch (err) {
            const msg = axios_1.default.isAxiosError(err)
                ? `HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`
                : (err instanceof Error ? err.message : String(err));
            return { sucesso: false, erro: msg };
        }
    }
}
exports.CotiaConector = CotiaConector;
//# sourceMappingURL=cotia.js.map