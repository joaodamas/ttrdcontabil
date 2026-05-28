/* JP Fiscal UI Kit — fake pt-BR data (illustrative) */
window.DATA = (function () {
  const clientes = [
    { id:'c1', codigo:1042, tipo:'pj', razao:'JP Project Manager LTDA', fantasia:'JP Project', cpfCnpj:'59.360.092/0001-63', regime:'Simples Nacional', cidade:'Cajamar', uf:'SP', status:'ativo', email:'joaodamasit@gmail.com', tel:'(11) 9320-5315', valor:1200, diaEmissao:5, nfse:3 },
    { id:'c2', codigo:1037, tipo:'pj', razao:'Damasit Comércio de Alimentos ME', fantasia:'Damasit', cpfCnpj:'12.845.300/0001-09', regime:'Simples Nacional', cidade:'Jundiaí', uf:'SP', status:'ativo', email:'contato@damasit.com.br', tel:'(11) 3477-1180', valor:980, diaEmissao:10, nfse:7 },
    { id:'c3', codigo:1031, tipo:'pj', razao:'Núcleo Contábil e Assessoria S/S', fantasia:'Núcleo', cpfCnpj:'08.221.764/0001-55', regime:'Lucro Presumido', cidade:'Campinas', uf:'SP', status:'ativo', email:'fiscal@nucleo.com.br', tel:'(19) 3251-7744', valor:2500, diaEmissao:15, nfse:12 },
    { id:'c4', codigo:1028, tipo:'pf', razao:'Marina Alves Pereira', fantasia:'', cpfCnpj:'327.118.940-72', regime:'MEI', cidade:'Barueri', uf:'SP', status:'ativo', email:'marina.alves@gmail.com', tel:'(11) 99812-4410', valor:320, diaEmissao:20, nfse:1 },
    { id:'c5', codigo:1019, tipo:'pj', razao:'Vértice Engenharia LTDA', fantasia:'Vértice', cpfCnpj:'21.553.880/0001-14', regime:'Lucro Real', cidade:'São Paulo', uf:'SP', status:'suspenso', email:'adm@vertice.eng.br', tel:'(11) 3815-2299', valor:4200, diaEmissao:8, nfse:0 },
    { id:'c6', codigo:1004, tipo:'pj', razao:'Lume Estúdio de Design ME', fantasia:'Lume', cpfCnpj:'33.901.270/0001-88', regime:'Simples Nacional', cidade:'São Paulo', uf:'SP', status:'inativo', email:'ola@lume.studio', tel:'(11) 95540-2030', valor:0, diaEmissao:null, nfse:0 },
  ];

  const tarefas = [
    { id:'t1', titulo:'Apuração DAS — Abril/2026', cliente:'JP Project Manager LTDA', resp:'Carla M.', prazo:'24/04/2026', prioridade:'urgente', status:'pendente', vencida:true },
    { id:'t2', titulo:'Conciliação bancária', cliente:'Núcleo Contábil', resp:'Rafael T.', prazo:'26/04/2026', prioridade:'alta', status:'em_andamento', vencida:true },
    { id:'t3', titulo:'Envio eSocial — competência 04', cliente:'Damasit Comércio', resp:'Carla M.', prazo:'30/04/2026', prioridade:'alta', status:'pendente', vencida:false },
    { id:'t4', titulo:'Folha de pagamento', cliente:'Vértice Engenharia', resp:'Ana P.', prazo:'02/05/2026', prioridade:'normal', status:'em_andamento', vencida:false },
    { id:'t5', titulo:'Emitir NFS-e mensal', cliente:'Marina Alves Pereira', resp:'Rafael T.', prazo:'05/05/2026', prioridade:'normal', status:'pendente', vencida:false },
    { id:'t6', titulo:'Revisão de pró-labore', cliente:'Lume Estúdio', resp:'Ana P.', prazo:'08/05/2026', prioridade:'baixa', status:'pendente', vencida:false },
  ];

  const lancamentos = [
    { id:'l1', descricao:'Honorários contábeis — Abril', cliente:'JP Project Manager LTDA', tipo:'receita', venc:'10/05/2026', valor:1200, status:'pago' },
    { id:'l2', descricao:'Honorários contábeis — Abril', cliente:'Damasit Comércio', tipo:'receita', venc:'28/04/2026', valor:980, status:'atrasado' },
    { id:'l3', descricao:'Abertura de empresa', cliente:'Núcleo Contábil', tipo:'receita', venc:'15/05/2026', valor:2500, status:'pendente' },
    { id:'l4', descricao:'Honorários contábeis — Abril', cliente:'Marina Alves Pereira', tipo:'receita', venc:'05/05/2026', valor:320, status:'pendente' },
    { id:'l5', descricao:'Assinatura sistema fiscal', cliente:'', tipo:'despesa', venc:'12/05/2026', valor:189, status:'pago' },
    { id:'l6', descricao:'Honorários contábeis — Março', cliente:'Vértice Engenharia', tipo:'receita', venc:'20/04/2026', valor:4200, status:'atrasado' },
  ];

  const nfse = [
    { id:'n1', cliente:'Núcleo Contábil', numero:'2026/0418', tomador:'Construtora Apex LTDA', data:'22/04/2026', valor:2500, status:'emitida' },
    { id:'n2', cliente:'JP Project Manager LTDA', numero:'2026/0417', tomador:'Studio Halo ME', data:'20/04/2026', valor:1200, status:'emitida' },
    { id:'n3', cliente:'Damasit Comércio', numero:'—', tomador:'Mercado União', data:'—', valor:980, status:'pendente_processamento' },
    { id:'n4', cliente:'Vértice Engenharia', numero:'—', tomador:'Prefeitura de Barueri', data:'19/04/2026', valor:4200, status:'erro_integracao' },
  ];

  const risco = [
    { id:'c2', razao:'Damasit Comércio de Alimentos ME', motivos:['Cobrança vencida','Tarefa atrasada'], score:3 },
    { id:'c5', razao:'Vértice Engenharia LTDA', motivos:['Cobrança vencida'], score:2 },
    { id:'c3', razao:'Núcleo Contábil e Assessoria', motivos:['Tarefa atrasada'], score:1 },
  ];

  const fechamento = [
    { cliente:'JP Project Manager LTDA', regime:'Simples', das:'ok', esocial:'ok', reinf:'enviado', fgts:'pendente' },
    { cliente:'Damasit Comércio', regime:'Simples', das:'enviado', esocial:'pendente', reinf:'pendente', fgts:'pendente' },
    { cliente:'Núcleo Contábil', regime:'Presumido', das:'na', esocial:'ok', reinf:'ok', fgts:'ok' },
    { cliente:'Vértice Engenharia', regime:'Real', das:'na', esocial:'sm', reinf:'sm', fgts:'guia' },
    { cliente:'Marina Alves Pereira', regime:'MEI', das:'ok', esocial:'na', reinf:'na', fgts:'na' },
  ];

  const fmt = (n) => 'R$\u00a0' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtK = (n) => n >= 1000 ? 'R$\u00a0' + (n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1}) + ' mil' : fmt(n);

  return { clientes, tarefas, lancamentos, nfse, risco, fechamento, fmt, fmtK };
})();
