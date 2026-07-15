# Templates de WhatsApp para cadastrar na Twilio

Rascunho pronto para você revisar e cadastrar no **Twilio Console → Messaging → Content Template Builder**. Eu não tenho acesso à conta Twilio (nenhuma credencial configurada nesta sessão), então não consigo submeter isso diretamente — o cadastro e o envio para aprovação da Meta precisam ser feitos por você.

Depois de aprovados, me passe os 6 `Content SID` (formato `HXxxxxxxxx...`) gerados pela Twilio que eu preencho o campo `providerContentSid` de cada template em **Admin → Parâmetros → Catálogo de mensagens WhatsApp** (tela já pronta, parte da migração para Twilio) e ativamos a régua de cobrança de verdade.

## Como cadastrar cada um

1. Twilio Console → **Messaging → Content Template Builder → Create new**.
2. Tipo de conteúdo: **WhatsApp**.
3. Idioma: **Portuguese (Brazil)** — `pt_BR`.
4. Categoria: **Utility** (são avisos operacionais de uma cobrança recorrente já existente, não é conteúdo promocional — isso evita cair em "Marketing" e precisar de opt-in de marketing separado).
5. **Friendly Name**: use exatamente a "Chave interna" indicada abaixo (é o `templateKey` que o sistema já espera).
6. Corpo (**Body**): copie o texto de "Corpo" — as variáveis `{{1}}`, `{{2}}`, `{{3}}`, `{{4}}` já estão na ordem que o backend envia (nome do cliente, serviço, valor, data). Não altere a ordem nem a quantidade de variáveis, só o texto ao redor.
7. **Footer** (opcional, mas recomendado): use o texto indicado em "Rodapé" — fica separado do corpo e não conta como variável.
8. Envie para aprovação. A Meta costuma levar de minutos a ~24h para aprovar templates utilitários bem comportados (sem linguagem promocional, sem variável isolada no início/fim da frase — já cuidei disso nos textos abaixo).

---

## 1. `cobranca_pre_vencimento_7` — aviso 7 dias antes do vencimento

**Corpo:**
```
Olá, {{1}}! Passando para lembrar que a mensalidade referente a {{2}}, no valor de {{3}}, vence em 7 dias, no dia {{4}}. Qualquer dúvida, é só responder esta mensagem.
```
**Rodapé:** `TTRD Contábil`

## 2. `cobranca_pre_vencimento_3` — aviso 3 dias antes do vencimento

**Corpo:**
```
Olá, {{1}}! A mensalidade referente a {{2}}, no valor de {{3}}, vence em 3 dias, no dia {{4}}. Se o pagamento já foi feito, pode desconsiderar este aviso.
```
**Rodapé:** `TTRD Contábil`

## 3. `cobranca_vencimento_hoje` — vence hoje

**Corpo:**
```
Olá, {{1}}! A mensalidade referente a {{2}}, no valor de {{3}}, vence hoje ({{4}}). Para evitar juros e manter seus serviços contábeis em dia, regularize ainda hoje.
```
**Rodapé:** `TTRD Contábil`

## 4. `cobranca_atraso_leve` — 3 dias em atraso

**Corpo:**
```
Olá, {{1}}! Identificamos que a mensalidade referente a {{2}}, no valor de {{3}}, com vencimento em {{4}}, ainda consta em aberto. Poderia verificar e regularizar assim que possível?
```
**Rodapé:** `TTRD Contábil`

## 5. `cobranca_atraso_critico` — 7 dias em atraso (crítico)

> No sistema, esta etapa já exige aprovação manual de um operador antes de disparar (`exigeAprovacao: true`) — ninguém recebe essa mensagem sem um humano confirmar antes.

**Corpo:**
```
Olá, {{1}}! A mensalidade referente a {{2}}, no valor de {{3}}, com vencimento em {{4}}, segue em aberto há mais de 7 dias. Para evitar a suspensão dos serviços contábeis, pedimos que regularize o quanto antes ou entre em contato conosco.
```
**Rodapé:** `TTRD Contábil`

## 6. `cobranca_baixa_confirmada` — confirmação de pagamento

> **Atenção:** esse template já está pré-cadastrado no catálogo (`whatsapp_templates`), mas **ainda não existe nenhum gatilho no código que o dispare automaticamente** quando um lançamento é baixado/pago. Vale cadastrar e aprovar agora (aprovação da Meta não expira), mas o disparo automático fica como próximo passo de desenvolvimento, não é urgente pra ir ao ar com a régua de cobrança.

**Corpo:**
```
Olá, {{1}}! Confirmamos o recebimento do pagamento da mensalidade referente a {{2}}, no valor de {{3}}, referente a {{4}}. Obrigado!
```
**Rodapé:** `TTRD Contábil`

---

## Depois da aprovação

Me mande os 6 Content SIDs (pode ser em qualquer ordem, eu identifico pelo Friendly Name) e eu:
1. Preencho `providerContentSid` de cada template em `whatsapp_templates` via a tela de admin.
2. Confirmo que o número WhatsApp Sender da Twilio está preenchido em Admin → Parâmetros.
3. Testamos 1 disparo real em sandbox antes de ligar a régua de cobrança pros 119 clientes.
