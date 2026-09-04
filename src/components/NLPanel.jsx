import { useState, useRef, useEffect, useCallback } from 'react';

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** Renders a single bot message — supports structured results (legacy) and plain text. */
function BotMessage({ text, results, streaming }) {
  if (streaming) {
    return (
      <span style={{ whiteSpace: 'pre-wrap' }}>
        {text}<span className="streaming-cursor" />
      </span>
    );
  }
  if (!results) return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;

  if (results.type === 'overview') {
    return (
      <span>
        {text}<br /><br />
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
          <span key={i.severity + i.title}><br />&#128308; [{i.severity}] {escHtml(i.title)}{results.type === 'critical_alerts' ? <span style={{ color: 'var(--text-secondary)' }}> {escHtml(i.site)}</span> : null}</span>
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
    {
      role: 'bot',
      text: 'Hi! I\'m your AI SOC assistant. Ask me about alerts, agents, vulnerabilities, or anything in your environment.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgsRef = useRef(null);
  const inputRef = useRef(null);
  const accumulatedRef = useRef(''); // holds the accumulating streaming text
  const msgIndexRef = useRef(-1);     // index of the streaming message in the array

  // Auto-scroll when new content arrives
  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  /** Append a streaming token to the last streaming message (or create one). */
  const appendToken = useCallback((token) => {
    accumulatedRef.current += token;
    setMessages(prev => {
      const idx = msgIndexRef.current;
      if (idx >= 0 && idx < prev.length && prev[idx].role === 'bot-streaming') {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], text: accumulatedRef.current };
        return updated;
      }
      // Create a new streaming message
      const newIdx = prev.length;
      msgIndexRef.current = newIdx;
      return [...prev, { role: 'bot-streaming', text: accumulatedRef.current }];
    });
  }, []);

  /** Finalize streaming — convert from bot-streaming to bot. */
  const finalizeStream = useCallback(() => {
    setMessages(prev => {
      const idx = msgIndexRef.current;
      if (idx >= 0 && idx < prev.length && prev[idx].role === 'bot-streaming') {
        const updated = [...prev];
        updated[idx] = { role: 'bot', text: updated[idx].text };
        msgIndexRef.current = -1;
        accumulatedRef.current = '';
        return updated;
      }
      msgIndexRef.current = -1;
      accumulatedRef.current = '';
      return prev;
    });
  }, []);

  const handleSend = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setLoading(true);
    accumulatedRef.current = '';
    msgIndexRef.current = -1;

    setMessages(prev => [...prev, { role: 'user', text: q }]);

    try {
      const history = messages.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.text,
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, messages: history }),
      });

      if (!res.ok) {
        // Fallback to legacy NL search
        const fb = await fetch('/api/nl/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        const d = await fb.json();
        setMessages(prev => [...prev, { role: 'bot', text: d.message || 'No response.', results: d.results }]);
        setLoading(false);
        return;
      }

      // Read SSE stream
      if (!res.body) throw new Error('Response body is null');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const chunk = JSON.parse(payload);
            if (chunk.type === 'token') {
              appendToken(chunk.content);
            } else if (chunk.type === 'done') {
              finalizeStream();
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      // If no 'done' event was received, finalize anyway
      if (accumulatedRef.current) {
        finalizeStream();
      }
    } catch (e) {
      // Reset any partial SSE stream state
      accumulatedRef.current = '';
      msgIndexRef.current = -1;
      setMessages(prev => prev.filter(m => m.role !== 'bot-streaming'));
      // Fallback on error
      try {
        const fb = await fetch('/api/nl/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        const d = await fb.json();
        setMessages(prev => [...prev, { role: 'bot', text: d.message || 'No response.', results: d.results }]);
      } catch {
        setMessages(prev => [...prev, { role: 'bot', text: `Error: ${e.message}` }]);
      }
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, appendToken, finalizeStream]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`nl-panel ${open ? 'open' : ''}`}>
      <div className="nl-header">
        <span>AI SOC Assistant</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 1 }} />}
          <span className="nl-close" onClick={onClose}>&#10005;</span>
        </div>
      </div>
      <div className="nl-messages" ref={msgsRef}>
        {messages.map((m, i) => (
          <div key={m.timestamp || m.text + m.role} className={`nl-msg nl-${m.role === 'bot-streaming' ? 'bot' : m.role}`}>
            <BotMessage
              text={m.text}
              results={m.results}
              streaming={m.role === 'bot-streaming'}
            />
          </div>
        ))}
        {loading && msgIndexRef.current < 0 && (
          <div className="nl-msg nl-bot">
            <span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 1 }} /> Thinking...
          </div>
        )}
      </div>
      <div className="nl-input-row">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about alerts, agents, threats..."
          disabled={loading}
        />
        <button
          className="btn btn-sm btn-primary"
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          &#10148;
        </button>
      </div>
    </div>
  );
}
