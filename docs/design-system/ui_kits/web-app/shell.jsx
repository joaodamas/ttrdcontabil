/* JP Fiscal UI Kit — app shell: Sidebar + TopBar */
const { useState: useStateShell } = React;

const NAV = [
  { id:'hoje', label:'Hoje', icon:'calendar-clock' },
  { id:'dashboard', label:'Painel', icon:'bar-chart-3' },
  { id:'_g_cad', label:'Cadastros', icon:'users', items:[ { id:'clientes', label:'Clientes', icon:'users' } ] },
  { id:'_g_op', label:'Operacional', icon:'clipboard-list', items:[
      { id:'tarefas', label:'Tarefas', icon:'check-square' },
      { id:'competencias', label:'Competências', icon:'layers' },
      { id:'fechamento', label:'Fechamento Mensal', icon:'folder-open' },
  ] },
  { id:'_g_fis', label:'Fiscal & NFS-e', icon:'receipt', items:[
      { id:'fiscal', label:'Emissão NFS-e', icon:'receipt' },
      { id:'historico', label:'Histórico NFS-e', icon:'history' },
      { id:'ir', label:'Imposto de Renda', icon:'file-text' },
  ] },
  { id:'financeiro', label:'Financeiro', icon:'wallet' },
];

const QUICK = [
  { id:'clientes', label:'Cliente', icon:'users' },
  { id:'tarefas', label:'Tarefa', icon:'check-square' },
  { id:'financeiro', label:'Lançamento', icon:'wallet' },
  { id:'fiscal', label:'NFS-e', icon:'receipt' },
];

function Sidebar({ route, go }) {
  const groupOf = (r) => NAV.find(s => s.items && s.items.some(i => i.id === r));
  const initOpen = {};
  NAV.forEach(s => { if (s.items) initOpen[s.id] = s.items.some(i => i.id === route); });
  const [open, setOpen] = useStateShell(initOpen);
  const toggle = (id) => setOpen(o => ({ ...o, [id]: !o[id] }));

  return (
    <aside className="sidebar">
      <div className="sb-logo">
        <div className="sb-mark"><img src="../../assets/jp-logo.png" alt="JP" /></div>
        <div>
          <div className="sb-name">JP Fiscal</div>
          <div className="sb-tag">Gestão Contábil Integrada</div>
        </div>
      </div>

      <div className="sb-summary" onClick={() => go('hoje')}>
        <div className="sb-summary-top">
          <span className="sb-summary-lbl">Hoje</span>
          <Icon name="alert-triangle" size={11} style={{ color: 'var(--destructive)' }} />
        </div>
        <div className="sb-summary-row">
          <div style={{ textAlign:'center' }}><div className="sb-summary-n t-danger">2</div><div className="sb-summary-c">atrasadas</div></div>
          <div style={{ textAlign:'center' }}><div className="sb-summary-n t-warning">3</div><div className="sb-summary-c">para hoje</div></div>
        </div>
      </div>

      <nav className="sb-nav">
        {NAV.map(s => {
          if (!s.items) {
            return (
              <div key={s.id} className={`sb-link ${route === s.id ? 'active' : ''}`} onClick={() => go(s.id)}>
                <Icon name={s.icon} />{s.label}
              </div>
            );
          }
          const isOpen = open[s.id];
          const active = s.items.some(i => i.id === route);
          return (
            <div key={s.id} className={`sb-group ${isOpen ? 'open' : ''}`}>
              <button className="sb-link" style={active && !isOpen ? { background:'var(--sidebar-accent)' } : null} onClick={() => toggle(s.id)}>
                <Icon name={s.icon} /><span style={{ flex:1, textAlign:'left' }}>{s.label}</span>
                <Icon name="chevron-down" size={13} className="chev" />
              </button>
              {isOpen && (
                <div className="sb-sub">
                  {s.items.map(i => (
                    <div key={i.id} className={`sb-link ${route === i.id ? 'active' : ''}`} onClick={() => go(i.id)}>
                      <Icon name={i.icon} />{i.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sb-quick">
        <div className="sb-quick-lbl">Ações rápidas <Icon name="plus" size={11} /></div>
        <div className="sb-quick-grid">
          {QUICK.map(q => (
            <div key={q.id} className="sb-quick-btn" onClick={() => go(q.id)}>
              <Icon name={q.icon} />{q.label}
            </div>
          ))}
        </div>
      </div>

      <div className="sb-user">
        <div className="sb-avatar">JD</div>
        <div style={{ minWidth:0, flex:1 }}>
          <div className="sb-uname">João Damasceno</div>
          <div className="sb-urole">admin</div>
        </div>
        <button className="sb-logout" title="Sair" onClick={() => go('__logout')}><Icon name="log-out" size={13} /></button>
      </div>
    </aside>
  );
}

function TopBar({ onSearch }) {
  return (
    <header className="topbar">
      <div style={{ flex:1 }} />
      <button className="searchbtn" onClick={onSearch}>
        <Icon name="search" size={13} /><span>Buscar</span>
        <span className="kbd">⌘K</span>
      </button>
      <Button variant="ink" size="sm" icon="plus">Novo</Button>
    </header>
  );
}

Object.assign(window, { Sidebar, TopBar });
