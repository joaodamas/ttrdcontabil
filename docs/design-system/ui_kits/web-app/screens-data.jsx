/* JP Fiscal UI Kit — Clientes (+ 360 modal), Financeiro, Fiscal */
const { useState: useStateData } = React;

const REGIME_LABEL = { simples_nacional:'Simples Nacional', lucro_presumido:'Lucro Presumido', lucro_real:'Lucro Real', mei:'MEI', isento:'Isento' };

/* ─── CLIENTES ─────────────────────────────────────────────────────────── */
function ClientesScreen({ go }) {
  const D = window.DATA;
  const [q, setQ] = useStateData('');
  const [status, setStatus] = useStateData('todos');
  const [sel, setSel] = useStateData(null);

  const list = D.clientes.filter(c =>
    (status === 'todos' || c.status === status) &&
    (q === '' || (c.razao + c.fantasia + c.cpfCnpj).toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="content-inner fade-in">
      <div className="page-head">
        <div><h1 className="page-title">Clientes</h1><p className="page-sub" style={{ textTransform:'none' }}>{D.clientes.length} clientes na carteira</p></div>
        <Button variant="primary" icon="plus">Novo cliente</Button>
      </div>

      <div className="row" style={{ justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <div className="search-field">
          <Icon name="search" size={15} />
          <input className="input" style={{ border:0, height:30, paddingLeft:0 }} placeholder="Buscar por razão social, fantasia ou CPF/CNPJ" value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div className="seg">
          {['todos','ativo','suspenso','inativo'].map(s => (
            <button key={s} className={status===s?'on':''} onClick={()=>setStatus(s)} style={{ textTransform:'capitalize' }}>{s==='todos'?'Todos':s}</button>
          ))}
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Código</th><th>Razão Social</th><th>CPF / CNPJ</th><th>Regime</th><th>Cidade/UF</th><th>Status</th></tr></thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id} onClick={()=>setSel(c)} style={{ cursor:'pointer' }}>
                <td className="mono muted">{c.codigo}</td>
                <td><div style={{ fontWeight:600 }}>{c.razao}</div>{c.fantasia && <div className="muted" style={{ fontSize:12 }}>{c.fantasia}</div>}</td>
                <td className="mono">{c.cpfCnpj}</td>
                <td>{c.regime}</td>
                <td>{c.cidade}/{c.uf}</td>
                <td><StatusBadge kind="cliente" value={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && <ClienteModal cliente={sel} onClose={()=>setSel(null)} />}
    </div>
  );
}

function ClienteModal({ cliente, onClose }) {
  const D = window.DATA;
  const [tab, setTab] = useStateData('resumo');
  const lanc = D.lancamentos.filter(l => l.cliente === cliente.razao);
  const notas = D.nfse.filter(n => n.cliente === cliente.razao);
  const TABS = [
    { id:'resumo', label:'Resumo' },
    { id:'servicos', label:`Serviços (0)` },
    { id:'comp', label:`Competências (2)` },
    { id:'fin', label:`Financeiro (${lanc.length})` },
    { id:'nfse', label:`NFS-e (${cliente.nfse})` },
    { id:'fiscal', label:'Fiscal' },
  ];

  const Info = ({ icon, label, value }) => (
    <div>
      <div className="row muted" style={{ gap:5, fontSize:12 }}><Icon name={icon} size={12} />{label}</div>
      <div style={{ fontWeight:600, marginTop:3 }}>{value || '—'}</div>
    </div>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="row" style={{ gap:10 }}>
              <h2 style={{ fontSize:19, fontWeight:700, margin:0 }}>{cliente.razao}</h2>
              <StatusBadge kind="cliente" value={cliente.status} />
            </div>
            <div className="muted" style={{ fontSize:12.5, marginTop:3 }}>{cliente.fantasia || REGIME_LABEL[cliente.regime] || cliente.regime}</div>
          </div>
          <div className="row">
            <Button variant="secondary" size="sm" icon="pencil">Editar</Button>
            <button className="modal-x" onClick={onClose}><Icon name="x" size={16} /></button>
          </div>
        </div>

        <div style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)', padding:'16px 22px' }}>
          <div className="info-grid">
            <Info icon="file-text" label="CPF / CNPJ" value={cliente.cpfCnpj} />
            <Info icon="briefcase" label="Regime Tributário" value={REGIME_LABEL[cliente.regime] || cliente.regime} />
            <Info icon="mail" label="E-mail" value={cliente.email} />
            <Info icon="phone" label="Telefone" value={cliente.tel} />
            <Info icon="map-pin" label="Cidade / UF" value={`${cliente.cidade} / ${cliente.uf}`} />
            <Info icon="dollar-sign" label="Valor Mensal" value={cliente.valor ? D.fmt(cliente.valor) : '—'} />
          </div>
        </div>

        <div style={{ padding:'14px 22px 0' }}>
          <div className="tabs" style={{ gap:16, overflowX:'auto' }}>
            {TABS.map(t => <button key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>{t.label}</button>)}
          </div>
        </div>

        <div style={{ padding:'18px 22px 22px', minHeight:120 }}>
          {tab === 'fin' && (lanc.length === 0
            ? <div className="modal-empty">Nenhum lançamento.</div>
            : <div className="tbl-wrap"><table className="tbl"><tbody>
                {lanc.map(l => (
                  <tr key={l.id}><td style={{ fontWeight:600 }}>{l.descricao}</td><td className="muted">{l.venc}</td>
                  <td className="cur" style={{ fontWeight:700 }}>{D.fmt(l.valor)}</td><td style={{ width:1 }}><StatusBadge kind="pagamento" value={l.status} /></td></tr>
                ))}
              </tbody></table></div>)}
          {tab === 'nfse' && (notas.length === 0
            ? <div className="modal-empty">Nenhuma NFS-e emitida.</div>
            : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Nº</th><th>Tomador</th><th>Emissão</th><th className="cur">Valor</th><th>Status</th></tr></thead><tbody>
                {notas.map(n => (
                  <tr key={n.id}><td className="mono">{n.numero}</td><td>{n.tomador}</td><td className="muted">{n.data}</td><td className="cur">{D.fmt(n.valor)}</td><td><StatusBadge kind="nfse" value={n.status} /></td></tr>
                ))}
              </tbody></table></div>)}
          {tab === 'fiscal' && (
            <div className="fiscal-config">
              <div className="row" style={{ justifyContent:'space-between', marginBottom:14 }}>
                <div className="row" style={{ gap:8 }}><Icon name="shield-check" size={16} className="t-success" /><span style={{ fontWeight:600 }}>Configuração Fiscal — NFS-e</span></div>
                <Button variant="secondary" size="sm" icon="pencil">Editar</Button>
              </div>
              <div className="info-grid">
                <Info icon="map-pin" label="Município" value="Cajamar" />
                <Info icon="server" label="Ambiente" value={<Badge variant="success">Produção</Badge>} />
                <Info icon="hash" label="Inscrição Municipal" value="29469" />
                <Info icon="briefcase" label="Regime" value="Simples Nacional" />
              </div>
            </div>
          )}
          {(tab === 'resumo' || tab === 'servicos' || tab === 'comp') && (
            tab === 'servicos' ? <div className="modal-empty">Nenhum serviço vinculado.</div>
            : tab === 'comp' ? <div className="tbl-wrap"><table className="tbl"><tbody>
                <tr><td style={{ fontWeight:600 }}>Apuração mensal</td><td className="muted">Abril/2026</td><td style={{ width:1 }}><Badge variant="info">Em andamento</Badge></td></tr>
                <tr><td style={{ fontWeight:600 }}>Apuração mensal</td><td className="muted">Março/2026</td><td style={{ width:1 }}><Badge variant="success">Concluída</Badge></td></tr>
              </tbody></table></div>
            : <div className="resumo-grid">
                <div className="resumo-cell"><div className="section-label">Endereço</div><p style={{ margin:'6px 0 0' }}>{cliente.cidade} / {cliente.uf}</p></div>
                <div className="resumo-cell"><div className="section-label">Dia de emissão NFS-e</div><p style={{ margin:'6px 0 0' }}>{cliente.diaEmissao ? `Dia ${cliente.diaEmissao}` : '—'}</p></div>
                <div className="resumo-cell"><div className="section-label">NFS-e emitidas</div><p style={{ margin:'6px 0 0', fontWeight:700 }}>{cliente.nfse}</p></div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── FINANCEIRO ───────────────────────────────────────────────────────── */
function FinanceiroScreen() {
  const D = window.DATA;
  const [filtro, setFiltro] = useStateData('todos');
  const [baixado, setBaixado] = useStateData({});
  const lista = D.lancamentos.filter(l => filtro==='todos' || l.tipo===filtro);
  const aReceber = D.lancamentos.filter(l=>l.tipo==='receita'&&l.status!=='pago').reduce((s,l)=>s+l.valor,0);
  const recebido = D.lancamentos.filter(l=>l.tipo==='receita'&&l.status==='pago').reduce((s,l)=>s+l.valor,0);
  const atraso = D.lancamentos.filter(l=>l.status==='atrasado').reduce((s,l)=>s+l.valor,0);

  return (
    <div className="content-inner fade-in">
      <div className="page-head">
        <div><h1 className="page-title">Financeiro</h1><p className="page-sub" style={{ textTransform:'none' }}>Lançamentos · receitas e despesas</p></div>
        <Button variant="primary" icon="plus">Novo lançamento</Button>
      </div>

      <section className="grid-kpi" style={{ gridTemplateColumns:'repeat(3,1fr)', marginBottom:18 }}>
        <KpiCard label="A receber" value={D.fmt(aReceber)} icon="wallet-cards" tone="info" />
        <KpiCard label="Recebido no mês" value={D.fmt(recebido)} icon="check-circle-2" tone="success" />
        <KpiCard label="Em atraso" value={D.fmt(atraso)} icon="alert-triangle" tone="danger" />
      </section>

      <div className="seg" style={{ marginBottom:14 }}>
        {[['todos','Todos'],['receita','Receita'],['despesa','Despesa']].map(([k,l]) => (
          <button key={k} className={filtro===k?'on':''} onClick={()=>setFiltro(k)}>{l}</button>
        ))}
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Descrição</th><th>Cliente</th><th>Tipo</th><th>Vencimento</th><th className="cur">Valor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {lista.map(l => {
              const st = baixado[l.id] ? 'pago' : l.status;
              return (
                <tr key={l.id}>
                  <td style={{ fontWeight:600 }}>{l.descricao}</td>
                  <td className="muted">{l.cliente || '—'}</td>
                  <td><Badge variant={l.tipo==='receita'?'success':'neutral'}>{l.tipo==='receita'?'Receita':'Despesa'}</Badge></td>
                  <td className={st==='atrasado'?'t-danger':'muted'}>{l.venc}</td>
                  <td className="cur" style={{ fontWeight:700 }}>{D.fmt(l.valor)}</td>
                  <td><StatusBadge kind="pagamento" value={st} /></td>
                  <td style={{ width:1 }}>{st!=='pago' && st!=='cancelado' && <Button variant="outline" size="sm" onClick={()=>setBaixado(b=>({...b,[l.id]:true}))}>Baixar</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── FISCAL ───────────────────────────────────────────────────────────── */
function FiscalScreen() {
  const D = window.DATA;
  return (
    <div className="content-inner fade-in">
      <div className="page-head">
        <div><h1 className="page-title">Fiscal &amp; NFS-e</h1><p className="page-sub" style={{ textTransform:'none' }}>Emissão e acompanhamento de notas</p></div>
        <div className="row"><Button variant="outline" icon="history">Histórico</Button><Button variant="primary" icon="receipt">Emitir NFS-e</Button></div>
      </div>

      <section className="grid-kpi" style={{ marginBottom:18 }}>
        <KpiCard label="Emitidas no mês" value="2" icon="check-circle-2" tone="success" />
        <KpiCard label="Pendentes" value="1" icon="clock" tone="info" />
        <KpiCard label="Com erro" value="1" icon="alert-triangle" tone="danger" />
        <KpiCard label="Canceladas" value="0" icon="ban" tone="muted" />
      </section>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Cliente</th><th>Nº NFS-e</th><th>Tomador</th><th>Emissão</th><th className="cur">Valor</th><th>Status</th></tr></thead>
          <tbody>
            {D.nfse.map(n => (
              <tr key={n.id}>
                <td style={{ fontWeight:600 }}>{n.cliente}</td>
                <td className="mono">{n.numero}</td>
                <td>{n.tomador}</td>
                <td className="muted">{n.data}</td>
                <td className="cur">{D.fmt(n.valor)}</td>
                <td><StatusBadge kind="nfse" value={n.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* generic placeholder for nav targets we didn't fully build */
function PlaceholderScreen({ title }) {
  return (
    <div className="content-inner fade-in">
      <div className="page-head"><div><h1 className="page-title">{title}</h1><p className="page-sub" style={{ textTransform:'none' }}>Módulo do produto</p></div></div>
      <div className="card" style={{ padding:40, textAlign:'center' }}>
        <Icon name="layout-dashboard" size={26} className="muted" />
        <p className="muted" style={{ marginTop:10 }}>Tela “{title}” faz parte do produto. Este kit demonstra os módulos principais — Hoje, Painel, Clientes, Financeiro e Fiscal.</p>
      </div>
    </div>
  );
}

Object.assign(window, { ClientesScreen, FinanceiroScreen, FiscalScreen, PlaceholderScreen });
