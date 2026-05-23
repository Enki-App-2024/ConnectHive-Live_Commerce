import "./guidance.css";

export default function HelpTip({
  title,
  text,
  compact = false,
  icon = "🐝",
  tone = "gold",
}) {
  return (
    <div className={`help-tip ${compact ? "compact" : ""} ${tone}`}>
      <div className="help-tip-icon" aria-hidden="true">{icon}</div>

      <div className="help-tip-copy">
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
