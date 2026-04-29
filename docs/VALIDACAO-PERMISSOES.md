# Validação de Permissões por Perfil

Checklist de homologação rápida para garantir que menu, quick actions e proteção de rota estão coerentes.

## Perfis

- admin
- operacional
- fiscal
- financeiro
- leitura

## Casos por perfil

### 1) Acesso de menu

- [ ] Verificar itens visíveis no sidebar condizentes com perfil.
- [ ] Garantir ausência de itens proibidos para o perfil.
- [ ] Testar com `telas` customizadas no usuário (override granular).

### 2) Quick actions

- [ ] Validar que ação rápida respeita `perfil`.
- [ ] Validar que ação rápida respeita `telaKey`.
- [ ] Em `/clientes/{id}`, validar links contextuais com `clienteId`.

### 3) Proteção de rota

- [ ] Acessar rota permitida diretamente por URL.
- [ ] Acessar rota proibida diretamente por URL e confirmar redirect para `/hoje`.
- [ ] Validar comportamento após login e refresh de página.

### 4) Cliente 360 / Timeline

- [ ] Timeline carrega eventos de múltiplas coleções.
- [ ] Severidade aparece corretamente.
- [ ] Link "Abrir" direciona para fluxo correto.
- [ ] Evento automático é criado ao:
  - [ ] criar/atualizar tarefa
  - [ ] criar/atualizar lançamento
  - [ ] criar competência
  - [ ] criar NFS-e emitida
  - [ ] atualizar configuração fiscal

## Critério de aceite

Liberar quando todos os itens acima estiverem concluídos por pelo menos dois perfis não-admin.

## Execução Pass/Fail (rápido)

Preencha durante homologação:

- Perfil testado:
- Data:
- Responsável:

### Resultado por bloco

- [ ] Menu (PASS)
- [ ] Quick actions (PASS)
- [ ] Proteção de rota (PASS)
- [ ] Timeline + eventos automáticos (PASS)

### Evidências

- URLs testadas:
- Prints:
- Observações:
