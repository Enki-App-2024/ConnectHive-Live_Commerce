import HelpTip from "./HelpTip";
import { helpContent } from "../../data/helpContent";

export default function FeatureGuide({
  feature,
  compact = false,
  tone = "gold",
}) {
  const content = helpContent[feature];

  if (!content) return null;

  return (
    <HelpTip
      title={content.title}
      text={content.text}
      icon={content.icon || "🐝"}
      compact={compact}
      tone={tone}
    />
  );
}
