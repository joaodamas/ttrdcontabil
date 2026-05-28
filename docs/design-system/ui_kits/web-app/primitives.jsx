/* JP Fiscal UI Kit — shared primitives */
const { useEffect, useRef } = React;

/* Lucide icon — rendered into a React-LEAF <span> so lucide's node swap
   never collides with React's reconciler (avoids removeChild crashes). */
function Icon({ name, size, className, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.lucide) return;
    el.innerHTML = '<i data-lucide="' + name + '"></i>';
    window.lucide.createIcons();
    if (size) {
      const svg = el.querySelector('svg');
      if (svg) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
    }
  }, [name, size]);
  return <span ref={ref} className={className} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...(style || {}) }} />;
}

function Button({ variant = 'primary', size, icon, iconEnd, children, className = '', ...rest }) {
  const cls = ['btn', `btn-${variant}`, size ? `btn-${size}` : '', !children ? 'btn-icon' : '', className].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
      {iconEnd && <Icon name={iconEnd} />}
    </button>
  );
}

function Badge({ variant = 'neutral', icon, children }) {
  return <span className={`badge badge-${variant}`}>{icon && <Icon name={icon} />}{children}</span>;
}

/* ── status → {label, variant} maps (from product status-badge.tsx) ──────── */
const STATUS = {
  cliente:     { ativo:['Ativo','success'], inativo:['Inativo','secondary'], suspenso:['Suspenso','warning'] },
  tarefa:      { pendente:['Pendente','outline'], em_andamento:['Em andamento','info'], concluida:['Concluída','success'], cancelada:['Cancelada','secondary'] },
  prioridade:  { baixa:['Baixa','outline'], normal:['Normal','secondary'], alta:['Alta','warning'], urgente:['Urgente','destructive'] },
  pagamento:   { pendente:['Pendente','outline'], pago:['Pago','success'], atrasado:['Atrasado','destructive'], cancelado:['Cancelado','secondary'], estornado:['Estornado','warning'] },
  nfse:        { emitida:['Emitida','success'], pendente_processamento:['Pendente','outline'], rejeitada:['Rejeitada','destructive'], cancelada:['Cancelada','secondary'], erro_integracao:['Erro','destructive'] },
};
function StatusBadge({ kind, value }) {
  const [label, variant] = (STATUS[kind] && STATUS[kind][value]) || [value, 'outline'];
  return <Badge variant={variant}>{label}</Badge>;
}

function KpiCard({ label, value, icon, tone = 'muted', desc, foot, onClick }) {
  const valTone = { yellow:'', success:'t-success', danger:'t-danger', info:'t-info', muted:'' }[tone] || '';
  return (
    <div className={`kpi fade-in ${onClick ? 'card-hover' : ''}`} onClick={onClick}>
      <div className="kpi-top">
        <div style={{ minWidth: 0 }}>
          <div className="kpi-lbl">{label}</div>
          <div className={`kpi-val ${valTone}`}>{value}</div>
        </div>
        {icon && <div className={`kpi-ic tone-${tone}`}><Icon name={icon} /></div>}
      </div>
      {desc && <div className="kpi-desc">{desc}</div>}
      {foot && <div className="kpi-foot">{foot} <Icon name="arrow-right" /></div>}
    </div>
  );
}

function Field({ label, req, children }) {
  return (
    <div>
      {label && <label className="field-lbl">{label}{req && <span className="req"> *</span>}</label>}
      {children}
    </div>
  );
}
function Select({ children, value, ...rest }) {
  return (
    <div className="select-wrap">
      <select className="input" value={value} {...rest}>{children}</select>
      <Icon name="chevron-down" />
    </div>
  );
}

Object.assign(window, { Icon, Button, Badge, StatusBadge, KpiCard, Field, Select });
