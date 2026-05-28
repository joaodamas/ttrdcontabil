/* JP Fiscal UI Kit — Login screen (recreated from login-form.tsx) */
const { useState: useStateLogin } = React;

const LOGIN_FEATURES = [
  'Gestão completa de clientes e competências',
  'Fechamento mensal e controle de obrigações',
  'Fiscal, NFS-e e lançamentos financeiros',
];
const LOGIN_STATS = [
  { label:'Clientes ativos', value:'200+', icon:'users', color:'#F5C200' },
  { label:'Fechamentos/mês', value:'99%', icon:'check-circle-2', color:'#22c55e' },
  { label:'Obrigações entregues', value:'100%', icon:'file-check-2', color:'#3b82f6' },
];

function Login({ onLogin }) {
  const [show, setShow] = useStateLogin(false);
  const [email, setEmail] = useStateLogin('joao@jpfiscal.com.br');
  const [senha, setSenha] = useStateLogin('demonstracao');
  const [busy, setBusy] = useStateLogin(false);

  const submit = (e) => {
    e.preventDefault();
    setBusy(true);
    setTimeout(() => { setBusy(false); onLogin(); }, 650);
  };

  return (
    <div className="login">
      {/* LEFT — dark brand panel */}
      <div className="login-left">
        <div className="login-dots" />
        <div className="login-glow" />
        <div className="login-diag" />
        <div className="login-left-c">
          <div className="login-logo">
            <div className="login-mark"><img src="../../assets/jp-logo.png" alt="JP" /></div>
            <div><div className="login-name">JP Fiscal</div><div className="login-tag">Gestão Contábil Integrada</div></div>
          </div>

          <div className="login-mid">
            <h1 className="login-h1">Sua contabilidade<br/><span className="g">no próximo nível</span></h1>
            <p className="login-lead">Plataforma completa para escritórios contábeis — clientes, obrigações, fiscal e financeiro em um único painel.</p>
            <div className="login-feats">
              {LOGIN_FEATURES.map((f,i) => (
                <div key={i} className="login-feat">
                  <span className="login-check"><Icon name="check-circle-2" size={12} /></span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <div className="login-stats">
              {LOGIN_STATS.map(s => (
                <div key={s.label} className="login-stat">
                  <Icon name={s.icon} size={16} style={{ color:s.color }} />
                  <div className="login-stat-v">{s.value}</div>
                  <div className="login-stat-l">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="login-foot">© 2026 JP Fiscal · Acesso restrito</p>
        </div>
      </div>

      {/* RIGHT — form */}
      <div className="login-right">
        <div className="login-right-dots" />
        <div className="login-card">
          <div className="login-card-ic"><Icon name="trending-up" size={16} /></div>
          <h2 className="login-card-h">Bem-vindo de volta</h2>
          <p className="login-card-sub">Entre com suas credenciais para acessar o painel</p>
          <form onSubmit={submit} style={{ marginTop: 22, display:'flex', flexDirection:'column', gap:16 }}>
            <Field label="E-mail">
              <input className="input login-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" />
            </Field>
            <Field label="Senha">
              <div style={{ position:'relative' }}>
                <input className="input login-input" type={show?'text':'password'} value={senha} onChange={e=>setSenha(e.target.value)} style={{ paddingRight: 38 }} />
                <button type="button" className="login-eye" onClick={()=>setShow(s=>!s)} tabIndex={-1}>
                  <Icon name={show?'eye-off':'eye'} size={16} />
                </button>
              </div>
            </Field>
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? <><Icon name="loader-2" size={16} className="spin" />Entrando...</> : <>Entrar no painel <Icon name="arrow-right" size={16} /></>}
            </button>
          </form>
        </div>
        <p className="login-restrict">Acesso restrito a usuários autorizados</p>
      </div>
    </div>
  );
}

window.Login = Login;
