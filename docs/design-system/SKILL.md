---
name: jp-fiscal-design
description: Use this skill to generate well-branded interfaces and assets for JP Fiscal / JP Project (a management ERP for Brazilian accounting firms — clientes, competências, fechamento, fiscal/NFS-e, financeiro), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, the JP logo, and a UI kit of components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick reference
- **Brand:** JP "JP" monogram — **J blue `#2243A5`**, **P green `#13A877`**. Blue = primary action; green = positive/accent. White text on solid blue. On dark surfaces lighten to `#4f7df0` / `#2fd49b`.
- **Language:** Brazilian Portuguese (pt-BR) always. Currency `R$ 1.234,56`, dates `DD/MM/AAAA`, `CPF/CNPJ`.
- **Type:** Inter (UI/body, 14px base), Sora (brand wordmark + headlines), Geist Mono (currency/tabular).
- **Tokens:** import `colors_and_type.css` for every color/type/radius/spacing/shadow variable.
- **Icons:** Lucide only (CDN: `https://unpkg.com/lucide@latest`, `<i data-lucide="…">` + `lucide.createIcons()`). No emoji.
- **Logo:** `assets/jp-logo.png` (on a white rounded tile over dark surfaces). Wordmark in Sora — "JP" bold blue, "Fiscal" green.
- **UI kit:** `ui_kits/web-app/` — modular React/JSX recreation (sidebar, topbar, login, KPI cards, tables, badges, status vocabulary, client 360 modal). Mirror its `kit.css` classes.
- **Feel:** calm, dense, tool-grade. White cards, slate canvas, always-dark sidebar, hairline borders + very soft shadows, full-pill badges, blue focus ring.

## Files
- `README.md` — full product context, content + visual foundations, iconography, manifest.
- `colors_and_type.css` — design tokens + semantic type/surface utilities + `.jp-logo` monogram.
- `assets/` — `jp-logo.png`, `logo-mark.html` (lockups).
- `preview/` — specimen cards (colors, type, spacing, components, brand).
- `ui_kits/web-app/` — interactive UI kit (`index.html` + JSX components + `kit.css`).
