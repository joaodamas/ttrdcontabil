# Roteiro — homologação de permissões (execução manual)

Use com a **seção 1** de `CHECKLIST-FINAL-PENDENTES.md`. Marque cada célula após testar com o perfil indicado.

**Perfis:** Admin · Operacional · Financeiro (ajuste nomes aos valores reais em `usuarios.perfil`).

**Legenda por célula:** `OK` acesso esperado · `BLOQ` bloqueio/redirecionamento esperado · `FALHA` comportamento incorreto (descrever no rodapé).

---

## Rotas principais (dashboard)

| Rota | Admin | Operacional | Financeiro | Observação |
|------|-------|-------------|------------|------------|
| `/dashboard` | | | | |
| `/hoje` | | | | |
| `/tarefas` | | | | |
| `/tarefas/nova` | | | | |
| `/clientes` | | | | |
| `/clientes/novo` | | | | |
| `/competencias` | | | | |
| `/competencias/nova` | | | | |
| `/financeiro` | | | | |
| `/financeiro/novo` | | | | |
| `/fechamento` | | | | |
| `/fiscal` | | | | |
| `/fiscal/emitir` | | | | |
| `/fiscal/historico` | | | | |
| `/ir` | | | | |
| `/ir/nova` | | | | |
| `/servicos` | | | | (redireciona para `/admin/servicos`) |
| `/admin` | | | | |
| `/admin/servicos` | | | | |
| `/admin/usuarios` | | | | |

## Rotas com parâmetro (substituir placeholders)

Testar **acesso direto por URL** com cada perfil (copiar/colar no navegador).

| Rota | Admin | Operacional | Financeiro |
|------|-------|-------------|------------|
| `/clientes/{id}` | | | |
| `/clientes/{id}/editar` | | | |
| `/clientes/{id}/fiscal` | | | |
| `/competencias/{id}` | | | |
| `/competencias/{id}/editar` | | | |
| `/tarefas/{id}` | | | |
| `/tarefas/{id}/editar` | | | |
| `/ir/{id}` | | | |
| `/ir/{id}/editar` | | | |

Use IDs válidos do ambiente de homologação.

---

## Quick Actions e ações inline

- [ ] Menu lateral / quick actions: cada item visível só para perfis esperados
- [ ] **Financeiro:** baixar lançamento, fila de cobrança, negociar (mailto)
- [ ] **Tarefas:** concluir, reatribuir, lote no `/hoje`
- [ ] **Cliente 360:** editar, links fiscais/financeiro
- [ ] **Admin:** criar/editar usuários e serviços (apenas perfis autorizados)

---

## Validação global

- [ ] Nenhuma tela restrita abre sem permissão (nem “flash” de conteúdo sensível)
- [ ] Redirecionamento ou mensagem clara ao bloquear
- [ ] Console sem erro crítico ao navegar
- [ ] Nenhuma resposta 500 nas APIs usadas pela tela

---

## Registro de falhas

| Data | Perfil | Rota | Esperado | Obtido | Corrigido em |
|------|--------|------|----------|--------|--------------|
| | | | | | |
