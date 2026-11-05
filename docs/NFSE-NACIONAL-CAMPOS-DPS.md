# Campos da DPS (NFS-e Nacional) × plataforma

Gerado a partir do XSD de **produção** v1.01 (`scripts/poc-nfse-nacional/schemas-producao`) e do montador `functions/src/nfse/nacional/dps.ts`. "Obrigatório" é dentro do grupo (o grupo pode ser opcional).

**240 campos-folha**, **126** já enviados pela plataforma.


## tpAmb (1/1 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/tpAmb` | obrigatório | ✔ envia | lista XSD (2) |

## dhEmi (1/1 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/dhEmi` | obrigatório | ✔ envia |  |

## verAplic (1/1 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/verAplic` | obrigatório | ✔ envia |  |

## serie (1/1 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/serie` | obrigatório | ✔ envia |  |

## nDPS (1/1 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/nDPS` | obrigatório | ✔ envia |  |

## dCompet (1/1 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/dCompet` | obrigatório | ✔ envia |  |

## tpEmit (1/1 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/tpEmit` | obrigatório | ✔ envia | lista XSD (3) |

## cMotivoEmisTI (0/1 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/cMotivoEmisTI` | opcional | — não envia | lista XSD (4) |

## chNFSeRej (0/1 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/chNFSeRej` | opcional | — não envia |  |

## cLocEmi (1/1 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/cLocEmi` | obrigatório | ✔ envia |  |

## Substituição de NFS-e (2/3 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/subst/chSubstda` | obrigatório | — não envia |  |
| `infDPS/subst/cMotivo` | obrigatório | ✔ envia | lista XSD (6) |
| `infDPS/subst/xMotivo` | opcional | ✔ envia |  |

## Prestador (15/22 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/prest/CNPJ` | obrigatório | ✔ envia |  |
| `infDPS/prest/CPF` | obrigatório | ✔ envia |  |
| `infDPS/prest/NIF` | obrigatório | — não envia |  |
| `infDPS/prest/cNaoNIF` | obrigatório | — não envia | lista XSD (3) |
| `infDPS/prest/CAEPF` | opcional | — não envia |  |
| `infDPS/prest/IM` | opcional | ✔ envia |  |
| `infDPS/prest/xNome` | opcional | ✔ envia |  |
| `infDPS/prest/end/endNac/cMun` | obrigatório | ✔ envia | Municípios (Anexo A) |
| `infDPS/prest/end/endNac/CEP` | obrigatório | ✔ envia |  |
| `infDPS/prest/end/endExt/cPais` | obrigatório | — não envia | Países (Anexo A) |
| `infDPS/prest/end/endExt/cEndPost` | obrigatório | — não envia |  |
| `infDPS/prest/end/endExt/xCidade` | obrigatório | — não envia |  |
| `infDPS/prest/end/endExt/xEstProvReg` | obrigatório | — não envia |  |
| `infDPS/prest/end/xLgr` | obrigatório | ✔ envia |  |
| `infDPS/prest/end/nro` | obrigatório | ✔ envia |  |
| `infDPS/prest/end/xCpl` | opcional | ✔ envia |  |
| `infDPS/prest/end/xBairro` | obrigatório | ✔ envia |  |
| `infDPS/prest/fone` | opcional | ✔ envia |  |
| `infDPS/prest/email` | opcional | ✔ envia |  |
| `infDPS/prest/regTrib/opSimpNac` | obrigatório | ✔ envia | lista XSD (3) |
| `infDPS/prest/regTrib/regApTribSN` | opcional | ✔ envia | lista XSD (3) |
| `infDPS/prest/regTrib/regEspTrib` | obrigatório | ✔ envia | lista XSD (8) |

## Tomador (12/19 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/toma/CNPJ` | obrigatório | ✔ envia |  |
| `infDPS/toma/CPF` | obrigatório | ✔ envia |  |
| `infDPS/toma/NIF` | obrigatório | — não envia |  |
| `infDPS/toma/cNaoNIF` | obrigatório | — não envia | lista XSD (3) |
| `infDPS/toma/CAEPF` | opcional | — não envia |  |
| `infDPS/toma/IM` | opcional | ✔ envia |  |
| `infDPS/toma/xNome` | obrigatório | ✔ envia |  |
| `infDPS/toma/end/endNac/cMun` | obrigatório | ✔ envia | Municípios (Anexo A) |
| `infDPS/toma/end/endNac/CEP` | obrigatório | ✔ envia |  |
| `infDPS/toma/end/endExt/cPais` | obrigatório | — não envia | Países (Anexo A) |
| `infDPS/toma/end/endExt/cEndPost` | obrigatório | — não envia |  |
| `infDPS/toma/end/endExt/xCidade` | obrigatório | — não envia |  |
| `infDPS/toma/end/endExt/xEstProvReg` | obrigatório | — não envia |  |
| `infDPS/toma/end/xLgr` | obrigatório | ✔ envia |  |
| `infDPS/toma/end/nro` | obrigatório | ✔ envia |  |
| `infDPS/toma/end/xCpl` | opcional | ✔ envia |  |
| `infDPS/toma/end/xBairro` | obrigatório | ✔ envia |  |
| `infDPS/toma/fone` | opcional | ✔ envia |  |
| `infDPS/toma/email` | opcional | ✔ envia |  |

## Intermediário (12/19 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/interm/CNPJ` | obrigatório | ✔ envia |  |
| `infDPS/interm/CPF` | obrigatório | ✔ envia |  |
| `infDPS/interm/NIF` | obrigatório | — não envia |  |
| `infDPS/interm/cNaoNIF` | obrigatório | — não envia | lista XSD (3) |
| `infDPS/interm/CAEPF` | opcional | — não envia |  |
| `infDPS/interm/IM` | opcional | ✔ envia |  |
| `infDPS/interm/xNome` | obrigatório | ✔ envia |  |
| `infDPS/interm/end/endNac/cMun` | obrigatório | ✔ envia | Municípios (Anexo A) |
| `infDPS/interm/end/endNac/CEP` | obrigatório | ✔ envia |  |
| `infDPS/interm/end/endExt/cPais` | obrigatório | — não envia | Países (Anexo A) |
| `infDPS/interm/end/endExt/cEndPost` | obrigatório | — não envia |  |
| `infDPS/interm/end/endExt/xCidade` | obrigatório | — não envia |  |
| `infDPS/interm/end/endExt/xEstProvReg` | obrigatório | — não envia |  |
| `infDPS/interm/end/xLgr` | obrigatório | ✔ envia |  |
| `infDPS/interm/end/nro` | obrigatório | ✔ envia |  |
| `infDPS/interm/end/xCpl` | opcional | ✔ envia |  |
| `infDPS/interm/end/xBairro` | obrigatório | ✔ envia |  |
| `infDPS/interm/fone` | opcional | ✔ envia |  |
| `infDPS/interm/email` | opcional | ✔ envia |  |

## Serviço (17/45 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/serv/locPrest/cLocPrestacao` | obrigatório | ✔ envia | Municípios (Anexo A) |
| `infDPS/serv/locPrest/cPaisPrestacao` | obrigatório | — não envia | Países (Anexo A) |
| `infDPS/serv/cServ/cTribNac` | obrigatório | ✔ envia | Lista nacional de serviços (Anexo B) |
| `infDPS/serv/cServ/cTribMun` | opcional | ✔ envia |  |
| `infDPS/serv/cServ/xDescServ` | obrigatório | ✔ envia |  |
| `infDPS/serv/cServ/cNBS` | opcional | ✔ envia | NBS (Anexo B) |
| `infDPS/serv/cServ/cIntContrib` | opcional | — não envia |  |
| `infDPS/serv/comExt/mdPrestacao` | obrigatório | — não envia | lista XSD (5) |
| `infDPS/serv/comExt/vincPrest` | obrigatório | — não envia | lista XSD (8) |
| `infDPS/serv/comExt/tpMoeda` | obrigatório | — não envia |  |
| `infDPS/serv/comExt/vServMoeda` | obrigatório | — não envia |  |
| `infDPS/serv/comExt/mecAFComexP` | obrigatório | — não envia | lista XSD (9) |
| `infDPS/serv/comExt/mecAFComexT` | obrigatório | — não envia | lista XSD (27) |
| `infDPS/serv/comExt/movTempBens` | obrigatório | — não envia | lista XSD (4) |
| `infDPS/serv/comExt/nDI` | opcional | — não envia |  |
| `infDPS/serv/comExt/nRE` | opcional | — não envia |  |
| `infDPS/serv/comExt/mdic` | obrigatório | — não envia | lista XSD (2) |
| `infDPS/serv/obra/inscImobFisc` | opcional | — não envia |  |
| `infDPS/serv/obra/cObra` | obrigatório | — não envia |  |
| `infDPS/serv/obra/cCIB` | obrigatório | — não envia |  |
| `infDPS/serv/obra/end/CEP` | obrigatório | ✔ envia |  |
| `infDPS/serv/obra/end/endExt/cEndPost` | obrigatório | — não envia |  |
| `infDPS/serv/obra/end/endExt/xCidade` | obrigatório | — não envia |  |
| `infDPS/serv/obra/end/endExt/xEstProvReg` | obrigatório | — não envia |  |
| `infDPS/serv/obra/end/xLgr` | obrigatório | ✔ envia |  |
| `infDPS/serv/obra/end/nro` | obrigatório | ✔ envia |  |
| `infDPS/serv/obra/end/xCpl` | opcional | ✔ envia |  |
| `infDPS/serv/obra/end/xBairro` | obrigatório | ✔ envia |  |
| `infDPS/serv/atvEvento/xNome` | obrigatório | ✔ envia |  |
| `infDPS/serv/atvEvento/dtIni` | obrigatório | — não envia |  |
| `infDPS/serv/atvEvento/dtFim` | obrigatório | — não envia |  |
| `infDPS/serv/atvEvento/idAtvEvt` | obrigatório | — não envia |  |
| `infDPS/serv/atvEvento/end/CEP` | obrigatório | ✔ envia |  |
| `infDPS/serv/atvEvento/end/endExt/cEndPost` | obrigatório | — não envia |  |
| `infDPS/serv/atvEvento/end/endExt/xCidade` | obrigatório | — não envia |  |
| `infDPS/serv/atvEvento/end/endExt/xEstProvReg` | obrigatório | — não envia |  |
| `infDPS/serv/atvEvento/end/xLgr` | obrigatório | ✔ envia |  |
| `infDPS/serv/atvEvento/end/nro` | obrigatório | ✔ envia |  |
| `infDPS/serv/atvEvento/end/xCpl` | opcional | ✔ envia |  |
| `infDPS/serv/atvEvento/end/xBairro` | obrigatório | ✔ envia |  |
| `infDPS/serv/infoCompl/idDocTec` | opcional | — não envia |  |
| `infDPS/serv/infoCompl/docRef` | opcional | — não envia |  |
| `infDPS/serv/infoCompl/xPed` | opcional | — não envia |  |
| `infDPS/serv/infoCompl/gItemPed/xItemPed` | obrigatório | — não envia |  |
| `infDPS/serv/infoCompl/xInfComp` | opcional | ✔ envia |  |

## Valores e tributos (35/62 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/valores/vServPrest/vReceb` | opcional | — não envia |  |
| `infDPS/valores/vServPrest/vServ` | obrigatório | ✔ envia |  |
| `infDPS/valores/vDescCondIncond/vDescIncond` | opcional | ✔ envia |  |
| `infDPS/valores/vDescCondIncond/vDescCond` | opcional | ✔ envia |  |
| `infDPS/valores/vDedRed/pDR` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/vDR` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/chNFSe` | obrigatório | ✔ envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/chNFe` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/NFSeMun/cMunNFSeMun` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/NFSeMun/nNFSeMun` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/NFSeMun/cVerifNFSeMun` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/NFNFS/nNFS` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/NFNFS/modNFS` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/NFNFS/serieNFS` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/nDocFisc` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/nDoc` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/tpDedRed` | obrigatório | — não envia | lista XSD (10) |
| `infDPS/valores/vDedRed/documentos/docDedRed/xDescOutDed` | opcional | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/dtEmiDoc` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/vDedutivelRedutivel` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/vDeducaoReducao` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/CNPJ` | obrigatório | ✔ envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/CPF` | obrigatório | ✔ envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/NIF` | obrigatório | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/cNaoNIF` | obrigatório | — não envia | lista XSD (3) |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/CAEPF` | opcional | — não envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/IM` | opcional | ✔ envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/xNome` | obrigatório | ✔ envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/end/xLgr` | obrigatório | ✔ envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/end/nro` | obrigatório | ✔ envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/end/xCpl` | opcional | ✔ envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/end/xBairro` | obrigatório | ✔ envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/fone` | opcional | ✔ envia |  |
| `infDPS/valores/vDedRed/documentos/docDedRed/fornec/email` | opcional | ✔ envia |  |
| `infDPS/valores/trib/tribMun/tribISSQN` | obrigatório | ✔ envia | lista XSD (4) |
| `infDPS/valores/trib/tribMun/cPaisResult` | opcional | — não envia |  |
| `infDPS/valores/trib/tribMun/tpImunidade` | opcional | — não envia | lista XSD (6) |
| `infDPS/valores/trib/tribMun/exigSusp/tpSusp` | obrigatório | — não envia | lista XSD (2) |
| `infDPS/valores/trib/tribMun/exigSusp/nProcesso` | obrigatório | — não envia |  |
| `infDPS/valores/trib/tribMun/BM/nBM` | obrigatório | — não envia |  |
| `infDPS/valores/trib/tribMun/BM/vRedBCBM` | opcional | — não envia |  |
| `infDPS/valores/trib/tribMun/BM/pRedBCBM` | opcional | — não envia |  |
| `infDPS/valores/trib/tribMun/tpRetISSQN` | obrigatório | ✔ envia | lista XSD (3) |
| `infDPS/valores/trib/tribMun/pAliq` | opcional | ✔ envia |  |
| `infDPS/valores/trib/tribFed/piscofins/CST` | obrigatório | ✔ envia | lista XSD (34) |
| `infDPS/valores/trib/tribFed/piscofins/vBCPisCofins` | opcional | ✔ envia |  |
| `infDPS/valores/trib/tribFed/piscofins/pAliqPis` | opcional | ✔ envia |  |
| `infDPS/valores/trib/tribFed/piscofins/pAliqCofins` | opcional | ✔ envia |  |
| `infDPS/valores/trib/tribFed/piscofins/vPis` | opcional | ✔ envia |  |
| `infDPS/valores/trib/tribFed/piscofins/vCofins` | opcional | ✔ envia |  |
| `infDPS/valores/trib/tribFed/piscofins/tpRetPisCofins` | opcional | ✔ envia | lista XSD (10) |
| `infDPS/valores/trib/tribFed/vRetCP` | opcional | ✔ envia |  |
| `infDPS/valores/trib/tribFed/vRetIRRF` | opcional | ✔ envia |  |
| `infDPS/valores/trib/tribFed/vRetCSLL` | opcional | ✔ envia |  |
| `infDPS/valores/trib/totTrib/vTotTrib/vTotTribFed` | obrigatório | ✔ envia |  |
| `infDPS/valores/trib/totTrib/vTotTrib/vTotTribEst` | obrigatório | ✔ envia |  |
| `infDPS/valores/trib/totTrib/vTotTrib/vTotTribMun` | obrigatório | ✔ envia |  |
| `infDPS/valores/trib/totTrib/pTotTrib/pTotTribFed` | obrigatório | ✔ envia |  |
| `infDPS/valores/trib/totTrib/pTotTrib/pTotTribEst` | obrigatório | ✔ envia |  |
| `infDPS/valores/trib/totTrib/pTotTrib/pTotTribMun` | obrigatório | ✔ envia |  |
| `infDPS/valores/trib/totTrib/indTotTrib` | obrigatório | ✔ envia | lista XSD (1) |
| `infDPS/valores/trib/totTrib/pTotTribSN` | obrigatório | ✔ envia |  |

## IBS/CBS (reforma) (25/60 enviados)

| Campo | Obrig. | Plataforma | Opções |
|---|---|---|---|
| `infDPS/IBSCBS/finNFSe` | obrigatório | ✔ envia | lista XSD (1) |
| `infDPS/IBSCBS/indFinal` | opcional | ✔ envia | lista XSD (2) |
| `infDPS/IBSCBS/cIndOp` | obrigatório | ✔ envia | Indicador de operação (Anexo C) |
| `infDPS/IBSCBS/tpOper` | opcional | — não envia | lista XSD (5) |
| `infDPS/IBSCBS/gRefNFSe/refNFSe` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/tpEnteGov` | opcional | — não envia | lista XSD (4) |
| `infDPS/IBSCBS/indDest` | obrigatório | ✔ envia | lista XSD (2) |
| `infDPS/IBSCBS/dest/CNPJ` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/dest/CPF` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/dest/NIF` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/dest/cNaoNIF` | obrigatório | — não envia | lista XSD (3) |
| `infDPS/IBSCBS/dest/xNome` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/dest/end/endNac/cMun` | obrigatório | ✔ envia | Municípios (Anexo A) |
| `infDPS/IBSCBS/dest/end/endNac/CEP` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/dest/end/endExt/cPais` | obrigatório | — não envia | Países (Anexo A) |
| `infDPS/IBSCBS/dest/end/endExt/cEndPost` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/dest/end/endExt/xCidade` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/dest/end/endExt/xEstProvReg` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/dest/end/xLgr` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/dest/end/nro` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/dest/end/xCpl` | opcional | ✔ envia |  |
| `infDPS/IBSCBS/dest/end/xBairro` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/dest/fone` | opcional | ✔ envia |  |
| `infDPS/IBSCBS/dest/email` | opcional | ✔ envia |  |
| `infDPS/IBSCBS/imovel/inscImobFisc` | opcional | — não envia |  |
| `infDPS/IBSCBS/imovel/cCIB` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/imovel/end/CEP` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/imovel/end/endExt/cEndPost` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/imovel/end/endExt/xCidade` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/imovel/end/endExt/xEstProvReg` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/imovel/end/xLgr` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/imovel/end/nro` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/imovel/end/xCpl` | opcional | ✔ envia |  |
| `infDPS/IBSCBS/imovel/end/xBairro` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/dFeNacional/tipoChaveDFe` | obrigatório | — não envia | lista XSD (4) |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/dFeNacional/xTipoChaveDFe` | opcional | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/dFeNacional/chaveDFe` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/docFiscalOutro/cMunDocFiscal` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/docFiscalOutro/nDocFiscal` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/docFiscalOutro/xDocFiscal` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/docOutro/nDoc` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/docOutro/xDoc` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/fornec/CNPJ` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/fornec/CPF` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/fornec/NIF` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/fornec/cNaoNIF` | obrigatório | — não envia | lista XSD (3) |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/fornec/xNome` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/dtEmiDoc` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/dtCompDoc` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/tpReeRepRes` | obrigatório | — não envia | lista XSD (5) |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/xTpReeRepRes` | opcional | — não envia |  |
| `infDPS/IBSCBS/valores/gReeRepRes/documentos/vlrReeRepRes` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/trib/gIBSCBS/CST` | obrigatório | ✔ envia |  |
| `infDPS/IBSCBS/valores/trib/gIBSCBS/cClassTrib` | obrigatório | ✔ envia | Classificação tributária IBS/CBS (tabela RFB/CGIBS — a obter) |
| `infDPS/IBSCBS/valores/trib/gIBSCBS/cCredPres` | opcional | — não envia |  |
| `infDPS/IBSCBS/valores/trib/gIBSCBS/gTribRegular/CSTReg` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/trib/gIBSCBS/gTribRegular/cClassTribReg` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/trib/gIBSCBS/gDif/pDifUF` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/trib/gIBSCBS/gDif/pDifMun` | obrigatório | — não envia |  |
| `infDPS/IBSCBS/valores/trib/gIBSCBS/gDif/pDifCBS` | obrigatório | — não envia |  |
