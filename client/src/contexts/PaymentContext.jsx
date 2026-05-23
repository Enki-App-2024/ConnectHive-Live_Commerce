import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "./AuthContext";

const PaymentsContext = createContext(null);

const PAYMENTS_TABLE = "live_payments";
const SELLERS_TABLE = "live_sellers";

const LOCAL_PAYMENTS_KEY = "connecthive_live_payments_v1";
const LEGACY_PAYMENTS_KEY = "connecthive-live-payments-v1";
const SELLER_ID_KEY = "connecthive_live_seller_id";
const SELLER_PROFILE_KEY = "connecthive_live_seller_profile";
const SELECTED_PLAN_KEY = "connecthive_live_selected_plan";
const TRIAL_KEY = "connecthive_live_trial_v2";
const ACTIVE_SUBSCRIPTION_KEY = "connecthive_live_active_subscription_v2";
const PLAN_EVENT = "connecthive-plan-updated";
const PAYMENT_EVENT = "connecthive-payment-updated";
const ACCESS_EVENT = "connecthive-access-updated";

export const PAYMENT_STATUS_OPTIONS = [
  "pending",
  "submitted",
  "verified",
  "rejected",
  "refunded",
];

export const PLAN_OPTIONS = [
  {
    key: "basic",
    id: "basic",
    name: "Basic",
    label: "Solo Seller",
    price: 500,
    amount: 500,
    trialAmount: 0,
    trialDays: 3,
    billing: "Monthly",
    badge: "3-day free trial",
    hosts: 1,
    moderators: 0,
    max_moderators: 0,
    description:
      "One seller account, live order capture, product pinning and companion mode. No moderators.",
    features: [
      "3-day free trial",
      "1 seller account",
      "0 moderators",
      "Live order capture",
      "Product pinning",
      "Companion window mode",
    ],
  },
  {
    key: "team",
    id: "team",
    name: "Team",
    label: "Seller + Moderators",
    price: 800,
    amount: 800,
    trialDays: 0,
    billing: "Monthly",
    badge: "Most practical",
    hosts: 1,
    moderators: 3,
    max_moderators: 3,
    description:
      "One host plus 3 moderators for serious live sellers who need help watching comments and orders.",
    features: [
      "1 seller host",
      "3 moderators",
      "Live order room",
      "Moderator notes",
      "Companion window mode",
      "Payment verification workflow",
    ],
  },
  {
    key: "growth",
    id: "growth",
    name: "Growth",
    label: "Growing Team",
    price: 2500,
    amount: 2500,
    trialDays: 0,
    billing: "Monthly",
    badge: "Growth",
    hosts: 1,
    moderators: 10,
    max_moderators: 10,
    description:
      "For sellers doing frequent lives with more team support and cleaner operations.",
    features: [
      "Everything in Team",
      "10 moderators",
      "Priority support",
      "Advanced workflow",
      "Pinned product controls",
      "CSV exports",
    ],
  },
  {
    key: "pro_team",
    id: "pro_team",
    name: "Pro Team",
    label: "Scale",
    price: 6500,
    amount: 6500,
    trialDays: 0,
    billing: "Monthly",
    badge: "Scale",
    hosts: 1,
    moderators: 25,
    max_moderators: 25,
    description:
      "For larger sellers, agencies and frequent live-commerce teams.",
    features: [
      "Everything in Growth",
      "25 moderators",
      "Founder-assisted onboarding",
      "Advanced support workflow",
      "Scale-ready operations",
      "AI-ready data foundation",
    ],
  },
];

const BASIC_PLAN = PLAN_OPTIONS[0];

function nowIso() {
  return new Date().toISOString();
}

function addDays(dateInput, days) {
  const date = new Date(dateInput || Date.now());
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
}

function isAfterNow(dateInput) {
  if (!dateInput) return false;
  return new Date(dateInput).getTime() > Date.now();
}

function daysLeft(dateInput) {
  if (!dateInput) return 0;
  const diff = new Date(dateInput).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function readLocal(key, fallback = null) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can fail in private/private-like modes.
  }
}

function removeLocal(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function emitAccessEvents() {
  window.dispatchEvent(new Event(PAYMENT_EVENT));
  window.dispatchEvent(new Event(PLAN_EVENT));
  window.dispatchEvent(new Event(ACCESS_EVENT));
}

export function normalizeAmount(value) {
  const cleaned = String(value ?? "").replace(/[^\d.]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

export function getPlanByKey(key = "basic") {
  return PLAN_OPTIONS.find((plan) => plan.key === key || plan.id === key) || BASIC_PLAN;
}

export function normalizePlan(rawPlan) {
  const key = rawPlan?.key || rawPlan?.id || rawPlan?.plan_key || rawPlan?.plan_id || "basic";
  const fallback = getPlanByKey(key);

  return {
    ...fallback,
    ...rawPlan,
    key: fallback.key,
    id: fallback.key,
    name: rawPlan?.name || rawPlan?.plan_name || fallback.name,
    price: normalizeAmount(rawPlan?.price ?? rawPlan?.amount ?? rawPlan?.plan_price ?? fallback.price),
    amount: normalizeAmount(rawPlan?.amount ?? rawPlan?.price ?? rawPlan?.plan_price ?? fallback.price),
    moderators: Number(rawPlan?.moderators ?? rawPlan?.max_moderators ?? fallback.moderators),
    max_moderators: Number(rawPlan?.max_moderators ?? rawPlan?.moderators ?? fallback.moderators),
    hosts: Number(rawPlan?.hosts ?? fallback.hosts ?? 1),
  };
}

export function normalizePayment(payment = {}) {
  const planKey = payment.plan_key || payment.plan_id || payment.plan || payment.key || "basic";
  const plan = getPlanByKey(planKey);

  return {
    id: payment.id || crypto.randomUUID(),
    seller_id: payment.seller_id || null,
    user_id: payment.user_id || null,

    customer_name:
      payment.customer_name ||
      payment.seller_name ||
      payment.business_name ||
      payment.name ||
      "",

    phone: payment.phone || "",
    mpesa_code:
      payment.mpesa_code ||
      payment.mpesaCode ||
      payment.transaction_code ||
      "",

    amount: normalizeAmount(payment.amount ?? payment.amount_paid ?? plan.price),
    status: String(payment.status || payment.payment_status || "pending").toLowerCase(),

    plan_key: plan.key,
    plan_id: plan.key,
    plan_name: payment.plan_name || plan.name,

    moderators:
      Number(payment.moderators ?? payment.max_moderators ?? plan.moderators),

    notes: payment.notes || payment.note || "",

    starts_at: payment.starts_at || payment.startsAt || null,
    expires_at: payment.expires_at || payment.expiresAt || null,

    created_at:
      payment.created_at ||
      payment.createdAt ||
      nowIso(),

    updated_at:
      payment.updated_at ||
      payment.updatedAt ||
      nowIso(),
  };
}

function readLocalPayments() {
  const primary = readLocal(LOCAL_PAYMENTS_KEY, null);
  if (Array.isArray(primary)) return primary.map(normalizePayment);

  const legacy = readLocal(LEGACY_PAYMENTS_KEY, null);
  if (Array.isArray(legacy)) return legacy.map(normalizePayment);

  return [];
}

function saveLocalPayments(payments) {
  const normalized = payments.map(normalizePayment);
  writeLocal(LOCAL_PAYMENTS_KEY, normalized);
  writeLocal(LEGACY_PAYMENTS_KEY, normalized);
  emitAccessEvents();
}

function readSelectedPlan() {
  return normalizePlan(readLocal(SELECTED_PLAN_KEY, BASIC_PLAN));
}

function saveSelectedPlan(plan) {
  const normalized = normalizePlan(plan);
  writeLocal(SELECTED_PLAN_KEY, normalized);
  window.dispatchEvent(new Event(PLAN_EVENT));
  return normalized;
}

function readTrial() {
  return readLocal(TRIAL_KEY, null);
}

function saveTrial(trial) {
  writeLocal(TRIAL_KEY, trial);
  emitAccessEvents();
}

function readActiveSubscription() {
  const stored = readLocal(ACTIVE_SUBSCRIPTION_KEY, null);
  if (!stored) return null;

  const plan = getPlanByKey(stored.plan_key);
  return {
    ...stored,
    plan_key: plan.key,
    plan_name: stored.plan_name || plan.name,
    moderators: Number(stored.moderators ?? plan.moderators),
    max_moderators: Number(stored.max_moderators ?? plan.moderators),
  };
}

function saveActiveSubscription(subscription) {
  writeLocal(ACTIVE_SUBSCRIPTION_KEY, subscription);
  emitAccessEvents();
}

function buildDbPayment(payment, sellerId, userId) {
  const normalized = normalizePayment(payment);

  return {
    seller_id: sellerId,
    user_id: userId || normalized.user_id || null,
    customer_name: normalized.customer_name,
    phone: normalized.phone,
    mpesa_code: normalized.mpesa_code,
    amount: normalized.amount,
    status: normalized.status,
    plan_key: normalized.plan_key,
    plan_name: normalized.plan_name,
    moderators: normalized.moderators,
    notes: normalized.notes,
    starts_at: normalized.starts_at,
    expires_at: normalized.expires_at,
  };
}

function createSubscriptionFromPayment(payment) {
  const normalized = normalizePayment(payment);
  const plan = getPlanByKey(normalized.plan_key);
  const startsAt = nowIso();
  const expiresAt = addDays(startsAt, 30);

  return {
    id: `sub_${normalized.id}`,
    payment_id: normalized.id,
    seller_id: normalized.seller_id || null,
    user_id: normalized.user_id || null,
    plan_key: plan.key,
    plan_name: plan.name,
    amount: normalized.amount,
    status: "active",
    source: "verified_payment",
    starts_at: startsAt,
    expires_at: expiresAt,
    hosts: plan.hosts,
    moderators: plan.moderators,
    max_moderators: plan.moderators,
    created_at: startsAt,
    updated_at: startsAt,
  };
}

function computeAccess({ selectedPlan, payments }) {
  const activeSub = readActiveSubscription();
  const planFromSub = activeSub ? getPlanByKey(activeSub.plan_key) : null;

  if (activeSub?.status === "active" && isAfterNow(activeSub.expires_at)) {
    return {
      status: "active",
      locked: false,
      canUseLive: true,
      canUseCompanion: true,
      requiresPayment: false,
      isTrial: false,
      isExpired: false,
      lockReason: "",
      plan: planFromSub,
      planKey: planFromSub.key,
      planName: planFromSub.name,
      amountDue: planFromSub.price,
      daysLeft: daysLeft(activeSub.expires_at),
      expiresAt: activeSub.expires_at,
      maxModerators: planFromSub.moderators,
      hosts: planFromSub.hosts,
      subscription: activeSub,
    };
  }

  const verified = [...payments]
    .map(normalizePayment)
    .filter((payment) => payment.status === "verified" && isAfterNow(payment.expires_at || addDays(payment.created_at, 30)))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  if (verified) {
    const sub = createSubscriptionFromPayment(verified);
    sub.expires_at = verified.expires_at || sub.expires_at;
    saveActiveSubscription(sub);
    const plan = getPlanByKey(verified.plan_key);

    return {
      status: "active",
      locked: false,
      canUseLive: true,
      canUseCompanion: true,
      requiresPayment: false,
      isTrial: false,
      isExpired: false,
      lockReason: "",
      plan,
      planKey: plan.key,
      planName: plan.name,
      amountDue: plan.price,
      daysLeft: daysLeft(sub.expires_at),
      expiresAt: sub.expires_at,
      maxModerators: plan.moderators,
      hosts: plan.hosts,
      subscription: sub,
    };
  }

  const trial = readTrial();
  if (trial?.status === "trialing" && isAfterNow(trial.expires_at)) {
    const plan = BASIC_PLAN;
    return {
      status: "trialing",
      locked: false,
      canUseLive: true,
      canUseCompanion: true,
      requiresPayment: false,
      isTrial: true,
      isExpired: false,
      lockReason: `Basic trial active. ${daysLeft(trial.expires_at)} day(s) left.`,
      plan,
      planKey: plan.key,
      planName: plan.name,
      amountDue: plan.price,
      daysLeft: daysLeft(trial.expires_at),
      expiresAt: trial.expires_at,
      maxModerators: 0,
      hosts: 1,
      subscription: trial,
    };
  }

  const pending = [...payments]
    .map(normalizePayment)
    .filter((payment) => ["pending", "submitted"].includes(payment.status))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  if (pending) {
    const plan = getPlanByKey(pending.plan_key);
    return {
      status: "pending",
      locked: true,
      canUseLive: false,
      canUseCompanion: false,
      requiresPayment: true,
      isTrial: false,
      isExpired: false,
      lockReason: `${plan.name} payment is waiting for admin verification.`,
      plan,
      planKey: plan.key,
      planName: plan.name,
      amountDue: plan.price,
      daysLeft: 0,
      expiresAt: null,
      maxModerators: 0,
      hosts: 1,
      subscription: null,
    };
  }

  const plan = normalizePlan(selectedPlan || BASIC_PLAN);
  return {
    status: "expired",
    locked: true,
    canUseLive: false,
    canUseCompanion: false,
    requiresPayment: true,
    isTrial: false,
    isExpired: true,
    lockReason:
      plan.key === "basic"
        ? "Your free Basic trial is not active. Start trial or pay KES 500/month."
        : `Pay ${plan.name} to unlock this plan.`,
    plan,
    planKey: plan.key,
    planName: plan.name,
    amountDue: plan.price,
    daysLeft: 0,
    expiresAt: null,
    maxModerators: 0,
    hosts: 1,
    subscription: null,
  };
}

export function PaymentsProvider({ children }) {
  const { user } = useAuth();

  const [payments, setPayments] = useState(() => readLocalPayments());
  const [selectedPlan, setSelectedPlanState] = useState(() => readSelectedPlan());
  const [sellerId, setSellerId] = useState(() => readLocal(SELLER_ID_KEY, null));
  const [syncStatus, setSyncStatus] = useState("Local ready");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sortedPayments = useMemo(() => {
    return [...payments]
      .map(normalizePayment)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [payments]);

  const activeAccess = useMemo(() => {
    return computeAccess({ selectedPlan, payments: sortedPayments });
  }, [selectedPlan, sortedPayments]);

  const activePlan = activeAccess.plan;

  const paymentStats = useMemo(() => {
    const total = sortedPayments.length;
    const pending = sortedPayments.filter((payment) => payment.status === "pending").length;
    const submitted = sortedPayments.filter((payment) => payment.status === "submitted").length;
    const verified = sortedPayments.filter((payment) => payment.status === "verified").length;
    const rejected = sortedPayments.filter((payment) => payment.status === "rejected").length;
    const revenue = sortedPayments
      .filter((payment) => payment.status === "verified")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    return { total, pending, submitted, verified, rejected, revenue };
  }, [sortedPayments]);

  const setSelectedPlan = useCallback((plan) => {
    const normalized = saveSelectedPlan(plan);
    setSelectedPlanState(normalized);
    return normalized;
  }, []);

  const startBasicTrial = useCallback(() => {
    const existing = readTrial();
    if (existing?.started_at) {
      setSelectedPlan(BASIC_PLAN);
      return existing;
    }

    const startedAt = nowIso();
    const trial = {
      id: `trial_${crypto.randomUUID()}`,
      plan_key: "basic",
      plan_name: "Basic",
      status: "trialing",
      source: "basic_free_trial",
      started_at: startedAt,
      starts_at: startedAt,
      expires_at: addDays(startedAt, BASIC_PLAN.trialDays),
      hosts: 1,
      moderators: 0,
      max_moderators: 0,
      created_at: startedAt,
      updated_at: startedAt,
    };

    saveTrial(trial);
    setSelectedPlan(BASIC_PLAN);
    return trial;
  }, [setSelectedPlan]);

  const resolveSellerId = useCallback(async () => {
    const existing = readLocal(SELLER_ID_KEY, null);
    if (existing) {
      setSellerId(existing);
      return existing;
    }

    const profile = readLocal(SELLER_PROFILE_KEY, {});
    const authUser = user;

    if (!authUser?.id) return null;

    try {
      const { data, error: sellerError } = await supabase
        .from(SELLERS_TABLE)
        .upsert(
          {
            user_id: authUser.id,
            full_name: profile.fullName || profile.full_name || authUser.email,
            business_name:
              profile.businessName ||
              profile.business_name ||
              profile.fullName ||
              "ConnectHive Seller",
            phone: profile.phone || "",
            email: profile.email || authUser.email,
            county: profile.county || "",
            platform: profile.platform || "",
            live_handle: profile.liveHandle || profile.live_handle || "",
            plan_key: activePlan.key,
            plan_name: activePlan.name,
            plan_price: activePlan.price,
            max_moderators: activePlan.moderators,
            approval_status: activeAccess.canUseLive ? "approved" : "pending",
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (sellerError) throw sellerError;

      writeLocal(SELLER_ID_KEY, data.id);
      setSellerId(data.id);
      setSyncStatus("Cloud synced");

      return data.id;
    } catch (sellerError) {
      console.info("Seller sync failed:", sellerError?.message);
      setSyncStatus("Local mode");
      return null;
    }
  }, [user, activePlan, activeAccess.canUseLive]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");

    const local = readLocalPayments();
    setPayments(local);

    try {
      const currentSellerId = await resolveSellerId();

      let query = supabase
        .from(PAYMENTS_TABLE)
        .select("*")
        .order("created_at", { ascending: false });

      if (currentSellerId) query = query.eq("seller_id", currentSellerId);
      else if (user?.id) query = query.eq("user_id", user.id);
      else throw new Error("No seller session yet.");

      const { data, error: loadError } = await query;

      if (loadError) throw loadError;

      const cloudRows = (data || []).map(normalizePayment);
      if (cloudRows.length) {
        setPayments(cloudRows);
        saveLocalPayments(cloudRows);
      }

      setSyncStatus("Cloud synced");
    } catch (loadError) {
      console.info("Payment load using local fallback:", loadError?.message);
      setError(loadError?.message || "");
      setSyncStatus("Local mode");
    } finally {
      setLoading(false);
    }
  }, [resolveSellerId, user]);

  const submitPayment = useCallback(
    async (paymentPayload) => {
      const normalized = normalizePayment({
        ...paymentPayload,
        plan_key: paymentPayload?.plan_key || selectedPlan.key,
        plan_name: paymentPayload?.plan_name || selectedPlan.name,
        moderators: paymentPayload?.moderators ?? selectedPlan.moderators,
        status: paymentPayload?.status || "pending",
        created_at: nowIso(),
        updated_at: nowIso(),
      });

      const plan = getPlanByKey(normalized.plan_key);
      const expectedAmount = plan.price;

      if (normalized.amount < expectedAmount) {
        throw new Error(
          `${plan.name} requires KES ${expectedAmount.toLocaleString("en-KE")}. The submitted amount is too low.`
        );
      }

      const currentSellerId = await resolveSellerId();
      const paymentWithSeller = {
        ...normalized,
        seller_id: currentSellerId,
        user_id: user?.id || normalized.user_id || null,
      };

      const nextLocal = [paymentWithSeller, ...readLocalPayments()]
        .filter((item, index, arr) => arr.findIndex((row) => row.id === item.id) === index)
        .slice(0, 250);

      setPayments(nextLocal);
      saveLocalPayments(nextLocal);

      try {
        if (!currentSellerId && !user?.id) {
          throw new Error("No seller/user id for cloud insert yet.");
        }

        const { data, error: insertError } = await supabase
          .from(PAYMENTS_TABLE)
          .insert(buildDbPayment(paymentWithSeller, currentSellerId, user?.id))
          .select()
          .single();

        if (insertError) throw insertError;

        const saved = normalizePayment({
          ...data,
          customer_name: paymentWithSeller.customer_name,
          plan_key: paymentWithSeller.plan_key,
          plan_name: paymentWithSeller.plan_name,
        });

        const merged = [saved, ...nextLocal.filter((item) => item.id !== paymentWithSeller.id)]
          .filter((item, index, arr) => arr.findIndex((row) => row.id === item.id) === index);

        setPayments(merged);
        saveLocalPayments(merged);
        setSyncStatus("Cloud synced");

        return saved;
      } catch (insertError) {
        console.info("Payment saved locally:", insertError?.message);
        setError(insertError?.message || "");
        setSyncStatus("Local mode");
        return paymentWithSeller;
      }
    },
    [resolveSellerId, selectedPlan, user]
  );

  const updatePayment = useCallback(
    async (paymentId, patch = {}) => {
      let updatedPayment = null;

      const next = readLocalPayments().map((payment) => {
        if (payment.id !== paymentId) return payment;

        updatedPayment = normalizePayment({
          ...payment,
          ...patch,
          updated_at: nowIso(),
        });

        if (updatedPayment.status === "verified") {
          updatedPayment.starts_at = updatedPayment.starts_at || nowIso();
          updatedPayment.expires_at = updatedPayment.expires_at || addDays(updatedPayment.starts_at, 30);
        }

        return updatedPayment;
      });

      setPayments(next);
      saveLocalPayments(next);

      if (updatedPayment?.status === "verified") {
        saveActiveSubscription(createSubscriptionFromPayment(updatedPayment));
      }

      try {
        const dbPatch = {
          ...patch,
          updated_at: nowIso(),
        };

        if (patch.status === "verified") {
          dbPatch.starts_at = updatedPayment?.starts_at || nowIso();
          dbPatch.expires_at = updatedPayment?.expires_at || addDays(nowIso(), 30);
        }

        const { error: updateError } = await supabase
          .from(PAYMENTS_TABLE)
          .update(dbPatch)
          .eq("id", paymentId);

        if (updateError) throw updateError;

        setSyncStatus("Cloud synced");
      } catch (updateError) {
        console.info("Payment update saved locally:", updateError?.message);
        setError(updateError?.message || "");
        setSyncStatus("Local mode");
      }

      return updatedPayment;
    },
    []
  );

  const verifyPayment = useCallback(
    async (paymentId) => updatePayment(paymentId, { status: "verified" }),
    [updatePayment]
  );

  const rejectPayment = useCallback(
    async (paymentId) => updatePayment(paymentId, { status: "rejected" }),
    [updatePayment]
  );

  const markSubmitted = useCallback(
    async (paymentId) => updatePayment(paymentId, { status: "submitted" }),
    [updatePayment]
  );

  const deletePayment = useCallback(async (paymentId) => {
    const next = readLocalPayments().filter((payment) => payment.id !== paymentId);
    setPayments(next);
    saveLocalPayments(next);

    try {
      const { error: deleteError } = await supabase
        .from(PAYMENTS_TABLE)
        .delete()
        .eq("id", paymentId);

      if (deleteError) throw deleteError;
      setSyncStatus("Cloud synced");
    } catch (deleteError) {
      console.info("Payment delete local only:", deleteError?.message);
      setSyncStatus("Local mode");
    }
  }, []);

  const clearLocalAccess = useCallback(() => {
    removeLocal(ACTIVE_SUBSCRIPTION_KEY);
    removeLocal(TRIAL_KEY);
    emitAccessEvents();
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    const onStorageLikeUpdate = () => {
      setSelectedPlanState(readSelectedPlan());
      setPayments(readLocalPayments());
    };

    window.addEventListener(PAYMENT_EVENT, onStorageLikeUpdate);
    window.addEventListener(PLAN_EVENT, onStorageLikeUpdate);
    window.addEventListener(ACCESS_EVENT, onStorageLikeUpdate);
    window.addEventListener("storage", onStorageLikeUpdate);

    return () => {
      window.removeEventListener(PAYMENT_EVENT, onStorageLikeUpdate);
      window.removeEventListener(PLAN_EVENT, onStorageLikeUpdate);
      window.removeEventListener(ACCESS_EVENT, onStorageLikeUpdate);
      window.removeEventListener("storage", onStorageLikeUpdate);
    };
  }, []);

  useEffect(() => {
    if (!sellerId) return undefined;

    const channel = supabase
      .channel(`live-payments-${sellerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: PAYMENTS_TABLE,
          filter: `seller_id=eq.${sellerId}`,
        },
        () => loadPayments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, loadPayments]);

  const value = {
    payments,
    sortedPayments,
    paymentStats,

    selectedPlan,
    setSelectedPlan,
    activePlan,
    activeAccess,

    sellerId,
    loading,
    error,
    syncStatus,

    loadPayments,
    startBasicTrial,

    submitPayment,
    updatePayment,
    verifyPayment,
    rejectPayment,
    markSubmitted,
    deletePayment,

    resolveSellerId,
    clearLocalAccess,

    plans: PLAN_OPTIONS,
    getPlanByKey,
    normalizePlan,
    normalizePayment,
    normalizeAmount,
  };

  return (
    <PaymentsContext.Provider value={value}>
      {children}
    </PaymentsContext.Provider>
  );
}

export function usePayments() {
  const context = useContext(PaymentsContext);

  if (!context) {
    throw new Error("usePayments must be used inside PaymentsProvider");
  }

  return context;
}

export default PaymentsContext;
