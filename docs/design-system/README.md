# JP Fiscal / TTRD Contábil — Design System

A reusable design system extracted from **JP Fiscal** (internally **TTRD Contábil**), a
white-label management platform — a *mini-ERP* — built for Brazilian accounting firms
(*escritórios de contabilidade*). Use it to generate on-brand interfaces, mockups,
prototypes and assets that look and feel exactly like the product.

> **Language:** The product is entirely in **Brazilian Portuguese (pt-BR)**. All UI copy,
> labels, statuses and sample data must be in pt-BR. Currency is **BRL (R$)**, dates are
> **DD/MM/AAAA**, documents are **CPF / CNPJ**.
>
> **Brand:** JP Project — a **“JP” monogram in blue `#2243A5` + green `#13A877`**. (The
> open-source product ships a yellow `#F5C200` white-label default; the JP blue/green
> identity supersedes it across this system.)

---

## 1. Product context

JP Fiscal organizes the *work of the accountant*, not the finances of the accountant's
clients. Where ERPs like Conta Azul / Omie manage a single company's books, JP Fiscal
manages an accounting firm's entire client portfolio and the recurring obligations
attached to each one: monthly competências, fiscal closing, tax filings and billing.

**Core modules (each is a left-nav destination):**

| Module | Route | What it does |
|---|---|---|
| **Hoje** | `/hoje` | Daily execution cockpit — overdue + due-today queue, SLA |
| **Painel** | `/dashboard` | Executive KPIs, risk ranking, Curva-S closing burndown |
| **Clientes** | `/clientes` | Client 360 — registry, services, 360 modal with tabs |
| **Tarefas** | `/tarefas` | Internal tasks with priority, owner, deadline, comments |
| **Competências** | `/competencias` | Monthly accounting periods per client (MM/AAAA) |
| **Fechamento Mensal** | `/fechamento` | Obligation grid: DAS, eSocial, REINF, FGTS per client |
| **Fiscal & NFS-e** | `/fiscal` | Service-invoice (NFS-e) issuing, history, A1 certificate |
| **Imposto de Renda** | `/ir` | Income-tax declarations + document checklist |
| **Financeiro** | `/financeiro` | Receivables/payables (lançamentos), settle ("Baixar") |
| **Administração** | `/admin` | Users, service types, connectors, parameters |

**Audience:** accountants and firm operators — power users who live in dense data tables
all day. The product is a **tool**, not a marketing site: information-dense, fast,
keyboard-friendly (⌘K command palette), restrained color, no decoration for its own sake.

### Sources (read-only; reader may not have access)
- **Codebase (primary source of truth):** `ttrdcontabil/` mounted folder.
  - `ttrdcontabil/ttrdcontabil-1/` — the current, most-complete build (Next.js 16, App Router, static export).
  - `ttrdcontabil/app-temp/`, `ttrdcontabil/src/` — earlier iterations.
  - `ttrdcontabil/landing/index.html` — marketing landing stub.
- **Functional + technical docs:** `ttrdcontabil/docs/documentacao-completa.md` (full module/Firestore spec).
- **Design tokens:** `ttrdcontabil-1/src/app/globals.css` (Tailwind v4 `@theme` + shadcn).
- **Reference screenshots:** four WhatsApp screenshots (client 360 modal, fiscal config, NFS-e form) — copied to `_ref/`.
- **Stack:** Next.js + Tailwind CSS v4 + shadcn/ui (Base UI / Radix) + Firebase + Lucide icons.

---

## 2. Content fundamentals

**Voice:** professional, direct, operational. Speaks to a busy professional who needs to
*act*. Copy favors **nouns and short verb phrases** over sentences: "Emitir NFS-e",
"Novo cliente", "Ver competências", "Baixar". Section headers are plain nouns:
"Pendências operacionais", "Saúde do mês", "Clientes em risco".

- **Language:** Brazilian Portuguese, always. Accents matter (competência, fiscal, lançamento, atrasado).
- **Person:** mostly impersonal/imperative — the system addresses the task, not "you".
  Buttons are imperatives ("Entrar no painel", "Salvar Configuração", "Enviar Certificado").
- **Casing:** **Sentence case** for body, descriptions and most buttons
  ("Novo cliente", "Ver carteira"). **UPPERCASE micro-labels** for eyebrows / field labels /
  table headers, tracked out (`.section-label`, e.g. "CLIENTES ATIVOS", "CPF / CNPJ").
  Page titles are sentence case ("Visão executiva", "Bem-vindo de volta").
- **Numbers:** tabular nums everywhere; currency `R$ 1.234,56` (pt-BR formatting,
  monospace for money). Counts pluralize correctly ("1 tarefa vencida" / "3 tarefas vencidas").
- **Status language is a fixed vocabulary** (see status-badge map): Ativo, Inativo,
  Suspenso · Aberta, Em andamento, Concluída, Cancelada · Pendente, Pago, Atrasado ·
  Emitida, Rejeitada, Erro · Pendente, Entregue, Retificado.
- **Tone of alerts:** factual and quantified, never alarmist —
  "3 ponto(s) pedem ação", "Operação sem alerta crítico imediato",
  "Prioridade calculada por tarefas vencidas, cobranças atrasadas e emissão fiscal próxima."
- **Empty states:** calm and reassuring — "Nenhuma tarefa vencida",
  "Todos os fechamentos em dia", "Sem cobranças em atraso", "Nenhum lançamento."
- **No emoji.** No exclamation marks. No marketing fluff. Iconography carries tone, not punctuation.

---

## 3. Visual foundations

The aesthetic is **calm, dense, tool-grade**. Think Linear/Vercel restraint with a
single confident brand accent. The look is built from neutrals + one yellow.

### Color
- **Brand:** the JP Project mark is a **“JP” monogram** — **J in blue `#2243A5`** + **P in green `#13A877`**. Blue is the primary action color (buttons, active nav, focus rings, links, KPI accents, chart-1); green is the positive/accent color (success highlights, accent chips, chart-2). On the solid blue, text is **white**. On dark surfaces the blues lighten to `#4f7df0`/`#5a86f5` and green to `#2fd49b` for legibility.
- **Canvas:** very light cool-gray (`slate-50`, `oklch(0.982 0.002 250)`). **Cards are pure white.**
- **Text:** near-black `oklch(0.13 0.008 260)`; muted text `oklch(0.48 0.012 250)`.
- **Semantic:** green = success/paid/done, red = destructive/overdue/error, amber/warning =
  due/high-priority, blue (info) = in-progress, gray (neutral) = waiting/draft.
  Semantic fills are always **soft tints** (`/10`–`/15` alpha) with the saturated color as text.
- **Sidebar is always dark** (`oklch(0.155 …)`) even in light mode — a signature contrast
  active item = blue text on `primary/12` tint.
- **Dark mode** exists and is fully tokenized (`.dark`), canvas matches the sidebar's near-black.

### Type
- **Inter** for product UI / body (loaded via `next/font`; weights 400–800).
- **Sora** for the brand wordmark and login/marketing headlines (display).
- **Geist Mono** for financial/tabular values (`.tabular-currency`, currency cells).
- Page titles `text-2xl`/`text-xl` semibold, tight tracking (`-0.02em`). Body is **14px** (`text-sm`) —
  this is a dense pro tool, not a 16px marketing page. Micro-labels 10–12px uppercase tracked.
- KPI numbers are big, bold, tabular, very tight tracking (`-0.03em`).

### Shape, depth & spacing
- **Radii:** base 10px. Inputs/buttons `rounded-lg` (10px). Cards `rounded-xl` (14px).
  KPI/insight cards `rounded-2xl` (18px). Login form card 20px. **Badges are full pills** (`rounded-4xl`).
- **Borders over shadows.** Cards use a hairline border (`border-border`, ~`oklch(0.916)`)
  or a `ring-1 ring-foreground/10`, plus a *very* soft shadow (`0 1px 2px rgb(0 0 0 /.04)`).
  Hover lifts to `0 2px 8px -2px rgb(0 0 0 /.08)`. Modals get a layered shadow + 1px ring.
  No heavy/dramatic drop-shadows anywhere.
- **Spacing:** 4-point scale (4/8/12/16/24/32). Cards pad `p-4`/`p-5`. Generous `gap-`-based
  flex/grid layouts; content capped at `max-w-[1280px]`, sidebar fixed `w-56`.

### Motion & states
- **Subtle and fast.** `transition-colors` / `transition-all` on interactive elements.
  Cards fade+slide-in on mount (`animate-in fade-in slide-in-from-bottom-2 duration-300`).
  One bespoke `sla-pulse` (2s opacity pulse) flags critical SLA deadlines. No bounces, no parallax.
- **Hover:** rows → `bg-muted/60`; cards → border tints to `primary/35` + shadow lift;
  buttons → `primary/90`. **Press:** primary buttons nudge down 1px (`active:translate-y-px`).
- **Focus:** 3px yellow ring (`ring-ring/50`) + border turns yellow. Consistent everywhere.

### Backgrounds & texture
- App body is flat light-gray — **no gradients, no imagery, no patterns** inside the app.
- The **login screen** is the one expressive surface: a dark navy panel (`#070d22`) with a
  **technological treatment** — a faint square grid masked toward the top, a large **blue
  radial glow** (top-right) and a softer **green glow** (bottom-left), and two faint accent
  rings. The headline second line uses a **blue→green gradient**. Right panel is `#f6f7f9`
  with a subtle blue dot grid and a white form card (blue→indigo gradient CTA). Glassmorphism
  is used lightly on the stat cards (`backdrop-filter: blur`).
- **No photography. No illustration.** Visual interest comes from data, badges, and the
  dark-sidebar / yellow-accent contrast.

### Tables & data
- Tables: `rounded-lg` bordered container, `bg-muted/50` header with uppercase 12px tracked
  heads, rows with bottom borders and `hover:bg-muted/60`. Currency cells right-aligned,
  monospace, tabular. Left-border priority indicators on task rows
  (3px: red urgente, amber alta, border normal, transparent baixa). Overdue dates render red.

---

## 4. Iconography

- **Lucide** (`lucide-react`) is the *only* icon system, used pervasively. Clean, consistent
  **1.5–2px stroke**, rounded line icons. No filled icon sets, no custom glyphs, no emoji,
  no unicode-as-icon. The one custom marker is a 2px CSS dot (`h-2 w-2 rounded-full`) used as
  a status bullet, and `⌘K` rendered in a `<kbd>`.
- **Sizing:** icons are small and quiet — 13–16px in nav/buttons/badges, ~16–20px in KPI/alert
  chips. Buttons auto-size svgs to `size-4`. Badges force svgs to `size-3`.
- **Common icons by domain:** `Users` (clientes), `CheckSquare` (tarefas), `Layers`
  (competências), `FolderOpen` (fechamento), `Receipt` (NFS-e/fiscal), `FileText` (IR),
  `Wallet`/`DollarSign`/`WalletCards` (financeiro), `CalendarClock` (hoje), `BarChart3`
  (painel), `Settings`/`UserCog`/`Plug`/`SlidersHorizontal` (admin), `AlertTriangle`/`Bell`
  (alerts), `CheckCircle2` (success/empty), `Shield*` (certificate status), `ArrowRight`
  (drill-in links), `Building2` (the logo/brand mark).
- **Logo / brand mark:** the official mark is the **“JP” monogram** (`assets/jp-logo.png`) —
  **J blue `#2243A5`** + **P green `#13A877`**. On dark surfaces it sits on a **white rounded
  tile** (so its white background reads as an intentional app-icon). The wordmark **“JP Fiscal”**
  is set in **Sora** (display) — “JP” bold blue, “Fiscal” in green — with the tagline
  “Gestão Contábil Integrada” tracked out in uppercase. See `assets/logo-mark.html`. The
  uploaded PNG is low-res with a baked white background; request an **SVG / hi-res** version
  for large applications. (The original product shipped a generic `Building2`-on-yellow
  placeholder; the JP blue/green identity supersedes it.)
- **Usage in this system:** load Lucide from CDN (`https://unpkg.com/lucide@latest`) and call
  `lucide.createIcons()`, or use `<i data-lucide="receipt"></i>`. This matches the product's
  exact icon set — do **not** hand-draw SVG icons.

---

## 5. Index / manifest

Root files:
- **`README.md`** — this file. Context, content + visual foundations, iconography, manifest.
- **`colors_and_type.css`** — all color, type, radius, spacing, shadow tokens as CSS vars,
  plus semantic type/surface utility classes. Import this into any artifact.
- **`SKILL.md`** — Agent-Skill front-matter wrapper so this folder works as a downloadable skill.
- **`_ref/`** — reference screenshots from the live product.

Design-system preview cards (rendered in the Design System tab):
- **`preview/`** — small specimen cards: colors, type, spacing/radii/shadows, components
  (buttons, badges, inputs, cards, tables, KPI, nav, alerts).

UI kit (high-fidelity, reusable recreations of the real product):
- **`ui_kits/web-app/`** — `index.html` (interactive click-through: login → app shell with
  Hoje cockpit, Dashboard, Clientes + 360 modal, Financeiro, Fiscal), plus modular JSX
  components and a kit `README.md`.

No slide template was provided, so no `slides/` directory was created.

---

## 6. Caveats / substitutions
- **Fonts:** Inter, Sora and Geist Mono are loaded from Google Fonts (CDN). Inter is the
  product's actual UI font. Sora is the brand display face for the wordmark/headlines.
  Geist Mono matches the intended financial-data mono.
- **Logo:** the uploaded `assets/jp-logo.png` is low-res (66×44) with a baked white
  background. The wordmark is recreated in Sora; for large/retina use, request an official
  **SVG or hi-res PNG** of the JP monogram.
- Colors are kept in **oklch** for the neutral/semantic scales; brand blue/green are hex.
  All modern browsers support oklch.
