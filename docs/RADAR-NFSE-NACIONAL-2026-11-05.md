# Radar — emitir NFS-e direto pelo Ambiente Nacional (Sefin Nacional)

Levantado em **05/11/2026**. Status: **PoC pronta, aguardando um A1 de cliente** —
`scripts/poc-nfse-nacional/` (CLI travada na produção restrita). Ver a seção
"Achados da PoC" abaixo.

## Restrição do dono (2026-11-05)

**Sem integrador.** Spedy encerrada e nenhum outro agregador (Focus NFe, Nota
Gateway, Tecnospeed e afins). A emissão é direta: conector da prefeitura ou a
API pública da Sefin Nacional, com o certificado A1 do próprio cliente.

## Respostas rápidas

- **Dá para emitir direto?** Sim — `POST /nfse` na Sefin Nacional recebe a DPS
  (XML assinado) e devolve a NFS-e de forma síncrona.
- **Sai no CNPJ do cliente?** Sim — a DPS é assinada e a conexão autenticada com
  o certificado digital do prestador (o manual amarra o acesso aos "atores" da
  nota: prestador, tomador, intermediário). A plataforma já guarda o A1 de cada
  cliente cifrado. Emitir com certificado do escritório como procurador: **a
  confirmar**. Formalizar a autorização do cliente em contrato/procuração.
- **No valor que ele falar?** O valor do serviço é declaratório (vai o que o
  cliente informou). Alíquota, código de tributação, regime e retenções são
  validados contra os parâmetros do município (`/parametros_municipais/...`) e a
  DPS é rejeitada se não baterem — consultar antes de enviar.

## Teste real na produção restrita (2026-11-05)

Certificado A1 da **JP PROJECT MANAGER LTDA** (59.360.092/0001-63, Cajamar/SP, Simples).

- **Autenticação com o A1 do prestador: funciona** (mTLS aceito pelo ADN e pela Sefin).
- **Rota de parâmetros:** a do ADN (`adn.producaorestrita.nfse.gov.br/parametrizacao/{ibge}/convenio`) é a certa; a via Sefin (`/API/SefinNacional/parametros_municipais`) responde 404 HTML.
- **Convênio por município** (produção restrita — produção pode estar à frente):

  | Município | IBGE | Ambiente Nacional | Emissor Nacional |
  |---|---|---|---|
  | Barueri | 3505708 | sim | **sim** |
  | São Paulo | 3550308 | sim | **sim** |
  | Campinas | 3509502 | sim | **sim** |
  | Jundiaí | 3525904 | sim | não (só compartilha dados) |
  | Cajamar | 3509205 | **convênio não ativo** | não |

- **Envio da DPS (`POST /API/SefinNacional/nfse`): o transporte funciona.** A DPS validada no XSD v1.01, assinada e enviada compactada foi lida e processada pelas regras de negócio, e recusada só por **E0037** ("município emissor inexistente no cadastro de convênio") — esperado para Cajamar. Ou seja: formato JSON, compressão, assinatura e endpoint estão corretos.
- **Próximo passo:** repetir o `emitir` com o A1 de um cliente de **Barueri, São Paulo ou Campinas** — aí deve sair a NFS-e de teste (chave de acesso), seguida de `consultar` e `cancelar`.
- **Bug achado no caminho (corrigido):** a plataforma gravava Cajamar como 3508900 (Caiabu) e Taboão da Serra como 3552502 (Suzano). Corretos: 3509205 e 3552809. Configs antigas são normalizadas (`IBGE_LEGADO`).

## Por que agora

- A conta na Spedy foi encerrada (10/09/2026) e o conector saiu do código
  (05/11/2026). Era o único caminho que montava o grupo **IBS/CBS** da reforma; os
  8 conectores municipais não preenchem esses campos.
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

## Achados da PoC (05/11/2026)

Código: `scripts/poc-nfse-nacional/` (CLI + README com o passo a passo) e testes em
`__tests__/lib/nfse-nacional-*.test.ts`. Primeiro comando com o certificado:
`NFSE_PFX=<arquivo.pfx> npm run poc:nfse -- convenio --ibge 3525904`.

**Confirmado em documentação oficial:**

- Rotas da Sefin Nacional: `POST /nfse` (síncrono), `GET /nfse/{chave}`, `GET`/`HEAD /dps/{id}`,
  `POST`/`GET /nfse/{chave}/eventos`, `GET /parametros_municipais/{ibge}/convenio|{codServ}|{CPF/CNPJ}`
  — [manual do emissor público – API v1.2](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf).
- Leiaute 1.01 da **produção restrita** é diferente do de produção (NT 009): `finNFSe` obrigatório no
  `infDPS`, `xDescServ` no fim de `cServ`, CST/cClassTrib direto em `IBSCBS/valores/trib`. Grupo
  `IBSCBS` é **opcional** no XSD — [esquemas da produção restrita 20/10/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita)
  (cópia em `scripts/poc-nfse-nacional/schemas/`; a DPS gerada pela PoC valida neles com `xmllint`).
- Id da DPS = `DPS`+IBGE(7)+tpInsc(1)+inscrição(14)+série(5)+nDPS(15); Id do pedido de evento =
  `PRE`+chave(50)+código(6); cancelamento = evento `e101101` (cMotivo 1/2/9, xMotivo 15–255) — XSD e
  [Anexo II (prod. restrita)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/anexo_ii-sefin_adn-pedregevt_evt-snnfse_prodrest-v1-01-20261020.xlsx).
- Envio **compactado em base64** (regras E1225/E1226), XML UTF-8 (E1229), **sem prefixo de namespace**
  (E1228), assinatura obrigatória com o certificado do **emitente** (E0714/E0717/E0718), certificado
  de transmissão ICP-Brasil com CNPJ/CPF no OtherName (E1200–E1209) — [Anexo I (prod. restrita)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/anexo_i-sefin_adn-dps_nfse-snnfse_prodrest-v1-01-20261020.xlsx),
  abas RN_RECEP. O código E6157→E1225 "Falha ao descompactar XML **Zip B64**" está no
  [histórico de atualizações](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/atualizacoes-e-implantacoes).
- **DANFSe:** a API do ADN foi suspensa em 03/08/2026; o sistema gera o PDF seguindo a NT 008
  (tarja "NFS-e SEM VALIDADE JURÍDICA" quando `tpAmb=2`) — [NT 008 v1.02](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf)
  e [atualizações (03/08/2026: "Desativação da API do DANFSe do ADN")](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/atualizacoes-e-implantacoes).
- ADN (distribuição): consulta aceita certificado do mesmo **CNPJ raiz** — [manual APIs ADN](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-apis-adn-sistema-nacional-nfse.pdf).
- 28/09/2026: o Painel Municipal ganhou opção para o município **antecipar** a adoção do Emissor Nacional
  pelos optantes do Simples ([atualizações](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/atualizacoes-e-implantacoes)).

**Só em bibliotecas abertas** (lidas como referência — PyNFSeNacionalGT 1.3.2 no PyPI e `nfse` 0.1.0
no hex.pm; nenhuma virou dependência): nomes dos campos JSON (`dpsXmlGZipB64`, `nfseXmlGZipB64`,
`chaveAcesso`, `pedidoRegistroEventoXmlGZipB64`, `eventoXmlGZipB64`, `erros`/`alertas`), gzip como
compactação, RSA-SHA1 + C14N inclusiva com a `<Signature>` depois do `infDPS`, rotas do ADN
`/parametrizacao/{ibge}/convenio` e `/parametrizacao/{ibge}/{cod.com.pontos}/{competencia}/aliquota`.

**Ainda aberto** (os Swaggers da produção restrita pedem o certificado A1 até para abrir a
documentação — HTTP 403 / handshake com pedido de certificado):

1. Campos JSON exatos e formato do erro (conferir no Swagger com o A1).
2. Base da Sefin na produção restrita: `/API/SefinNacional` (link oficial) × `/SefinNacional` — os dois
   existem (403 sem certificado). A PoC usa o primeiro e aceita `--sefin raiz`.
3. Parâmetros municipais: ADN `/parametrizacao` × Sefin `/parametros_municipais`.
4. Se o CNPJ precisa ser habilitado antes no Emissor Nacional/CNC e liberado pelo município na produção restrita.
5. Certificado do escritório como procurador: as regras exigem a assinatura do emitente (E0718) —
   tratar como não suportado até prova.
6. Se a API de DANFSe ainda responde na produção restrita (a PoC testa e informa).
7. `/dps/{id}` com ou sem o prefixo `DPS`; faixas de série por tipo de emissor.

## O que validar (em ordem)

1. **Norma vigente**: resolução CGSN em vigor e cronograma no portal nfse.gov.br —
   quem da carteira (Simples × Presumido/Real) já é obrigado.
2. **Municípios da carteira**: para cada IBGE atendido hoje (Jundiaí, Campinas, Cotia,
   Barueri, Cajamar, Santana de Parnaíba, Taboão da Serra, São Paulo), confirmar se
   aceita emissão pela Sefin Nacional ou só pelo emissor próprio.
3. **Produção restrita**: com um A1 real de cliente, rodar a PoC (`scripts/poc-nfse-nacional/`,
   Etapa 1 `convenio`, Etapa 2 `emitir`, depois `consultar` e `cancelar`). Formato do envio já
   confirmado como base64 compactado (Anexo I); falta ver os nomes dos campos no Swagger.
4. **Numeração**: a DPS tem série e número próprios por emitente — resolve junto a
   pendência do RPS `Date.now()` (contador transacional por prestador+série).
5. **DANFSe**: **confirmado** — API suspensa em 03/08/2026 (NT 008 v1.02). O sistema precisa gerar o
   próprio PDF a partir do XML da NFS-e, no leiaute da NT 008.
6. **Cloud Functions**: mTLS com o A1 do cliente a partir de `southamerica-east1`
   (o certificado já fica cifrado no Storage + senha no Secret Manager).

## Fontes

- [Documentação técnica — produção restrita (esquemas e anexos 20/10/2026)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita)
- [Atualizações e implantações](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/atualizacoes-e-implantacoes)
- [NT 008 — DANFSe v1.02](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf)

- [APIs — produção restrita e produção (gov.br/nfse)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao)
- [Manual dos contribuintes — APIs ADN (gov.br/nfse)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-apis-adn-sistema-nacional-nfse.pdf)
- [Manual contribuintes — emissor público API v1.2, out/2025 (gov.br/nfse)](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf/@@download/file)
- Mercado (não normativo, só para contexto de prazos — não são opções de integração): [Contábeis](https://www.contabeis.com.br/artigos/77741/nfs-e-nacional-obrigatoriedade-prazos-e-impacto-contabil/), [Focus NFe](https://focusnfe.com.br/blog/nfse-nacional/), [Nota Gateway](https://notagateway.com.br/blog/api-nfse-nacional/), [Migrate](https://migrate.info/en/blog/brasil/nfs-e-simples-nacional-emissor-nacional-obrigatorio)
