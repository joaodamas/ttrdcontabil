# PoC — NFS-e direto pelo Sistema Nacional (produção restrita)

Prova de conceito para emitir NFS-e **direto na API pública do governo** (Sefin
Nacional + ADN), sem integrador nenhum, usando o certificado A1 do próprio
cliente. **Travada na produção restrita** (o ambiente de testes oficial). As
notas geradas lá **não têm validade jurídica**.

## Garantias de segurança

- **Só produção restrita.** O CLI usa só as funções travadas de
  `functions/src/nfse/nacional/ambiente.ts` (`montarUrl`,
  `assertXmlHomologacao` — mesma fonte de verdade do `NacionalConector` da
  plataforma), que só deixam sair requisição para
  `sefin.producaorestrita.nfse.gov.br` e `adn.producaorestrita.nfse.gov.br`.
  `sefin.nfse.gov.br` / `adn.nfse.gov.br` (produção) e qualquer outro host são
  recusados **antes** de abrir conexão. Não existe flag ou variável que mude
  isso. Há teste automatizado da trava (`__tests__/lib/nfse-nacional-ambiente.test.ts`).
- **tpAmb = 2 sempre.** O montador da DPS e do evento
  (`functions/src/nfse/nacional/dps.ts`) usa `tpAmb=2` quando não recebe
  ambiente — e o CLI nunca passa ambiente. Antes de enviar, o CLI ainda confere o XML e recusa se
  achar outro valor.
- **Certificado e senha:** o `.pfx` vem de `--pfx` ou `NFSE_PFX`; a senha vem
  de `NFSE_PFX_SENHA` ou é **digitada no terminal sem eco**. A senha nunca é
  impressa, nem gravada. `*.pfx` e `*.p12` estão no `.gitignore`.
- **Dados reais ficam locais:** cada execução grava XML/resposta em
  `.poc-nfse/<data>-<comando>/` (permissão 600, pasta ignorada pelo git). Não
  commitar, não mandar por WhatsApp/e-mail.
- **Nada de Firestore, Functions ou produção.** O script roda só na máquina.
- Validação no **XSD oficial** (cópia em `schemas/`) antes de qualquer envio,
  via `xmllint` (já vem no macOS). Se o XML não passar, o envio é abortado.

## O que o dono precisa fornecer

1. O **certificado A1** (`.pfx`) de **um** cliente prestador + a senha.
2. Para esse cliente: **CNPJ, Inscrição Municipal, município (IBGE)** e o
   **regime** (Simples ME/EPP, MEI ou não optante).
3. O **código de tributação nacional** (`cTribNac`, 6 dígitos — ex.: `171901`
   para contabilidade) do serviço que ele presta e, se o município usar, o
   desdobro municipal (`cTribMun`, 3 dígitos).
4. Um tomador de teste (pode ser o próprio escritório) — CNPJ e razão social.

Pré-requisitos na máquina: Node ≥ 22.18 (roda TypeScript direto), e
`npm ci` na raiz **e** em `functions/` (o script reaproveita o assinador
`functions/src/nfse/xml/signer.ts`, que usa `node-forge` e `xml-crypto` de lá).

## Passo a passo

Em todos os comandos abaixo, defina o certificado uma vez no terminal:

```bash
export NFSE_PFX="$HOME/Documents/certificados/cliente-x.pfx"   # fora do repositório!
# a senha será pedida na tela (ou: export NFSE_PFX_SENHA=... — evite deixar no histórico)
```

### 0. Conferir o certificado (offline)

```bash
npm run poc:nfse -- certificado
```

Sucesso: mostra o titular (normalmente `RAZAO SOCIAL:CNPJ`) e a validade.

### Etapa 1 — só leitura: o município tem convênio?

```bash
npm run poc:nfse -- convenio --ibge 3525904                # Jundiaí (via ADN /parametrizacao)
npm run poc:nfse -- convenio --ibge 3525904 --via sefin    # rota do manual (/parametros_municipais)
npm run poc:nfse -- parametros --ibge 3525904 --servico 171901                 # alíquota + regimes especiais
npm run poc:nfse -- parametros --ibge 3525904 --cnpj 11222333000181            # retenções/benefícios (rota do manual)
```

- **Sucesso:** `HTTP 200` e um JSON com os parâmetros do convênio
  (`parametrosConvenio`, alíquotas…). Isso também prova que o **mTLS com o A1
  funciona** — é o primeiro teste a fazer.
- `HTTP 404` + `mensagem`: o município não tem esse parâmetro (ou a rota é a
  outra — tente `--via sefin`).
- `HTTP 403`/`401` ou erro de TLS: certificado recusado (vencido, cadeia, não
  ICP-Brasil) — ver mensagens `E12xx` abaixo.

IBGE da carteira: Jundiaí 3525904, Campinas 3509502, Cotia 3513009, Barueri
3505708, Cajamar 3509205, Santana de Parnaíba 3547304, Taboão da Serra 3552809,
São Paulo 3550308.

### Etapa 2 — emitir uma NFS-e de teste

1. Copie o exemplo para **fora** do repositório e preencha com os dados reais
   do cliente (o exemplo usa CNPJ fictício):

   ```bash
   cp scripts/poc-nfse-nacional/exemplo-nota.json ~/nota-teste.json
   ```

   Campos: `prestador` (cnpj, inscricaoMunicipal, municipioIbge, regime
   `{opSimpNac 1|2|3, regApTribSN (só ME/EPP), regEspTrib}`), `tomador`
   (opcional), `servico` (`cTribNac`, `cTribMun?`, `cNBS?`, `descricao`,
   `municipioPrestacao`), `valores` (`valorServico`, `tribISSQN`, `tpRetISSQN`,
   `aliquotaIss?`, `pisCofins?`, retenções, `totTrib`), `dps` (`serie`,
   `numero`, `competencia`) e `ibscbs` (opcional — ver abaixo). Os tipos estão
   documentados em `functions/src/nfse/nacional/dps.ts`.
   - **ME/EPP do Simples:** `totTrib: {"pTotTribSN": <percentual>}` (E0712 proíbe
     `indTotTrib`). **MEI / não optante:** `{"indTotTrib": 0}`.
   - Série/número: use uma série só para teste (ex.: `900`) e incremente
     `numero` a cada tentativa — o par série+número identifica a DPS.

2. Ensaiar sem enviar (monta, assina, valida no XSD):

   ```bash
   npm run poc:nfse -- emitir --dados ~/nota-teste.json --sem-enviar
   ```

3. Enviar:

   ```bash
   npm run poc:nfse -- emitir --dados ~/nota-teste.json
   ```

- **Sucesso:** `SUCESSO: NFS-e gerada…`, com a **chave de acesso** (50
  posições), o número e o XML salvo em `.poc-nfse/…/nfse.xml`.
- **Rejeição:** linhas `ERRO [E0xxx] descrição — complemento`. Os códigos estão
  no Anexo I (aba “RN DPS_NFS-e 1.01”). Comuns: `E0312` (falta `cTribMun`),
  `E0315` (município não usa `cTribMun`), `E0008` (relógio — data futura),
  `E0712` (totTrib errado p/ Simples), `E0718` (certificado não é do
  prestador), `E1235` (falha de schema), `E1225` (base64/gzip), `E1228`
  (prefixo de namespace), `E1229` (não UTF-8), `E12xx` (certificado de
  transmissão).

### Depois de emitir

```bash
npm run poc:nfse -- consultar --chave <chave>
npm run poc:nfse -- consultar-dps --id DPS<42 dígitos>      # Id que o emitir imprime (testar também sem "DPS")
npm run poc:nfse -- cancelar --chave <chave> --cnpj <CNPJ do prestador> --motivo "Teste de cancelamento PoC" [--codigo 1|2|9]
npm run poc:nfse -- danfse --chave <chave>
```

`cancelar` também aceita `--sem-enviar`. `danfse` deve falhar: a API foi
suspensa (ver abaixo) — o script diz isso claramente.

Opção geral `--sefin api|raiz`: base da Sefin (`/API/SefinNacional`, padrão,
igual ao link oficial do Swagger; ou `/SefinNacional`). Se o `POST /nfse`
devolver 404, tente `--sefin raiz`.

## Testar o conector da plataforma (sem Firebase)

`emitir-conector.mjs` roda o **mesmo** `NacionalConector` das Cloud Functions
(compilado em `functions/lib/`), sem Firestore/Storage, sempre na produção
restrita (`ambienteEmissao` forçado para `homologacao`):

```bash
cp scripts/poc-nfse-nacional/exemplo-conector.json ~/nota-conector.json   # preencher fora do repo
NFSE_PFX=~/certs/cliente.pfx NFSE_PFX_SENHA='...' \
  npm run poc:nfse:conector -- --dados ~/nota-conector.json --consultar
# cancelar logo em seguida:  ... --cancelar "Teste de cancelamento do conector"
```

Número da DPS: `--numero N` (padrão: derivado do relógio) e `--serie` (padrão 900).

## Grupo IBS/CBS (opcional)

O XSD da produção restrita (v1.01, NT 009) tem o grupo `IBSCBS` como
**opcional**. O PoC monta a classificação (`indFinal?`, `cIndOp`, `indDest`,
`valores/trib/CST`, `cClassTrib`) quando o JSON tem:

```json
"ibscbs": { "indFinal": 0, "cIndOp": "100301", "indDest": 0, "cst": "000", "cClassTrib": "000001" }
```

Os valores acima são só de formato — os códigos certos vêm do Anexo VII /
Anexo C (cIndOp) e da tabela de cClassTrib. Optantes do Simples estão
dispensados do destaque em 2026 (confirmar); para a primeira nota, **não
preencher**.

## Validar o XML à mão

```bash
xmllint --noout --nonet --schema scripts/poc-nfse-nacional/schemas/DPS_v1.01.xsd .poc-nfse/<pasta>/dps-assinada.xml
xmllint --noout --nonet --schema scripts/poc-nfse-nacional/schemas/pedRegEvento_v1.01.xsd .poc-nfse/<pasta>/pedido-evento-assinado.xml
```

`schemas/` é cópia de `esquemas_prod_restrita_20261020.zip` (sha256
`25fdcecc651a67a216496ab10d7566631e6ed10f721e37d62c7845dadb0ea267`), de
<https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita>.

## Como funciona (confirmado × a confirmar)

Confirmado em documentação oficial (gov.br/nfse):

- `POST /nfse` (síncrono, DPS → NFS-e), `GET /nfse/{chave}`, `GET`/`HEAD
  /dps/{id}`, `POST /nfse/{chave}/eventos`, `GET /parametros_municipais/...`
  — manual “Emissor Público Nacional – API” v1.2.
- Id da DPS = `DPS` + IBGE(7) + tpInsc(1) + inscrição(14) + série(5) + nDPS(15);
  Id do pedido de evento = `PRE` + chave(50) + código do evento(6) — XSD e
  Anexo II.
- Mensagem compactada em **gzip + base64** dentro de JSON (regras E1225/E1226
  “descompactação da base 64”), XML **UTF-8** (E1229), **sem prefixo de
  namespace** (E1228), assinatura XMLDSig obrigatória (E0714/E0717) com o
  certificado do emitente (E0718); certificado de transmissão ICP-Brasil com
  CNPJ (E1200–E1209) — Anexo I/II, abas RN_RECEP.
- A API de DANFSe do ADN foi **suspensa em 03/08/2026** (NT 008 v1.02); o
  sistema deve gerar o PDF a partir do XML, com a tarja “NFS-e SEM VALIDADE
  JURÍDICA” quando `tpAmb=2`.

Vindo de bibliotecas abertas (lidas só como referência, nenhuma é dependência):

- Nomes dos campos JSON: `dpsXmlGZipB64` (envio), `nfseXmlGZipB64` e
  `chaveAcesso` (retorno), `pedidoRegistroEventoXmlGZipB64` (evento),
  `eventoXmlGZipB64`, `erros[{codigo, descricao, complemento}]`, `alertas`.
- Assinatura RSA-SHA1 + C14N inclusiva + enveloped, `<Signature>` como último
  filho de `<DPS>` (o assinador do repositório já fazia RSA-SHA1/C14N; ganhou a
  opção `posicao: 'after'`).
- Parâmetros municipais no ADN em `/parametrizacao/{ibge}/convenio`,
  `/parametrizacao/{ibge}/{cod.com.pontos}/{competencia}T00:00:00/aliquota`.

## Perguntas em aberto (não deu para confirmar sem o certificado)

Os Swaggers oficiais da produção restrita (`/API/SefinNacional/docs`,
`adn.producaorestrita…/…/docs`) **exigem o certificado A1 até para abrir a
documentação** (403 / handshake pede certificado). Logo:

1. **Nomes exatos dos campos JSON** e formato do erro — só vistos nas libs
   abertas. Conferir no Swagger assim que tiver o A1 (abrir no navegador com o
   certificado instalado).
2. **Base da Sefin:** `/API/SefinNacional` (link oficial do Swagger) ou
   `/SefinNacional` (usado por uma lib). Ambos existem no servidor.
3. **Parâmetros municipais:** rota do ADN (`/parametrizacao/...`) × rota do
   manual na Sefin (`/parametros_municipais/...`); o manual repete o mesmo
   caminho `/{ibge}/{CPF/CNPJ}` para retenções e benefícios.
4. **Habilitação prévia:** se o CNPJ precisa primeiro acessar o Emissor
   Nacional (gov.br / certificado) para existir no Cadastro Nacional de
   Contribuintes (CNC) — e se o município precisa tê-lo cadastrado/liberado na
   produção restrita.
5. **Certificado do escritório como procurador:** o manual amarra o acesso aos
   “atores” da nota e a regra E0718 exige assinatura do emitente; o ADN aceita
   certificado do mesmo **CNPJ raiz**. Procuração eletrônica do contador não
   aparece nas regras — tratar como **não suportado** até prova.
6. **DANFSe na produção restrita:** a suspensão da NT 008 vale para produção;
   não está claro se a API ainda responde em produção restrita. O comando
   `danfse` testa.
7. **`/dps/{id}`:** se o `id` vai com ou sem o prefixo `DPS`.
8. **Série da DPS:** faixas reservadas por tipo de emissor (o Emissor Web usa
   80000–89999 para transcrição manual). O XSD da produção restrita aceita
   `[0-9]{1,4}|[0-8][0-9]{4}`.
9. **IBS/CBS:** se a produção restrita já exige o grupo para não optantes
   (Lucro Presumido/Real) — o XSD diz opcional.
