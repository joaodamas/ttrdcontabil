# Usuários e permissões — JP Fiscal

Estado a partir da branch `feat/usuarios-permissoes` (2026-11-05). Decisões do dono:
1. Usuário novo entra por **convite por e-mail** e define a própria senha — ninguém mais a conhece.
2. Senhas de portal dos clientes: visíveis só para **administrador** e **fiscal**.
3. Continuam os 5 perfis; as telas (`telas`) seguem ajustáveis por usuário.

## Onde está cada regra

| O quê | Arquivo |
|---|---|
| Perfis, telas e padrão de telas por perfil (fonte única, front + functions) | `functions/src/usuarios/perfis.ts` (reexportado por `src/lib/permissions.ts`) |
| Criar / atualizar / reenviar convite / excluir usuário | `functions/src/usuarios/callables.ts` (validação pura em `regras.ts`) |
| Checagem de perfil nas functions (uma só) | `functions/src/authz.ts` (`carregarUsuarioAtivo`, `assertPerfil`, `assertAdmin`, `assertCanAccessCliente`) |
| Projeção pública de usuários para seletores | trigger `sincronizarDiretorioUsuario` → `usuarios_diretorio/{uid}` (id, nome, ativo, tenant) |
| Senhas de portal do cliente | `clientes_credenciais/{clienteId}`, **cifradas** e só pelos callables `lerCredenciaisCliente` / `salvarCredenciaisCliente` / `exportarCredenciaisClientes` (`functions/src/clientes/credenciais-callables.ts`); lista de campos em `credenciais-campos.ts` |
| Auditoria de CRUD (clientes, clientes_fiscal, clientes_credenciais, lancamentos, usuarios) | triggers `auditar*` (`functions/src/auditoria/triggers.ts`); redator em `functions/src/audit.ts` |
| Segundo fator (TOTP) e interruptor `configuracoes/seguranca.mfaObrigatorio` | tela `/conta/seguranca`, `src/lib/mfa.ts`; servidor `functions/src/seguranca/mfa.ts` |
| Logout por inatividade (admin/fiscal, 30 min) | `src/lib/sessao-inatividade.ts`, `src/hooks/use-logout-inatividade.ts` |
| Descarte ao excluir cliente (LGPD) | trigger `descartarDadosClienteExcluido` (`functions/src/clientes/descarte.ts`); ver `docs/LGPD-TRATAMENTO.md` |
| Status "preenchida/em branco" sem ler a senha | trigger `sincronizarCredenciaisPreenchidas` → `clientes.credenciaisPreenchidas` (só nomes de campo) |
| Sessão no navegador | `src/lib/auth-client.ts` (ouve `usuarios/{uid}` em tempo real) |

## Perfil × capacidade

"Tela" = padrão do perfil; o admin pode conceder/retirar telas por usuário. As colunas de dados
seguem o **perfil** (e, onde indicado, a tela concedida), conferido em `firestore.rules`.

| Capacidade | admin | operacional | fiscal | financeiro | leitura |
|---|:-:|:-:|:-:|:-:|:-:|
| Gerenciar usuários (criar, convite, perfil/telas, desativar, excluir) | ✔ | — | — | — | — |
| Listar `usuarios` (e-mail, perfil, telas de todos) | ✔ | — | — | — | — |
| Ver nomes nos seletores de responsável (`usuarios_diretorio`) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ler clientes | ✔ | ✔ | ✔ | ✔ | ✔ |
| Criar/editar clientes | ✔ | ✔ | — | — | — |
| Ver/editar **senhas de portal** do cliente (só pelo servidor; cada revelação no log, com IP) | ✔ | — | ✔ | — | — |
| Ver se cada senha está preenchida | ✔ | ✔ | ✔ | ✔ | ✔ |
| Relatório da ficha **com senhas** (exportação auditada) | ✔ | — | — | — | — |
| Ler NFS-e, baixar XML/DANFSe (Firestore, Storage `nfse/`, `obterUrlDanfse` — URL de 5 min) | ✔ | tela fiscal | ✔ | ✔ | — |
| Ler configuração fiscal do cliente (`clientes_fiscal`, `produtos`) | ✔ | tela fiscal | ✔ | — (mesmo com a tela fiscal) | tela fiscal |
| Validar/enviar certificado A1 (`validarCertificado`, `uploadCertificado`) | ✔ | — | ✔ | — | — |
| Fechamento mensal: gerar (`gerarFechamentoMensal`), editar células e encerrar a revisão do mês | ✔ | ✔ | ✔ | — | — |
| Fechamento mensal: reabrir mês travado | ✔ | — | — | — | — |
| Storage `documentos/` (nenhuma tela usa — trancado) | — | — | — | — | — |
| Gravar log de auditoria pelo navegador (só coleções não sensíveis; em nome próprio, e-mail do token, hora do servidor, campos fechados) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ligar/desligar a exigência de 2º fator (só em sessão que entrou com 2º fator) | ✔ | — | — | — | — |
| 2º fator obrigatório (quando o interruptor está ligado) e logout após 30 min parado | ✔ | — | ✔ | — | — |

Telas padrão (`PERFIL_DEFAULT_TELAS`): admin = todas; operacional = hoje, dashboard, clientes,
competências, tarefas, fechamento; fiscal = + fiscal, IR; financeiro = hoje, dashboard, clientes,
financeiro, fiscal; leitura = hoje, dashboard, clientes. (O formulário antigo pré-marcava também
competências e tarefas para "leitura"; quem foi criado assim mantém as telas gravadas.)

## Ciclo de vida do usuário

- **Criar** (`criarUsuario`): admin ativo do mesmo tenant; valida e-mail, perfil e telas; cria a conta
  no Auth com senha aleatória que ninguém conhece e o perfil `usuarios/{uid}` + log na mesma batch.
  Se o perfil falha, a conta recém-criada é apagada (sem órfão). Depois o navegador pede ao Firebase
  o e-mail de "definir senha" (`sendPasswordResetEmail`, idioma pt) — esse é o convite.
- **E-mail já existe no Auth**: com perfil → "Já existe um usuário com este e-mail." (mesma mensagem
  para qualquer tenant). **Sem perfil** (sobra do fluxo antigo ou de cadastro público) → a conta é
  reaproveitada: senha trocada por aleatória, conta reabilitada, sessões revogadas, perfil criado e
  convite enviado. Quem tinha criado a conta perde o acesso; só o dono do e-mail define a senha.
  **Desde 2026-11-06 só se for seguro** (`decidirReaproveitamentoConta` em
  `functions/src/usuarios/regras.ts`): a conta precisa ter **só provedor de senha**, **nenhum 2º fator**
  e **nenhum login nos últimos 30 dias**. Motivo: trocar a senha só derruba quem conhece a senha — com
  Google/telefone vinculado ou um TOTP cadastrado, quem criou a conta continuaria entrando, agora com
  perfil e dados do escritório; e uma conta usada há pouco é de alguém, que perderia o acesso sem aviso.
  Fora dessas condições o callable recusa (`failed-precondition`) pedindo para remover a conta órfã no
  console do Firebase Authentication ou usar outro e-mail. Risco residual: conta só-senha, parada há
  mais de 30 dias, criada por terceiro com o e-mail de outra pessoa — o reaproveitamento a toma de volta
  para o dono do e-mail (o convite vai para a caixa dele), que é o comportamento desejado.
- **Reenviar convite / redefinir senha** (`redefinirSenhaUsuario`): confere admin + alvo ativo do
  tenant, registra no log e devolve o e-mail; o navegador dispara o e-mail. O link **não** é
  devolvido ao admin (ele poderia definir a senha no lugar do usuário).
- **Desativar/reativar** (`atualizarUsuario` com `ativo`): perfil primeiro, depois
  `auth.updateUser({ disabled })` e, ao desativar, `revokeRefreshTokens`. A tela do usuário
  desativado cai na hora (o front ouve o próprio perfil). Se o Auth falhar, a function devolve erro
  e repetir a ação reaplica o estado.
- **Excluir** (`excluirUsuario`): hard delete do perfil e da conta de login. Desativar é o caminho
  reversível; excluir serve para cadastro errado e pedido de remoção de dados. Tarefas/registros
  antigos mantêm o nome gravado; o log guarda id e antes/depois. Se a exclusão no Auth falhar, a
  conta é desabilitada e reaproveitável num novo cadastro do mesmo e-mail.
- **Último admin**: qualquer mudança que deixaria o tenant sem admin ativo (rebaixar, desativar,
  excluir — inclusive a si mesmo) é recusada, checada dentro da transação. Ninguém se desativa nem se
  exclui.
- **Auditoria**: todo create/update/convite/delete grava em `logs_auditoria` (entidade `usuarios`,
  `entidadeId` = uid, ator, antes/depois de nome/perfil/telas/ativo) na mesma transação.
- **`ativo` ausente** conta como **ativo** em todo lugar (regras, functions, front). Perfis antigos
  criados por script não têm o campo; o script do diretório lista quais são.
- **Sem perfil = sem acesso**: login sem `usuarios/{uid}`, inativo ou com perfil inválido mostra
  "Sem acesso" e desloga (antes entrava como "leitura").

## Ordem de deploy

Rodar da raiz do repositório, projeto `ttrdcontabil-jpproject` (`.firebaserc`). Cada passo depende do anterior.

```bash
# 1. Functions (callables novos, triggers, authz endurecido). authz.ts é usado por quase
#    todas as functions: publicar o conjunto inteiro.
firebase deploy --only functions

# 2. Carga inicial do diretório de usuários (o trigger só reage a escritas novas).
node scripts/sincronizar-diretorio-usuarios.mjs            # dry-run: confira a lista
node scripts/sincronizar-diretorio-usuarios.mjs --aplicar

# 3. Regras do Firestore e do Storage.
firebase deploy --only firestore:rules,storage

# 4. Front (logo em seguida: entre 3 e 4 os seletores de responsável do front antigo
#    ficam vazios para quem não é admin, e a tela antiga de usuários deixa de salvar).
firebase deploy --only hosting

# 5. Migração das senhas de portal para clientes_credenciais.
node scripts/migrar-credenciais-clientes.mjs               # dry-run: só nomes de campo e contagens
node scripts/migrar-credenciais-clientes.mjs --aplicar
```

Os scripts usam `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON) ou Application Default Credentials
(`gcloud auth application-default login`); projeto por `FIREBASE_PROJECT_ID`.

6. **Console do Firebase — só depois do passo 1**: Authentication → Settings → User actions →
   desmarcar **"Enable create (sign-up)"**. Antes disso a criação pelo navegador ainda é o único
   caminho do front antigo; depois, só os callables (Admin SDK) criam contas.
7. **Console — modelo do e-mail**: Authentication → Templates → **Redefinição de senha** → idioma
   português, assunto e texto que sirvam de convite ("Defina sua senha de acesso ao JP Fiscal").

Primeiro admin de um ambiente novo: os scripts antigos `setup-admin.mjs`/`check-usuario.mjs` gravam
o perfil pelo SDK do navegador e as regras não deixam mais; criar o perfil pelo Console do Firestore
ou por Admin SDK (`usuarios/{uid}` com `nome`, `email`, `perfil: 'admin'`, `ativo: true`, `tenantId`).

## Rollback

- **Hosting**: Console → Hosting → versão anterior → Rollback. O front antigo volta a ler
  `usuarios` (precisa das regras antigas para não-admin) e as senhas em `clientes` (vazias para
  quem já foi migrado).
- **Regras**: `git checkout <commit-anterior> -- firestore.rules storage.rules` e
  `firebase deploy --only firestore:rules,storage` (ou restaurar a versão anterior no Console →
  Firestore → Regras, que guarda o histórico).
- **Functions**: os callables novos podem ficar no ar (só admin os chama). Para voltar o endurecimento
  de `gerarDanfse`/`validarCertificado`, publicar a versão anterior das functions.
- **Migração das senhas**: não apaga nada sem copiar (cópia e remoção na mesma transação). Para
  desfazer, copiar de volta de `clientes_credenciais/{id}` para `clientes/{id}` (Admin SDK) **antes**
  de reverter as regras — com as regras novas o navegador não grava senha em `clientes`.
- **Cadastro público**: reabilitar "Enable create (sign-up)" só junto com o rollback do hosting.

## Segurança e auditoria (branch `feat/seguranca-auditoria`, 2026-11-06)

### O que mudou
- **Trilha de auditoria no servidor**: triggers `auditarClientes`, `auditarClientesFiscal`,
  `auditarClientesCredenciais`, `auditarLancamentos`, `auditarUsuarios` gravam antes/depois de toda
  escrita (tela, SDK direto, script ou console), com o uid do contexto do evento e nome/e-mail da
  conta no Firebase Auth. O navegador deixou de logar essas coleções. Senhas de portal: o log leva
  só os nomes dos campos. Id do log = id do evento (reentrega não duplica).
- **Callables gravam IP e navegador** (`ip`, `userAgent`) e o ator vem do token, não de
  `usuarios.nome` (que o próprio usuário edita).
- **Redator** (`audit.ts`): mantém `certTitular`/`certVencimento`/`certValido` e a lista
  `credenciaisPreenchidas`; dentro de um bloco de credenciais todo o resto vira `[REDACTED]`;
  `login*` (usuário do portal) passou a ser redigido também no servidor.
- **`logs_auditoria` pelo navegador**: só em nome próprio, `usuarioEmail` = e-mail do token,
  `origem: 'client'`, `criadoEm` = hora do servidor, conjunto fechado de campos.
- **`events`**: o navegador cria só `fechamento` (operacional/fiscal/admin) e `lancamento`
  (financeiro/admin), em nome próprio e com hora do servidor. **`nfse_eventos`**: só servidor.
- **Senhas de portal**: o navegador não lê nem grava `clientes_credenciais`; os callables cifram com
  `CREDENTIAL_KEY` (mesmo helper AES-256-GCM das credenciais fiscais). A ficha mostra mascarado e
  revela **um campo por clique** (cada clique = 1 log com IP); o formulário só carrega as senhas no
  botão "Mostrar e editar senhas". Exportação com senhas (admin) pelo callable, auditada.
- **M1**: financeiro não lê mais `clientes_fiscal`/`produtos` (a tela 'fiscal' padrão dele dava
  acesso ao bloco `credenciais`). As telas dele seguem lendo NFS-e.
- **DANFSe**: sem token de download permanente; `obterUrlDanfse` confere quem lê a nota e devolve
  URL assinada de 5 min (ou o PDF em base64, se a conta de serviço não puder assinar).
  `gerarDanfse` segue no ar com o mesmo contrato, para o front antigo em cache.
- **2º fator (TOTP)** em `/conta/seguranca` (QR Code) e no login; interruptor
  `configuracoes/seguranca.mfaObrigatorio` (padrão desligado). Ligado: admin/fiscal sem 2º fator
  vão para o cadastro, e os callables de usuários, senhas de portal e certificado A1 recusam sessão
  sem 2º fator.
- **Inatividade**: admin/fiscal saem após 30 min sem mexer em nenhuma aba (aviso 1 min antes).
- **Cabeçalhos** no hosting: CSP **aplicada** (não report-only), `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
- **Baixos**: `clientes_fiscal_integracao` trancada; `measurementId` removido do config (sem
  Analytics); Storage `documentos/` trancado.
- **Descarte LGPD** ao excluir cliente (ver `docs/LGPD-TRATAMENTO.md`).

### Ordem de deploy (esta branch)

1. Confirme que o segredo `CREDENTIAL_KEY` existe (já usado pelas credenciais fiscais):
   `firebase functions:secrets:access CREDENTIAL_KEY` (não cole a saída em lugar nenhum).
2. `firebase deploy --only functions` — **primeiro**: o front novo chama `lerCredenciaisCliente`,
   `salvarCredenciaisCliente`, `exportarCredenciaisClientes` e `obterUrlDanfse`. Triggers de
   auditoria e de descarte entram junto.
3. `firebase deploy --only hosting` — front novo + cabeçalhos/CSP. O front novo funciona com as
   regras antigas.
4. `firebase deploy --only firestore:rules,storage` — tranca `clientes_credenciais`, endurece
   logs/events, M1, `documentos/`. Depois deste passo o front **antigo** não lê mais senhas; por isso
   vem depois do hosting.
5. Scripts, sempre primeiro em dry-run e depois com `--aplicar`:
   - `node scripts/migrar-credenciais-clientes.mjs` (se ainda houver senha em `clientes`);
   - `node scripts/cifrar-credenciais-clientes.mjs` com `CREDENTIAL_KEY` no ambiente (pegue com
     `gcloud secrets versions access latest --secret=CREDENTIAL_KEY --project ttrdcontabil-jpproject`);
   - `node scripts/revogar-tokens-danfse.mjs` (apaga os links permanentes antigos do DANFSe).

### Passos de console (nesta ordem)
1. **URL assinada do DANFSe** (recomendado, junto do passo 2 acima): IAM → conta de serviço das
   functions (`<número-do-projeto>-compute@developer.gserviceaccount.com`) → conceder a ela mesma
   **Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`) e habilitar a
   **IAM Service Account Credentials API**. Sem isso o DANFSe ainda abre (o PDF vem em base64).
2. **2º fator** (quando for usar): Firebase Console → Authentication → Settings → **Upgrade to
   Firebase Authentication with Identity Platform** (confira o plano/custos). Depois habilitar TOTP —
   não há botão no console; uma vez, com credencial de dono do projeto:
   ```bash
   curl -X PATCH "https://identitytoolkit.googleapis.com/admin/v2/projects/ttrdcontabil-jpproject/config?updateMask=mfa" \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "Content-Type: application/json" \
     -H "X-Goog-User-Project: ttrdcontabil-jpproject" \
     -d '{"mfa":{"providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":5}}]}}'
   ```
3. Cada admin e fiscal abre **Administração → Segurança** (ou `/conta/seguranca`), confirma o
   e-mail se pedido e cadastra o aplicativo. Um admin **sai e entra de novo com o código** e liga
   "Exigir 2º fator de administradores e fiscais". Desligar em emergência sem admin com 2º fator:
   Console do Firestore → `configuracoes/seguranca` → `mfaObrigatorio: false`.
4. **Futuro — App Check** (não feito): registrar o app web com reCAPTCHA Enterprise no Console →
   App Check, pôr a chave no build (`initializeAppCheck`), observar as métricas e só então ligar o
   enforcement em Firestore, Storage e Functions.

### Rollback
- Hosting: versão anterior no Console — reverter as regras junto (o front antigo lê senhas direto).
- Regras: `git checkout <commit-anterior> -- firestore.rules storage.rules` e publicar.
- CSP quebrando alguma tela: trocar a chave `Content-Security-Policy` por
  `Content-Security-Policy-Report-Only` no `firebase.json` e publicar só o hosting.
- 2º fator: `configuracoes/seguranca.mfaObrigatorio = false` pelo console.
- Senhas cifradas não voltam a texto puro sozinhas; o leitor aceita os dois formatos.

## Riscos e pendências conhecidos

- **CSP com `'unsafe-inline'` em `script-src`/`style-src`**: o export estático do Next injeta
  scripts inline (`self.__next_f.push(...)`, hidratação) sem nonce — site estático não gera nonce
  por requisição — e a UI usa `style=""`. A CSP ainda bloqueia script de outro domínio, `eval`,
  `object`, `<base>` e iframe de terceiros. Validada com build + emuladores e Playwright nas telas
  principais (CHANGELOG); tela não visitada pode esbarrar num domínio novo (ex.: logo externo) — o
  rollback é Report-Only.
- Os triggers de auditoria usam `authType`/`authId` do evento; o `firebase-functions` 6.x não tipa
  `app_user`, então um `authId` sem `@` é tratado como uid e confirmado no Auth.
- Callables de emissão/ciclo de NFS-e (`functions/src/nfse/**`, fora desta branch) ainda tiram o
  nome do ator de `usuarios.nome` e não gravam IP.
- Sem testes automáticos de `storage.rules` (só Firestore no emulador).
- Callables testados por unidade nas regras puras; o fluxo completo (Auth + Firestore) não roda em
  CI — validar em homologação: criar, convite, desativar com sessão aberta, último admin, excluir.
