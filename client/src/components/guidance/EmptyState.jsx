import "./guidance.css";

export default function EmptyState({
  title,
  text,
  action,
  icon = "🐝",
}) {
  return (
    <div className="empty-state-card">
      <div className="empty-state-icon" aria-hidden="true">
        {icon}
      </div>

      <h3>{title}</h3>
      <p>{text}</p>

      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}