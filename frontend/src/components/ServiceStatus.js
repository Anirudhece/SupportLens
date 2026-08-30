const labels = {
  checking: 'Checking',
  connected: 'Connected',
  unreachable: 'Unreachable',
  'not-configured': 'Not configured'
};

export default function ServiceStatus({ name, state = 'checking', detail }) {
  const safeState = labels[state] ? state : 'checking';

  return (
    <article className={`status-card status-${safeState}`}>
      <h2>{name}</h2>
      <div className="status-line">
        <span className="status-dot" aria-hidden="true" />
        <span>{labels[safeState]}</span>
      </div>
      <p className="status-detail">{detail || 'Waiting for a response.'}</p>
    </article>
  );
}
