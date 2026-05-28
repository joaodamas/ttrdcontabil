# Plano de Priorização — TTRD Contábil

> **Data:** 2026-05-28 · **Branch base:** `master` (pós-merge P0 `208b5c6`)
> **Fontes:** laudo técnico [`AUDITORIA_MATURIDADE_2026-05-28.md`](AUDITORIA_MATURIDADE_2026-05-28.md) + pareceres dos agents `auditor-plataforma`, `guardiao-seguranca-lgpd`, `revisor-rules-firebase`, `diretor-produto-design`, `socio-critico`, `estrategista-growth`, `closer-vendas`, `arquiteto-landing`.

## Como ler este plano

A ordem dos blocos é **deliberada** e reflete a convergência de 3 pareceres independentes (sócio, estrategista, closer): **o gargalo não é UI nem marketing — é PROVAR o produto.** Não pule blocos para frente (vender/divulgar) antes de fechar os de trás (provar/robustez).

- `[ ]` pendente · `[x]` feito
- **Tags:** 🔴 P0 (bloqueia venda/risco agora) · 🟠 P1 (bloqueia pagante sério) · 🟡 P2 (maturidade) · ⚪ P3 (polimento)
- **Esforço:** B (<½ dia) · M (≤ dias) · A (alto) · MA (muito alto)
- **Gate comercial:** vendável a escritório pagante = laudo ≥ 3.5 e **zero 🔴 aberto**. Hoje: **3.2/5**.

---

## BLOCO 0 — P0 técnico ✅ CONCLUÍDO (commit `515133d`)

- [x] 🔴 Rules Firestore p/ `whatsapp_*` e `nfse_erros` (desbloqueia régua de cobrança e histórico de erro NFS-e) · `firestore.rules`
- [x] 🔴 Validação de assinatura `X-Hub-Signature-256` no webhook WhatsApp (HMAC constant-time, fail-closed) · `functions/src/whatsapp/webhook.ts`
- [x] 🔴 Remoção da dependência morta `xmldom@0.6.0` (CVE crítico) + `npm audit fix` functions (21→9 vulns)
- [x] 🟠 Documentado o invariante de isolamento single-tenant em `usuarios/list`
- [x] 🟠 Suíte de rules ampliada (escalada de privilégio, append-only, novas coleções) — *escrita, ainda não executada (ver Bloco 1)*

---

## BLOCO 1 — PROVAR (inegociável antes de qualquer pagante) 🔴/🟠

> Sócio: *"isolamento é boato até a barra ficar verde."* Estes itens são dias de trabalho, não meses.

- [ ] 🔴 Subir **JDK 21+** em CI e **rodar** `npm run test:rules` — hoje o host tem Java 8 e a suíte é `describe.skip` (0 testes executam). *(T02 · M)*
- [ ] 🔴 Confirmar verde nos casos críticos: escalada de `perfil`/`ativo`/`tenantId`, append-only de `logs_auditoria`, isolamento cross-tenant. *(B)*
- [ ] 🟠 **Executar de fato** a homologação e preencher os 3 arquivos de evidência hoje vazios: `GO-LIVE-INTERNO-FASE1.md`, `VALIDACAO-PERMISSOES.md`, `REGRESSAO-FUNCIONAL-LOG.md`. *(M)*
- [ ] 🟠 Deploy das novas rules em produção: `firebase deploy --only firestore:rules`. *(B)*
- [ ] 🟠 Corrigir build/lint do "plano de guerra" D1 (build quebra sem env válido). *(B)*

## BLOCO 2 — ROBUSTEZ / OBSERVABILIDADE (P1 do laudo, hoje 100% intocado) 🟠

> "Você opera no escuro: se uma cobrança não sai ou uma nota duplica, ninguém é avisado."

- [ ] 🟠 **Error tracking** (Sentry ou equivalente) no front **e** nas Functions — hoje `grep` = 0. *(O01 · M)*
- [ ] 🟠 Fila WhatsApp: **reprocessar** jobs `falhou` honrando `nextRetryAt` + alerta ao esgotar tentativas (hoje só processa `agendado`). *(B01 · M)* · `functions/src/whatsapp/scheduler.ts:54`
- [ ] 🟠 **Alerta de falha de backup** (hoje o código literalmente diz "add a poller"). *(D02 · B)* · `functions/src/backup.ts`
- [ ] 🟠 Consulta-prévia por RPS na emissão direta NFS-e (evita emissão duplicada). *(F01 · M)*
- [ ] 🟡 Definir e aplicar **TTL/retenção** em `logs_auditoria`/`events`/`whatsapp_*` (LGPD + custo). *(D · M)*

## BLOCO 3 — PODAS DE UX (diretor-produto-design) — "podar, não redesenhar" 🟡

- [ ] 🟠 **Matar a duplicação de cockpit:** `/dashboard` = leitura executiva (remover linguagem "cockpit/o que fazer hoje" e a Fila crítica acionável); `/hoje` = execução. *(B)*
- [ ] 🟡 Simplificar `/hoje` de volta aos 4 blocos da spec (KPIs → alerta crítico → fila → bloqueios); tirar Kanban/Agenda da rota de cockpit (mover p/ `/tarefas`). *(M)*
- [ ] 🟡 Padronizar filtros para o `FilterBtn` canônico em `/hoje` (pills de prioridade + toggle de view usam `bg-primary` indevido). *(B)*
- [ ] 🟡 Unificar header em `PageHeader` em todas as páginas (`/hoje`, dashboard). *(B)*
- [ ] 🟡 Recolher **Administração** para o rodapé da sidebar ("Configurações"), fora do fluxo diário; corrigir `telaKey` de Relatórios/Produtividade (hoje atrás de permissão `admin`). *(B)*
- [ ] ⚪ Loading do cockpit: trocar `Loader2` nu por skeleton (a própria spec exige). *(B)*

## BLOCO 4 — PILOTO INTERNO (transforma produto em prova) 🟠

> O teste mais barato e mais negligenciado. Pré-requisito: Bloco 1 fechado.

- [ ] 🟠 Rodar o "dia real" de **5–7 dias** com 2–5 usuários internos. *(M)*
- [ ] 🟠 Instrumentar **antes/depois** das métricas-alvo: dias p/ fechar o mês, % tarefas via cockpit, inadimplência média. *(M)*
- [ ] 🟡 Capturar 2–3 frases/depoimentos reais de quem usou. *(B)*
- [ ] 🟡 1 ciclo de fechamento mensal feito 100% no sistema, sem planilha paralela. *(critério de pronto)*

## BLOCO 5 — COMERCIAL (closer-vendas) — só após Bloco 1 (e Bloco 2 p/ externo) 🟡

- [ ] 🟡 Definir **ticket-alvo** e piso de preço por porte (nº de clientes na carteira/usuários). *(decisão do dono)*
- [ ] 🟡 Calcular **margem por tenant** (Firebase + WhatsApp + onboarding manual) — crítico no modelo single-tenant. *(M)*
- [ ] 🟡 Empacotar **bom/melhor/o melhor** (Essencial · Operação Completa [âncora] · Premium/Parceiro). *(B)*
- [ ] 🟡 Estruturar oferta de **piloto pago concierge** (vagas limitadas reais, preço travado 12m, contrapartida = depoimento). *(B)*
- [ ] 🔴 **Corrigir material comercial:** vender "plataforma whitelabel para um escritório", **não** "SaaS multi-escritório" (dívida estrutural R4). *(COMERCIAL-POSICIONAMENTO.md · B)*
- [ ] ⚪ Não demonstrar a tela WhatsApp em venda até G01 estar no ar.

## BLOCO 6 — MARKETING / CAPTURA (estrategista-growth) — Estágio 0→1 🟡

> **NÃO fazer ainda:** mídia paga, landing institucional, prospecção fria em volume, anunciar WhatsApp como pronto.

- [ ] 🟡 Construir o **funil mínimo** de captura (página + isca + qualificação + nutrição) — só depois de ter prova do piloto. *(M)*
- [ ] 🟡 Criar a isca **"Raio-X do Mês Travado"** (diagnóstico de 5 min que qualifica: porte, regime, dor). *(M)*
- [ ] 🟡 Resposta rápida a lead via WhatsApp já integrado (lead B2B esfria em horas). *(B)*
- [ ] ⚪ Conteúdo orgânico/autoridade (LinkedIn do dono + grupos de contadores + indicação dos pilotos). *(contínuo)*
- [ ] ⚪ Mídia paga em teste **só** quando: laudo ≥ 3.5, 1–2 pilotos pagantes com depoimento, página convertendo orgânico.

## BLOCO 7 — LANDING (arquiteto-landing) — blueprint pronto, greenfield ⚪

> Princípio: "o produto é a mídia". Construir só quando houver prova (Bloco 4) e oferta (Bloco 5).

- [ ] 🟡 Capturar screenshots reais com dados fictícios (LGPD): `/hoje`, Dashboard V2 + Curva-S, `/fiscal`, Cliente 360 (+ recortes mobile). *(B)*
- [ ] ⚪ Screencast curto (6–10s, loop) de ação em lote na tela Hoje. *(M)*
- [ ] 🟡 Construir landing seguindo o blueprint de 8 seções (hero split → vilão×herói → "um dia na TTRD" → tabela comparativa → prova honesta → preço aberto → captura). *(A)*
- [ ] ⚪ Reaproveitar tokens de `globals.css` + `src/components/premium/saas-blocks` p/ fidelidade visual. *(—)*
- [ ] ⚪ Checagem final: performance (next/image AVIF, LCP<2.5s), mobile-first, `prefers-reduced-motion`, contraste do amarelo (`--primary-foreground`). *(B)*

## BACKLOG — Dívida estrutural / maturidade (P2/P3) 🟡/⚪

- [ ] 🟡 **MFA** (TOTP) obrigatório para `admin`/`fiscal` (manuseiam certificado A1 e dados fiscais). *(guardião)*
- [ ] 🟡 App Check + rate limiting nos callables sensíveis (`uploadCertificado`/`validarCertificado`). *(guardião)*
- [ ] 🟡 Direitos do titular LGPD: export estruturado + exclusão/anonimização real (hoje só soft-delete). *(validar prazos com DPO)*
- [ ] 🟡 Registrar eventos de acesso (login/logout/IP) na trilha de auditoria. *(guardião)*
- [ ] 🟡 Cabeçalhos de segurança no Hosting (CSP, HSTS, X-Frame-Options). *(firebase.json)*
- [ ] ⚪ Login fail-closed em falha de leitura de perfil (hoje cai para `leitura` silenciosamente). *(guardião)*
- [ ] 🔵 **R4 (MA):** multi-tenant real (schedulers com filtro universal de `tenantId`) — só se a estratégia for vender SaaS multi-escritório. Hoje: single-tenant por deploy.

---

## Sequência recomendada (1 frase do dono)

**Congele features e UI; pague a dívida de prova (Bloco 1) e observabilidade (Bloco 2) — 1 a 2 semanas; rode o piloto interno (Bloco 4) com números; só então parta para comercial (Bloco 5), marketing (Bloco 6) e landing (Bloco 7).**

## Decisões em aberto (do dono — destravam os blocos)

1. **Owner + data** para subir JDK 21 em CI e rodar o emulador de rules? (destrava Bloco 1 e o gate comercial)
2. Primeiro cliente é **piloto interno** ou **escritório externo pagante**? (interno: liberado após Bloco 1; externo: exige Bloco 2)
3. **Ticket-alvo, margem por tenant e concorrência** (Conta Azul/Omie/Domínio/Nibo)? (destrava Bloco 5)
4. Vai prometer **SaaS multi-tenant**? Se sim, R4 entra antes; se não, corrigir o material comercial agora.
5. **Orçamento de marketing** e **runway** — há pressão de caixa para vender já, ou dá para esperar o ciclo de prova?
