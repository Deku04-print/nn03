import LiveBadge from './LiveBadge.jsx';

export default function PageHeader({ title, subtitle, actions, live = false, icon }) {
  return (
    <header className="page-header">
      <div className="page-heading">
        {icon && <div className="page-header-icon" aria-hidden="true">{icon}</div>}
        <div>
          <div className="page-title-row">
            <h1 className="page-title">{title}</h1>
            {live && <LiveBadge />}
          </div>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
