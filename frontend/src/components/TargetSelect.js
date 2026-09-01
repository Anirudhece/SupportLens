export default function TargetSelect({ target, onChange }) {
  return <div className="target-options"><label><input type="radio" name="rag-target" checked={target === 'local'} onChange={() => onChange('local')} /> Local</label><label><input type="radio" name="rag-target" checked={target === 'cloud'} onChange={() => onChange('cloud')} /> Chroma Cloud</label></div>;
}
