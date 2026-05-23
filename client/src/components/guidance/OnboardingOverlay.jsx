import { useEffect, useState } from "react";
import { onboardingSteps } from "../../data/helpContent";
import "./guidance.css";

const STORAGE_KEY = "connecthive_live_onboarding_seen";

export default function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) setVisible(true);
  }, []);

  if (!visible) return null;

  const step = onboardingSteps[stepIndex];
  const isLast = stepIndex === onboardingSteps.length - 1;

  const close = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  };

  const next = () => {
    if (isLast) return close();
    setStepIndex((current) => current + 1);
  };

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true">
      <div className="onboarding-card">
        <span className="onboarding-kicker">ConnectHive Live Setup</span>
        <h2>{step.title}</h2>
        <p>{step.text}</p>

        <div className="onboarding-progress">
          {onboardingSteps.map((_, index) => (
            <span
              key={index}
              className={index === stepIndex ? "active" : ""}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          <button type="button" className="guide-btn secondary" onClick={close}>
            Skip
          </button>
          <button type="button" className="guide-btn primary" onClick={next}>
            {isLast ? "Start Selling" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
