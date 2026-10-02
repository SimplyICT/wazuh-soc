import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorState from '../components/ErrorState';

// Used only if the API omits "source"; the library provenance is otherwise API-driven.
const SOURCE_FALLBACK = 'https://github.com/mukul975/Anthropic-Cybersecurity-Skills';

function clip(s, n = 170) {
  const str = String(s || '');
  return str.length > n ? `${str.slice(0, n).trimEnd()}...` : str;
}

function Chips({ items, cls }) {
  if (!items || items.length === 0) return <span className="text-sm text-secondary">none</span>;
  return (
    <div className="flex flex-wrap gap-4">
      {items.map(x => <span key={x} className={`badge ${cls} badge-xs`}>{x}</span>)}
    </div>
  );
}

export default function Skills() {
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [subdomains, setSubdomains] = useState([]);

  // The URL is the single source of truth for selection and technique filter,
  // so Other pages can deep-link into a specific playbook.
  const selected = params.get('name') || '';
  const technique = params.get('technique') || '';

  // Debounce the search box so each keystroke does not hit the API.
  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useApi(
    () => fetch(`/api/skills?q=${encodeURIComponent(q)}&subdomain=${encodeURIComponent(subdomain)}&technique=${encodeURIComponent(technique)}&limit=50`).then(r => r.json()),
    [q, subdomain, technique]
  );

  const detail = useApi(
    () => (selected
      ? fetch(`/api/skills/${encodeURIComponent(selected)}`).then(r => r.json())
      : Promise.resolve(null)),
    [selected]
  );

  const skills = list.data?.skills || [];
  const counts = list.data?.counts || {};
  const source = list.data?.source || SOURCE_FALLBACK;

  // Keep every subdomain we have seen so the filter options do not shrink as
  // search results change; lane_priority seeds the list on first load.
  useEffect(() => {
    const data = list.data || {};
    const found = (data.skills || []).map(s => s.subdomain).filter(Boolean);
    const lane = data.counts?.lane_priority || [];
    setSubdomains(prev => [...new Set([...prev, ...found, ...lane])].sort());
  }, [list.data]);

  const selectSkill = (name) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      if (p.get('name') === name) p.delete('name'); else p.set('name', name);
      return p;
    });
  };

  const clearTechnique = () => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      p.delete('technique');
      return p;
    });
  };

  if (list.loading && !list.data) return <LoadingSpinner />;
  if (list.error) return <ErrorState message={list.error.message} onRetry={list.refetch} />;

  const d = detail.data && !detail.data.error ? detail.data : null;

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Playbooks &amp; Skills</div>
          <span className="text-sm text-secondary">Vendored cybersecurity skill library</span>
        </div>
        <div className="text-sm text-secondary">
          Source <a href={source} target="_blank" rel="noopener noreferrer">{source.replace(/^https?:\/\//, '')}</a>
          {counts.vendored_commit && <> &middot; commit <code>{String(counts.vendored_commit).slice(0, 7)}</code></>}
          {counts.total != null && <> &middot; {counts.total} skills indexed ({counts.defensive} defensive, {counts.offensive_excluded} offensive excluded)</>}
          {' '}&middot; offensive skills are hidden by default
        </div>
      </div>

      <div className="flex gap-8" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-header">
            <div className="card-title">Library ({skills.length})</div>
          </div>
          <div className="flex gap-6" style={{ marginBottom: 12 }}>
            <input className="input-flex" value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search skills..." />
            <select className="select" value={subdomain} onChange={e => setSubdomain(e.target.value)}>
              <option value="">All subdomains</option>
              {subdomains.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {technique && (
            <div style={{ marginBottom: 12 }}>
              <span className="badge badge-red badge-xs">technique: {technique}</span>
              <span className="text-sm text-secondary" style={{ marginLeft: 6, cursor: 'pointer' }} onClick={clearTechnique}>clear</span>
            </div>
          )}
          {list.loading ? <LoadingSpinner /> : skills.length === 0 ? (
            <div className="empty-state">No skills match this filter.</div>
          ) : (
            <div className="flex-col gap-8">
              {skills.map(s => (
                <div key={s.name} className="card"
                  style={{ padding: 10, margin: 0, cursor: 'pointer', borderLeft: selected === s.name ? '3px solid var(--accent)' : '3px solid transparent' }}
                  onClick={() => selectSkill(s.name)}>
                  <div className="flex gap-6 items-center" style={{ marginBottom: 2 }}>
                    <span className="text-mono text-md" style={{ fontWeight: 600 }}>{s.name}</span>
                    <span className="badge badge-accent badge-xs">{s.subdomain}</span>
                  </div>
                  <div className="text-sm text-secondary">{clip(s.description)}</div>
                  <div className="flex flex-wrap gap-4" style={{ marginTop: 4 }}>
                    {(s.mitre_attack || []).slice(0, 5).map(t => <span key={t} className="badge badge-red badge-xs">{t}</span>)}
                    {(s.tags || []).slice(0, 4).map(t => <span key={t} className="badge badge-gray badge-xs">{t}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-header">
            <div className="card-title">Skill detail</div>
            {selected && <button className="btn btn-xs" onClick={() => selectSkill(selected)}>Close</button>}
          </div>
          {!selected ? (
            <div className="empty-state">Select a skill to read its playbook.</div>
          ) : detail.loading ? <LoadingSpinner /> : !d ? (
            <div className="empty-state">Skill not found in the library.</div>
          ) : (
            <>
              <div className="flex gap-6 items-center" style={{ marginBottom: 8 }}>
                <span className="text-mono text-md" style={{ fontWeight: 600 }}>{d.name}</span>
                <span className="badge badge-accent badge-xs">{d.subdomain}</span>
              </div>
              <div className="text-base" style={{ marginBottom: 10 }}>{d.description}</div>
              <div className="text-sm text-secondary" style={{ marginBottom: 2 }}>Techniques</div>
              <div style={{ marginBottom: 8 }}><Chips items={d.mitre_attack} cls="badge-red" /></div>
              <div className="text-sm text-secondary" style={{ marginBottom: 2 }}>Tags</div>
              <div style={{ marginBottom: 8 }}><Chips items={d.tags} cls="badge-gray" /></div>
              <div className="text-sm text-secondary" style={{ marginBottom: 2 }}>NIST CSF</div>
              <div style={{ marginBottom: 8 }}><Chips items={d.nist_csf} cls="badge-accent" /></div>
              <div className="text-sm text-secondary">SKILL.md</div>
              {d.body ? (
                <pre className="code-block" style={{ whiteSpace: 'pre-wrap', maxHeight: 480, overflowY: 'auto' }}>{d.body}</pre>
              ) : (
                <div className="text-sm text-secondary">No body available.</div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
