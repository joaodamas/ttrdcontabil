# Checklist NFS-e para produção

Status em 2026-05-04.

## Crítico

- [~] Implementar cancelamento real por município nos conectores NFS-e.
- [~] Implementar consulta real de status por município nos conectores NFS-e.
- [x] Melhorar retry para controlar tentativas, evitar duplicidade e reaproveitar erro/rascunho com segurança.

## Alto

- [x] Exibir XML completo na tela de detalhe da NFS-e.
- [x] Exibir erro da última tentativa na tela de detalhe da NFS-e.
- [x] Exibir motivo de cancelamento e eventos fiscais ricos na tela de detalhe.
- [x] Persistir `tentativas`, `erroUltimaTentativa`, `atualizadoEm` e ator nos fluxos de erro/retry.
- [x] Criar índices necessários para as novas consultas fiscais.
- [x] Trocar `window.prompt` de cancelamento por dialog com validação.

## Médio

- [~] Exportação Excel real (`.xlsx`).
- [ ] Exportação PDF/relatório de inadimplência.
- [x] Relatório de inadimplência agrupado com totais.
- [~] Notificações para erro de NFS-e, cancelamento pendente, emissão pendente e fechamento revisado.
- [ ] Resolver arquitetura `output: export` + rotas dinâmicas com `placeholder`.

## Operacional

- [x] Deploy das Cloud Functions.
- [x] Deploy das Firestore Rules.
- [x] Deploy dos Firestore Indexes.
- [x] Deploy do Hosting após rota dinâmica `/fiscal/[id]`.
- [ ] Homologar emissão, consulta e cancelamento por município com credenciais reais.
