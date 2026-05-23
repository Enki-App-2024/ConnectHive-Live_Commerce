import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/pending-approval.css";

const PLAN_KEY = "connecthive_live_selected_plan";
const PAYMENT_KEYS = ["connecthive_live_payments", "connecthive_live_payments_v1"];

function safeRead(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getLatestPayment() {
  for (const key of PAYMENT_KEYS) {
    const value = safeRead(key, null);
    if (Array.isArray(value) && value.length > 0) {
      return value[0];
    }
  }

  return null;
}

function PendingApproval() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedPlan =
    location.state?.selectedPlan || safeRead(PLAN_KEY, null) || {
      name: "Selected",
      priceText: "Pending",
    };

  const latestPayment = useMemo(() => getLatestPayment(), []);

  const planName =
    selectedPlan?.name || selectedPlan?.plan_name || latestPayment?.plan || "Selected";

  const amount =
    latestPayment?.amount || selectedPlan?.price || selectedPlan?.amount || "";

  const mpesaCode =
    latestPayment?.mpesa_code ||
    latestPayment?.transaction_code ||
    latestPayment?.code ||
    "";

  const whatsappNumber = "254768063078";

  const whatsappMessage = encodeURIComponent(
    `Hi ConnectHive Live, I have submitted payment for the ${planName} plan.${
      amount ? ` Amount: KES ${amount}.` : ""
    }${mpesaCode ? ` M-Pesa code: ${mpesaCode}.` : ""} Please help verify my account.`
  );

  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  return (
    <main className="approval-page">
      <section className="approval-card">
        <div className="page-kicker">PAYMENT SUBMITTED</div>

        <h1>
          Your account is under <span>review</span>
        </h1>

        <p>
          We have recorded your selected plan and payment details locally while
          the Supabase verification table is being prepared. Admin will verify
          the M-Pesa code, then activate the seller account.
        </p>

        <div className="approval-summary-grid">
          <div>
            <span>Plan</span>
            <strong>{planName}</strong>
          </div>

          <div>
            <span>Amount</span>
            <strong>{amount ? `KES ${Number(amount).toLocaleString("en-KE")}` : "Pending"}</strong>
          </div>

          <div>
            <span>M-Pesa Code</span>
            <strong>{mpesaCode || "Not provided"}</strong>
          </div>
        </div>

        <div className="approval-timeline">
          <div className="timeline-step active">
            <strong>1</strong>
            <div>
              <h3>Payment submitted</h3>
              <p>Your plan and M-Pesa details have been captured.</p>
            </div>
          </div>

          <div className="timeline-step active">
            <strong>2</strong>
            <div>
              <h3>Admin verification</h3>
              <p>Support confirms the transaction manually.</p>
            </div>
          </div>

          <div className="timeline-step">
            <strong>3</strong>
            <div>
              <h3>Account activation</h3>
              <p>Your seller dashboard is activated after verification.</p>
            </div>
          </div>
        </div>

        <div className="approval-support">
          <h3>Need faster support?</h3>
          <p>
            Tap WhatsApp and send the verification message. Support number:
            <strong> 0768063078</strong>
          </p>

          <div className="action-row">
            <a
              className="btn-primary link-btn"
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
            >
              Open WhatsApp Support
            </a>

            <button className="btn-secondary" type="button" onClick={() => navigate("/payments")}>
              Back to Payments
            </button>

            <button className="btn-secondary" type="button" onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default PendingApproval;
