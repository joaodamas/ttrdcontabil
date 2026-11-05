# Radar — emitir NFS-e direto pelo Ambiente Nacional (Sefin Nacional)

Levantado em **05/11/2026**. Status: **a validar** — nada implementado ainda.

## Por que agora

- A conta na Spedy foi encerrada (CHANGELOG, 10/09/2026). Era o único caminho que
  montava o grupo **IBS/CBS** da reforma tributária; os 8 conectores municipais não
  preenchem esses campos.
- A LC 214/2025 exigiu a adesão dos municípios ao padrão nacional até 01/01/2026.
  A Sefin Nacional recebe a DPS e devolve a NFS-e no layout nacional, que já traz
  IBS/CBS — um conector só no lugar de 8 conectores municipais + provedor pago.
- **Possível urgência (confirmar):** fontes de mercado divergem sobre a data em que
  ME/EPP do Simples Nacional passam a emitir obrigatoriamente pelo Emissor Nacional —
  01/09/2026 (Resolução CGSN 189/2026) ou **01/11/2026** (Resolução CGSN 191/2026, que
  teria revogado a 189). Se for 01/11, já está valendo para a maior parte da carteira.

## O que já existe no código

- `src/types/firestore.ts:19` — `TipoIntegracaoNfse` já tem `'nacional'`, sem conector.
- `functions/src/nfse/xml/signer.ts` — assinatura XML com A1 (reaproveitável para a DPS).
- `functions/src/nfse/municipios/router.ts` — ponto único onde um `NacionalConector`
  entraria (por `config.provedorNfse === 'nacional'` ou por município aderente).
- `functions/src/nfse/municipios/sao-paulo.ts:7` — nota de que SP transmite ao ADN
  mas mantém emissor próprio (exceção a tratar).

## O que validar (em ordem)

1. **Norma vigente**: resolução CGSN em vigor e cronograma no portal nfse.gov.br —
   quem da carteira (Simples × Presumido/Real) já é obrigado.
2. **Municípios da carteira**: para cada IBGE atendido hoje (Jundiaí, Campinas, Cotia,
   Barueri, Cajamar, Santana de Parnaíba, Taboão da Serra, São Paulo), confirmar se
   aceita emissão pela Sefin Nacional ou só pelo emissor próprio.
3. **Produção restrita**: com um A1 real de cliente, emitir uma DPS de teste pelo
   Swagger de produção restrita. Confirmar autenticação (certificado no TLS), formato
   do envio (XML da DPS assinado, compactado e em base64 dentro de JSON — a confirmar no
   manual), retorno da chave de acesso e eventos (cancelamento).
4. **Numeração**: a DPS tem série e número próprios por emitente — resolve junto a
   pendência do RPS `Date.now()` (contador transacional por prestador+série).
5. **DANFSe**: há relato de que a geração do PDF pela API foi suspensa (NT 008,
   03/08/2026) e o sistema precisa gerar o próprio — confirmar na nota técnica.
6. **Cloud Functions**: mTLS com o A1 do cliente a partir de `southamerica-east1`
   (o certificado já fica cifrado no Storage + senha no Secret Manager).

## Fontes

- [APIs — produção restrita e produção (gov.br/nfse)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao)
- [Manual dos contribuintes — APIs ADN (gov.br/nfse)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-apis-adn-sistema-nacional-nfse.pdf)
- [Manual contribuintes — emissor público API v1.2, out/2025 (gov.br/nfse)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf/@@download/file)
- Mercado (não normativo): [Contábeis](https://www.contabeis.com.br/artigos/77741/nfs-e-nacional-obrigatoriedade-prazos-e-impacto-contabil/), [Focus NFe](https://focusnfe.com.br/blog/nfse-nacional/), [Nota Gateway](https://notagateway.com.br/blog/api-nfse-nacional/), [Migrate](https://migrate.info/en/blog/brasil/nfs-e-simples-nacional-emissor-nacional-obrigatorio)
