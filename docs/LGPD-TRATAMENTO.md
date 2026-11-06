# LGPD — tratamento de dados no JP Fiscal (RASCUNHO para revisão jurídica)

> **Rascunho técnico (2026-11-06), não é parecer.** Descreve o que o sistema faz hoje com dados
> pessoais, para o advogado do escritório revisar bases legais, prazos e textos. Itens marcados
> **[decidir]** precisam de decisão do controlador.

## Papéis

| Papel | Quem |
|---|---|
| Controlador | O escritório contábil (TTRD) — decide o que é tratado e por quê. |
| Operadores | Google Cloud / Firebase (hospedagem, banco, arquivos, login — região `southamerica-east1`, São Paulo); Receita Federal / Sefin Nacional e prefeituras (recebem a NFS-e); BrasilAPI e ViaCEP (consulta de CNPJ e CEP digitados). **[decidir]** se o fornecedor do JP Fiscal entra como operador no contrato. |
| Encarregado (DPO) | **[decidir]** |

## Registro de operações de tratamento (art. 37)

| # | Dados | Titulares | Finalidade | Base legal sugerida | Onde fica | Quem acessa | Retenção |
|---|---|---|---|---|---|---|---|
| 1 | Cadastro do cliente: razão social, CNPJ/CPF, endereço, e-mail, telefone, regime | Clientes PF/MEI e sócios | Prestar o serviço contábil | Art. 7º, V (execução de contrato) | `clientes` | Todo usuário ativo do escritório (leitura); admin/operacional editam | Enquanto durar o contrato + prazo de guarda contábil **[decidir]** |
| 2 | Representante/sócio: nome, CPF, documentos, endereço | Sócios/representantes | Obrigações acessórias, procurações | Art. 7º, II (obrigação legal) e V | `clientes` | Idem 1 | Idem 1 |
| 3 | Senhas de portal (prefeitura, posto fiscal, Meu Gov, e-CAC, PIN do certificado) | Cliente e representante | Cumprir obrigações em nome do cliente | Art. 7º, V | `clientes_credenciais`, **cifradas** (AES-256-GCM) | Só administrador e fiscal, pelo servidor; **cada revelação vai para o log com IP** | Até o fim do contrato; apagadas na exclusão do cliente |
| 4 | Certificado digital A1 (.pfx) e senha | Cliente (PJ/PF) | Assinar e emitir NFS-e | Art. 7º, V | Storage `certificados/` (só servidor) + senha cifrada em `clientes_fiscal` | Ninguém pelo navegador; servidor na emissão | Até vencer/ser trocado ou o cliente sair (apagado na exclusão) |
| 5 | NFS-e emitidas (XML/PDF): dados do prestador e do **tomador** (nome, CPF/CNPJ, endereço, e-mail) | Clientes e os clientes deles | Emissão e guarda fiscal | Art. 7º, II (obrigação legal) | `nfse_emitidas`, Storage `nfse/` | Fiscal, financeiro, admin (e tela fiscal concedida) | **Mínimo 5 anos** (CTN art. 173/195) — **não** apagadas na exclusão do cliente |
| 6 | Carteira de tomadores do cliente | Clientes dos clientes | Emitir notas recorrentes | Art. 7º, V | `tomadores` | Fiscal (escrita); leitores de NFS-e | Até o fim do contrato; apagada na exclusão do cliente (a nota emitida guarda cópia do tomador) |
| 7 | Financeiro: honorários, vencimentos, cobranças | Clientes | Cobrança do escritório | Art. 7º, V | `lancamentos`, `cobrancas` | Financeiro, admin | Prazo contábil/fiscal **[decidir]** |
| 8 | Usuários do escritório: nome, e-mail, perfil, último acesso, 2º fator | Equipe | Controle de acesso | Art. 7º, V e IX (legítimo interesse — segurança) | Firebase Auth, `usuarios` | Admin | Enquanto ativo; exclusão a pedido (callable `excluirUsuario`) |
| 9 | Logs de auditoria: quem, quando, o que mudou (antes/depois **com segredos redigidos**), **IP e navegador** nas operações sensíveis | Equipe (e, indiretamente, dados do registro alterado) | Segurança, prova, apuração de incidente | Art. 7º, IX e art. 37 | `logs_auditoria` (append-only; ninguém edita/apaga pelo app) | Admin | **[decidir]** — sugestão: 5 anos |

## Medidas de segurança (art. 46) — estado em 2026-11-06

- Acesso por perfil (admin, operacional, fiscal, financeiro, leitura) conferido nas regras do Firestore/Storage e nas Cloud Functions — matriz em `docs/USUARIOS-PERMISSOES.md`.
- Senhas de portal e senha do certificado **cifradas** com chave no Secret Manager; o navegador não lê o banco dessas coleções.
- Trilha de auditoria gravada pelo **servidor** (triggers e callables), com hora do servidor e ator tirado da autenticação — não forjável pelo navegador.
- Segundo fator (TOTP) disponível para admin e fiscal, com interruptor para torná-lo obrigatório; logout após 30 min de inatividade para esses perfis.
- DANFSe por URL assinada de 5 minutos (sem link permanente).
- Cabeçalhos de segurança no site (CSP, anti-iframe, HSTS etc.).
- Backup semanal do Firestore (`exportarFirestoreSemanal`).
- Pendente: App Check (bloqueia chamadas fora do app), revisão periódica de acessos, política de retenção de logs, plano de resposta a incidente (art. 48) **[decidir]**.

## Descarte ao excluir um cliente

Excluir o cliente (só admin; "inativar" não dispara nada) aciona o trigger
`descartarDadosClienteExcluido` (`functions/src/clientes/descarte.ts`), que:

- **Apaga**: senhas de portal (`clientes_credenciais`), configuração fiscal (`clientes_fiscal`,
  inclusive a senha cifrada do A1), o arquivo do certificado em `certificados/`, a carteira de
  tomadores (`tomadores`).
- **Encerra** os contratos de nota recorrente (`nfse_recorrentes.ativo = false`).
- **Preserva** (guarda legal): `nfse_emitidas`, `nfse_eventos`, `nfse_erros`, XML/PDF em `nfse/`,
  lançamentos, competências e logs.
- Registra `descarte_lgpd` em `logs_auditoria` com o que foi removido e o que falhou.

O que **não** é apagado automaticamente e precisa de decisão: tarefas, competências, POP/notas
internas e comentários do cliente, lançamentos após o prazo de guarda **[decidir]**. Backups do
Firestore guardam cópias até expirarem **[decidir prazo do bucket de backup]**.

## Direitos do titular (art. 18) — como atender hoje

| Pedido | Como |
|---|---|
| Confirmação/acesso | Admin exporta a ficha do cliente (relatório de clientes ou PDF da ficha). |
| Correção | Edição do cadastro (fica no log). |
| Eliminação | Excluir o cliente (descarte acima). Notas fiscais emitidas ficam pela obrigação legal (art. 16, I). |
| Usuário da equipe | `excluirUsuario` apaga perfil e login; o log guarda o id e o antes/depois. |

## Para o advogado revisar

1. Bases legais da tabela (sobretudo 1, 2, 7 e 9) e se cabe consentimento em algum caso.
2. Prazos de retenção marcados **[decidir]** e o prazo dos backups.
3. Cláusulas de operador com o Google (DPA do Google Cloud) e com o fornecedor do sistema.
4. Texto de aviso de privacidade para clientes e para a equipe (IP e navegador nos logs).
5. Procedimento de incidente (art. 48): quem avisa, em quanto tempo, ANPD e titulares.
