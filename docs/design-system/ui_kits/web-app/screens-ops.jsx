/* JP Fiscal UI Kit — Hoje cockpit + Dashboard */
const { useState: useStateOps } = React;

const HOJE_DATE = 'sexta-feira, 24 de abril';

function HojeScreen({ go }) {
  const D = window.DATA;
  const [done, setDone] = useStateOps({});
  const atrasadas = D.tarefas.filter(t => t.vencida && !done[t.id]);
  const paraHoje = D.tarefas.filter(t => !t.vencida && t.status !== 'concluida' && !done[t.id]).slice(0, 3);

  const TaskRow = ({ t, overdue }) => (
    <div className={`hoje-row prio-${t.prioridade}`}>
      <button className="hoje-check" onClick={() => setDone(d => ({ ...d, [t.id]: true }))} title="Concluir"><Icon name="check" size={13} /></button>
      <div style={{ minWidth:0, flex:1 }}>
        <div className="hoje-title">{t.titulo}</div>
        <div className="hoje-meta">
          <span>{t.cliente}</span>
          <span className="dotsep">·</span>
          <span className={overdue ? 't-danger' : 't-muted'}>{t.prazo}</span>
          <span className="dotsep">·</span>
          <span className="muted">{t.resp}</span>
        </div>
      </div>
      <StatusBadge kind="prioridade" value={t.prioridade} />
      <Button variant="outline" size="sm" iconEnd="arrow-right" onClick={() => go('tarefas')}>Abrir</Button>
    </div>
  );

  return (
    <div className="content-inner fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title">Hoje</h1>
          <p className="page-sub">{HOJE_DATE}</p>
        </div>
        <div className="row">
          <Button variant="outline" size="sm" icon="filter">Filtros</Button>
          <Button variant="primary" size="sm" icon="receipt" onClick={() => go('fiscal')}>Emitir NFS-e</Button>
        </div>
      </div>

      <div className={`alert ${atrasadas.length ? 'alert-danger' : 'alert-success'}`} style={{ marginBottom: 18 }}>
        <div className="ic">{atrasadas.length ? <Icon name="alert-triangle" /> : <Icon name="check-circle-2" />}</div>
        <div style={{ flex:1 }}>
          <div className="alert-ttl">{atrasadas.length ? `${atrasadas.length + paraHoje.length} item(ns) na sua fila de execução` : 'Fila zerada — bom trabalho'}</div>
          <div className="alert-sub">Prioridade calculada por prazo, SLA e impacto fiscal. Conclua de cima para baixo.</div>
        </div>
        <div className="hoje-stat"><div className="hoje-stat-n t-danger">{atrasadas.length}</div><div className="hoje-stat-l">atrasadas</div></div>
        <div className="hoje-stat"><div className="hoje-stat-n t-warning">{paraHoje.length}</div><div className="hoje-stat-l">para hoje</div></div>
      </div>

      <div className="card" style={{ overflow:'hidden', marginBottom:16 }}>
        <div className="list-head"><span className="dot" style={{ background:'var(--destructive)' }} /><h2 className="list-h">Atrasadas</h2>{atrasadas.length>0 && <span className="count-pill t-danger">{atrasadas.length}</span>}</div>
        {atrasadas.length === 0
          ? <div className="empty"><Icon name="check-circle-2" size={28} style={{ color:'color-mix(in oklab,var(--success) 50%,transparent)' }} /><p>Nenhuma tarefa atrasada</p></div>
          : atrasadas.map(t => <TaskRow key={t.id} t={t} overdue />)}
      </div>

      <div className="card" style={{ overflow:'hidden' }}>
        <div className="list-head"><span className="dot" style={{ background:'var(--warning)' }} /><h2 className="list-h">Para hoje</h2></div>
        {paraHoje.length === 0
          ? <div className="empty"><Icon name="check-circle-2" size={28} style={{ color:'color-mix(in oklab,var(--success) 50%,transparent)' }} /><p>Nada para hoje</p></div>
          : paraHoje.map(t => <TaskRow key={t.id} t={t} />)}
      </div>
    </div>
  );
}

function DashboardScreen({ go }) {
  const D = window.DATA;
  const recebiveis = D.lancamentos.filter(l => l.tipo==='receita' && l.status==='pendente').reduce((s,l)=>s+l.valor,0);
  const atraso = D.lancamentos.filter(l => l.status==='atrasado').reduce((s,l)=>s+l.valor,0);
  const vencidas = D.tarefas.filter(t=>t.vencida);

  return (
    <div className="content-inner fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title">Visão executiva</h1>
          <p className="page-sub">{HOJE_DATE}</p>
        </div>
        <div className="row">
          <Button variant="outline" size="sm" icon="calendar-clock" onClick={()=>go('hoje')}>Fila de execução</Button>
          <Button variant="primary" size="sm" icon="receipt" onClick={()=>go('fiscal')}>Emitir NFS-e</Button>
        </div>
      </div>

      {/* priority banner */}
      <section className="card" style={{ padding:16, marginBottom:18 }}>
        <div className="dash-banner">
          <div className="row" style={{ alignItems:'flex-start', gap:12 }}>
            <div className="kpi-ic tone-danger" style={{ width:44, height:44 }}><Icon name="alert-triangle" /></div>
            <div>
              <h2 className="alert-ttl">{vencidas.length + 1} ponto(s) pedem ação</h2>
              <p className="alert-sub" style={{ maxWidth:420 }}>Prioridade calculada por tarefas vencidas, cobranças atrasadas e emissão fiscal próxima.</p>
            </div>
          </div>
          <div className="dash-tiles">
            <div className="dash-tile" onClick={()=>go('tarefas')}><div className="dash-tile-n t-danger">{vencidas.length}</div><div className="dash-tile-l">tarefas</div></div>
            <div className="dash-tile" onClick={()=>go('financeiro')}><div className="dash-tile-n t-danger">2</div><div className="dash-tile-l">cobranças</div></div>
            <div className="dash-tile" onClick={()=>go('fiscal')}><div className="dash-tile-n t-warning">1</div><div className="dash-tile-l">NFS-e</div></div>
          </div>
        </div>
      </section>

      <section className="grid-kpi" style={{ marginBottom:18 }}>
        <KpiCard label="Clientes ativos" value="4" icon="users" tone="yellow" desc="Carteira operacional disponível para rotinas." foot="Abrir área" onClick={()=>go('clientes')} />
        <KpiCard label="Tarefas abertas" value={D.tarefas.length} icon="check-square" tone="danger" desc={`${vencidas.length} vencida(s) exigem tratamento primeiro.`} foot="Abrir área" onClick={()=>go('tarefas')} />
        <KpiCard label="Recebíveis 7 dias" value={D.fmtK(recebiveis)} icon="wallet-cards" tone="success" desc="3 lançamento(s) previstos para recebimento." foot="Abrir área" onClick={()=>go('financeiro')} />
        <KpiCard label="Atraso financeiro" value={D.fmtK(atraso)} icon="dollar-sign" tone="danger" desc="2 lançamento(s) já passaram do vencimento." foot="Abrir área" onClick={()=>go('financeiro')} />
      </section>

      <section className="dash-2col">
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card card-hover" style={{ padding:16, display:'flex', justifyContent:'space-between', alignItems:'center' }} onClick={()=>go('hoje')}>
            <div>
              <h2 className="list-h">Pendências operacionais</h2>
              <p className="alert-sub">{vencidas.length} tarefa(s) vencida(s) · 2 cobrança(s) em atraso · 1 NFS-e a emitir</p>
            </div>
            <div className="kpi-foot" style={{ marginTop:0 }}>Abrir fila <Icon name="arrow-right" /></div>
          </div>

          <div className="card" style={{ padding:16 }}>
            <div className="row" style={{ justifyContent:'space-between', marginBottom:14 }}>
              <div className="row" style={{ gap:8 }}><Icon name="clipboard-list" size={16} className="muted" /><span className="list-h">Competências — Abril/2026</span></div>
              <span className="kpi-foot muted" style={{ marginTop:0, cursor:'pointer' }} onClick={()=>go('competencias')}>Ver todas <Icon name="arrow-right" /></span>
            </div>
            <div className="comp-strip">
              <div className="comp-item"><Badge variant="outline">Abertas</Badge><span className="comp-n">5</span></div>
              <div className="comp-item"><Badge variant="info">Em andamento</Badge><span className="comp-n">8</span></div>
              <div className="comp-item"><Badge variant="success">Concluídas</Badge><span className="comp-n">21</span></div>
            </div>
          </div>

          <div className="card" style={{ overflow:'hidden' }}>
            <div className="list-head"><span className="dot" style={{ background:'var(--destructive)' }} /><h2 className="list-h">Cobranças vencidas</h2></div>
            {D.lancamentos.filter(l=>l.status==='atrasado').map(l=>(
              <div key={l.id} className="hoje-row" style={{ cursor:'pointer' }} onClick={()=>go('financeiro')}>
                <div style={{ flex:1, minWidth:0 }}><div className="hoje-title">{l.descricao}</div><div className="hoje-meta"><span>{l.cliente}</span></div></div>
                <div style={{ textAlign:'right' }}><div className="mono t-danger" style={{ fontWeight:700 }}>{D.fmt(l.valor)}</div><div className="hoje-meta" style={{ justifyContent:'flex-end' }}><span className="t-danger">{l.venc}</span></div></div>
              </div>
            ))}
          </div>
        </div>

        <aside style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card" style={{ padding:16 }}>
            <div className="row" style={{ gap:8, marginBottom:14 }}><Icon name="gauge" size={16} style={{ color:'var(--brand-yellow)' }} /><span className="list-h">Saúde do mês</span></div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <div className="row" style={{ justifyContent:'space-between', fontSize:12, marginBottom:5 }}><span className="muted">Abertas</span><span style={{ fontWeight:600 }} className="tnum">5</span></div>
                <div className="bar"><span style={{ width:'30%', background:'var(--warning)' }} /></div>
              </div>
              <div>
                <div className="row" style={{ justifyContent:'space-between', fontSize:12, marginBottom:5 }}><span className="muted">Concluídas</span><span style={{ fontWeight:600 }} className="tnum">21</span></div>
                <div className="bar"><span style={{ width:'72%', background:'var(--success)' }} /></div>
              </div>
              <div className="row" style={{ justifyContent:'space-between', fontSize:12, paddingTop:10, borderTop:'1px solid var(--border)' }}><span className="muted">Execução do mês</span><span className="t-warning" style={{ fontWeight:700 }}>72%</span></div>
            </div>
            <Button variant="outline" size="sm" className="btn-block" style={{ marginTop:14 }} onClick={()=>go('competencias')}>Ver competências</Button>
          </div>

          <div className="card" style={{ overflow:'hidden' }}>
            <div className="list-head"><Icon name="bar-chart-2" size={16} className="t-danger" /><h2 className="list-h">Clientes em risco</h2><span className="count-pill t-danger">{D.risco.length}</span></div>
            {D.risco.map((c,i)=>(
              <div key={c.id} className="risk-row" onClick={()=>go('clientes')}>
                <span className="risk-rank">{i+1}</span>
                <div style={{ flex:1, minWidth:0 }}><div className="hoje-title" style={{ fontSize:13 }}>{c.razao}</div><div className="hoje-meta">{c.motivos.join(' · ')}</div></div>
                <span className={`risk-score ${c.score>=3?'t-danger':'t-warning'}`}>{c.score}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

Object.assign(window, { HojeScreen, DashboardScreen });
