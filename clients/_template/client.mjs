// ─────────────────────────────────────────────────────────────────────────
// TEMPLATE de escritório white-label. Para abrir um cliente novo:
//   cp -r clients/_template clients/<slug>
//   # edite os valores abaixo, depois:
//   node scripts/use-client.mjs <slug>   # gera .env.production + aponta o projeto
//   scripts/provision.sh <slug>          # build + deploy no projeto isolado
//
// Pré-requisitos (uma vez por escritório) — ver docs_dev/guia-whitelabel-single-tenant.md:
//   1. Criar o projeto Firebase próprio (Auth, Firestore, Functions, Hosting, Storage).
//   2. Registrar o app Web e copiar o firebaseConfig para o bloco `env` abaixo.
//   3. Setar os secrets das Functions (lista em `secrets`).
// ─────────────────────────────────────────────────────────────────────────
export default {
  slug: "acmecontabil",                 // curto e estável (= tenantId)
  firebaseProject: "acmecontabil-app",  // projectId do Firebase do escritório
  hostingSite: "acmecontabil-app",      // hosting.site (normalmente = projectId)

  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: "",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "",
    NEXT_PUBLIC_FIREBASE_APP_ID: "",
    NEXT_PUBLIC_APP_URL: "https://gestao.acmecontabil.com.br",

    // ── Marca (white-label) ──
    NEXT_PUBLIC_APP_NAME: "ACME Contábil",
    NEXT_PUBLIC_APP_SHORT_NAME: "ACME",
    NEXT_PUBLIC_APP_TAGLINE: "Gestão Contábil Integrada",
    NEXT_PUBLIC_APP_TENANT_ID: "acmecontabil",
    NEXT_PUBLIC_APP_BRAND_PRIMARY: "#1e40af", // cor do cliente (aplica em toda a UI)
    NEXT_PUBLIC_APP_LOGO_URL: "", // opcional: URL do logo; vazio → monograma nas iniciais
  },

  escritorio: {
    razaoSocial: "",
    nomeFantasia: "",
    cnpj: "",
    inscricaoMunicipal: "",
    municipio: "",
    uf: "",
    regimeTributario: "",
    emailAlertas: "",
    ambienteFiscal: "homologacao",
  },

  secrets: ["CREDENTIAL_KEY", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM", "EMAIL_TO", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
};
