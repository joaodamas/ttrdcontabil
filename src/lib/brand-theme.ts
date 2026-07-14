// ─────────────────────────────────────────────────────────────────────────
// Motor de tema da marca (white-label).
//
// A cor primária vem de appConfig.brandPrimary (env NEXT_PUBLIC_APP_BRAND_PRIMARY,
// congelada no build por ser static export). Daqui derivamos a paleta e o
// contraste, e injetamos como CSS custom properties no <body> (layout.tsx),
// sobrescrevendo os defaults de globals.css sem editá-los por cliente.
// ─────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from "react";
import { appConfig } from "./app-config";

type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || Number.isNaN(parseInt(h, 16))) return { r: 34, g: 67, b: 165 }; // fallback azul
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Luminância relativa (WCAG) — decide se o texto sobre a marca é claro ou escuro.
function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Mistura com branco (amt>0 clareia) ou preto (amt<0 escurece), amt em [-1, 1].
function mix(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return toHex({ r: r + (target - r) * p, g: g + (target - g) * p, b: b + (target - b) * p });
}

const primary = appConfig.brandPrimary;

// Cor de texto sobre a marca (branco em marcas escuras, quase-preto em claras).
export const onBrand = relativeLuminance(hexToRgb(primary)) > 0.5 ? "#0a0a0a" : "#ffffff";

// Cor primária e derivados para estilos inline (onde não dá para usar CSS vars).
export const brandPrimary = primary;
export const brandLight = mix(primary, 0.28); // versão clara (acentos sobre fundo escuro)
export function brandRgba(alpha: number): string {
  const { r, g, b } = hexToRgb(primary);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// O sidebar é escuro; a cor de destaque nele é uma versão mais clara da marca.
const sidebarPrimary = mix(primary, 0.22);

// Injetável como style no <body>: as vars cascateiam para todo o app e para os islands.
export const brandVars = {
  "--primary": primary,
  "--primary-foreground": onBrand,
  "--ring": primary,
  "--chart-1": primary,
  "--sidebar-primary": sidebarPrimary,
  "--sidebar-primary-foreground": onBrand,
  "--sidebar-ring": sidebarPrimary,
} as CSSProperties;
