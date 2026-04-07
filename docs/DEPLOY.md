# Deploy — TTRD Contábil | Gestão
## gestao.ttrdcontabil.com.br

**Stack:** Next.js 16 → Firebase App Hosting → Cloudflare DNS

---

## 1. Pré-requisitos

```bash
npm install -g firebase-tools
firebase login
firebase use ttrdcontabil-jpproject
```

---

## 2. Habilitar Firebase Auth

No [Console Firebase](https://console.firebase.google.com/project/ttrdcontabil-jpproject):

1. **Authentication > Sign-in method** → Habilitar **E-mail/senha**
2. **Authentication > Settings > Authorized domains** → Adicionar:
   - `gestao.ttrdcontabil.com.br`
   - `ttrdcontabil-jpproject.web.app` (domínio padrão do App Hosting)

---

## 3. Deploy das Regras Firestore + Storage

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

---

## 4. Firebase App Hosting

### 4.1 Criar o backend no Console Firebase

1. Acesse: **Hosting > App Hosting** no Console Firebase
2. Clique em **Get started** (ou **Add backend**)
3. Conecte ao repositório GitHub: `joaodamas/ttrdcontabil`
4. Branch de deploy: `master`
5. Root directory: `app-temp` *(se o Next.js estiver em subpasta)*
6. Confirme o nome do backend: `ttrdcontabil-gestao` (ou qualquer nome)

> O Firebase App Hosting usa `apphosting.yaml` na raiz do projeto para configurações.  
> As variáveis de ambiente públicas já estão definidas no `apphosting.yaml`.  
> O SDK Admin usa **Application Default Credentials** automaticamente — sem necessidade de `FIREBASE_SERVICE_ACCOUNT_KEY` em produção.

### 4.2 Permissões do Service Account (App Hosting)

O App Hosting usa a conta `firebase-app-hosting-compute@ttrdcontabil-jpproject.iam.gserviceaccount.com`.

No [IAM do Google Cloud](https://console.cloud.google.com/iam-admin/iam?project=ttrdcontabil-jpproject), confirme que ela tem os roles:
- `Firebase Admin SDK Administrator Service Agent`
- `Cloud Datastore User` (Firestore)
- `Storage Admin`

### 4.3 Deploy via GitHub Actions (automático)

Após conectar o repo, cada `git push origin master` aciona um deploy automático.

**Deploy manual forçado:**
```bash
firebase apphosting:backends:create   # apenas na primeira vez
# ou via Console > App Hosting > Rollouts > Deploy manually
```

---

## 5. Domínio customizado

### 5.1 Adicionar no App Hosting

1. Console Firebase > **App Hosting > seu backend > Custom domains**
2. Adicionar: `gestao.ttrdcontabil.com.br`
3. O Firebase vai fornecer um valor de DNS para verificação

### 5.2 Configurar DNS no Cloudflare

| Tipo | Nome | Valor | Proxy |
|------|------|-------|-------|
| CNAME | `gestao` | `ttrdcontabil-gestao.web.app` | ☁️ Proxied |

*(Substitua pelo valor exato que o Firebase App Hosting fornecer)*

> Com Cloudflare Proxied ativo: SSL automático, proteção DDoS, cache de borda.

---

## 6. Seed inicial (apenas uma vez)

Execute localmente com o `.env.local` configurado:

```bash
# Certifique-se que FIREBASE_SERVICE_ACCOUNT_KEY está em .env.local
npx tsx src/scripts/seed.ts
```

**Admin criado:**
- E-mail: `admin@ttrdcontabil.com.br`
- Senha inicial: `Admin@123456`
- ⚠️ **TROQUE A SENHA NO PRIMEIRO LOGIN!**

---

## 7. Desenvolvimento local

```bash
cp .env.local.example .env.local   # ou edite manualmente
# Configure FIREBASE_SERVICE_ACCOUNT_KEY com o JSON da conta de serviço
npm run dev
```

Para gerar a chave de serviço local:
1. Console Firebase → ⚙️ → **Contas de serviço**
2. **Gerar nova chave privada** → baixar JSON
3. Minificar: `node -e "console.log(JSON.stringify(require('./service-account.json')))" > key.txt`
4. Colar o conteúdo em `FIREBASE_SERVICE_ACCOUNT_KEY=...` no `.env.local`

---

## 8. Arquitetura

```
gestao.ttrdcontabil.com.br
         │
    [Cloudflare]
    (proxy, DDoS, SSL, cache)
         │
 [Firebase App Hosting]
   (Next.js 16 SSR + API)
   Cloud Run gerenciado
         │
    [Firebase]
 Auth │ Firestore │ Storage
```

---

## 9. Headers de Segurança (Cloudflare)

Configure em **Rules > Transform Rules > Modify Response Header**:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```
