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
| Senhas de portal do cliente | `clientes_credenciais/{clienteId}`; lista de campos em `functions/src/clientes/credenciais-campos.ts` |
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
| Ver/editar **senhas de portal** do cliente | ✔ | — | ✔ | — | — |
| Ver se cada senha está preenchida | ✔ | ✔ | ✔ | ✔ | ✔ |
| Relatório da ficha **com senhas** (exportação auditada) | ✔ | — | — | — | — |
| Ler NFS-e, baixar XML/DANFSe (Firestore, Storage `nfse/`, `gerarDanfse`) | ✔ | tela fiscal | ✔ | ✔ | — |
| Validar/enviar certificado A1 (`validarCertificado`, `uploadCertificado`) | ✔ | — | ✔ | — | — |
| Storage `documentos/` (leitura; escrita só servidor) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Gravar log de auditoria (só em nome próprio, origem `client`) | ✔ | ✔ | ✔ | ✔ | ✔ |

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

## Riscos e pendências conhecidos

- DANFSe: `pdfUrl` é URL com token de download do Storage, que ignora `storage.rules`. Ela só fica
  em `nfse_emitidas` (lido por quem lê NFS-e), mas quem a copiou continua com acesso. Trocar por
  URL assinada de curta duração se isso importar.
- `documentos/` no Storage segue legível por qualquer usuário ativo do tenant (como a coleção
  `documentos`); nenhuma tela usa hoje. Restringir por perfil antes de guardar ali documento sensível.
- Sem testes automáticos de `storage.rules` (só Firestore no emulador).
- Callables testados por unidade nas regras puras; o fluxo completo (Auth + Firestore) não roda em
  CI — validar em homologação: criar, convite, desativar com sessão aberta, último admin, excluir.
