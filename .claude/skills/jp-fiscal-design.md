---
name: jp-fiscal-design
description: Use this skill to generate well-branded interfaces and assets for JP Fiscal / TTRD Contábil (a management ERP for Brazilian accounting firms — clientes, competências, fechamento, fiscal/NFS-e, financeiro), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, the JP logo, and a UI kit of components for prototyping.
user-invocable: true
---

Read `docs/design-system/README.md` and explore the other available files in `docs/design-system/`.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, read the rules here to become an expert in designing with this brand.

If invoked without guidance, ask what to build/design, ask clarifying questions, and act as an expert designer who outputs HTML artifacts _or_ production code depending on the need.

## Quick reference
- **Brand:** JP monogram — **J blue `#2243A5`**, **P green `#13A877`**. Blue = primary action; green = positive/accent. White text on solid blue. On dark surfaces lighten to `#4f7df0` / `#2fd49b`.
- **Language:** Brazilian Portuguese (pt-BR) always. Currency `R$ 1.234,56`, dates `DD/MM/AAAA`, `CPF/CNPJ`.
- **Type:** Inter (UI/body, 14px base), Sora (brand wordmark + headlines), Geist Mono (currency/tabular).
- **Tokens:** import `docs/design-system/colors_and_type.css` for every color/type/radius/spacing/shadow variable.
- **Icons:** Lucide only (CDN: `https://unpkg.com/lucide@latest`). No emoji.
- **Logo:** `docs/design-system/assets/jp-logo.png`. Wordmark in Sora — "JP" bold blue, "Fiscal" green.
- **UI kit:** `docs/design-system/ui_kits/web-app/` — interactive HTML+JSX recreation (sidebar, topbar, login, KPI cards, tables, badges, client 360 modal).
- **Feel:** calm, dense, tool-grade. White cards, slate canvas, always-dark sidebar, hairline borders + very soft shadows, full-pill badges, blue focus ring.

## Files
- `docs/design-system/README.md` — full product context, visual foundations, iconography, manifest.
- `docs/design-system/colors_and_type.css` — all design tokens.
- `docs/design-system/assets/` — `jp-logo.png`, `logo-mark.html`.
- `docs/design-system/preview/` — specimen cards (colors, type, spacing, components).
- `docs/design-system/ui_kits/web-app/` — interactive UI kit (`index.html` + JSX + `kit.css`).
