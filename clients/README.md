# Clientes white-label (Contábil)

Cada escritório é uma instância **isolada** (Caminho A): 1 projeto Firebase por cliente, mesmo código, marca e dados próprios. Este diretório guarda a identidade de cada cliente; os scripts leem daqui.

```
clients/
├── _template/client.mjs   # modelo — copie para começar
└── ttrd/client.mjs        # cliente de referência (TTRD Contábil)
```

## Abrir um cliente novo

**1. Pré-requisitos (uma vez, manual)** — ver [`docs_dev/guia-whitelabel-single-tenant.md`](../docs_dev/guia-whitelabel-single-tenant.md):
- Criar o projeto Firebase do escritório (Auth, Firestore, Functions, Hosting, Storage) no plano Blaze.
- Registrar o app Web e copiar o `firebaseConfig`.
- Setar os secrets das Functions no projeto: `CREDENTIAL_KEY`, `SMTP_*`, `EMAIL_*`.

**2. Criar a identidade do cliente:**
```bash
cp -r clients/_template clients/<slug>
# edite clients/<slug>/client.mjs:
#   - firebaseProject / hostingSite  (projectId do Firebase do escritório)
#   - env.NEXT_PUBLIC_FIREBASE_*      (o firebaseConfig copiado)
#   - env.NEXT_PUBLIC_APP_NAME / _SHORT_NAME / _TAGLINE / _TENANT_ID
#   - env.NEXT_PUBLIC_APP_BRAND_PRIMARY  (a cor do cliente — aplica em TODA a UI)
#   - env.NEXT_PUBLIC_APP_LOGO_URL       (opcional; vazio → monograma nas iniciais)
#   - escritorio.*                       (razão social, CNPJ… usados no seed)
```

**3. Publicar:**
```bash
scripts/provision.sh <slug>          # aponta a marca → build → deploy (pede confirmação)
```
Por baixo: `use-client.mjs` gera o `.env.production` + ajusta `firebase.json`/`.firebaserc`, depois `next build` e `firebase deploy` no projeto do cliente.

**4. Pós-deploy:** semear os dados iniciais (admin + escritório + serviços base), apontar o domínio no Hosting e restringir a API key por domínio no Google Cloud. Checklist de aceite no guia.

## Como a marca é aplicada

- **Cores**: `NEXT_PUBLIC_APP_BRAND_PRIMARY` → `src/lib/brand-theme.ts` deriva a paleta (com contraste automático para cores claras) e injeta como CSS vars no `<body>` — cascata para todo o app e islands.
- **Nome / tagline / monograma**: `src/lib/app-config.ts` (o monograma são as iniciais do nome curto quando não há logo).
- **Logo**: se `NEXT_PUBLIC_APP_LOGO_URL` estiver preenchido, usa a imagem; senão, o monograma na cor da marca.

Trocar a cor no `client.mjs` e rebuildar troca a identidade inteira (validado: TTRD azul → cliente-teste roxo, sem tocar em nenhum componente).
