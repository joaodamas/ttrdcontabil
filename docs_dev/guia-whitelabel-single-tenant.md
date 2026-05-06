# Guia whitelabel single-tenant

Status inicial em 2026-05-05.

Objetivo: criar um novo ambiente isolado da plataforma TTRD Contabil para outro escritorio, reaproveitando funcionalidades e alterando apenas identidade, configuracoes e dados iniciais.

## Decisao de arquitetura

- Cada escritorio deve ter um projeto Firebase proprio.
- Nao deve haver mais de um escritorio operando no mesmo Firestore.
- O campo `tenantId` continua obrigatorio, mas representa o ambiente fixo, nao uma selecao de cliente SaaS na UI.
- Tenant atual da TTRD: `ttrd`.
- Para novo escritorio, usar um tenant curto e estavel, por exemplo `acmecontabil`.

## Pre-requisitos

- Acesso ao Firebase Console.
- Firebase CLI autenticada.
- Node.js compativel com o projeto.
- Java 21+ para executar testes de regras no emulator.
- Dominio do novo escritorio ou subdominio temporario.
- Dados fiscais e administrativos do escritorio.

## 1. Criar projeto Firebase

1. Criar novo projeto no Firebase Console.
2. Ativar Authentication.
3. Ativar Firestore.
4. Ativar Storage.
5. Ativar Functions.
6. Ativar Hosting.
7. Criar Web App no projeto.
8. Copiar as credenciais publicas do Web SDK.

## 2. Configurar variaveis do frontend

Criar arquivo de ambiente equivalente ao `.env.production` do novo projeto.

Variaveis obrigatorias atuais:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_APP_URL=
```

Variaveis recomendadas para evolucao whitelabel:

```env
NEXT_PUBLIC_APP_NAME=
NEXT_PUBLIC_APP_SHORT_NAME=
NEXT_PUBLIC_APP_TAGLINE=
NEXT_PUBLIC_APP_TENANT_ID=
NEXT_PUBLIC_APP_BRAND_PRIMARY=
NEXT_PUBLIC_APP_LOGO_URL=
```

Observacao: se essas variaveis recomendadas ainda nao existirem no codigo, criar tarefa tecnica antes do primeiro clone real.

## 3. Configurar secrets das Functions

Secrets obrigatorios conforme uso do ambiente:

```bash
firebase functions:secrets:set CREDENTIAL_KEY
firebase functions:secrets:set SMTP_HOST
firebase functions:secrets:set SMTP_PORT
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
firebase functions:secrets:set EMAIL_FROM
firebase functions:secrets:set EMAIL_TO
```

`CREDENTIAL_KEY` precisa ser uma chave hex valida de 32 bytes para criptografia de credenciais fiscais.

## 4. Ajustar Firebase Hosting

1. Atualizar `firebase.json` com o novo `hosting.site`.
2. Validar rewrites de rotas dinamicas.
3. Configurar dominio customizado.
4. Restringir API key por dominio/referrer no Google Cloud Console.

## 5. Publicar regras e indices

Executar no novo projeto:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Antes de liberar uso real, executar:

```bash
npm run test:rules
```

## 6. Seed inicial

O seed do ambiente deve criar:

- usuario admin inicial;
- documento em `usuarios/{uid}` com `ativo = true`, perfil admin e `tenantId` fixo;
- parametros do escritorio;
- servicos base;
- conectores fiscais;
- configuracao de e-mail;
- configuracao fiscal padrao;
- telas/permissoes padrao por perfil.

Nenhum usuario autenticado deve conseguir acessar dados se nao existir documento ativo em `usuarios/{uid}`.

## 7. Dados obrigatorios do escritorio

- Razao social.
- Nome fantasia.
- CNPJ.
- Inscricao municipal.
- Municipio e UF.
- Regime tributario.
- Certificado digital ou credencial municipal.
- E-mail de alertas.
- Responsaveis operacionais.
- Ambiente fiscal padrao: homologacao ou producao.

## 8. Deploy

Fluxo recomendado:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
firebase deploy
```

Depois do deploy:

```bash
npm run smoke:prod
```

O smoke depende de credenciais reais configuradas no ambiente.

## 9. Checklist de aceite do clone

- [ ] Login funciona.
- [ ] Usuario admin possui perfil e `tenantId` correto.
- [ ] Usuario autenticado sem cadastro interno nao acessa dados.
- [ ] Firestore Rules aprovadas no emulator.
- [ ] Storage Rules aprovadas no emulator.
- [ ] Branding correto.
- [ ] Parametros do escritorio preenchidos.
- [ ] Servicos base cadastrados.
- [ ] Cliente teste cadastrado.
- [ ] Servico vinculado ao cliente teste.
- [ ] Competencia do mes criada.
- [ ] Tarefa operacional criada e concluida.
- [ ] Lancamento financeiro criado e baixado.
- [ ] Configuracao fiscal validada.
- [ ] Certificado/credencial fiscal validado.
- [ ] Rascunho NFS-e criado em homologacao.
- [ ] Emissao NFS-e homologada para municipio liberado.
- [ ] Consulta NFS-e homologada.
- [ ] Cancelamento NFS-e homologado, se aplicavel.

## 10. Itens que nao devem ser clonados

- Clientes reais da TTRD.
- Usuarios reais da TTRD.
- Logs de auditoria da TTRD.
- NFS-e emitidas da TTRD.
- Certificados ou credenciais fiscais da TTRD.
- Backups de producao da TTRD.

## 11. Riscos

- Copiar dados reais por engano para ambiente whitelabel.
- Deixar API key sem restricao de dominio.
- Criar usuario Auth sem documento interno em `usuarios/{uid}` e permitir acesso por regra permissiva.
- Esquecer `tenantId` fixo no seed.
- Publicar municipio fiscal sem homologacao real.
- Reaproveitar certificado/credencial de outro ambiente.
