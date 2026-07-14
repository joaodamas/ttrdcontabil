// ─────────────────────────────────────────────────────────────────────────
// Cliente de referência: TTRD Contábil.
//
// Cada escritório white-label é uma pasta clients/<slug>/ com este arquivo.
// `scripts/use-client.mjs <slug>` lê daqui e gera o .env.production + ajusta
// firebase.json (hosting.site) e .firebaserc (projeto ativo). Modelo "Caminho
// A": 1 projeto Firebase por escritório (ver docs_dev/guia-whitelabel-single-tenant.md).
//
// As chaves NEXT_PUBLIC_FIREBASE_* NÃO são segredos (vão para o bundle; a
// segurança vem das Firestore/Storage Rules). Os secrets das Functions
// (CREDENTIAL_KEY, SMTP_*, EMAIL_*) são setados à parte via
// `firebase functions:secrets:set` — ver campo `secrets` abaixo (só lembrete).
// ─────────────────────────────────────────────────────────────────────────
export default {
  slug: "ttrd",
  firebaseProject: "ttrdcontabil-jpproject",
  hostingSite: "ttrdcontabil-jpproject",

  // Vira o .env.production (linha a linha).
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyDzFv78FFgoYY2wXaO43par3Dy4N69o1S8",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "ttrdcontabil-jpproject.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "ttrdcontabil-jpproject",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "ttrdcontabil-jpproject.firebasestorage.app",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1077611965156",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:1077611965156:web:adf49df9b1e34982df1af1",
    NEXT_PUBLIC_APP_URL: "https://gestao.ttrdcontabil.com.br",

    // ── Marca (white-label) ──
    NEXT_PUBLIC_APP_NAME: "TTRD Contábil",
    NEXT_PUBLIC_APP_SHORT_NAME: "TTRD",
    NEXT_PUBLIC_APP_TAGLINE: "Gestão Contábil Integrada",
    NEXT_PUBLIC_APP_TENANT_ID: "ttrd",
    NEXT_PUBLIC_APP_BRAND_PRIMARY: "#2243A5", // azul TTRD (aplicado em toda a UI via brand-theme)
    NEXT_PUBLIC_APP_LOGO_URL: "", // vazio → usa o monograma (iniciais na cor da marca)
  },

  // Dados do escritório usados pelo seed (scripts/seed-single-tenant.mjs).
  escritorio: {
    razaoSocial: "TTRD Contábil",
    nomeFantasia: "TTRD Contábil",
    cnpj: "",
    inscricaoMunicipal: "",
    municipio: "",
    uf: "",
    regimeTributario: "",
    emailAlertas: "",
    ambienteFiscal: "homologacao", // homologacao | producao
  },

  // Lembrete dos secrets das Functions a setar no projeto (valores NÃO ficam aqui).
  secrets: ["CREDENTIAL_KEY", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM", "EMAIL_TO"],
};
