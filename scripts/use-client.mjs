#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// use-client.mjs — aponta o build para um escritório white-label.
//
// Lê clients/<slug>/client.mjs e:
//   1. gera o .env.production (Firebase config + marca),
//   2. ajusta firebase.json → hosting.site,
//   3. ajusta .firebaserc → projeto ativo (default).
//
// Uso: node scripts/use-client.mjs <slug>
//
// SEGURANÇA: não cria projetos, não faz deploy, não apaga nada. Só reescreve
// os três arquivos de configuração local a partir do cliente selecionado.
// ─────────────────────────────────────────────────────────────────────────
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];

if (!slug) {
  console.error("✗ Faltou o slug do cliente.");
  console.error("  Uso: node scripts/use-client.mjs <slug>");
  process.exit(1);
}

const clientFile = join(ROOT, "clients", slug, "client.mjs");
if (!existsSync(clientFile)) {
  console.error(`✗ Cliente não encontrado: clients/${slug}/client.mjs`);
  console.error("  Crie a partir do template:  cp -r clients/_template clients/" + slug);
  process.exit(1);
}

const { default: client } = await import(pathToFileURL(clientFile).href);

if (!client?.env || !client.firebaseProject || !client.hostingSite) {
  console.error(`✗ clients/${slug}/client.mjs incompleto (precisa de env, firebaseProject, hostingSite).`);
  process.exit(1);
}

// 1. .env.production — valores com "#" ou "=" ganham aspas (senão o parser quebra).
const envBody = Object.entries(client.env)
  .map(([k, v]) => {
    const s = String(v ?? "");
    return /[#=]/.test(s) ? `${k}="${s}"` : `${k}=${s}`;
  })
  .join("\n");
const header =
  "# Gerado por scripts/use-client.mjs — NÃO editar à mão.\n" +
  `# Cliente: ${slug} (${client.env.NEXT_PUBLIC_APP_NAME}).\n`;
await writeFile(join(ROOT, ".env.production"), header + envBody + "\n");

// 2. firebase.json → hosting.site
const fbPath = join(ROOT, "firebase.json");
const fb = JSON.parse(await readFile(fbPath, "utf8"));
if (!fb.hosting) { console.error("✗ firebase.json sem bloco hosting."); process.exit(1); }
fb.hosting.site = client.hostingSite;
await writeFile(fbPath, JSON.stringify(fb, null, 2) + "\n");

// 3. .firebaserc → projeto ativo
await writeFile(
  join(ROOT, ".firebaserc"),
  JSON.stringify({ projects: { default: client.firebaseProject } }, null, 2) + "\n"
);

console.log(`✓ Cliente "${slug}" selecionado:`);
console.log(`  marca    → ${client.env.NEXT_PUBLIC_APP_NAME} · ${client.env.NEXT_PUBLIC_APP_BRAND_PRIMARY}`);
console.log(`  firebase → ${client.firebaseProject}  (hosting.site: ${client.hostingSite})`);
console.log(`  próximo  → scripts/provision.sh ${slug}`);
