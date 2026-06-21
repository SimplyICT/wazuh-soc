import { useState } from 'react';

export default function FilterTabs({ tabs, onChange, initial = 'all' }) {
  const [active, setActive] = useState(initial);
  const handle = (key) => {
    setActive(key);
    if (onChange) onChange(key);
  };
  return (
    <div className="filter-tabs">
      {tabs.map(t => (
        <span
          key={t.key}
          className={`filter-tab ${active === t.key ? 'active' : ''}`}
          onClick={() => handle(t.key)}
        >{t.label}</span>
      ))}
    </div>
  );
}
