# TTRD Contabil - Documentacao Geral

Esta documentacao consolida o estado atual da ferramenta em dois eixos:

- Documentacao funcional (visao de produto e operacao)
- Documentacao tecnica (arquitetura, codigo, infraestrutura e seguranca)

## Arquivos principais

- `docs_dev/documentacao-funcional.md`
- `docs_dev/documentacao-tecnica.md`
- `docs_dev/plano-redesign-tecnico-2.0.md`

## Escopo considerado

- Frontend Next.js (rotas, componentes, fluxo de navegacao)
- Backend Firebase (Firestore, Rules, Indexes, Storage Rules)
- Cloud Functions (schedulers, triggers, NFS-e, backup)
- Controle de acesso por perfil e `TelaKey`
- Fluxos operacionais por modulo (Hoje, Clientes, Tarefas, Competencias, Fechamento, Financeiro, Fiscal, IR, Admin)
- Qualidade de engenharia (testes unitarios e E2E existentes)
- Processo de build e deploy em Firebase Hosting

## Como manter atualizado

Atualizar estes arquivos sempre que houver:

- Nova rota funcional
- Mudanca de regra de permissao (frontend ou Firestore Rules)
- Inclusao/alteracao de colecoes Firestore
- Nova Cloud Function (scheduler, trigger ou callable/http)
- Mudanca de fluxo critico de negocio (cockpit, fechamento, cobranca, emissao fiscal)
