# Checklist NFS-e para produção

Status em 2026-05-04.

## Crítico

- [~] Implementar cancelamento real por município nos conectores NFS-e.
- [~] Implementar consulta real de status por município nos conectores NFS-e.
- [x] Melhorar retry para controlar tentativas, evitar duplicidade e reaproveitar erro/rascunho com segurança.
  - Execução 2026-05-08: retry consulta histórico interno e prefeitura por RPS antes de nova emissão; sem RPS persistido, bloqueia retry para evitar emissão às cegas. Ainda falta persistir RPS/chave antes da primeira chamada externa e usar ID determinístico para a nota.

## Alto

- [x] Exibir XML completo na tela de detalhe da NFS-e.
- [x] Exibir erro da última tentativa na tela de detalhe da NFS-e.
- [x] Exibir motivo de cancelamento e eventos fiscais ricos na tela de detalhe.
- [x] Persistir `tentativas`, `erroUltimaTentativa`, `atualizadoEm` e ator nos fluxos de erro/retry.
- [x] Redigir payloads fiscais e erros SOAP antes de persistir/logar.
  - Execução 2026-05-08: redaction server-side cobre chaves/padrões sensíveis e strings com CPF/CNPJ, e-mail, telefone, XML e payload extenso; Cajamar/GeisWeb e SOAP deixam de expor corpo bruto.
- [x] Registrar auditoria padronizada em emissão, lote, consulta, cancelamento e retry.
- [x] Criar índices necessários para as novas consultas fiscais.
- [x] Trocar `window.prompt` de cancelamento por dialog com validação.

## Médio

- [~] Exportação Excel real (`.xlsx`).
  - Execução 2026-05-08: tela Financeiro ganhou exportação da lista filtrada/carregada via helper atual `exportToExcel` (`.xls` HTML). Ainda não é `.xlsx` real.
- [ ] Exportação PDF/relatório de inadimplência.
- [x] Relatório de inadimplência agrupado com totais.
- [~] Notificações para erro de NFS-e, cancelamento pendente, emissão pendente e fechamento revisado.
- [ ] Resolver arquitetura `output: export` + rotas dinâmicas com `placeholder`.
  - Execução parcial 2026-05-08: rotas dinâmicas de cliente passaram a extrair o ID da URL real para contornar `placeholder`; decisão arquitetural completa ainda pendente.

## Operacional

- [x] Deploy das Cloud Functions.
- [x] Deploy das Firestore Rules.
- [x] Deploy dos Firestore Indexes.
- [x] Deploy do Hosting após rota dinâmica `/fiscal/[id]`.
- [ ] Homologar emissão, consulta e cancelamento por município com credenciais reais.
