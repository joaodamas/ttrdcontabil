# NFS-e Nacional — campos da DPS, opções e regras

Fonte: documentação de **produção** do portal gov.br/nfse — Anexo I v1.01-20260209 (leiaute e regras de negócio), Anexos A/B/C, XSD v1.01-20260209 e tabela cClassTrib da Conformidade Fácil (SVRS/RFB). Gerado de `src/lib/nfse-dominios/*.json` (atualizar com `node scripts/atualizar-dominios-nfse.mjs`).

**236 campos de preenchimento** na DPS; o montador da DPS (`functions/src/nfse/nacional/dps.ts`, master) sabe gerar **122** — o que não significa que a tela de emissão já peça o dado: o grupo IBS/CBS, por exemplo, existe no montador mas nenhuma tela o preenche ainda. “Ocorr.” é dentro do grupo: `1-1` obrigatório, `0-1` opcional. “Rejeições” são os códigos de erro da Sefin para o campo.

Resumo das listas de opções disponíveis no catálogo:

| Lista | Itens | Uso |
|---|---|---|
| Lista nacional de serviços (cTribNac) | 338 | código de tributação nacional |
| NBS 2.0 | 1.210 | cNBS — exigido com IBS/CBS |
| Municípios IBGE / países ISO2 | 5.570 / 250 | endereços, local da prestação, local de incidência |
| Indicador de operação (cIndOp) | 26 | IBS/CBS — local do fornecimento |
| CST + cClassTrib IBS/CBS | 12 CST / 73 classificações | IBS/CBS (só as marcadas para NFS-e) |
| Listas fechadas do XSD | 50 tipos | regime especial, tributação do ISS, retenção, exigibilidade suspensa etc. |


## Identificação da DPS

| Campo | Ocorr. | Montador DPS | Descrição | Opções | Rejeições |
|---|---|---|---|---|---|
| `tpAmb` | 1-1 | ✔ | Identificação do tipo de ambiente no Sistema Nacional NFS-e: 1 - Produção; 2 - Homologação; | `1` Produção<br>`2` Homologação | E0006 |
| `dhEmi` | 1-1 | ✔ | Data e hora da emissão da DPS. Data e hora no formato UTC (Universal Coordinated Time): AAAA-MM-DDThh:mm:ssTZD |  | E0008 |
| `verAplic` | 1-1 | ✔ | Versão do aplicativo que gerou a DPS. |  |  |
| `serie` | 1-1 | ✔ | Série da DPS. — Faixas de utilização da série da DPS: 00001 a 49999 - Emissão com aplicativo pŕoprio; 50000 a 69999 - Emissor Móvel; 70000 a 79999 - Emissor Web; 80000 a 89999 - Emissão com *transcrição manual (Web); *O emitente deve informar o número de sé… |  | E0010 |
| `nDPS` | 1-1 | ✔ | Número da DPS. — 1 até 999999999999999 |  |  |
| `dCompet` | 1-1 | ✔ | Data de competência da prestação do serviço. Ano, Mês e Dia (AAAA-MM-DD) — A data de competência deve ser única e ser a mesma que a data do fato gerador do tributo, ou seja, a data da prestação do serviço. |  | E0015 |
| `tpEmit` | 1-1 | ✔ | Emitente da DPS: 1 - Prestador; 2 - Tomador; 3 - Intermediário; | `1` Prestador<br>`2` Tomador<br>`3` Intermediário | E9996 |
| `cMotivoEmisTI` | 0-1 | — | Motivo da Emissão da DPS pelo Tomador/Intermediário: 1 - Importação de Serviço; 2 - Tomador/Intermediário obrigado a emitir NFS-e por legislação municipal; 3 - Tomador/Intermediário emitindo NFS-e por recusa de emissão pelo prestador; 4 - Tomador/Intermediá… | `1` Importação de Serviço<br>`2` Tomador/Intermediário obrigado a emitir NFS-e por legislação municipal<br>`3` Tomador/Intermediário emitindo NFS-e por recusa de emissão pelo prestador<br>`4` Tomador/Intermediário emitindo por rejeitar a NFS-e emitida pelo prestador | E0029 |
| `chNFSeRej` | 0-1 | — | Chave de Acesso da NFS-e rejeitada pelo Tomador/Intermediário. — O tomador deve referenciar neste campo a nota do prestador, utilizando-se da chave da NFS-e emitida pelo prestador e previamente rejeitada pelo tomador, ou seja, o Tomador/Intermediário antes … |  | E0034 |
| `cLocEmi` | 1-1 | ✔ | Código de 7 dígitos da localidade emissora da NFS-e. — O campo cLocEmi (Código da Localidade de Emissão da DPS) sempre corresponderá a um município brasileiro e identificado pela tabela de códigos de municípios do IBGE ou um trecho de concessão de exploraçã… | Municípios IBGE | E0037 |

## Substituição

| Campo | Ocorr. | Montador DPS | Descrição | Opções | Rejeições |
|---|---|---|---|---|---|
| `subst/chSubstda` | 1-1 | — | Chave de Acesso da NFS-e a ser substituída. — O município conveniado ao Sistema Nacional NFS-e deverá parametrizar o prazo máximo permitido para que o emitente da NFS-e possa substituir uma NFS-e que o município tenha gerado. Prazo máximo parametrizável é 2… |  | E0042 |
| `subst/cMotivo` | 1-1 | ✔ | Código de justificativa para substituição de NFS-e: 1 - Desenquadramento de NFS-e do Simples Nacional; 2 - Enquadramento de NFS-e no Simples Nacional; 3 - Inclusão Retroativa de Imunidade/Isenção para NFS-e; 4 - Exclusão Retroativa de Imunidade/Isenção para… | `01` Desenquadramento de NFS-e do Simples Nacional<br>`02` Enquadramento de NFS-e no Simples Nacional<br>`03` Inclusão Retroativa de Imunidade/Isenção para NFS-e<br>`04` Exclusão Retroativa de Imunidade/Isenção para NFS-e<br>`05` Rejeição de NFS-e pelo tomador ou pelo intermediário se responsável pelo recolhimento do tributo<br>`99` Outros |  |
| `subst/xMotivo` | 0-1 | ✔ | Descrição do motivo da substituição da NFS-e quando o emitente deve descrever o motivo da substituição para outros motivos (cMotivo = 99). |  | E0078 |

## Prestador

| Campo | Ocorr. | Montador DPS | Descrição | Opções | Rejeições |
|---|---|---|---|---|---|
| `prest/CNPJ` | 1-1 | ✔ | Número da inscrição federal (CNPJ) do prestador do serviço. |  | E0080 |
| `prest/CPF` | 1-1 | ✔ | Número da inscrição federal (CPF) do prestador do serviço. |  | E0096 |
| `prest/NIF` | 1-1 | — | Número de identificação fiscal fornecido por órgão de administração tributária no exterior. |  | E0112 |
| `prest/cNaoNIF` | 1-1 | — | Motivo para não informação do NIF: 0 - Não informado na nota de origem; 1 - Dispensado do NIF; 2 - Não exigência do NIF; — O valor 0 deve ser utilizado como opção de preenchimento do campo somente no compartilhamento de NFS-e pelo municipio com o ADN NFS-e. | `0` Não informado na nota de origem<br>`1` Dispensado do NIF<br>`2` Não exigência do NIF |  |
| `prest/CAEPF` | 0-1 | — | Número do Cadastro de Atividade Econômica da Pessoa Física (CAEPF). |  |  |
| `prest/IM` | 0-1 | ✔ | Número do indicador municipal do prestador do serviço. |  | E0116 |
| `prest/xNome` | 0-1 | ✔ | Nome / Nome Empresarial do prestador. |  | E0121 |
| `prest/end/endNac` | 1-1 | ✔ | Grupo de informações do endereço nacional. |  |  |
| `prest/end/endNac/cMun` | 1-1 | ✔ | Código do município do endereço do prestador do serviço. (Tabela do IBGE) | Municípios IBGE (5.570) | E0130 |
| `prest/end/endNac/CEP` | 1-1 | ✔ | Código numérico do Endereçamento Postal nacional (CEP) do endereço do prestador do serviço. |  | E0138 |
| `prest/end/endExt` | 1-1 | — | Grupo de informações do endereço no exterior. |  | E0142 |
| `prest/end/endExt/cPais` | 1-1 | — | Código do país do endereço do prestador do prestador do serviço. (Tabela de Países ISO) | Países ISO2 (250) | E0146 |
| `prest/end/endExt/cEndPost` | 1-1 | — | Código alfanumérico do Endereçamento Postal no exterior do prestador do serviço. |  |  |
| `prest/end/endExt/xCidade` | 1-1 | — | Nome da cidade no exterior do prestador do serviço. |  |  |
| `prest/end/endExt/xEstProvReg` | 1-1 | — | Estado, província ou região da cidade no exterior do prestador do serviço. |  |  |
| `prest/end/xLgr` | 1-1 | ✔ | Tipo e nome do logradouro do endereço do prestador do serviço. |  |  |
| `prest/end/nro` | 1-1 | ✔ | Número no logradouro do endereço do prestador do serviço. |  |  |
| `prest/end/xCpl` | 0-1 | ✔ | Complemento do endereço do prestador do serviço. |  |  |
| `prest/end/xBairro` | 1-1 | ✔ | Bairro do endereço do prestador do serviço. |  |  |
| `prest/fone` | 0-1 | ✔ | Número do telefone do prestador. (Preencher com o Código DDD + número do telefone. Nas operações com exterior é permitido informar o código do país + código da localidade + número do telefone) |  |  |
| `prest/email` | 0-1 | ✔ | E-mail do prestador. |  | E0148 |
| `prest/regTrib/opSimpNac` | 1-1 | ✔ | Situação perante Simples Nacional: 1 - Não Optante; 2 - Optante - Microempreendedor Individual (MEI); 3 - Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP); | `1` Não Optante<br>`2` Optante - Microempreendedor Individual (MEI)<br>`3` Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP) | E0160 |
| `prest/regTrib/regApTribSN` | 0-1 | ✔ | Regime de Apuração Tributária pelo Simples Nacional. Opção para que o contribuinte optante pelo Simples Nacional ME/EPP (opSimpNac = 3) possa indicar, ao emitir o documento fiscal, em qual regime de apuração os tributos federais e municipal estão inseridos,… | `1` Regime de apuração dos tributos federais e municipal pelo SN<br>`2` Regime de apuração dos tributos federais pelo SN e ISSQN por fora do SN conforme respectiva legislação municipal do tributo<br>`3` Regime de apuração dos tributos federais e municipal por fora do SN conforme respectivas legislações federal e municipal de cada tributo | E0162 |
| `prest/regTrib/regEspTrib` | 1-1 | ✔ | Tipos de Regimes Especiais de Tributação Municipal: 0 - Nenhum; 1 - Ato Cooperado (Cooperativa); 2 - Estimativa; 3 - Microempresa Municipal; 4 - Notário ou Registrador; 5 - Profissional Autônomo; 6 - Sociedade de Profissionais; 9 - Outros; | `0` Nenhum<br>`1` Ato Cooperado (Cooperativa)<br>`2` Estimativa<br>`3` Microempresa Municipal<br>`4` Notário ou Registrador<br>`5` Profissional Autônomo<br>`6` Sociedade de Profissionais<br>`9` Outros | E0172 |

## Tomador

| Campo | Ocorr. | Montador DPS | Descrição | Opções | Rejeições |
|---|---|---|---|---|---|
| `toma/CNPJ` | 1-1 | ✔ | Número da inscrição federal (CNPJ) do tomador de serviço. |  | E0188 |
| `toma/CPF` | 1-1 | ✔ | Número da inscrição federal (CPF) do tomador do serviço. |  |  |
| `toma/NIF` | 1-1 | — | Número de identificação fiscal fornecido por órgão de administração tributária no exterior. |  | E0222 |
| `toma/cNaoNIF` | 1-1 | — | Motivo para não informação do NIF: 0 - Não informado na nota de origem; 1 - Dispensado do NIF; 2 - Não exigência do NIF; — O valor 0 deve ser utilizado como opção de preenchimento do campo somente no compartilhamento de NFS-e pelo municipio com o ADN NFS-e. | `0` Não informado na nota de origem<br>`1` Dispensado do NIF<br>`2` Não exigência do NIF |  |
| `toma/CAEPF` | 0-1 | — | Número do Cadastro de Atividade Econômica da Pessoa Física (CAEPF). |  |  |
| `toma/IM` | 0-1 | ✔ | Número do indicador municipal do tomador do serviço. |  | E0228 |
| `toma/xNome` | 1-1 | ✔ | Nome / Nome Empresarial do tomador. |  | E0233 |
| `toma/end/endNac` | 1-1 | ✔ | Grupo de informações do endereço nacional. |  | E0235 |
| `toma/end/endNac/cMun` | 1-1 | ✔ | Código do município do endereço do tomador do serviço. (Tabela do IBGE) | Municípios IBGE (5.570) | E0238 |
| `toma/end/endNac/CEP` | 1-1 | ✔ | Código numérico do Endereçamento Postal nacional (CEP) do endereço do tomador do serviço. |  | E0240 |
| `toma/end/endExt` | 1-1 | — | Grupo de informações do endereço no exterior. |  | E0242 |
| `toma/end/endExt/cPais` | 1-1 | — | Código do país do endereço do prestador do tomador do serviço. (Tabela de Países ISO) | Países ISO2 (250) | E0246 |
| `toma/end/endExt/cEndPost` | 1-1 | — | Código alfanumérico do Endereçamento Postal no exterior do tomador do serviço. |  |  |
| `toma/end/endExt/xCidade` | 1-1 | — | Nome da cidade no exterior do tomador do serviço. |  |  |
| `toma/end/endExt/xEstProvReg` | 1-1 | — | Estado, província ou região da cidade no exterior do tomador do serviço. |  |  |
| `toma/end/xLgr` | 1-1 | ✔ | Tipo e nome do logradouro do endereço do tomador do serviço. |  |  |
| `toma/end/nro` | 1-1 | ✔ | Número no logradouro do endereço do tomador do serviço. |  |  |
| `toma/end/xCpl` | 0-1 | ✔ | Complemento do endereço do tomador do serviço. |  |  |
| `toma/end/xBairro` | 1-1 | ✔ | Bairro do endereço do tomador do serviço. |  |  |
| `toma/fone` | 0-1 | ✔ | Número do telefone do tomador. (Preencher com o Código DDD + número do telefone. Nas operações com exterior é permitido informar o código do país + código da localidade + número do telefone) |  |  |
| `toma/email` | 0-1 | ✔ | E-mail do tomador. |  | E0247 |

## Intermediário

| Campo | Ocorr. | Montador DPS | Descrição | Opções | Rejeições |
|---|---|---|---|---|---|
| `interm/CNPJ` | 1-1 | ✔ | Número da inscrição federal (CNPJ) do intermediário de serviço |  | E0248 |
| `interm/CPF` | 1-1 | ✔ | Número da inscrição federal (CPF) do intermediário do serviço |  |  |
| `interm/NIF` | 1-1 | — | Número de identificação fiscal fornecido por órgão de administração tributária no exterior |  | E0280 |
| `interm/cNaoNIF` | 1-1 | — | Motivo para não informação do NIF: 0 - Não informado na nota de origem; 1 - Dispensado do NIF; 2 - Não exigência do NIF; — O valor 0 deve ser utilizado como opção de preenchimento do campo somente no compartilhamento de NFS-e pelo municipio com o ADN NFS-e. | `0` Não informado na nota de origem<br>`1` Dispensado do NIF<br>`2` Não exigência do NIF |  |
| `interm/CAEPF` | 0-1 | — | Número do Cadastro de Atividade Econômica da Pessoa Física (CAEPF). |  |  |
| `interm/IM` | 0-1 | ✔ | Número do indicador municipal do intermediário do serviço |  | E0287 |
| `interm/xNome` | 1-1 | ✔ | Nome / Nomer Empresarial do intermediário |  | E0292 |
| `interm/end/endNac` | 1-1 | ✔ | Grupo de informações do endereço nacional. |  | E1388 |
| `interm/end/endNac/cMun` | 1-1 | ✔ | Código do município do endereço do intermediário do serviço. (Tabela do IBGE) | Municípios IBGE (5.570) | E0294 |
| `interm/end/endNac/CEP` | 1-1 | ✔ | Código numérico do Endereçamento Postal nacional (CEP) do endereço do intermediário do serviço. |  | E0296 |
| `interm/end/endExt` | 1-1 | — | Grupo de informações do endereço no exterior. |  | E0298 |
| `interm/end/endExt/cPais` | 1-1 | — | Código do país do endereço do prestador do intermediário do serviço. (Tabela de Países ISO) | Países ISO2 (250) | E0299 |
| `interm/end/endExt/cEndPost` | 1-1 | — | Código alfanumérico do Endereçamento Postal no exterior do intermediário do serviço. |  |  |
| `interm/end/endExt/xCidade` | 1-1 | — | Nome da cidade no exterior do intermediário do serviço. |  |  |
| `interm/end/endExt/xEstProvReg` | 1-1 | — | Estado, província ou região da cidade no exterior do intermediário do serviço. |  |  |
| `interm/end/xLgr` | 1-1 | ✔ | Tipo e nome do logradouro do endereço do intermediário do serviço. |  |  |
| `interm/end/nro` | 1-1 | ✔ | Número no logradouro do endereço do intermediário do serviço. |  |  |
| `interm/end/xCpl` | 0-1 | ✔ | Complemento do endereço do intermediário do serviço. |  |  |
| `interm/end/xBairro` | 1-1 | ✔ | Bairro do endereço do intermediário do serviço. |  |  |
| `interm/fone` | 0-1 | ✔ | Número do telefone do intermediário. (Preencher com o Código DDD + número do telefone. Nas operações com exterior é permitido informar o código do país + código da localidade + número do telefone) |  |  |
| `interm/email` | 0-1 | ✔ | E-mail do intermediário. |  | E0300 |

## Serviço

| Campo | Ocorr. | Montador DPS | Descrição | Opções | Rejeições |
|---|---|---|---|---|---|
| `serv/locPrest/cLocPrestacao` | 1-1 | ✔ | Código da localidade da prestação do serviço. | Municípios IBGE (5.570) | E0302 |
| `serv/locPrest/cPaisPrestacao` | 1-1 | — | Código do país onde ocorreu a prestação do serviço. (Tabela de Países ISO) | Países ISO2 (250) | E0304 |
| `serv/cServ/cTribNac` | 1-1 | ✔ | Código de tributação nacional do ISSQN, nos termos da LC 116/2003, Conforme aba MUN.INCID_INFO.SERV. do ANEXO I — Para o caso de serviço prestado em "Águas Marítimas" o seviço informado nunca poderá ser 20.01 | Lista nacional de serviços (338) | E0310 |
| `serv/cServ/cTribMun` | 0-1 | ✔ | Código de tributação municipal do ISSQN. |  | E0314 |
| `serv/cServ/xDescServ` | 1-1 | ✔ | Descrição completa do serviço prestado |  |  |
| `serv/cServ/cNBS` | 0-1 | ✔ | Código NBS correspondente ao serviço prestado, seguindo a versão 2.0, conforme Anexo B. — NBS - Nomenclatura Brasileira de Serviços, Intangíveis e outras Operações que produzam Variações no Patrimônio | NBS 2.0 (1.210) | E0316 |
| `serv/cServ/cIntContrib` | 0-1 | — | Código interno do contribuinte — Utilizado para identificação da DPS no Sistema interno do Contribuinte |  |  |
| `serv/comExt/mdPrestacao` | 1-1 | — | Modo de Prestação: 0 - Desconhecido (tipo não informado na nota de origem); 1 - Transfronteiriço; 2 - Consumo no Brasil; 3 - Movimento Temporário de Pessoas Físicas; 4 - Consumo no Exterior; — O valor 0 deve ser utilizado como opção de preenchimento do camp… | `0` Desconhecido (tipo não informado na nota de origem)<br>`1` Transfronteiriço<br>`2` Consumo no Brasil<br>`3` Presença Comercial no Exterior<br>`4` Movimento Temporário de Pessoas Físicas | E0333 |
| `serv/comExt/vincPrest` | 1-1 | — | Vínculo entre as partes no negócio: 0 - Sem vínculo com o Tomador/Prestador 1 - Controlada; 2 - Controladora; 3 - Coligada; 4 - Matriz; 5 - Filial ou sucursal; 6 - Outro vínculo; 9 - Desconhecido (tipo não informado na nota de origem); — Adicionar ao Hint d… | `0` Sem vínculo com o Tomador/Prestador<br>`1` Controlada<br>`2` Controladora<br>`3` Coligada<br>`4` Matriz<br>`5` Filial ou sucursal<br>`6` Outro vínculo<br>`9` Desconhecido (tipo não informado na nota de origem) |  |
| `serv/comExt/tpMoeda` | 1-1 | — | Identifica a moeda da transação comercial. O usuário deve informar o código da moeda. — inclusão, no Emissor Público, da tabela de moedas do Banco Central do Brasil para seleção pelo emitente da NFS-e. No Painel Nacional deverá haver função para atualização… |  |  |
| `serv/comExt/vServMoeda` | 1-1 | — | Valor do serviço prestado expresso em moeda estrangeira especificada em tpmoeda. |  |  |
| `serv/comExt/mecAFComexP` | 1-1 | — | Mecanismo de apoio/fomento ao Comércio Exterior utilizado pelo prestador do serviço: 00 - Desconhecido (tipo não informado na nota de origem); 01 - Nenhum; 02 - ACC - Adiantamento sobre Contrato de Câmbio – Redução a Zero do IR e do IOF; 03 - ACE – Adiantam… | 9 opções (`TSMecAFComExPrest`) | E0341 |
| `serv/comExt/mecAFComexT` | 1-1 | — | Mecanismo de apoio/fomento ao Comércio Exterior utilizado pelo tomador do serviço: 00 - Desconhecido (tipo não informado na nota de origem); 01 - Nenhum; 02 - Adm. Pública e Repr. Internacional; 03 - Alugueis e Arrend. Mercantil de maquinas, equip., embarc.… | 27 opções (`TSMecAFComExToma`) | E0343 |
| `serv/comExt/movTempBens` | 1-1 | — | Vínculo da Operação à Movimentação Temporária de Bens: 0 - Desconhecido (tipo não informado na nota de origem); 1 - Não; 2 - Vinculada - Declaração de Importação; 3 - Vinculada - Declaração de Exportação; — O valor 0 deve ser utilizado como opção de preench… | `0` Desconhecido (tipo não informado na nota de origem)<br>`1` Não<br>`2` Vinculada - Declaração de Importação<br>`3` Vinculada - Declaração de Exportação | E0345 |
| `serv/comExt/nDI` | 0-1 | — | Número da Declaração de Importação (DI/DSI/DA/DRI-E) averbado. |  | E0352 |
| `serv/comExt/nRE` | 0-1 | — | Número do Registro de Exportação (RE) averbado. |  |  |
| `serv/comExt/mdic` | 1-1 | — | Indicador se a NFS-e deverá ser disponibilizada ao MDIC. 0 - Não enviar para o MDIC; 1 - Enviar para o MDIC; | `0` Não enviar para o MDIC<br>`1` Enviar para o MDIC |  |
| `serv/obra/inscImobFisc` | 0-1 | — | Inscrição imobiliária fiscal (código fornecido pela prefeitura para a identificação da obra ou para fins de recolhimento do IPTU) |  |  |
| `serv/obra/cObra` | 1-1 | — | Número de identificação da obra. Cadastro Nacional de Obras (CNO) ou Cadastro Específico do INSS (CEI). |  |  |
| `serv/obra/cCIB` | 1-1 | — | Código do Cadastro Imobiliário Brasileiro - CIB |  | E0373 |
| `serv/obra/end` | 1-1 | ✔ | Grupo de informações do endereço da obra. |  |  |
| `serv/obra/end/CEP` | 1-1 | ✔ | Código de Endereçamento Postal numérico do endereço nacional da obra. |  | E0380 |
| `serv/obra/end/endExt` | 1-1 | — | Grupo de informações descritivas do endereço no exterior da obra. |  | E0384 |
| `serv/obra/end/endExt/cEndPost` | 1-1 | — | Código de Endereçamento Postal alfanumérico do endereço no exterior da obra. |  |  |
| `serv/obra/end/endExt/xCidade` | 1-1 | — | Nome da cidade no exterior, local da obra. |  |  |
| `serv/obra/end/endExt/xEstProvReg` | 1-1 | — | Estado, província ou região da cidade no exterior, local da obra. |  |  |
| `serv/obra/end/xLgr` | 1-1 | ✔ | Tipo e nome do logradouro do endereço da obra. |  |  |
| `serv/obra/end/nro` | 1-1 | ✔ | Número no logradouro do endereço da obra. |  |  |
| `serv/obra/end/xCpl` | 0-1 | ✔ | Complemento do endereço da obra. |  |  |
| `serv/obra/end/xBairro` | 1-1 | ✔ | Bairro do endereço da obra. |  |  |
| `serv/atvEvento/xNome` | 1-1 | ✔ | Nome do evento Artístico, Cultural, Esportivo, ... |  |  |
| `serv/atvEvento/dtIni` | 1-1 | — | Data de início da atividade de evento. Ano, Mês e Dia (AAAA-MM-DD) |  |  |
| `serv/atvEvento/dtFim` | 1-1 | — | Data de fim da atividade de evento. Ano, Mês e Dia (AAAA-MM-DD) |  |  |
| `serv/atvEvento/idAtvEvt` | 1-1 | — | Identificação da Atividade de Evento (código identificador de evento determinado pela Administração Tributária Municipal) — Choice com o grupo de endereço da atividade de evento |  |  |
| `serv/atvEvento/end` | 1-1 | ✔ | Grupo de informações do endereço da atividade de evento. |  |  |
| `serv/atvEvento/end/CEP` | 1-1 | ✔ | Código de Endereçamento Postal numérico do endereço nacional da atividade de evento. |  | E0398 |
| `serv/atvEvento/end/endExt` | 1-1 | — | Grupo de informações descritivas do endereço no exterior da atividade de evento. |  | E0402 |
| `serv/atvEvento/end/endExt/cEndPost` | 1-1 | — | Código de Endereçamento Postal alfanumérico do endereço no exterior da atividade de evento. |  |  |
| `serv/atvEvento/end/endExt/xCidade` | 1-1 | — | Nome da cidade no exterior, local da atividade de evento. |  |  |
| `serv/atvEvento/end/endExt/xEstProvReg` | 1-1 | — | Estado, província ou região da cidade no exterior, local da atividade de evento. |  |  |
| `serv/atvEvento/end/xLgr` | 1-1 | ✔ | Tipo e nome do logradouro do endereço da atividade de evento. |  |  |
| `serv/atvEvento/end/nro` | 1-1 | ✔ | Número no logradouro do endereço da atividade de evento. |  |  |
| `serv/atvEvento/end/xCpl` | 0-1 | ✔ | Complemento do endereço da atividade de evento. |  |  |
| `serv/atvEvento/end/xBairro` | 1-1 | ✔ | Bairro do endereço da atividade de evento. |  |  |
| `serv/infoCompl/idDocTec` | 0-1 | — | Identificador de Documento de Responsabilidade Técnica: ART, RRT, DRT, Outros. |  |  |
| `serv/infoCompl/docRef` | 0-1 | — | Chave da nota, número identificador da nota, número do contrato ou outro identificador de documento emitido pelo prestador de serviços, que subsidia a emissão dessa nota pelo tomador do serviço ou intermediário (preenchimento obrigatório caso a nota esteja … |  |  |
| `serv/infoCompl/xPed` | 0-1 | — | Número do pedido/ordem de compra/ordem de serviço/projeto que autorize a prestação do serviço em operações B2B - Informação de interesse do tomador do serviço para controle e gestão da Negociação |  |  |
| `serv/infoCompl/gItemPed/xItemPed` | 1-99 | — | Número do item do pedido/ordem de compra/ordem de serviço/projeto - Identificação do número do item do pedido ou ordem de compra destacado e xPed |  |  |
| `serv/infoCompl/xInfComp` | 0-1 | ✔ | Campo livre para preenchimento pelo contribuinte. |  |  |

## Valores e tributos

| Campo | Ocorr. | Montador DPS | Descrição | Opções | Rejeições |
|---|---|---|---|---|---|
| `valores/vServPrest/vReceb` | 0-1 | — | Valor monetário recebido pelo intermediário do serviço (R$). |  | E0423 |
| `valores/vServPrest/vServ` | 1-1 | ✔ | Valor monetário do serviço (R$). |  | E0427 |
| `valores/vDescCondIncond/vDescIncond` | 0-1 | ✔ | Valor monetário do desconto incondicionado (R$). |  | E0431 |
| `valores/vDescCondIncond/vDescCond` | 0-1 | ✔ | Valor monetário do desconto condicionado (R$). |  | E0432 |
| `valores/vDedRed/pDR` | 1-1 | — | Valor percentual padrão para dedução/redução do valor do serviço. — As três opções para informação de Dedução/Redução, caso exista, são: Valor, Percentual ou Documento; |  | E0453 |
| `valores/vDedRed/vDR` | 1-1 | — | Valor monetário padrão para dedução/redução do valor do serviço. |  | E0446 |
| `valores/vDedRed/documentos` | 1-1 | — | Grupo de informações de documento utilizado para dedução/redução do valor da base de cálculo (valor do serviço) |  | E0449 |
| `valores/vDedRed/documentos/docDedRed/chNFSe` | 1-1 | ✔ | Chave de acesso da NFS-e (padrão nacional). — Para o caso de informação de documento para Dedução/Redução existem seis opções possíveis: NFS-e, NF-e, Outras NFS-e, NFS/NFS (Modelo não eletrônico), Outros documentos fiscais e Outros documentos; |  | E0455 |
| `valores/vDedRed/documentos/docDedRed/chNFe` | 1-1 | — | Chave de acesso da NF-e. |  | E0460 |
| `valores/vDedRed/documentos/docDedRed/NFSeMun` | 1-1 | — | Grupo de informações para outras notas eletrônicas municipais (Nota eletrônica municipal emitida fora do padrão nacional) |  |  |
| `valores/vDedRed/documentos/docDedRed/NFSeMun/cMunNFSeMun` | 1-1 | — | Código Município emissor da nota eletrônica municipal. (Tabela do IBGE) |  | E0466 |
| `valores/vDedRed/documentos/docDedRed/NFSeMun/nNFSeMun` | 1-1 | — | Número da nota eletrônica municipal. |  |  |
| `valores/vDedRed/documentos/docDedRed/NFSeMun/cVerifNFSeMun` | 1-1 | — | Código de Verificação da nota eletrônica municipal. |  |  |
| `valores/vDedRed/documentos/docDedRed/NFNFS` | 1-1 | — | Grupo de informações de NF ou NFS (Modelo não eletrônico) |  |  |
| `valores/vDedRed/documentos/docDedRed/NFNFS/nNFS` | 1-1 | — | Número da Nota Fiscal NF ou NFS. |  |  |
| `valores/vDedRed/documentos/docDedRed/NFNFS/modNFS` | 1-1 | — | Modelo da Nota Fiscal NF ou NFS. |  |  |
| `valores/vDedRed/documentos/docDedRed/NFNFS/serieNFS` | 1-1 | — | Série Nota Fiscal NF ou NFS. |  |  |
| `valores/vDedRed/documentos/docDedRed/nDocFisc` | 1-1 | — | Identificador de documento fiscal diferente dos demais do grupo. |  |  |
| `valores/vDedRed/documentos/docDedRed/nDoc` | 1-1 | — | Identificador de documento não fiscal diferente dos demais do grupo. |  |  |
| `valores/vDedRed/documentos/docDedRed/tpDedRed` | 1-1 | — | Tipo da Dedução/Redução: 01 – Alimentação e bebidas/frigobar; 02 – Materiais; 03 - Produção Externa; 04 - Reembolso de despesas; 05 – Repasse consorciado; 06 – Repasse plano de saúde; 07 – Serviços; 08 – Subempreitada de mão de obra; 99 – Outras deduções; —… | 10 opções (`TSIdeDedRed`) |  |
| `valores/vDedRed/documentos/docDedRed/xDescOutDed` | 0-1 | — | Descrição da Dedução/Redução quando a opção é "99 – Outras Deduções". |  | E0468 |
| `valores/vDedRed/documentos/docDedRed/dtEmiDoc` | 1-1 | — | Data da emissão do documento dedutível. Ano, mês e dia (AAAA-MM-DD) |  |  |
| `valores/vDedRed/documentos/docDedRed/vDedutivelRedutivel` | 1-1 | — | Valor monetário total dedutível/redutível no documento informado (R$). Este é o valor total no documento informado que é passível de dedução/redução. |  |  |
| `valores/vDedRed/documentos/docDedRed/vDeducaoReducao` | 1-1 | — | Valor monetário utilizado para dedução/redução do valor do serviço da NFS-e que está sendo emitida (R$). Deve ser menor ou igual ao valor deduzível/redutível (vDedutivelRedutivel). |  | E0474 |
| `valores/vDedRed/documentos/docDedRed/fornec/CNPJ` | 1-1 | ✔ | Número da inscrição federal (CNPJ) do fornecedor de serviço. |  | E0478 |
| `valores/vDedRed/documentos/docDedRed/fornec/CPF` | 1-1 | ✔ | Número da inscrição federal (CPF) do fornecedor do serviço. |  | E0484 |
| `valores/vDedRed/documentos/docDedRed/fornec/NIF` | 1-1 | — | Este elemento só deverá ser preenchido para fornecedores não residentes no Brasil. |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/cNaoNIF` | 1-1 | — | Motivo para não informação do NIF: 0 - Não informado na nota de origem; 1 - Dispensado do NIF; 2 - Não exigência do NIF; — O valor 0 deve ser utilizado como opção de preenchimento do campo somente no compartilhamento de NFS-e pelo municipio com o ADN NFS-e. | `0` Não informado na nota de origem<br>`1` Dispensado do NIF<br>`2` Não exigência do NIF |  |
| `valores/vDedRed/documentos/docDedRed/fornec/CAEPF` | 0-1 | — | Número do Cadastro de Atividade Econômica da Pessoa Física (CAEPF). |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/IM` | 0-1 | ✔ | Número do indicador municipal do fornecedor. |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/xNome` | 1-1 | ✔ | Nome / Razão Social do fornecedor. |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/end/endNac` | 1-1 | ✔ | Grupo de informações do endereço nacional. |  | E0492 |
| `valores/vDedRed/documentos/docDedRed/fornec/end/endNac/cMun` | 1-1 | ✔ | Código do município do endereço do fornecedor. (Tabela do IBGE) | Municípios IBGE (5.570) | E0494 |
| `valores/vDedRed/documentos/docDedRed/fornec/end/endNac/CEP` | 1-1 | ✔ | Código numérico do Endereçamento Postal nacional (CEP) do endereço do fornecedor. |  | E0496 |
| `valores/vDedRed/documentos/docDedRed/fornec/end/endExt` | 1-1 | — | Grupo de informações do endereço no exterior. |  | E0498 |
| `valores/vDedRed/documentos/docDedRed/fornec/end/endExt/cPais` | 1-1 | — | Código do país do endereço do prestador do fornecedor. (Tabela de Países ISO) | Países ISO2 (250) | E0499 |
| `valores/vDedRed/documentos/docDedRed/fornec/end/endExt/cEndPost` | 1-1 | — | Código alfanumérico do Endereçamento Postal no exterior do fornecedor. |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/end/endExt/xCidade` | 1-1 | — | Nome da cidade no exterior do fornecedor. |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/end/endExt/xEstProvReg` | 1-1 | — | Estado, província ou região da cidade no exterior do fornecedor. |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/xLgr` | 1-1 | ✔ | Tipo e nome do logradouro do endereço do fornecedor. |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/nro` | 1-1 | ✔ | Número no logradouro do endereço do fornecedor. |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/xCpl` | 0-1 | ✔ | Complemento do endereço do fornecedor. |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/xBairro` | 1-1 | ✔ | Bairro do endereço do fornecedor. |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/fone` | 0-1 | ✔ | Número do telefone do fornecedor. (Preencher com o Código DDD + número do telefone. Nas operações com exterior é permitido informar o código do país + código da localidade + número do telefone) |  |  |
| `valores/vDedRed/documentos/docDedRed/fornec/email` | 0-1 | ✔ | E-mail do fornecedor. |  |  |
| `valores/trib/tribMun/tribISSQN` | 1-1 | ✔ | Tributação do ISSQN sobre o serviço prestado: 1 - Operação tributável; 2 - Imunidade; 3 - Exportação de serviço; 4 - Não Incidência; | `1` Operação tributável<br>`2` Imunidade<br>`3` Exportação de serviço<br>`4` Não Incidência | E0529 |
| `valores/trib/tribMun/cPaisResult` | 0-1 | — | Código do país onde ocorreu o resultado do serviço prestado. (Tabela de Países ISO) — Se houver indicação pelo emitente de exportação de serviço, mesmo não havendo nenhum elemento para a ocorrência de exportação, então o emitente deve indicar em qual país o… | Países ISO2 | E0590 |
| `valores/trib/tribMun/tpImunidade` | 0-1 | — | Identificação da Imunidade do ISSQN – somente para o caso de Imunidade. Tipos de Imunidades: 0 - Imunidade (tipo não informado na nota de origem); 1 - Patrimônio, renda ou serviços, uns dos outros (CF88, Art 150, VI, a); 2 - Entidades religiosas e templos d… | `0` Imunidade (tipo não informado na nota de origem)<br>`1` Patrimônio, renda ou serviços, uns dos outros (CF88, Art 150, VI, a)<br>`2` Templos de qualquer culto (CF88, Art 150, VI, b)<br>`3` Patrimônio, renda ou serviços dos partidos políticos, inclusive suas fundações, das entidades sindicais dos trabalhadores, das instituições de educação e de assistência social, sem fins lucrativos, atendidos os requisitos da lei (CF88, Art 150, VI, c)<br>`4` Livros, jornais, periódicos e o papel destinado a sua impressão (CF88, Art 150, VI, d)<br>`5` Fonogramas e videofonogramas musicais produzidos no Brasil contendo obras musicais ou literomusicais de autores brasileiros e/ou obras em geral interpretadas por artistas brasileiros bem como os suportes materiais ou arquivos digitais que os contenham, salvo na etapa de replicação industrial de mídias ópticas de leitura a laser. (CF88, Art 150, VI, e) | E0592 |
| `valores/trib/tribMun/exigSusp/tpSusp` | 1-1 | — | Opção para Exigibilidade Suspensa: 1 - Exigibilidade do ISSQN Suspensa por Decisão Judicial; 2 - Exigibilidade do ISSQN Suspensa por Processo Administrativo; | `1` Exigibilidade Suspensa por Decisão Judicial<br>`2` Exigibilidade Suspensa por Processo Administrativo |  |
| `valores/trib/tribMun/exigSusp/nProcesso` | 1-1 | — | Número do processo judicial ou administrativo de suspensão da exigibilidade. |  |  |
| `valores/trib/tribMun/BM/nBM` | 1-1 | — | Identificador do benefício parametrizado pelo município. Trata-se de um identificador único que foi gerado pelo Sistema Nacional no momento em que o município de incidência do ISSQN incluiu o benefício no sistema. Critério de formação do número de identific… |  |  |
| `valores/trib/tribMun/BM/vRedBCBM` | 0-1 | — | Valor monetário (R$) informado pelo emitente para redução da base de cálculo (BC) do ISSQN devido a um Benefício Municipal (BM). |  |  |
| `valores/trib/tribMun/BM/pRedBCBM` | 0-1 | — | Valor percentual (%) informado pelo emitente para redução da base de cálculo (BC) do ISSQN devido a um Benefício Municipal (BM). — O limite para este valor percentual informado pelo emitente está previamente parametrizado pelo município de incidência no cad… |  |  |
| `valores/trib/tribMun/tpRetISSQN` | 1-1 | ✔ | Tipo de retencao do ISSQN: 1 - Não Retido; 2 - Retido pelo Tomador; 3 - Retido pelo Intermediario; | `1` Não Retido<br>`2` Retido pelo Tomador<br>`3` Retido pelo Intermediario | E0580 |
| `valores/trib/tribMun/pAliq` | 0-1 | ✔ | Valor da alíquota (%) do serviço prestado relativo ao município sujeito ativo (município de incidência) do ISSQN. — Se o município de incidência pertence ao Sistema Nacional NFS-e a alíquota estará parametrizada e, portanto, será fornecida pelo sistema. Se … |  | E0595 |
| `valores/trib/tribFed/piscofins/CST` | 1-1 | ✔ | Código de Situação Tributária do PIS/COFINS (CST): 00 - Nenhum; 01 - Operação Tributável com Alíquota Básica; 02 - Operação Tributável com Alíquota Diferenciada; 03 - Operação Tributável com Alíquota por Unidade de Medida de Produto; 04 - Operação Tributáve… | CST PIS/COFINS (lista XSD) |  |
| `valores/trib/tribFed/piscofins/vBCPisCofins` | 0-1 | ✔ | Valor da Base de Cálculo do PIS/COFINS, relativo à apuração própria (R$). |  | E0677 |
| `valores/trib/tribFed/piscofins/pAliqPis` | 0-1 | ✔ | Alíquota do PIS, relativa à apuração própria (%). |  | E0686 |
| `valores/trib/tribFed/piscofins/pAliqCofins` | 0-1 | ✔ | Alíquota da COFINS, relativa à apuração própria (%). |  | E0692 |
| `valores/trib/tribFed/piscofins/vPis` | 0-1 | ✔ | Valor do débito de PIS apuração própria (R$). |  | E0694 |
| `valores/trib/tribFed/piscofins/vCofins` | 0-1 | ✔ | Valor do débito de COFINS apuração própria (R$). |  | E0696 |
| `valores/trib/tribFed/piscofins/tpRetPisCofins` | 0-1 | ✔ | Tipo de retenção PIS/COFINS e CSLL: 0 - PIS/COFINS/CSLL Não Retidos; 1 - PIS/COFINS Retido; 2 - PIS/COFINS Não Retido; 3 - PIS/COFINS/CSLL Retidos; 4 - PIS/COFINS Retidos, CSLL Não Retido; 5 - PIS Retido, COFINS/CSLL Não Retido; 6 - COFINS Retido, PIS/CSLL … | 10 opções (`TSTipoRetPISCofins`) |  |
| `valores/trib/tribFed/vRetCP` | 0-1 | ✔ | Valor monetário do CP(R$). |  | E0699 |
| `valores/trib/tribFed/vRetIRRF` | 0-1 | ✔ | Valor monetário do IRRF (R$). |  | E0700 |
| `valores/trib/tribFed/vRetCSLL` | 0-1 | ✔ | Valor monetário do CSLL (R$). |  | E0720 |
| `valores/trib/totTrib/vTotTrib` | 1-1 | ✔ | Valor monetário total aproximado dos tributos, em conformidade com o artigo 1o da Lei no 12.741/2012 |  |  |
| `valores/trib/totTrib/vTotTrib/vTotTribFed` | 1-1 | ✔ | Valor monetário total aproximado dos tributos federais (R$). |  |  |
| `valores/trib/totTrib/vTotTrib/vTotTribEst` | 1-1 | ✔ | Valor monetário total aproximado dos tributos estaduais (R$). |  |  |
| `valores/trib/totTrib/vTotTrib/vTotTribMun` | 1-1 | ✔ | Valor monetário total aproximado dos tributos municipais (R$). |  |  |

## valorestrib

| Campo | Ocorr. | Montador DPS | Descrição | Opções | Rejeições |
|---|---|---|---|---|---|
| `valorestrib/totTrib/pTotTrib` | 1-1 | ✔ | Valor percentual total aproximado dos tributos, em conformidade com o artigo 1o da Lei no 12.741/2012 |  |  |

## Valores e tributos

| Campo | Ocorr. | Montador DPS | Descrição | Opções | Rejeições |
|---|---|---|---|---|---|
| `valores/trib/totTrib/pTotTrib/pTotTribFed` | 1-1 | ✔ | Valor percentual total aproximado dos tributos federais (%). |  |  |
| `valores/trib/totTrib/pTotTrib/pTotTribEst` | 1-1 | ✔ | Valor percentual total aproximado dos tributos estaduais (%). |  |  |
| `valores/trib/totTrib/pTotTrib/pTotTribMun` | 1-1 | ✔ | Valor percentual total aproximado dos tributos municipais (%). |  |  |
| `valores/trib/totTrib/indTotTrib` | 1-1 | ✔ | Indicador de informação de valor total de tributos. Se informado indica que o emitente opta por não informar nenhum valor estimado para os Tributos (Decreto 8.264/2014). 0 - Não; | `0` Não | E0712 |
| `valores/trib/totTrib/pTotTribSN` | 1-1 | ✔ | Valor percentual aproximado do total dos tributos da alíquota do Simples Nacional (%). |  |  |

## IBS/CBS (reforma tributária)

| Campo | Ocorr. | Montador DPS | Descrição | Opções | Rejeições |
|---|---|---|---|---|---|
| `IBSCBS/finNFSe` | 1-1 | ✔ | Indicador da finalidade da emissão de NFS-e 0 = NFS-e regular; | `0` NFS-e regular |  |
| `IBSCBS/indFinal` | 0-1 | ✔ | Indica operação de uso ou consumo pessoal. (art. 57) 0=Não; 1=Sim; — Esse campo será descontinuado a partir da implantação do layout da NT 005 que ocorrerá ao longo de 2026, em data a ser divulgada no portal da NFS-e.I327 | `0` Não<br>`1` Sim |  |
| `IBSCBS/cIndOp` | 1-1 | ✔ | Código indicador da operação de fornecimento, conforme tabela “código indicador de operação” | Indicador de operação (26) | E0901 |
| `IBSCBS/tpOper` | 0-1 | — | Tipo de Operação com Entes Governamentais ou outros serviços sobre bens imóveis: 1 – Fornecimento com pagamento posterior; 2 - Recebimento do pagamento com fornecimento já realizado; 3 – Fornecimento com pagamento já realizado; 4 – Recebimento do pagamento … | `1` Fornecimento com pagamento posterior<br>`2` Recebimento do pagamento com fornecimento já realizado<br>`3` Fornecimento com pagamento já realizado<br>`4` Recebimento do pagamento com fornecimento posterior<br>`5` Fornecimento e recebimento do pagamento concomitantes | E0903 |
| `IBSCBS/gRefNFSe/refNFSe` | 1-99 | — | Chave da NFS-e referenciada. |  | E0907 |
| `IBSCBS/tpEnteGov` | 0-1 | — | Tipo de ente governamental Para administração pública direta e suas autarquias e fundações: 1 = União; 2 = Estado; 3 = Distrito Federal; 4 = Município; — Campo só deve ser informado no caso de compras governamentais. | `1` União<br>`2` Estado<br>`3` Distrito Federal<br>`4` Município |  |
| `IBSCBS/indDest` | 1-1 | ✔ | A respeito do Destinatário dos serviços: 0 – o destinatário é o próprio tomador/adquirente identificado na NFS-e (tomador=adquirente=destinatário); 1 – o destinatário não é o próprio adquirente, podendo ser outra pessoa, física ou jurídica (ou equiparada), … | `0` o destinatário é o próprio tomador/adquirente identificado na NFS-e (tomador = adquirente = destinatário)<br>`1` o destinatário não é o próprio adquirente, podendo ser outra pessoa, física ou jurídica (ou equiparada), ou um estabelecimento diferente do indicado como tomador (tomador = adquirente ≠ destinatário) |  |
| `IBSCBS/dest/CNPJ` | 1-1 | ✔ | Número da inscrição no Cadastro Nacional de Pessoa Jurídica (CNPJ) do destinatário de serviço |  | E0911 |
| `IBSCBS/dest/CPF` | 1-1 | ✔ | Número da inscrição no Cadastro Nacional de Pessoa Física (CPF) do destinatário do serviço |  | E0913 |
| `IBSCBS/dest/NIF` | 1-1 | — | Número de identificação fiscal fornecido por órgão de administração tributária no exterior |  |  |
| `IBSCBS/dest/cNaoNIF` | 1-1 | — | Motivo para não informação do NIF: 0 - Não informado na nota de origem; 1 - Dispensado do NIF; 2 - Não exigência do NIF; | `0` Não informado na nota de origem<br>`1` Dispensado do NIF<br>`2` Não exigência do NIF |  |
| `IBSCBS/dest/xNome` | 1-1 | ✔ | Nome / Nome Empresarial do destinatário |  |  |
| `IBSCBS/dest/end/endNac` | 1-1 | ✔ | Grupo de informações do endereço nacional. |  |  |
| `IBSCBS/dest/end/endNac/cMun` | 1-1 | ✔ | Código do município do endereço do destinatário do serviço. (Tabela do IBGE) | Municípios IBGE (5.570) | E0920 |
| `IBSCBS/dest/end/endNac/CEP` | 1-1 | ✔ | Código numérico do Endereçamento Postal nacional (CEP) do endereço do destinatário do serviço. (Informar os zeros não significativos) |  |  |
| `IBSCBS/dest/end/endExt` | 1-1 | — | Grupo de informações do endereço no exterior. |  |  |
| `IBSCBS/dest/end/endExt/cPais` | 1-1 | — | Código do país do endereço do destinatário do serviço. (Tabela de Países ISO) | Países ISO2 (250) |  |
| `IBSCBS/dest/end/endExt/cEndPost` | 1-1 | — | Código alfanumérico do Endereçamento Postal no exterior do destinatário do serviço. |  |  |
| `IBSCBS/dest/end/endExt/xCidade` | 1-1 | — | Nome da cidade no exterior do destinatário do serviço. |  |  |
| `IBSCBS/dest/end/endExt/xEstProvReg` | 1-1 | — | Estado, província ou região da cidade no exterior do destinatário do serviço. |  |  |
| `IBSCBS/dest/end/xLgr` | 1-1 | ✔ | Tipo e nome do logradouro do endereço do destinatário do serviço. |  |  |
| `IBSCBS/dest/end/nro` | 1-1 | ✔ | Número no logradouro do endereço do destinatário do serviço. |  |  |
| `IBSCBS/dest/end/xCpl` | 0-1 | ✔ | Complemento do endereço do destinatário do serviço. |  |  |
| `IBSCBS/dest/end/xBairro` | 1-1 | ✔ | Bairro do endereço do destinatário do serviço. |  |  |
| `IBSCBS/dest/fone` | 0-1 | ✔ | Número do telefone do destinatário. (Preencher com o Código DDD + número do telefone. Nas operações com exterior é permitido informar o código do país + código da localidade + número do telefone) |  |  |
| `IBSCBS/dest/email` | 0-1 | ✔ | E-mail do destinatário. |  | E0930 |
| `IBSCBS/imovel/inscImobFisc` | 0-1 | — | Inscrição imobiliária fiscal (código fornecido pela prefeitura para a identificação da obra ou para fins de recolhimento do IPTU) |  |  |
| `IBSCBS/imovel/cCIB` | 1-1 | — | Código do Cadastro Imobiliário Brasileiro - CIB |  | E0933 |
| `IBSCBS/imovel/end` | 1-1 | ✔ | Grupo de informações do endereço do imóvel. |  |  |
| `IBSCBS/imovel/end/CEP` | 1-1 | ✔ | Código numérico do Endereçamento Postal nacional (CEP) do endereço do imóvel. (Informar os zeros não significativos) |  |  |
| `IBSCBS/imovel/end/endExt` | 1-1 | — | Grupo de informações descritivas do endereço do imóvel no exterior. |  | E0934 |
| `IBSCBS/imovel/end/endExt/cEndPost` | 1-1 | — | Código de Endereçamento Postal alfanumérico do endereço do imóvel no exterior. |  |  |
| `IBSCBS/imovel/end/endExt/xCidade` | 1-1 | — | Nome da cidade no exterior, local do imóvel. |  |  |
| `IBSCBS/imovel/end/endExt/xEstProvReg` | 1-1 | — | Estado, província ou região da cidade no exterior, local do imóvel. |  |  |
| `IBSCBS/imovel/end/xLgr` | 1-1 | ✔ | Tipo e nome do logradouro do endereço do imóvel. |  |  |
| `IBSCBS/imovel/end/nro` | 1-1 | ✔ | Número no logradouro do endereço do imóvel. |  |  |
| `IBSCBS/imovel/end/xCpl` | 0-1 | ✔ | Complemento do endereço do imóvel. |  |  |
| `IBSCBS/imovel/end/xBairro` | 1-1 | ✔ | Bairro do endereço do imóvel. |  |  |
| `IBSCBS/valores/gReeRepRes/documentos/dFeNacional` | 1-1 | — | Grupo de informações de documentos fiscais eletrônicos que se encontram no repositório nacional. |  |  |
| `IBSCBS/valores/gReeRepRes/documentos/dFeNacional/tipoChaveDFe` | 1-1 | — | Documento fiscal a que se refere a chaveDfe que seja um dos documentos do Repositório Nacional: 1 = NFS-e; 2 = NF-e; 3 = CT-e; 9 = Outro; | `1` NFS-e<br>`2` NF-e<br>`3` CT-e<br>`9` Outro |  |
| `IBSCBS/valores/gReeRepRes/documentos/dFeNacional/xTipoChaveDFe` | 0-1 | — | Descrição da DF-e a que se refere a chaveDfe que seja um dos documentos do Repositório Nacional. Deve ser preenchido apenas quando tipoChaveDFe = 9 (Outro). |  |  |
| `IBSCBS/valores/gReeRepRes/documentos/dFeNacional/chaveDFe` | 1-1 | — | Chave do Documento Fiscal eletrônico do repositório nacional referenciado para os casos de operações já tributadas. |  | E0940 |
| `IBSCBS/valores/gReeRepRes/documentos/docFiscalOutro` | 1-1 | — | Grupo de informações de documento fiscais, eletrônicos ou não, que não se encontram no repositório nacional. |  | E0942 |
| `IBSCBS/valores/gReeRepRes/documentos/docFiscalOutro/cMunDocFiscal` | 1-1 | — | Código do município emissor do documento fiscal que não se encontra no repositório nacional |  | E0943 |
| `IBSCBS/valores/gReeRepRes/documentos/docFiscalOutro/nDocFiscal` | 1-1 | — | Número do documento fiscal que não se encontra no repositório nacional |  |  |
| `IBSCBS/valores/gReeRepRes/documentos/docFiscalOutro/xDocFiscal` | 1-1 | — | Descrição do documento fiscal |  |  |
| `IBSCBS/valores/gReeRepRes/documentos/docOutro` | 1-1 | — | Grupo de informações de documento não fiscal. |  |  |
| `IBSCBS/valores/gReeRepRes/documentos/docOutro/nDoc` | 1-1 | — | Número do documento não fiscal. |  |  |
| `IBSCBS/valores/gReeRepRes/documentos/docOutro/xDoc` | 1-1 | — | Descrição do documento não fiscal. |  |  |
| `IBSCBS/valores/gReeRepRes/documentos/fornec/CNPJ` | 1-1 | ✔ | Número da inscrição federal (CNPJ) do fornecedor. |  | E0945 |
| `IBSCBS/valores/gReeRepRes/documentos/fornec/CPF` | 1-1 | ✔ | Número da inscrição federal (CPF) do fornecedor. |  | E0947 |
| `IBSCBS/valores/gReeRepRes/documentos/fornec/NIF` | 1-1 | — | Este elemento só deverá ser preenchido para fornecedores não residentes no Brasil. |  |  |
| `IBSCBS/valores/gReeRepRes/documentos/fornec/cNaoNIF` | 1-1 | — | Motivo para não informação do NIF: 0 - Não informado na nota de origem; 1 - Dispensado do NIF; 2 - Não exigência do NIF; — O valor 0 deve ser utilizado como opção de preenchimento do campo somente no compartilhamento de NFS-e pelo municipio com o ADN NFS-e. | `0` Não informado na nota de origem<br>`1` Dispensado do NIF<br>`2` Não exigência do NIF |  |
| `IBSCBS/valores/gReeRepRes/documentos/fornec/xNome` | 1-1 | ✔ | Nome / Razão Social do fornecedor. |  |  |
| `IBSCBS/valores/gReeRepRes/documentos/dtEmiDoc` | 1-1 | — | Data da emissão do documento dedutível. Ano, mês e dia (AAAA-MM-DD) |  | E0950 |
| `IBSCBS/valores/gReeRepRes/documentos/dtCompDoc` | 1-1 | — | Data da competência do documento dedutível. Ano, mês e dia (AAAA-MM-DD) |  | E0951 |
| `IBSCBS/valores/gReeRepRes/documentos/tpReeRepRes` | 1-1 | — | Tipo de valor incluído neste documento, recebido por motivo de estarem relacionadas a operações de terceiros, objeto de reembolso, repasse ou ressarcimento pelo recebedor, já tributados e aqui referenciados 01 = Repasse de remuneração por intermediação de i… | `01` Repasse de remuneração por intermediação de imóveis a demais corretores envolvidos na operação<br>`02` Repasse de valores a fornecedor relativo a fornecimento intermediado por agência de turismo<br>`03` Reembolso ou ressarcimento recebido por agência de propaganda e publicidade por valores pagos relativos<br>`04` Reembolso ou ressarcimento recebido por agência de propaganda e publicidade por valores pagos relativos<br>`99` Outros reembolsos ou ressarcimentos recebidos por valores pagos relativos a operações por conta e ordem de terceiro |  |
| `IBSCBS/valores/gReeRepRes/documentos/xTpReeRepRes` | 0-1 | — | Descrição do reembolso ou ressarcimento quando a opção é "99 – Outros reembolsos ou ressarcimentos recebidos por valores pagos relativos a operações por conta e ordem de terceiro". |  | E0952 |
| `IBSCBS/valores/gReeRepRes/documentos/vlrReeRepRes` | 1-1 | — | Valor monetário (total ou parcial, conforme documento informado) utilizado para não inclusão na base de cálculo do ISS e do IBS e da CBS da NFS-e que está sendo emitida (R$). |  | E0953 |
| `IBSCBS/valores/trib/gIBSCBS/CST` | 1-1 | ✔ | Código de Situação Tributária do IBS e da CBS | CST IBS/CBS (18) |  |
| `IBSCBS/valores/trib/gIBSCBS/cClassTrib` | 1-1 | ✔ | Código de Classificação Tributária do IBS e da CBS | cClassTrib IBS/CBS (73 p/ NFS-e) | E0958 |
| `IBSCBS/valores/trib/gIBSCBS/cCredPres` | 0-1 | — | Código e classificação do crédito presumido: IBS e CBS. |  |  |
| `IBSCBS/valores/trib/gIBSCBS/gTribRegular/CSTReg` | 1-1 | — | Código de Situação Tributária do IBS e da CBS de tributação regular |  |  |
| `IBSCBS/valores/trib/gIBSCBS/gTribRegular/cClassTribReg` | 1-1 | — | Código da Classificação Tributária do IBS e da CBS de tributação regular | cClassTrib IBS/CBS | E0969 |
| `IBSCBS/valores/trib/gIBSCBS/gDif/pDifUF` | 1-1 | — | Percentual de diferimento para o IBS estadual. |  |  |
| `IBSCBS/valores/trib/gIBSCBS/gDif/pDifMun` | 1-1 | — | Percentual de diferimento para o IBS municipal. |  |  |
| `IBSCBS/valores/trib/gIBSCBS/gDif/pDifCBS` | 1-1 | — | Percentual de diferimento para a CBS. |  |  |

## Serviços com grupo de detalhamento obrigatório

Pelo Anexo I (aba MUN.INCID_INFO.SERV.), estes códigos exigem um grupo extra na DPS:

| Grupo | Serviços |
|---|---|
| `obra` | 13: 07.02.01, 07.02.02, 07.04.01, 07.05.01, 07.05.02, 07.06.01, 07.06.02, 07.07.01, 07.08.01, 07.17.01, 07.19.01, 14.14.03, 14.14.04 |
| `atvEvento` | 19: 12.01.01, 12.02.01, 12.03.01, 12.04.01, 12.05.01, 12.06.01, 12.07.01, 12.08.01, 12.09.01, 12.09.02, 12.09.03, 12.10.01, 12.11.01, 12.12.01, 12.13.01, 12.14.01, 12.15.01, 12.16.01, 12.17.01 |

Local de incidência do ISS por serviço (EP = estabelecimento do prestador, LP = local da prestação, ET = tomador): EP: 277, LP: 57, ET: 1, —: 2.

## IBS/CBS — CST e cClassTrib válidos para NFS-e

| CST | cClassTrib | Descrição | Redução IBS/CBS |
|---|---|---|---|
| 000 Tributação integral | `000001` | Situações tributadas integralmente pelo IBS e CBS. | 0% / 0% |
| 000 Tributação integral | `000006` | Situações tributadas integralmente pelo IBS e CBS realizadas por autônomo | 0% / 0% |
| 010 Tributação com alíquotas uniformes | `010001` | Operações do FGTS não realizadas pela Caixa Econômica Federal, observado o art. 212 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 010 Tributação com alíquotas uniformes | `010002` | Operações do serviço financeiro | 0% / 0% |
| 011 Tributação com alíquotas uniformes reduzidas | `011003` | Intermediação de planos de assistência à saúde, observado o art. 240 da Lei Complementar nº 214, de 2025. | 60% / 60% |
| 200 Alíquota reduzida | `200001` | Serviços de transporte de bens até as zonas de processamento de exportação e bens exportados a partir das zonas de processamento de exportação, observ | 100% / 100% |
| 200 Alíquota reduzida | `200004` | Fornecimento de dispositivos médicos com a especificação das respectivas classificações da NCM/SH previstas no Anexo XII da Lei Complementar nº 214, d | 100% / 100% |
| 200 Alíquota reduzida | `200005` | Fornecimento de dispositivos médicos com a especificação das respectivas classificações da NCM/SH previstas no Anexo IV da Lei Complementar nº 214, de | 100% / 100% |
| 200 Alíquota reduzida | `200006` | Situação de emergência de saúde pública reconhecida pelo Poder Legislativo federal, estadual, distrital ou municipal competente, ato conjunto do Minis | 100% / 100% |
| 200 Alíquota reduzida | `200007` | Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência relacionados no Anexo XIII da Lei Complementar nº 214, de 2025,  | 100% / 100% |
| 200 Alíquota reduzida | `200008` | Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência relacionados no Anexo V da Lei Complementar nº 214, de 2025, com | 100% / 100% |
| 200 Alíquota reduzida | `200016` | Prestação de serviços de pesquisa e desenvolvimento por Instituição Científica, Tecnológica e de Inovação (ICT) sem fins lucrativos para a administraç | 100% / 100% |
| 200 Alíquota reduzida | `200017` | Operações relacionadas ao FGTS, considerando aquelas necessárias à aplicação da Lei nº 8.036, de 1990, realizadas pelo Conselho Curador ou Secretaria  | 100% / 100% |
| 200 Alíquota reduzida | `200019` | Importador dos serviços financeiros que seja contribuinte e tenha direito de apropriação de créditos na aquisição do mesmo serviço financeiro no País, | 100% / 100% |
| 200 Alíquota reduzida | `200020` | Operação praticada por sociedades cooperativas optantes por regime específico do IBS e CBS, quando o associado destinar bem ou serviço à cooperativa d | 100% / 100% |
| 200 Alíquota reduzida | `200021` | Serviços de transporte público coletivo de passageiros ferroviário e hidroviário urbanos, semiurbanos e metropolitanos, observado o art. 285 da Lei Co | 100% / 100% |
| 200 Alíquota reduzida | `200025` | Fornecimento dos serviços de educação relacionados ao Programa Universidade para Todos (Prouni), instituído pela Lei nº 11.096, de 13 de janeiro de 20 | 60% / 100% |
| 200 Alíquota reduzida | `200026` | Locação de imóveis localizados nas zonas reabilitadas, pelo prazo de 5 (cinco) anos, contado da data de expedição do habite-se, e relacionados a proje | 80% / 80% |
| 200 Alíquota reduzida | `200027` | Operações de locação, cessão onerosa e arrendamento de bens imóveis, observado o art. 261 da Lei Complementar nº 214, de 2025. | 70% / 70% |
| 200 Alíquota reduzida | `200028` | Fornecimento dos serviços de educação relacionados no Anexo II da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações | 60% / 60% |
| 200 Alíquota reduzida | `200029` | Fornecimento dos serviços de saúde humana relacionados no Anexo III da Lei Complementar nº 214, de 2025, com a especificação das respectivas classific | 60% / 60% |
| 200 Alíquota reduzida | `200030` | Venda dos dispositivos médicos relacionados no Anexo IV da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM | 60% / 60% |
| 200 Alíquota reduzida | `200031` | Fornecimento dos dispositivos de acessibilidade próprios para pessoas com deficiência relacionados no Anexo V da Lei Complementar nº 214, de 2025, com | 60% / 60% |
| 200 Alíquota reduzida | `200037` | Fornecimento de serviços ambientais de conservação ou recuperação da vegetação nativa, mesmo que fornecidos sob a forma de manejo sustentável de siste | 60% / 60% |
| 200 Alíquota reduzida | `200038` | Fornecimento dos insumos agropecuários e aquícolas relacionados no Anexo IX da Lei Complementar nº 214, de 2025, com a especificação das respectivas c | 60% / 60% |
| 200 Alíquota reduzida | `200039` | Fornecimento dos bens e serviços listados no Anexo X da Lei Complementar nº 214, de 2025, com a especificação das respectivas classificações da NCM/SH | 60% / 60% |
| 200 Alíquota reduzida | `200040` | Fornec dos seguintes serv de comunic instit à admin púb direta, autarq e fund púb: serviços direcionados ao planej, criação, programação e manutenção  | 60% / 60% |
| 200 Alíquota reduzida | `200041` | Operações relacionadas às seguintes atividades desportivas: fornecimento de serviço de educação desportiva, classificado no código 1.2205.12.00 da NBS | 60% / 60% |
| 200 Alíquota reduzida | `200042` | Operações relacionadas às seguintes atividades desportivas: gestão e exploração do desporto por associações e clubes esportivos filiados ao órgão esta | 60% / 60% |
| 200 Alíquota reduzida | `200043` | Fornecimento à administração pública direta, autarquias e fundações púbicas dos serviços e dos bens relativos à soberania e à segurança nacional, à se | 60% / 60% |
| 200 Alíquota reduzida | `200044` | Operações e prestações de serviços de segurança da informação e segurança cibernética desenvolvidos por sociedade que tenha sócio brasileiro com o mín | 60% / 60% |
| 200 Alíquota reduzida | `200045` | Operações relacionadas a projetos de reabilitação urbana de zonas históricas e de áreas críticas de recuperação e reconversão urbanística dos Municípi | 60% / 60% |
| 200 Alíquota reduzida | `200046` | Operações com bens imóveis, observado o art. 261 da Lei Complementar nº 214, de 2025. | 50% / 50% |
| 200 Alíquota reduzida | `200048` | Hotelaria, Parques de Diversão e Parques Temáticos, observado o art. 281 da Lei Complementar nº 214, de 2025. | 40% / 40% |
| 200 Alíquota reduzida | `200051` | Agências de Turismo, observado o art. 289 da Lei Complementar nº 214, de 2025. | 40% / 40% |
| 200 Alíquota reduzida | `200052` | Prestação de serviços das seguintes profissões intelectuais de natureza científica, literária ou artística, submetidas à fiscalização por conselho pro | 30% / 30% |
| 200 Alíquota reduzida | `200054` | Fornecimento de bem material pela cooperativa de produção agropecuária a associado não sujeito ao regime regular do IBS e da CBS com anulação de crédi | 100% / 100% |
| 200 Alíquota reduzida | `200055` | Fornecimento dos serviços com redução de alíquota de 60% realizado por autônomo, observado o art. 128 da Lei Complementar nº 214, de 2025. | 60% / 60% |
| 200 Alíquota reduzida | `200056` | Fornecimento dos serviços com redução de alíquota de 30% realizado por autônomo, observado o art. 127 da Lei Complementar nº 214, de 2025. | 30% / 30% |
| 221 Alíquota fixa proporcional | `221001` | Locação, cessão onerosa ou arrendamento de bem imóvel com alíquota sobre a receita bruta, observado o art. 487 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 400 Isenção | `400001` | Fornecimento de serviços de transporte público coletivo de passageiros rodoviário e metroviário de caráter urbano, semiurbano e metropolitano, sob reg | 0% / 0% |
| 410 Imunidade e não incidência | `410001` | Fornecimento de bonificações quando constem do respectivo documento fiscal e que não dependam de evento posterior, observado o art. 5º da Lei Compleme | 0% / 0% |
| 410 Imunidade e não incidência | `410003` | Doações e amostras grátis que não tenham por objeto bens ou serviços que tenham permitido a apropriação de créditos pelo doador, observado o art. 6º d | 0% / 0% |
| 410 Imunidade e não incidência | `410004` | Exportações de bens e serviços, observado o art. 8º da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 410 Imunidade e não incidência | `410005` | Fornecimentos realizados pela União, pelos Estados, pelo Distrito Federal e pelos Municípios, observado o art. 9º da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 410 Imunidade e não incidência | `410006` | Fornecimentos realizados por entidades religiosas e templos de qualquer culto, inclusive suas organizações assistenciais e beneficentes, observado o a | 0% / 0% |
| 410 Imunidade e não incidência | `410007` | Fornecimentos realizados por partidos políticos, inclusive suas fundações, entidades sindicais dos trabalhadores e instituições de educação e de assis | 0% / 0% |
| 410 Imunidade e não incidência | `410008` | Fornecimentos de livros, jornais, periódicos e do papel destinado a sua impressão, observado o art. 9º da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 410 Imunidade e não incidência | `410009` | Fornecimentos de fonogramas e videofonogramas musicais produzidos no Brasil contendo obras musicais ou literomusicais de autores brasileiros e/ou obra | 0% / 0% |
| 410 Imunidade e não incidência | `410010` | Fornecimentos de serviço de comunicação nas modalidades de radiodifusão sonora e de sons e imagens de recepção livre e gratuita, observado o art. 9º d | 0% / 0% |
| 410 Imunidade e não incidência | `410012` | Fornecimento de condomínio edilício não optante pelo regime regular, observado o art. 26 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 410 Imunidade e não incidência | `410014` | Fornecimento de produtor rural não contribuinte, observado o art. 164 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 410 Imunidade e não incidência | `410015` | Fornecimento por transportador autônomo não contribuinte, observado o art. 169 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 410 Imunidade e não incidência | `410026` | Doações e amostras grátis sem contraprestação em benefício do doador, com anulação de crédito apropriados pelo doador referente ao fornecimento doado, | 0% / 0% |
| 410 Imunidade e não incidência | `410027` | Fornecimento de bens e serviços, desde que vinculados direta e exclusivamente à exportação de bens materiais ou associados à entrega no exterior de be | 0% / 0% |
| 410 Imunidade e não incidência | `410033` | Operações com bens imóveis, inclusive operações com direitos reais sobre bens imóveis, realizadas por Fundos de Investimento Imobiliário (FII) e Fundo | 0% / 0% |
| 410 Imunidade e não incidência | `410035` | Fornecimento realizado por nanoempreendedor, observado o art. 26 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 410 Imunidade e não incidência | `410999` | Operações não onerosas sem previsão de tributação, não especificadas anteriormente, observado o art. 4º da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 515 Diferimento com redução de alíquota | `515001` | Operações, sujeitas a diferimento, com insumos agropecuários e aquícolas, observado o art. 138 da Lei Complementar nº 214, de 2025. | 60% / 60% |
| 550 Suspensão | `550016` | Regime Especial de Incentivos para o Desenvolvimento da Infraestrutura - Reidi, observado o art. 106 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 550 Suspensão | `550022` | Regime Especial de Incentivos para a Produção de Hidrogênio de Baixa Emissão de Carbono (Rehidro), observado o art. 106 da Lei Complementar nº 214, de | 0% / 0% |
| 800 Transferência de crédito | `800001` | Fusão, cisão ou incorporação, observado o art. 55 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 800 Transferência de crédito | `800002` | Transferência de crédito do associado, inclusive as cooperativas singulares, para cooperativa de que participa das operações antecedentes às operações | 0% / 0% |
| 811 Ajustes | `811001` | Anulação de crédito proporcional ao valor das operações imunes e isentas, observado o art. 51 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 811 Ajustes | `811002` | Débitos de notas fiscais não processadas na apuração, observado o art. 45 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 811 Ajustes | `811003` | Débitos apurados após o desenquadramento do regime Simples Nacional, observado o art. 41 da Lei Complementar nº 214, de 2025. | 0% / 0% |
| 820 Tributação em documento específico | `820001` | Documento com informações de fornecimento de serviços de planos de assistência à saúde elencados no art. 234 da Lei Complementar nº 214, de 2025, mas  | 0% / 0% |
| 820 Tributação em documento específico | `820002` | Documento com informações de fornecimento de serviços de planos de assinstência funerária, mas com tributação realizada por outro meio, observado o ar | 0% / 0% |
| 820 Tributação em documento específico | `820003` | Documento com informações de fornecimento de serviços de planos de assinstência à saúde de animais domésticos, mas com tributação realizada por outro  | 0% / 0% |
| 820 Tributação em documento específico | `820004` | Documento com informações de prestação de serviços de consursos de prognósticos, mas com tributação realizada por outro meio, observado o art. 248 da  | 0% / 0% |
| 820 Tributação em documento específico | `820006` | Documento com informações de fornecimento de serviços de exploração de via, mas com tributação realizada por outro meio, observado o art. 11 da Lei Co | 0% / 0% |
| 820 Tributação em documento específico | `820007` | Documento com informações de fornecimento de serviços financeiros, mas com tributação realizada por outro meio, observado o art. 181 da Lei Complement | 0% / 0% |
| 820 Tributação em documento específico | `820009` | Fornecimentos declarados e tributados em outro documento, observado o art. 60 da Lei Complementar nº 214, de 2025. | 0% / 0% |
