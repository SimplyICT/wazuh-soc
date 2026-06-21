export default function LoadingSpinner({ text = 'Loading...' }) {
  return (
    <div className="loading">
      <div className="loading-spinner"></div>
      <div style={{ marginTop: 12 }}>{text}</div>
    </div>
  );
}
