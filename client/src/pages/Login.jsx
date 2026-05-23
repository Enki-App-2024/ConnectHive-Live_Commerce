import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "../contexts/AuthContext";
import "../styles/auth.css";

const SELLER_PROFILE_KEY = "connecthive_live_seller_profile";
const SELECTED_PLAN_KEY = "connecthive_live_selected_plan";

function safeRead(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithGoogle } = useAuth();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const sellerProfile = useMemo(() => safeRead(SELLER_PROFILE_KEY, null), []);
  const selectedPlan = useMemo(() => safeRead(SELECTED_PLAN_KEY, null), []);

  const nextPath = location.state?.next || "/dashboard";

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const { error } = await signInWithGoogle();

      if (error) {
        setErrorMessage(error.message || "Google login failed. Try again.");
        setLoading(false);
      }
    } catch (error) {
      setErrorMessage(error?.message || "Google login failed. Try again.");
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-story">
          <div className="page-kicker">SELLER LOGIN</div>

          <h1>
            Continue with <span>Google</span>
          </h1>

          <p>
            ConnectHive Live keeps onboarding simple: Google login, plan
            selection, M-Pesa verification, then the seller command center.
          </p>

          <div className="auth-trust-grid">
            <div>
              <strong>No SMS costs</strong>
              <p>We avoid Twilio/SMS bills during the MVP.</p>
            </div>

            <div>
              <strong>Platform-free</strong>
              <p>Works beside TikTok, Instagram, Facebook or YouTube Live.</p>
            </div>

            <div>
              <strong>Ready for Supabase</strong>
              <p>Seller accounts can later sync to live_sellers.</p>
            </div>
          </div>
        </div>

        <aside className="auth-card">
          <div className="auth-card-header">
            <span>ConnectHive Live</span>
            <h2>Welcome back</h2>
            <p>
              Sign in to manage live orders, products, payments and moderators.
            </p>
          </div>

          {sellerProfile && (
            <div className="auth-context-card">
              <small>Saved business profile</small>
              <strong>{sellerProfile.businessName || sellerProfile.fullName}</strong>
              <p>
                {sellerProfile.platform || "Selling platform"} ·{" "}
                {sellerProfile.phone || "Phone not set"}
              </p>
            </div>
          )}

          {selectedPlan && (
            <div className="auth-context-card plan">
              <small>Selected plan</small>
              <strong>{selectedPlan.name || "Plan selected"}</strong>
              <p>{selectedPlan.priceText || "Payment pending"}</p>
            </div>
          )}

          <button
            className="google-btn"
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <FcGoogle className="google-icon" />
            {loading ? "Opening Google..." : "Continue with Google"}
          </button>

          {errorMessage && <p className="auth-error">{errorMessage}</p>}

          <div className="auth-route-row">
            <button
              className="btn-secondary"
              type="button"
              onClick={() => navigate("/signup", { state: { next: nextPath } })}
            >
              Create seller profile
            </button>

            <button
              className="text-btn"
              type="button"
              onClick={() => navigate("/plans")}
            >
              View plans
            </button>
          </div>

          <div className="support-note">
            <strong>Support: 0768063078</strong>
            <p>
              Payment activation is handled through M-Pesa verification and
              WhatsApp support while the live_payments table is being prepared.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default Login;
