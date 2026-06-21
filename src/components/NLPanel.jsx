import { useState, useRef, useEffect } from 'react';

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
      let txt = d.message || 'No response.';
      const r = d.results;
      if (r) {
        if (r.type === 'overview') {
          txt += `<br><br><span style="color:var(--accent)">&#128268; ${r.devices_total} devices</span> &middot; <span style="color:var(--green)">${r.devices_online} online</span> &middot; <span style="color:var(--red)">${r.devices_offline} offline</span> &middot; <span style="color:var(--amber)">${r.alerts_open} alerts</span>`;
        } else if (r.type === 'offline_devices' && r.items) {
          txt += r.items.map(i => `<br>&#128308; [${i.severity}] ${escHtml(i.title)}`).join('');
        } else if (r.type === 'critical_alerts' && r.items) {
          txt += r.items.map(i => `<br>&#128308; [${i.severity}] ${escHtml(i.title)} <span style="color:var(--text-secondary)">${escHtml(i.site)}</span>`).join('');
        } else if (r.type === 'device_detail') {
          txt = `<b>${escHtml(r.ip)}</b><br>Name: ${escHtml(r.friendly_name || r.hostname || '-')}<br>Type: ${escHtml(r.device_type)}<br>Vendor: ${escHtml(r.vendor)}<br>Status: ${escHtml(r.status)}`;
        }
      }
      setMessages(prev => [...prev.slice(0, -1), { role: 'bot', text: txt, html: true }]);
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
          <div key={i} className={`nl-msg nl-${m.role}`}
              dangerouslySetInnerHTML={m.html ? { __html: m.text } : undefined}>
            {!m.html && m.text}
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

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
