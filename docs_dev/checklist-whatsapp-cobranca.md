# Checklist tecnico - cobranca automatica por WhatsApp

Status inicial em 2026-05-08.

Objetivo: permitir aviso automatico de vencimento e atraso de mensalidades via WhatsApp, com rastreio completo de envio, entrega, leitura, resposta e falha, sem gerar duplicidade de cobranca nem expor dados financeiros sensiveis.

## 1. Escopo funcional fechado

Fluxos cobertos neste modulo:

- aviso `D-7` antes do vencimento;
- aviso `D-3` antes do vencimento;
- aviso `D0` no dia do vencimento;
- aviso `D+3` apos vencimento;
- aviso `D+7` de atraso mais critico;
- confirmacao de baixa/pagamento;
- envio manual assistido pelo operador;
- recepcao de webhook de status e resposta.

Premissas de negocio obrigatorias:

- o pagador precisa estar vinculado ao cliente/CNPJ correto;
- a mensalidade precisa existir como `lancamento` recorrente e rastreavel;
- o cliente/responsavel precisa ter telefone WhatsApp valido;
- o cliente/responsavel precisa ter consentimento ativo para cobranca;
- a automacao nao pode disparar duas vezes a mesma etapa para o mesmo lancamento;
- a regua precisa ser configuravel por ambiente/tenant.

Decisoes tecnicas fechadas:

- usar WhatsApp Business Platform oficial via Cloud API;
- enviar mensagens somente por backend;
- usar templates aprovados para mensagens iniciadas pela empresa;
- receber status e respostas por webhook proprio;
- nao usar automacao via WhatsApp Web;
- toda automacao precisa ser idempotente por `lancamentoId + etapaRegua + dataBase`.

Legenda:

- [ ] Pendente
- [~] Em andamento
- [x] Concluido

## 2. Modelo de dados

### 2.1 Cliente e responsavel financeiro

- [x] Adicionar no cadastro do cliente os campos:
  - `whatsapp`
  - `whatsappFinanceiro`
  - `aceiteWhatsAppCobranca`
  - `aceiteWhatsAppCobrancaEm`
  - `aceiteWhatsAppCobrancaOrigem`
  - `responsavelFinanceiroNome`
  - `responsavelFinanceiroCargo`
  - `responsavelFinanceiroEmail`
  - `responsavelFinanceiroTelefone`
  - `responsavelFinanceiroWhatsapp`
  - `responsavelFinanceiroPreferencial`
  - `whatsappCobrancaPausado`
  - `whatsappCobrancaPausadoMotivo`
  - `whatsappCobrancaPausadoEm`
  - `whatsappCobrancaPausadoPor`
  - Criterio de aceite: cliente pode ter contato principal e contato financeiro separados, com consentimento e pausa operacional independentes.

- [x] Definir contato preferencial de cobranca.
  - Regra sugerida:
    1. `responsavelFinanceiroWhatsapp` quando existir e estiver ativo;
    2. `whatsappFinanceiro`;
    3. `whatsapp` do cliente.
  - Criterio de aceite: o backend resolve um unico destino primario para cada lancamento.

### 2.2 Lancamento financeiro

- [x] Adicionar no `lancamento` os campos minimos:
  - `cobrancaWhatsappEnabled`
  - `statusWhatsappCobranca`
  - `ultimoEnvioWhatsappEm`
  - `proximaAcaoWhatsappEm`
  - `ultimaMensagemWhatsappId`
  - `etapaWhatsappAtual`
  - `whatsappCobrancaPausada`
  - `whatsappCobrancaPausadaMotivo`
  - `whatsappCobrancaIgnorada`
  - `whatsappCobrancaExigeAprovacao`
  - `servicoId`
  - `clienteServicoId`
  - `pagadorNome`
  - `pagadorWhatsapp`
  - Criterio de aceite: cada lancamento sabe se entra ou nao na regua, em que etapa esta e qual foi a ultima interacao.

- [~] Garantir vinculo explicito entre:
  - cliente;
  - servico contratado;
  - lancamento;
  - responsavel de cobranca.
  - Criterio de aceite: nao existe mensagem automatica disparada para um lancamento sem origem comercial/financeira clara.

### 2.3 Novas colecoes

- [x] Criar `whatsapp_templates`.
  - Campos minimos:
    - `tenantId`
    - `templateKey`
    - `providerTemplateName`
    - `providerLanguage`
    - `categoria`
    - `ativo`
    - `variaveisEsperadas`
    - `canal`
    - `aprovadoProvider`
  - Criterio de aceite: a plataforma referencia templates por chave interna, sem hardcode no envio.

- [x] Criar `whatsapp_campaign_rules`.
  - Campos minimos:
    - `tenantId`
    - `ativo`
    - `diasAntes`
    - `diasDepois`
    - `etapa`
    - `templateKey`
    - `usarDiasUteis`
    - `horaMinima`
    - `horaMaxima`
    - `exigeAprovacao`
    - `prioridade`
  - Criterio de aceite: a regua e configurada por dados, nao por codigo.

- [x] Criar `whatsapp_jobs`.
  - Campos minimos:
    - `tenantId`
    - `jobKey`
    - `clienteId`
    - `lancamentoId`
    - `messageId`
    - `etapa`
    - `status`
    - `scheduledFor`
    - `attemptCount`
    - `lastAttemptAt`
    - `nextRetryAt`
    - `erro`
    - `detalhes`
  - Criterio de aceite: cada envio planejado vira job rastreavel e idempotente.

- [x] Criar `whatsapp_messages`.
  - Campos minimos:
    - `tenantId`
    - `clienteId`
    - `lancamentoId`
    - `jobId`
    - `templateKey`
    - `etapa`
    - `status`
    - `providerMessageId`
    - `payloadResumo`
    - `responseResumo`
    - `erro`
    - `detalhes`
    - `contatoDestino`
    - `criadoEm`
    - `atualizadoEm`
  - Criterio de aceite: a plataforma consulta historico e status sem depender de logs volateis.

- [x] Criar `whatsapp_webhook_events`.
  - Campos minimos:
    - `tenantId`
    - `providerMessageId`
    - `eventType`
    - `payloadResumo`
    - `receivedAt`
    - `processedAt`
    - `dedupeKey`
  - Criterio de aceite: webhook e auditavel, reprocessavel e deduplicado.

## 3. Frontend

### 3.1 Cadastro do cliente

- [x] Exibir secao "Cobranca por WhatsApp" no cadastro/edicao do cliente.
  - Campos:
    - contato financeiro;
    - WhatsApp preferencial;
    - consentimento;
    - origem do consentimento;
    - pausa de cobranca.
  - Criterio de aceite: operador consegue configurar o destino e a autorizacao sem depender de planilha externa.

- [x] Validar telefone WhatsApp no frontend.
  - Criterio de aceite: normalizar para E.164 ou formato padrao interno antes de persistir.

### 3.2 Financeiro

- [x] Adicionar colunas operacionais na lista de lancamentos:
  - `Pagador`
  - `WhatsApp`
  - `Vencimento`
  - `Status financeiro`
  - `Status WhatsApp`
  - `Ultima acao`
  - `Proxima acao`
  - `Acoes`
  - Criterio de aceite: operador entende, por linha, quem sera cobrado, quando, e em que estado esta a comunicacao.

- [x] Adicionar status visuais de WhatsApp:
  - `nao_agendado`
  - `agendado`
  - `enviado`
  - `entregue`
  - `lido`
  - `respondido`
  - `falhou`
  - `pausado`
  - Criterio de aceite: status aparece em badge padronizado e filtravel.

- [~] Adicionar acoes por lancamento:
  - `Enviar agora`
  - `Reagendar`
  - `Pausar regua`
  - `Retomar regua`
  - `Abrir historico`
  - `Marcar como negociado`
  - Criterio de aceite: operador nao precisa ir para fora do Financeiro para controlar a cobranca.

### 3.3 Cliente 360

- [~] Exibir eventos de WhatsApp na timeline do Cliente 360.
  - Eventos minimos:
    - mensagem enviada;
    - entregue;
    - lida;
    - resposta recebida;
    - falha;
    - pausa/reagendamento manual.
  - Criterio de aceite: timeline do cliente mostra o relacionamento financeiro e nao apenas o status do lancamento.

### 3.4 Telas operacionais dedicadas

- [ ] Criar visao "Cobrancas WhatsApp de hoje".
  - Criterio de aceite: lista jobs agendados/enviados/falhos do dia com filtros por operador e status.

- [ ] Criar visao "Falhas de entrega".
  - Criterio de aceite: mostra falhas com motivo, contato, lancamento e CTA de reenvio/correcao.

- [ ] Criar visao "Clientes que responderam".
  - Criterio de aceite: operador consegue priorizar atendimento manual de retorno.

## 4. Backend e automacao

### 4.1 Regras de elegibilidade

- [x] Implementar resolver de elegibilidade para cobranca WhatsApp.
  - Regras minimas:
    - lancamento `pendente` ou `atrasado`;
    - cliente ativo;
    - telefone valido;
    - consentimento ativo;
    - regua ativa para o tenant;
    - nao existir envio da mesma etapa para a mesma base;
    - se lancamento foi pago, cancelar proximos disparos;
    - se cliente esta negociado/pausado, nao disparar.
  - Criterio de aceite: toda decisao de envio e explicavel e auditavel.

### 4.2 Scheduler

- [x] Criar scheduler horario ou diario para montar jobs.
  - Sugestao:
    - scheduler horario para ganho operacional;
    - janela de disparo controlada por tenant.
  - Criterio de aceite: jobs elegiveis sao criados sem intervencao manual.

- [x] Calcular etapas da regua por `dataVencimento`.
  - Etapas base:
    - `D-7`
    - `D-3`
    - `D0`
    - `D+3`
    - `D+7`
  - Criterio de aceite: regra suporta dias uteis ou corridos por configuracao.

### 4.3 Sender

- [x] Criar Function/worker de envio.
  - Responsabilidades:
    - carregar job;
    - resolver template;
    - montar payload;
    - chamar Cloud API;
    - persistir request resumido;
    - persistir response resumido;
    - gravar `providerMessageId`;
    - atualizar `whatsapp_messages`, `whatsapp_jobs` e `lancamentos`.
  - Criterio de aceite: envio roda sem dependencia de UI e com trilha de auditoria completa.

- [x] Implementar envio manual assistido.
  - Criterio de aceite: operador pode disparar um template elegivel de um lancamento especifico, sem quebrar a regua automatica.

### 4.4 Webhooks

- [x] Criar endpoint de webhook oficial.
  - Eventos esperados:
    - `sent`
    - `delivered`
    - `read`
    - `failed`
    - `message` / resposta do cliente
  - Criterio de aceite: status do provedor reflete no sistema em ate alguns segundos/minutos apos o retorno.

- [x] Atualizar mensagem e job a partir do webhook.
  - Criterio de aceite: `providerMessageId` casa com a mensagem enviada e atualiza o status correto.

- [x] Deduplicar webhook por `dedupeKey`.
  - Criterio de aceite: o mesmo evento nao gera timeline ou atualizacao em duplicidade.

## 5. Seguranca, LGPD e auditoria

- [x] Redigir payloads e respostas antes de persistir.
  - Nao salvar corpo bruto completo quando contiver dados financeiros ou pessoais desnecessarios.
  - Criterio de aceite: historico tecnico preserva suporte e auditoria sem expor excesso de dado.

- [~] Auditar eventos criticos do modulo.
  - Eventos minimos:
    - criacao de regra;
    - pausa/retomada de regua;
    - envio manual;
    - falha critica;
    - alteracao de contato financeiro;
    - alteracao de consentimento.
  - Criterio de aceite: actor, data, entidade, origem e resumo ficam registrados.

- [ ] Restringir visualizacao de historico tecnico por perfil.
  - Criterio de aceite: somente perfis autorizados acessam detalhes de envio, erro e resposta.

- [x] Garantir que opt-out e pausa tenham efeito imediato.
  - Criterio de aceite: qualquer revogacao de consentimento impede novos disparos ainda nao enviados.

## 6. Configuracao administrativa

- [ ] Criar secao de admin para templates.
  - Criterio de aceite: operador/admin consegue vincular chave interna a template oficial aprovado.

- [ ] Criar secao de admin para regua.
  - Parametros minimos:
    - etapas ativas;
    - horario minimo/maximo;
    - dias uteis vs corridos;
    - pausa por negociacao;
    - exigencia de aprovacao.
  - Criterio de aceite: regua e ajustavel sem deploy.

- [~] Criar secao de admin para integracao WhatsApp.
  - Campos minimos:
    - phone number id / identificador do remetente;
    - tokens/segredos em Secret Manager;
    - status da verificacao do webhook;
    - ambiente homologacao/producao.
  - Criterio de aceite: a configuracao fica centralizada e auditavel.

## 7. Observabilidade e diagnostico

- [x] Criar diagnostico tecnico expandido por mensagem.
  - Mostrar:
    - template usado;
    - etapa da regua;
    - contato destino;
    - horario do envio;
    - status do provedor;
    - codigo/erro do provedor;
    - correlation id interno;
    - job id;
    - link para lancamento/cliente.
  - Criterio de aceite: suporte consegue entender rapidamente se a falha foi de elegibilidade, template, API, telefone ou webhook.

- [ ] Criar metricas basicas do modulo.
  - KPIs:
    - mensagens agendadas;
    - enviadas;
    - entregues;
    - lidas;
    - falhas;
    - respondidas;
    - cobrancas interrompidas por pagamento.
  - Criterio de aceite: existe visao de efetividade e qualidade operacional.

## 8. Rollout

### 8.1 Fase 1 - fundacao

- [x] Modelar schema e campos no Firestore.
- [x] Ajustar cadastro de cliente/responsavel.
- [~] Ajustar vinculo entre `clientes_servicos`, `lancamentos` e contato financeiro.
- [x] Criar colecoes novas.
- [~] Configurar secrets e integracao base.

### 8.2 Fase 2 - backend minimo

- [x] Implementar elegibilidade.
- [x] Implementar scheduler.
- [x] Implementar sender.
- [x] Persistir jobs/mensagens.
- [x] Implementar webhook e deduplicacao.

### 8.3 Fase 3 - frontend operacional

- [x] Adicionar status e acoes no Financeiro.
- [~] Adicionar timeline no Cliente 360.
- [ ] Adicionar listas operacionais.
- [x] Adicionar diagnostico tecnico.

### 8.4 Fase 4 - piloto controlado

- [ ] Rodar piloto com poucos clientes.
- [ ] Validar consentimento real.
- [ ] Validar templates aprovados.
- [ ] Validar leitura de webhook.
- [ ] Validar pausa por pagamento e negociacao.
- [ ] Ajustar texto e horario de disparo.

### 8.5 Fase 5 - producao plena

- [ ] Ativar automacao para toda a base elegivel.
- [ ] Monitorar falhas por 5 dias uteis.
- [ ] Revisar quality/rate/provider errors.
- [ ] Congelar mudancas de template sem aprovacao.

## 9. Criterios de aceite finais

- [~] Um lancamento recorrente elegivel gera job automaticamente na etapa correta.
- [x] O job nao duplica para a mesma etapa e mesma base.
- [~] O envio usa template oficial e retorna `providerMessageId`.
- [x] O webhook atualiza `sent`, `delivered`, `read`, `failed` e respostas.
- [x] O Financeiro mostra status atual e proxima acao por lancamento.
- [~] O Cliente 360 mostra historico de cobranca WhatsApp.
- [x] Pausa, opt-out e pagamento interrompem disparos futuros.
- [ ] Logs e auditoria nao expõem dados sensiveis indevidos.
- [~] Operador consegue reenviar, reagendar e diagnosticar falhas sem planilha externa.

## 10. Fora de escopo deste ciclo

- Chatbot de cobranca com IA.
- Negociacao automatica de parcelamento.
- Emissao automatica de boleto/Pix por resposta conversacional.
- Integracao com WhatsApp Web nao oficial.
- Campanhas comerciais fora do contexto de cobranca financeira.
