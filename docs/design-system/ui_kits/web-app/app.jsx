/* JP Fiscal UI Kit — root app + simple router */
const { useState: useStateApp, useEffect: useEffectApp } = React;

function App() {
  const [authed, setAuthed] = useStateApp(false);
  const [route, setRoute] = useStateApp('hoje');

  const go = (r) => {
    if (r === '__logout') { setAuthed(false); return; }
    setRoute(r);
  };

  if (!authed) return <Login onLogin={() => { setAuthed(true); setRoute('hoje'); }} />;

  let screen;
  switch (route) {
    case 'hoje':        screen = <HojeScreen go={go} />; break;
    case 'dashboard':   screen = <DashboardScreen go={go} />; break;
    case 'clientes':    screen = <ClientesScreen go={go} />; break;
    case 'financeiro':  screen = <FinanceiroScreen />; break;
    case 'fiscal':      screen = <FiscalScreen />; break;
    case 'tarefas':     screen = <PlaceholderScreen title="Tarefas" />; break;
    case 'competencias':screen = <PlaceholderScreen title="Competências" />; break;
    case 'fechamento':  screen = <PlaceholderScreen title="Fechamento Mensal" />; break;
    case 'historico':   screen = <PlaceholderScreen title="Histórico NFS-e" />; break;
    case 'ir':          screen = <PlaceholderScreen title="Imposto de Renda" />; break;
    default:            screen = <HojeScreen go={go} />;
  }

  return (
    <div className="app">
      <Sidebar route={route} go={go} />
      <div className="main">
        <TopBar onSearch={() => {}} />
        <div className="content">{screen}</div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
