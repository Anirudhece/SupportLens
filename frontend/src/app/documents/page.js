'use client';
import { useEffect, useState } from 'react';
import AppNav from '../../components/AppNav.js';
import TargetSelect from '../../components/TargetSelect.js';
import { listDocuments, uploadDocument } from '../../apiHandlers/ragApi.js';

export default function DocumentsPage() {
  const [target, setTarget] = useState('local'); const [documents, setDocuments] = useState([]); const [message, setMessage] = useState('');
  async function refresh() { try { setDocuments((await listDocuments(target)).documents); } catch (error) { setMessage(error.message); } }
  useEffect(() => { refresh(); }, [target]);
  async function onUpload(event) { const file = event.target.files?.[0]; if (!file) return; setMessage('Ingesting…'); try { await uploadDocument(file, target); setMessage('Document ingested.'); await refresh(); } catch (error) { setMessage(error.message); } }
  return <main className="shell"><AppNav /><header className="hero"><p className="eyebrow">KNOWLEDGE BASE</p><h1>Documents</h1><p className="intro">Upload a small support document and inspect the explicit ingestion pipeline.</p></header><p className="warning">Gemini’s free tier is intended for synthetic, non-sensitive demonstration data. Do not upload confidential documents.</p><section className="target-panel"><div><h2>Storage target: {target === 'local' ? 'Local' : 'Chroma Cloud'}</h2><TargetSelect target={target} onChange={setTarget} /></div><label className="upload-button">Upload document<input type="file" accept=".md,.markdown,.txt,.pdf,text/plain,text/markdown,application/pdf" onChange={onUpload} /></label></section>{message && <p className="notice">{message}</p>}<section className="list-panel"><h2>Ingested documents</h2>{documents.length ? <ul>{documents.map((doc) => <li key={doc.id}><strong>{doc.name}</strong><span>{doc.status} · {doc.chunkCount} chunks</span></li>)}</ul> : <p className="status-detail">No documents yet.</p>}</section></main>;
}
