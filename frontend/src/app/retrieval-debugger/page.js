'use client';
import { useEffect, useState } from 'react';
import AppNav from '../../components/AppNav.js';
import TargetSelect from '../../components/TargetSelect.js';
import { retrieve } from '../../apiHandlers/ragApi.js';

export default function RetrievalDebuggerPage() { const [target, setTarget] = useState('local'); const [question, setQuestion] = useState(''); const [result, setResult] = useState(null); const [error, setError] = useState('');
  useEffect(() => { setResult(null); setError(''); }, [target]);
  async function submit(event) { event.preventDefault(); try { setError(''); setResult(await retrieve(question, target)); } catch (err) { setError(err.message); } }
  return <main className="shell"><AppNav /><header className="hero"><p className="eyebrow">RETRIEVAL VISIBILITY</p><h1>Debugger</h1><p className="intro">Inspect ranked Chroma results, similarity scores, metadata, and latency.</p></header><section className="target-panel"><h2>Storage target: {target === 'local' ? 'Local' : 'Chroma Cloud'}</h2><TargetSelect target={target} onChange={setTarget} /></section><form className="query-form" onSubmit={submit}><label htmlFor="debug-question">Query</label><input id="debug-question" value={question} onChange={(event) => setQuestion(event.target.value)} required maxLength={2000} /><button type="submit">Retrieve</button></form>{error && <p className="error-text">{error}</p>}{result && <section className="list-panel"><p className="notice">Target: {result.target} · {result.results.length} results · {result.latencyMs} ms · {result.embeddingModel}</p><ol className="retrieval-list">{result.results.map((item) => <li key={item.id}><strong>{item.metadata.source}</strong><span>score {item.score?.toFixed(4) ?? 'n/a'} · {item.metadata.section || 'document'}</span><p>{item.content}</p></li>)}</ol></section>}</main>; }
