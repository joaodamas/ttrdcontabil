# Deploy — TTRD Contábil | Gestão
## gestao.ttrdcontabil.com.br

---

## 1. Pré-requisitos

- Conta no [Vercel](https://vercel.com)
- Firebase CLI: `npm install -g firebase-tools`
- Projeto Firebase: `ttrdcontabil-jpproject`

---

## 2. Configurar Firebase Auth — Session Cookies

No Console Firebase:
1. **Authentication > Sign-in method** → Habilitar **E-mail/senha**
2. **Authentication > Settings > Authorized domains** → Adicionar:
   - `gestao.ttrdcontabil.com.br`
   - `ttrdcontabil-jpproject.vercel.app` (temporário)

---

## 3. Gerar Service Account (Firebase Admin SDK)

1. Console Firebase → **Configurações do projeto** (⚙️) → **Contas de serviço**
2. Clique em **Gerar nova chave privada**
3. Faça download do arquivo JSON
4. Minifique o conteúdo (sem quebras de linha):
   ```bash
   cat service-account.json | tr -d '\n'
   ```
5. Esse valor vai em `FIREBASE_SERVICE_ACCOUNT_KEY` nas variáveis de ambiente

---

## 4. Deploy no Vercel

### Via CLI:
```bash
cd app-temp
npm install -g vercel
vercel login
vercel --prod
```

### Via GitHub (recomendado):
1. Push para GitHub
2. Conectar repo no Vercel
3. Framework: **Next.js** (auto-detectado)

### Variáveis de ambiente no Vercel:
Configure em **Settings > Environment Variables**:

| Variável | Valor |
|----------|-------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyDzFv78FFgoYY2wXaO43par3Dy4N69o1S8` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `ttrdcontabil-jpproject.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `ttrdcontabil-jpproject` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `ttrdcontabil-jpproject.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `1077611965156` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:1077611965156:web:adf49df9b1e34982df1af1` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `G-TCQG0TXZZE` |
| `NEXT_PUBLIC_APP_URL` | `https://gestao.ttrdcontabil.com.br` |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | *(conteúdo do JSON minificado)* |

---

## 5. Domínio no Vercel

1. Vercel → **Settings > Domains**
2. Adicionar: `gestao.ttrdcontabil.com.br`
3. O Vercel vai te dar um valor CNAME, ex: `cname.vercel-dns.com`

---

## 6. Configurar DNS no Cloudflare

1. Acesse o Cloudflare do domínio `ttrdcontabil.com.br`
2. **DNS > Add record**:

| Tipo | Nome | Valor | Proxy |
|------|------|-------|-------|
| CNAME | `gestao` | `cname.vercel-dns.com` | ☁️ Proxied (ligado) |

3. Com o proxy do Cloudflare ativo você ganha:
   - SSL automático
   - Proteção DDoS
   - Cache de borda
   - Headers de segurança (configurar em Rules > Transform Rules)

---

## 7. Regras de Segurança do Firestore e Storage

```bash
firebase login
firebase use ttrdcontabil-jpproject
firebase deploy --only firestore:rules,firestore:indexes,storage
```

---

## 8. Seed inicial (apenas uma vez)

Depois do deploy, rode o seed para popular conectores e criar o admin:

```bash
# Configure o .env.local com FIREBASE_SERVICE_ACCOUNT_KEY
npx tsx src/scripts/seed.ts
```

**Admin criado:**
- E-mail: `admin@ttrdcontabil.com.br`
- Senha inicial: `Admin@123456`
- ⚠️ **TROQUE A SENHA NO PRIMEIRO LOGIN!**

---

## 9. Criar usuários adicionais

Após o deploy, acesse:
`https://gestao.ttrdcontabil.com.br/admin/usuarios`

Crie os usuários da equipe com os perfis corretos:
- `admin` — Acesso total
- `operacional` — Clientes, competências, tarefas, IR
- `fiscal` — NFS-e, configurações fiscais
- `financeiro` — Lançamentos, cobrança
- `leitura` — Apenas visualização

---

## 10. Headers de Segurança (Cloudflare)

Configure em **Cloudflare > Rules > Transform Rules > Modify Response Header**:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## Arquitetura de infraestrutura

```
gestao.ttrdcontabil.com.br
         │
    [Cloudflare]
    (proxy, DDoS, SSL, cache)
         │
      [Vercel]
    (Next.js 16, SSR)
         │
    [Firebase]
    Auth │ Firestore │ Storage
```
