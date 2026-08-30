'use client';

import { useEffect, useState } from 'react';
import ServiceStatus from '../components/ServiceStatus.js';
import { fetchDependencyHealth, fetchHealth } from '../apiHandlers/healthApi.js';

const initialStatus = { state: 'checking' };

export default function HomePage() {
  const [target, setTarget] = useState('local');
  const [apiStatus, setApiStatus] = useState(initialStatus);
  const [dependencyStatus, setDependencyStatus] = useState(initialStatus);

  useEffect(() => {
    let active = true;

    async function checkStatus() {
      setApiStatus(initialStatus);
      setDependencyStatus(initialStatus);

      const [apiResult, dependencyResult] = await Promise.all([
        fetchHealth(),
        fetchDependencyHealth(target)
      ]);

      if (active) {
        setApiStatus(apiResult);
        setDependencyStatus(dependencyResult);
      }
    }

    checkStatus();
    return () => {
      active = false;
    };
  }, [target]);

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">MILESTONE 0 · ENVIRONMENT SETUP</p>
        <h1>SupportLens technical status</h1>
        <p className="intro">
          Verify the browser, API, and selected ChromaDB connection before adding RAG behaviour.
        </p>
      </header>

      <section className="target-panel" aria-labelledby="target-heading">
        <div>
          <p className="eyebrow">CHROMADB TARGET</p>
          <h2 id="target-heading">Choose a dependency to check</h2>
        </div>
        <div className="target-options">
          <label>
            <input
              type="radio"
              name="target"
              value="local"
              checked={target === 'local'}
              onChange={() => setTarget('local')}
            />
            Local
          </label>
          <label>
            <input
              type="radio"
              name="target"
              value="cloud"
              checked={target === 'cloud'}
              onChange={() => setTarget('cloud')}
            />
            Chroma Cloud
          </label>
        </div>
      </section>

      <section className="status-grid" aria-label="Service status">
        <ServiceStatus name="Frontend" state="connected" detail="This status page is running." />
        <ServiceStatus name="Express API" state={apiStatus.state} detail={apiStatus.detail} />
        <ServiceStatus
          name={`ChromaDB · ${target === 'local' ? 'Local' : 'Cloud'}`}
          state={dependencyStatus.state}
          detail={dependencyStatus.detail}
        />
      </section>
    </main>
  );
}
