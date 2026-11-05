# JP Fiscal (ttrdcontabil)

Next.js 16.4.5 (static export para o Firebase Hosting). Desde a 16.4 o pacote traz a documentação da versão instalada em `node_modules/next/dist/docs/` — o bloco no fim deste arquivo é mantido pelo próprio `next dev`.

- `CHANGELOG.md` na raiz tem o histórico de mudanças (o que mudou, por quê, quando) — leia antes de assumir o estado do projeto.
- `docs/AUDITORIA-COMPLETA-2026-07-02.md` tem o raio-x completo (6 dimensões + UX por módulo) e a lista de achados por prioridade.
- Mudanças fiscais (NFS-e, cálculo de imposto, RPS) exigem homologação por município antes de deploy — nunca assuma que está liberado.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
