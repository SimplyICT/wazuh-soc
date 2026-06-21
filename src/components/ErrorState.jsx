export default function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      <div>{message}</div>
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}
