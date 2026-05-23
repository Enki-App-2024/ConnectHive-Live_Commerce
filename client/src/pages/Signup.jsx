import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabaseClient";
import "../styles/auth.css";

const SELLER_PROFILE_KEY = "connecthive_live_seller_profile";
const SELLER_ID_KEY = "connecthive_live_seller_id";
const SELECTED_PLAN_KEY = "connecthive_live_selected_plan";

const initialForm = {
  fullName: "",
  businessName: "",
  phone: "",
  email: "",
  county: "",
  platform: "",
  liveHandle: "",
};

const planDefaults = {
  basic: { key: "basic", name: "Basic", price: 0, moderators: 3 },
  team: { key: "team", name: "Team", price: 800, moderators: 10 },
  growth: { key: "growth", name: "Growth", price: 2500, moderators: 10 },
  pro_team: { key: "pro_team", name: "Pro Team", price: 6500, moderators: 25 },
};

function safeRead(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep app usable even if browser blocks storage.
  }
}

function normalizePlan(plan) {
  const saved = plan || safeRead(SELECTED_PLAN_KEY, null);
  const key = saved?.key || saved?.id || saved?.plan_key || "basic";
  const fallback = planDefaults[key] || planDefaults.basic;

  return {
    key,
    name: saved?.name || saved?.plan_name || fallback.name,
    price: Number(saved?.price ?? saved?.amount ?? saved?.plan_price ?? fallback.price),
    moderators: Number(saved?.moderators ?? saved?.max_moderators ?? fallback.moderators),
  };
}

function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signInWithGoogle } = useAuth();

  const savedProfile = safeRead(SELLER_PROFILE_KEY, null);
  const selectedPlan = normalizePlan(location.state?.selectedPlan);

  const [form, setForm] = useState({
    ...initialForm,
    ...savedProfile,
    email: savedProfile?.email || user?.email || "",
  });

  const [saving, setSaving] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");

  const completionScore = useMemo(() => {
    const important = [
      form.fullName,
      form.businessName,
      form.phone,
      form.email,
      form.platform,
      form.liveHandle,
    ];

    const filled = important.filter(Boolean).length;
    return Math.round((filled / important.length) * 100);
  }, [form]);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const buildProfile = () => ({
    ...form,
    email: form.email || user?.email || "",
    selectedPlanKey: selectedPlan.key,
    selectedPlanName: selectedPlan.name,
    selectedPlanPrice: selectedPlan.price,
    maxModerators: selectedPlan.moderators,
    updatedAt: new Date().toISOString(),
  });

  const saveLocalProfile = () => {
    const profile = buildProfile();
    safeWrite(SELLER_PROFILE_KEY, profile);
    safeWrite(SELECTED_PLAN_KEY, {
      key: selectedPlan.key,
      name: selectedPlan.name,
      price: selectedPlan.price,
      moderators: selectedPlan.moderators,
      priceText: `KES ${Number(selectedPlan.price || 0).toLocaleString("en-KE")}`,
    });
    window.dispatchEvent(new Event("connecthive-seller-profile-updated"));
    window.dispatchEvent(new Event("connecthive-plan-updated"));
    return profile;
  };

  const upsertSellerToSupabase = async (profile) => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const authUser = authData?.user || user;

    if (authError || !authUser?.id) {
      return { seller: null, cloudSaved: false };
    }

    const payload = {
      user_id: authUser.id,
      full_name: profile.fullName,
      business_name: profile.businessName || profile.fullName || "ConnectHive Seller",
      phone: profile.phone,
      email: profile.email || authUser.email,
      county: profile.county,
      platform: profile.platform,
      live_handle: profile.liveHandle,
      plan_key: selectedPlan.key,
      plan_name: selectedPlan.name,
      plan_price: selectedPlan.price,
      max_moderators: selectedPlan.moderators,
      approval_status: selectedPlan.price === 0 ? "approved" : "pending",
    };

    const { data, error } = await supabase
      .from("live_sellers")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      console.error("Seller profile sync failed:", error);
      return { seller: null, cloudSaved: false, error };
    }

    safeWrite(SELLER_ID_KEY, data.id);
    return { seller: data, cloudSaved: true };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSyncMessage("");

    const profile = saveLocalProfile();
    const { cloudSaved, error } = await upsertSellerToSupabase(profile);

    setSaving(false);

    if (error) {
      setSyncMessage("Saved locally. Supabase sync will retry after login/session is ready.");
    } else if (cloudSaved) {
      setSyncMessage("Seller profile saved to Supabase.");
    } else {
      setSyncMessage("Saved locally. Continue with Google to activate cloud sync.");
    }

    if (selectedPlan.price > 0) {
      navigate("/payments", { state: { selectedPlan } });
      return;
    }

    navigate(user?.id ? "/dashboard" : "/login", {
      state: { next: "/dashboard", selectedPlan },
    });
  };

  const handleGoogleSignup = async () => {
    setLoadingGoogle(true);
    setErrorMessage("");
    saveLocalProfile();

    try {
      const { error } = await signInWithGoogle();

      if (error) {
        setErrorMessage(error.message || "Google signup failed. Try again.");
        setLoadingGoogle(false);
      }
    } catch (error) {
      setErrorMessage(error?.message || "Google signup failed. Try again.");
      setLoadingGoogle(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-shell signup-shell">
        <div className="auth-story">
          <div className="page-kicker">SELLER ONBOARDING</div>

          <h1>
            Create your live selling <span>workspace</span>
          </h1>

          <p>
            This is the foundation row for Supabase. Once the seller profile
            exists, payments, products, orders and moderators can attach cleanly.
          </p>

          <div className="profile-progress-card">
            <span>Profile readiness</span>
            <strong>{completionScore}%</strong>
            <div>
              <i style={{ width: `${completionScore}%` }} />
            </div>
            <p>
              Saved locally first, then synced to <strong>live_sellers</strong>{" "}
              when Google session is available.
            </p>
          </div>
        </div>

        <aside className="auth-card signup-card">
          <div className="auth-card-header">
            <span>ConnectHive Live</span>
            <h2>Seller profile</h2>
            <p>
              Keep this clean. The business details here power payment
              verification and the live commerce dashboard.
            </p>
          </div>

          <form className="auth-form-grid" onSubmit={handleSubmit}>
            <label>
              Full name
              <input
                type="text"
                value={form.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
                placeholder="Evans Mugendi"
                required
              />
            </label>

            <label>
              Business name
              <input
                type="text"
                value={form.businessName}
                onChange={(event) => updateField("businessName", event.target.value)}
                placeholder="Grace Collections"
                required
              />
            </label>

            <label>
              Phone number
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="0712 345 678"
                required
              />
            </label>

            <label>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="seller@email.com"
                required
              />
            </label>

            <label>
              County / Location
              <input
                type="text"
                value={form.county}
                onChange={(event) => updateField("county", event.target.value)}
                placeholder="Nairobi"
              />
            </label>

            <label>
              Main live platform
              <select
                value={form.platform}
                onChange={(event) => updateField("platform", event.target.value)}
                required
              >
                <option value="" disabled>
                  Choose platform
                </option>
                <option value="TikTok Live">TikTok Live</option>
                <option value="Facebook Live">Facebook Live</option>
                <option value="Instagram Live">Instagram Live</option>
                <option value="YouTube Live">YouTube Live</option>
                <option value="Multiple platforms">Multiple platforms</option>
              </select>
            </label>

            <label className="full-row">
              Live handle / page name
              <input
                type="text"
                value={form.liveHandle}
                onChange={(event) => updateField("liveHandle", event.target.value)}
                placeholder="@yourshop or page name"
              />
            </label>

            <div className="auth-context-card plan full-row">
              <small>Selected plan</small>
              <strong>{selectedPlan.name}</strong>
              <p>
                KES {Number(selectedPlan.price || 0).toLocaleString("en-KE")} ·{" "}
                {selectedPlan.moderators} moderators
              </p>
            </div>

            <div className="auth-action-stack full-row">
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving Profile..." : "Save Profile & Continue"}
              </button>

              <button
                className="google-btn"
                type="button"
                onClick={handleGoogleSignup}
                disabled={loadingGoogle}
              >
                <FcGoogle className="google-icon" />
                {loadingGoogle ? "Opening Google..." : "Save & Continue with Google"}
              </button>

              {syncMessage && <p className="auth-success">{syncMessage}</p>}
              {errorMessage && <p className="auth-error">{errorMessage}</p>}
            </div>
          </form>

          <div className="auth-footer-line">
            <span>Already onboarded?</span>
            <button type="button" onClick={() => navigate("/login")}>
              Login
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default Signup;
