import { useState, useRef, useEffect } from 'react';
import { useRefresh } from './RefreshContext';

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function BotMessage({ text, results }) {
  if (!results) return <span>{text}</span>;
  if (results.type === 'overview') {
    return (
      <span>
        {text}
        <br /><br />
        <span style={{ color: 'var(--accent)' }}>&#128268; {results.devices_total} devices</span>
        {' '}&middot;{' '}
        <span style={{ color: 'var(--green)' }}>{results.devices_online} online</span>
        {' '}&middot;{' '}
        <span style={{ color: 'var(--red)' }}>{results.devices_offline} offline</span>
        {' '}&middot;{' '}
        <span style={{ color: 'var(--amber)' }}>{results.alerts_open} alerts</span>
      </span>
    );
  }
  if ((results.type === 'offline_devices' || results.type === 'critical_alerts') && results.items) {
    return (
      <span>
        {results.items.map((i, idx) => (
          <span key={idx}><br />&#128308; [{i.severity}] {escHtml(i.title)}{results.type === 'critical_alerts' ? <span style={{ color: 'var(--text-secondary)' }}> {escHtml(i.site)}</span> : null}</span>
        ))}
      </span>
    );
  }
  if (results.type === 'device_detail') {
    return (
      <span>
        <b>{escHtml(results.ip)}</b><br />
        Name: {escHtml(results.friendly_name || results.hostname || '-')}<br />
        Type: {escHtml(results.device_type)}<br />
        Vendor: {escHtml(results.vendor)}<br />
        Status: {escHtml(results.status)}
      </span>
    );
  }
  return <span>{text}</span>;
}

export default function NLPanel({ open, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hi! Ask me about your network. Try "show offline devices" or "site health".' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgsRef = useRef(null);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }, { role: 'bot', text: 'Thinking...' }]);
    setLoading(true);
    try {
      const res = await fetch('/wazuh-api/nl/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const d = await res.json();
      const txt = d.message || 'No response.';
      setMessages(prev => [...prev.slice(0, -1), { role: 'bot', text: txt, results: d.results }]);
    } catch (e) {
      setMessages(prev => [...prev.slice(0, -1), { role: 'bot', text: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`nl-panel ${open ? 'open' : ''}`}>
      <div className="nl-header">
        <span>Ask SOC</span>
        <span className="nl-close" onClick={onClose}>&#10005;</span>
      </div>
      <div className="nl-messages" ref={msgsRef}>
        {messages.map((m, i) => (
          <div key={i} className={`nl-msg nl-${m.role}`}>
            {m.role === 'bot' && (m.results || m.text !== 'Thinking...')
              ? <BotMessage text={m.text} results={m.results} />
              : m.text}
          </div>
        ))}
      </div>
      <div className="nl-input-row">
        <input value={input} onChange={e => setInput(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && handleSend()}
               placeholder="Ask a question..." />
        <button className="btn btn-sm btn-primary" onClick={handleSend} disabled={loading}>&#10148;</button>
      </div>
    </div>
  );
}
