export default function EmptyState({ message = 'No data available.' }) {
  return <div className="empty-state">{message}</div>;
}
