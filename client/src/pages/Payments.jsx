import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import {
  PLAN_OPTIONS,
  getPlanByKey,
  normalizePlan,
  usePayments,
} from "../contexts/PaymentContext";
import "../styles/payments.css";

const mpesaNumber = "0768063078";
const whatsappNumber = "254768063078";
const SELLER_PROFILE_KEY = "connecthive_live_seller_profile";

const initialForm = {
  customer_name: "",
  phone: "",
  amount: "",
  mpesa_code: "",
  notes: "",
};

function readLocal(key, fallback = null) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function currency(amount) {
  return `KES ${Number(amount || 0).toLocaleString("en-KE")}`;
}

function Payments() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    sortedPayments,
    paymentStats,
    selectedPlan,
    setSelectedPlan,
    activeAccess,
    submitPayment,
    verifyPayment,
    rejectPayment,
    markSubmitted,
    deletePayment,
    syncStatus,
    loading,
  } = usePayments();

  const locationPlan = normalizePlan(location.state?.selectedPlan || selectedPlan);
  const [selectedPlanKey, setSelectedPlanKey] = useState(locationPlan.key);
  const selectedPaymentPlan = getPlanByKey(selectedPlanKey);

  const [form, setForm] = useState(() => {
    const profile = readLocal(SELLER_PROFILE_KEY, {});
    const plan = locationPlan;

    return {
      ...initialForm,
      customer_name: profile.businessName || profile.fullName || "",
      phone: profile.phone || "",
      amount: plan.price || "",
    };
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const plan = getPlanByKey(selectedPlanKey);
    setSelectedPlan(plan);

    setForm((current) => ({
      ...current,
      amount: plan.price || "",
    }));
  }, [selectedPlanKey, setSelectedPlan]);

  const filteredPayments = useMemo(() => {
    const term = search.toLowerCase();

    return sortedPayments.filter((payment) => {
      const joined = [
        payment.customer_name,
        payment.phone,
        payment.plan_key,
        payment.plan_name,
        payment.mpesa_code,
        payment.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = joined.includes(term);
      const matchesStatus = statusFilter === "all" || payment.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [sortedPayments, search, statusFilter]);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(mpesaNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  function buildWhatsappLink(payment = null) {
    const row = payment || {
      customer_name: form.customer_name,
      phone: form.phone,
      plan_name: selectedPaymentPlan.name,
      amount: form.amount || selectedPaymentPlan.price,
      mpesa_code: form.mpesa_code,
    };

    const text = encodeURIComponent(
      `Hi ConnectHive Live, I have paid for ${row.plan_name}. Seller: ${
        row.customer_name
      }. Amount: ${currency(row.amount)}. M-Pesa code: ${
        row.mpesa_code
      }. Phone: ${row.phone}. Please verify my seller account.`
    );

    return `https://wa.me/${whatsappNumber}?text=${text}`;
  }

  async function savePayment(event, options = { openWhatsapp: true }) {
    event?.preventDefault?.();

    if (!form.customer_name || !form.phone || !form.amount || !form.mpesa_code) {
      setMessage("Fill seller name, phone, amount and M-Pesa code first.");
      return;
    }

    if (Number(form.amount) < selectedPaymentPlan.price) {
      setMessage(
        `${selectedPaymentPlan.name} requires ${currency(
          selectedPaymentPlan.price
        )}. Do not underpay then expect the bee to pretend.`
      );
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const saved = await submitPayment({
        customer_name: form.customer_name,
        phone: form.phone,
        amount: Number(form.amount || selectedPaymentPlan.price || 0),
        mpesa_code: form.mpesa_code.trim().toUpperCase(),
        notes: form.notes,
        plan_key: selectedPaymentPlan.key,
        plan_name: selectedPaymentPlan.name,
        moderators: selectedPaymentPlan.moderators,
        status: "pending",
      });

      setMessage(
        "Payment saved. It is locked as pending until admin verifies it."
      );

      setForm((current) => ({
        ...current,
        mpesa_code: "",
        notes: "",
      }));

      if (options.openWhatsapp) {
        window.open(buildWhatsappLink(saved), "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setMessage(error?.message || "Payment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(paymentId, status) {
    if (status === "verified") {
      await verifyPayment(paymentId);
      setMessage("Payment verified. Seller access has been activated for 30 days.");
      return;
    }

    if (status === "rejected") {
      await rejectPayment(paymentId);
      setMessage("Payment rejected. Seller access remains locked.");
      return;
    }

    if (status === "submitted") {
      await markSubmitted(paymentId);
      setMessage("Payment marked as submitted.");
    }
  }

  function exportCsv() {
    const rows = [
      ["Customer", "Phone", "Plan", "Amount", "M-Pesa Code", "Status", "Created At"],
      ...filteredPayments.map((payment) => [
        payment.customer_name,
        payment.phone,
        payment.plan_name || payment.plan_key,
        payment.amount,
        payment.mpesa_code,
        payment.status,
        payment.created_at,
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "connecthive-payments.csv";
    anchor.click();

    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout>
      <section className="payments-os-page">
        <section className="payments-hero">
          <div>
            <div className="payments-kicker">PAYMENT LOCKING</div>
            <h1>
              Activate the exact <span>plan paid for</span>
            </h1>
            <p>
              A seller can select any plan, but the app only unlocks limits from
              an active trial or verified payment. This protects Basic, Team,
              Growth and Pro from UI switching.
            </p>
          </div>

          <div className="payments-sync-card">
            <span className={`sync-dot ${syncStatus === "Cloud synced" ? "cloud" : "local"}`}></span>
            <strong>{syncStatus}</strong>
            <p>
              Current access: {activeAccess.planName} · {activeAccess.status}
            </p>
          </div>
        </section>

        <section className="payment-plan-grid">
          {PLAN_OPTIONS.map((plan) => (
            <button
              key={plan.key}
              className={`payment-plan-card ${
                selectedPlanKey === plan.key ? "active" : ""
              }`}
              type="button"
              onClick={() => setSelectedPlanKey(plan.key)}
            >
              <span>{plan.badge}</span>
              <h3>{plan.name}</h3>
              <strong>
                {plan.key === "basic" ? "KES 0 trial" : currency(plan.price)}
              </strong>
              <p>
                {plan.key === "basic"
                  ? `Then ${currency(plan.price)}/month`
                  : "Monthly"}
              </p>
              <small>
                {plan.hosts} host · {plan.moderators} moderator(s)
              </small>
            </button>
          ))}
        </section>

        <section className="payment-card access-lock-card">
          <div>
            <span>Access Guard</span>
            <h2>{activeAccess.canUseLive ? "Unlocked" : "Locked"}</h2>
            <p>{activeAccess.lockReason || `${activeAccess.daysLeft} day(s) left.`}</p>
          </div>

          <button type="button" onClick={() => navigate("/live-session")}>
            Open Live Session
          </button>
        </section>

        <section className="payments-main-grid">
          <div className="payment-card payment-instructions">
            <div className="section-heading">
              <div>
                <span>Step 1</span>
                <h2>Pay to ConnectHive</h2>
              </div>
              <button type="button" onClick={copyNumber}>
                {copied ? "Copied" : "Copy Number"}
              </button>
            </div>

            <div className="mpesa-display-card">
              <p>POCHI LA BIASHARA</p>
              <h3>{mpesaNumber}</h3>
              <span>
                Selected: {selectedPaymentPlan.name} · {currency(selectedPaymentPlan.price)}
              </span>
            </div>

            <ul className="payment-feature-list">
              {selectedPaymentPlan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>

          <form
            className="payment-card payment-submit-form"
            onSubmit={(event) => savePayment(event, { openWhatsapp: true })}
          >
            <div className="section-heading">
              <div>
                <span>Step 2</span>
                <h2>Submit payment details</h2>
              </div>
              <button type="button" onClick={() => navigate("/pending")}>
                Pending Page
              </button>
            </div>

            <div className="payment-form-grid">
              <label>
                Seller name
                <input
                  type="text"
                  value={form.customer_name}
                  placeholder="e.g. Grace Collections"
                  onChange={(event) => updateForm("customer_name", event.target.value)}
                />
              </label>

              <label>
                Phone number
                <input
                  type="tel"
                  value={form.phone}
                  placeholder="e.g. 0712 345 678"
                  onChange={(event) => updateForm("phone", event.target.value)}
                />
              </label>

              <label>
                Amount paid
                <input
                  type="number"
                  value={form.amount}
                  min={selectedPaymentPlan.price}
                  placeholder={`e.g. ${selectedPaymentPlan.price}`}
                  onChange={(event) => updateForm("amount", event.target.value)}
                />
              </label>

              <label>
                M-Pesa transaction code
                <input
                  type="text"
                  value={form.mpesa_code}
                  placeholder="e.g. TQ92ABC123"
                  onChange={(event) =>
                    updateForm("mpesa_code", event.target.value.toUpperCase())
                  }
                />
              </label>

              <label className="payment-wide">
                Verification note
                <textarea
                  rows="3"
                  value={form.notes}
                  placeholder="Optional note for admin/support"
                  onChange={(event) => updateForm("notes", event.target.value)}
                />
              </label>
            </div>

            {message && <p className="payment-message">{message}</p>}

            <div className="payment-actions">
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save & WhatsApp Support"}
              </button>

              <button
                type="button"
                onClick={(event) => savePayment(event, { openWhatsapp: false })}
                disabled={saving}
              >
                Save only
              </button>
            </div>
          </form>
        </section>

        <section className="payments-admin-grid">
          <article className="payment-stat-card">
            <span>Total payments</span>
            <strong>{paymentStats.total}</strong>
          </article>
          <article className="payment-stat-card">
            <span>Pending</span>
            <strong>{paymentStats.pending + paymentStats.submitted}</strong>
          </article>
          <article className="payment-stat-card">
            <span>Verified</span>
            <strong>{paymentStats.verified}</strong>
          </article>
          <article className="payment-stat-card">
            <span>Verified revenue</span>
            <strong>{currency(paymentStats.revenue)}</strong>
          </article>
        </section>

        <section className="payment-card payment-table-card">
          <div className="section-heading">
            <div>
              <span>Admin queue</span>
              <h2>Payment verification</h2>
            </div>

            <div className="payment-table-actions">
              <input
                type="search"
                value={search}
                placeholder="Search payments..."
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="submitted">Submitted</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
              <button type="button" onClick={exportCsv}>
                Export CSV
              </button>
            </div>
          </div>

          {loading ? (
            <div className="payments-empty">Loading payments...</div>
          ) : filteredPayments.length === 0 ? (
            <div className="payments-empty">No payments found yet.</div>
          ) : (
            <div className="payments-table-wrap">
              <table className="payments-table">
                <thead>
                  <tr>
                    <th>Seller</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>M-Pesa</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <strong>{payment.customer_name || "Seller"}</strong>
                        <span>{payment.phone}</span>
                      </td>
                      <td>{payment.plan_name}</td>
                      <td>{currency(payment.amount)}</td>
                      <td>{payment.mpesa_code}</td>
                      <td>
                        <span className={`payment-status ${payment.status}`}>
                          {payment.status}
                        </span>
                      </td>
                      <td>{new Date(payment.created_at).toLocaleString()}</td>
                      <td>
                        <div className="payment-row-actions">
                          <button
                            type="button"
                            onClick={() => updateStatus(payment.id, "submitted")}
                          >
                            Submitted
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(payment.id, "verified")}
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(payment.id, "rejected")}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePayment(payment.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </DashboardLayout>
  );
}

export default Payments;
