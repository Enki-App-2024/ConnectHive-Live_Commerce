import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PLAN_OPTIONS, usePayments } from "../contexts/PaymentContext";
import "../styles/plans.css";

function currency(amount) {
  return `KES ${Number(amount || 0).toLocaleString("en-KE")}`;
}

function Plans() {
  const navigate = useNavigate();
  const {
    selectedPlan,
    setSelectedPlan,
    activeAccess,
    startBasicTrial,
  } = usePayments();

  const [billingMode, setBillingMode] = useState("monthly");
  const [selectedPlanKey, setSelectedPlanKey] = useState(
    selectedPlan?.key || "basic"
  );

  const currentPlan = useMemo(() => {
    return PLAN_OPTIONS.find((plan) => plan.key === selectedPlanKey) || PLAN_OPTIONS[0];
  }, [selectedPlanKey]);

  const choosePlan = (plan) => {
    setSelectedPlan(plan);

    if (plan.key === "basic" && activeAccess.status === "expired") {
      const trial = startBasicTrial();

      if (trial?.status === "trialing") {
        navigate("/dashboard", {
          state: {
            accessMessage:
              "Basic trial started. You have 3 days to test ConnectHive Live before paying KES 500/month.",
          },
        });
        return;
      }
    }

    navigate("/payment", {
      state: {
        selectedPlan: plan,
      },
    });
  };

  return (
    <main className="plans-page">
      <section className="plans-hero">
        <div>
          <div className="page-kicker">CHOOSE YOUR PLAN</div>

          <h1>
            Simple pricing for <span>live sellers</span>
          </h1>

          <p>
            Start with a 3-day Basic trial, then pay monthly when the app starts
            helping you sell. No fake unlimited magic. Every plan is locked to
            the access you have actually paid for.
          </p>

          <div className="billing-toggle" aria-label="Billing mode">
            <button
              type="button"
              className={billingMode === "monthly" ? "active" : ""}
              onClick={() => setBillingMode("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={billingMode === "future" ? "active" : ""}
              onClick={() => setBillingMode("future")}
            >
              Annual later
            </button>
          </div>
        </div>

        <aside className="plans-summary-card">
          <span>Current access</span>
          <strong>{activeAccess.planName}</strong>
          <p>
            {activeAccess.status === "active"
              ? `${activeAccess.daysLeft} day(s) left on paid access.`
              : activeAccess.status === "trialing"
              ? `${activeAccess.daysLeft} day(s) left on Basic trial.`
              : activeAccess.lockReason}
          </p>
        </aside>
      </section>

      <section className="plans-grid">
        {PLAN_OPTIONS.map((plan) => {
          const isSelected = selectedPlanKey === plan.key;
          const isCurrent = activeAccess.planKey === plan.key && activeAccess.canUseLive;

          return (
            <article
              key={plan.key}
              className={`plan-card ${isSelected ? "active" : ""} ${
                isCurrent ? "current" : ""
              }`}
              onClick={() => setSelectedPlanKey(plan.key)}
            >
              <div className="plan-card-top">
                <span>{plan.badge}</span>
                {isCurrent && <small>Current</small>}
              </div>

              <h2>{plan.name}</h2>
              <p>{plan.label}</p>

              <div className="plan-price">
                <strong>{plan.key === "basic" ? "KES 0" : currency(plan.price)}</strong>
                <span>
                  {plan.key === "basic"
                    ? `for ${plan.trialDays} days, then ${currency(plan.price)}/month`
                    : "/ month"}
                </span>
              </div>

              <p className="plan-description">{plan.description}</p>

              <div className="plan-limits">
                <div>
                  <span>Hosts</span>
                  <strong>{plan.hosts}</strong>
                </div>
                <div>
                  <span>Moderators</span>
                  <strong>{plan.moderators}</strong>
                </div>
              </div>

              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <button type="button" onClick={() => choosePlan(plan)}>
                {plan.key === "basic" && activeAccess.status === "expired"
                  ? "Start 3-day trial"
                  : plan.key === "basic"
                  ? "Pay Basic"
                  : `Choose ${plan.name}`}
              </button>
            </article>
          );
        })}
      </section>

      <section className="plans-note">
        <h3>Payment containment logic</h3>
        <p>
          Selecting a card only changes the intended plan. The app unlocks limits
          only after a trial is started or a payment is verified. That means a
          seller cannot simply click Pro and receive Pro limits.
        </p>
      </section>
    </main>
  );
}

export default Plans;
