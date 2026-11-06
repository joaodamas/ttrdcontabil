# Restauração de backup do Firestore — runbook

Vale para o projeto `ttrdcontabil-jpproject`. O backup semanal é a function
`exportarFirestoreSemanal` (`functions/src/backup.ts`, domingo 02:00 BRT) →
`gs://ttrdcontabil-jpproject-backups/firestore/<AAAA-MM-DD>`. Além dele, o PITR
(7 dias) cobre erros recentes sem precisar de export.

> **O risco fiscal da restauração**: o export inclui `dps_sequencias` (contador
> do número da DPS por prestador/ambiente/série). Restaurar um backup de domingo
> numa quinta volta o contador para domingo — as notas emitidas de segunda a
> quinta usaram números que o contador "esqueceu". A próxima emissão repetiria
> esses números (E0014 na Sefin). A emissão pula sozinha os números colididos
> (até 5 por nota), mas o certo é **recalcular o contador antes de liberar a
> emissão** (passo 4).

## 0. Antes de tudo

1. Pare a emissão: Administração → Ambiente Nacional → desligue "produção
   liberada" (configuracoes/nfse_nacional). Os crons de recorrência e a rotina
   de reconciliação de 15 min continuam rodando, mas sem a chave nada sai em
   produção.
2. Anote a hora. Exporte o estado ATUAL antes de restaurar (é o seu "desfazer"):

   ```bash
   gcloud firestore export gs://ttrdcontabil-jpproject-backups/firestore/pre-restauracao-$(date +%Y%m%d-%H%M) \
     --project=ttrdcontabil-jpproject
   ```

## 1. Escolher o ponto de restauração

- Erro de até 7 dias: prefira **PITR** (restaura num banco novo, com precisão de
  minuto) — `gcloud firestore databases restore --source-backup=...` ou o
  console → Firestore → Disaster recovery.
- Mais antigo: o export semanal.

```bash
gcloud storage ls gs://ttrdcontabil-jpproject-backups/firestore/
```

## 2. Restaurar só o necessário

Importe só as coleções afetadas sempre que possível (`--collection-ids`). Um
import **sobrescreve** documentos com o mesmo id e **não apaga** os que não
estão no backup.

```bash
gcloud firestore import gs://ttrdcontabil-jpproject-backups/firestore/<AAAA-MM-DD> \
  --collection-ids=clientes,clientes_fiscal \
  --project=ttrdcontabil-jpproject
```

**Não importe `dps_sequencias`, `nfse_emitidas` nem `nfse_rascunhos`** de um
backup antigo se houve emissão depois dele: as notas emitidas depois do backup
existem na Sefin e precisam continuar registradas. Se for inevitável (restauração
total), siga os passos 3 e 4 com cuidado redobrado.

## 3. Conferir as notas do período

Notas emitidas entre o backup e a restauração continuam na Sefin. Se
`nfse_emitidas` foi restaurada, elas somem da plataforma — e os rascunhos voltam
a "aguardando". **Não emita de novo**: o rascunho com número reservado consulta
a Sefin antes de reenviar (`GET /dps/{id}`) e registra a nota que já existe. Para
notas emitidas pelo formulário (rascunho `emissao_<chave>`), confira o histórico
no Emissor Nacional do governo antes de qualquer reemissão.

## 4. Recalcular o contador da DPS (obrigatório depois de restaurar)

```bash
node scripts/recalcular-contador-dps.mjs            # dry-run: mostra o que mudaria
node scripts/recalcular-contador-dps.mjs --aplicar  # grava
```

O script pega, por prestador + ambiente + série, o maior número em
`nfse_emitidas` (pelo `idDps`), nos rascunhos com número reservado e no
"próximo número da DPS" da configuração fiscal, e sobe o contador até ele.
**Nunca desce.** Números usados fora da plataforma (site/app do Emissor
Nacional) não aparecem no banco: se o cliente emitiu por lá, informe o próximo
número em Configuração fiscal → Ambiente Nacional.

Credencial: `gcloud auth application-default login` (ou
`FIREBASE_SERVICE_ACCOUNT_KEY`). Projeto: `FIREBASE_PROJECT_ID` (padrão
`ttrdcontabil-jpproject`).

## 5. Religar

1. Rode o dry-run do passo 4 de novo — tem que dar "a ajustar: 0".
2. Emita uma nota em **homologação** para um cliente de teste.
3. Religue a chave "produção liberada".

## Retenção do bucket de backup (lifecycle) — a aplicar pelo dono

Hoje o bucket guarda os exports para sempre. Sugestão: 30 dias em Standard,
depois Coldline, apagar com 400 dias (cobre o ano fiscal + folga; ajuste se o
contador pedir mais). **Não aplicado** — exige decisão do dono:

```bash
cat > /tmp/lifecycle-backups.json <<'JSON'
{
  "rule": [
    { "action": { "type": "SetStorageClass", "storageClass": "COLDLINE" },
      "condition": { "age": 30, "matchesStorageClass": ["STANDARD"] } },
    { "action": { "type": "Delete" },
      "condition": { "age": 400 } }
  ]
}
JSON
gcloud storage buckets update gs://ttrdcontabil-jpproject-backups \
  --lifecycle-file=/tmp/lifecycle-backups.json --project=ttrdcontabil-jpproject

# conferir
gcloud storage buckets describe gs://ttrdcontabil-jpproject-backups --format="default(lifecycle_config)"
```

Coldline cobra leitura e tem mínimo de 90 dias armazenado: restaurar um export
com mais de 30 dias custa um pouco mais. O export contém dados pessoais e as
senhas/credenciais **cifradas** (a chave `CREDENTIAL_KEY` fica no Secret Manager,
fora do backup) — mantenha o bucket sem acesso público e com
`--uniform-bucket-level-access`.

## Certificados A1 (Storage)

O backup do Firestore **não** inclui o Storage. Os `.pfx` ficam em
`certificados/<clienteId>.pfx.b64`, cifrados desde 2026-11-06 (envelope
AES-256-GCM com a `CREDENTIAL_KEY`; `scripts/cifrar-certificados.mjs` cifra os
antigos). Restaurar o Firestore não mexe neles; perder a `CREDENTIAL_KEY` torna
os certificados e as senhas ilegíveis — o secret precisa de backup próprio
(versões no Secret Manager). Se o bucket tiver versionamento de objetos, apague
as versões antigas (em claro) depois de cifrar.
