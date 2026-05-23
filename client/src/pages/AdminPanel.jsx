import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { supabase } from "../services/supabaseClient";
import "../styles/admin-panel.css";


const ADMIN_USERS_KEY = "connecthive_live_admin_users_v1";
const ADMIN_ACTIVITY_KEY = "connecthive_live_admin_activity_v1";
const PAYMENTS_KEY = "connecthive_live_payments_v1";
const SELLER_PROFILE_KEY = "connecthive_live_seller_profile";
const SELECTED_PLAN_KEY = "connecthive_live_selected_plan";
const ORDERS_KEY = "connecthive_live_orders_v1";
const PRODUCTS_KEY = "connecthive_live_products_v1";
const MODERATORS_KEY = "connecthive_live_moderators_v1";

const nowIso = () => new Date().toISOString();

const PLAN_CATALOG = [
  {
    key: "basic",
    name: "Basic",
    badge: "3-Day Trial",
    amount: 500,
    trialDays: 3,
    moderators: 0,
    hostLimit: 1,
    description:
      "For one seller testing live orders. Three days free, then KES 500 monthly. No moderators.",
    features: ["1 seller", "0 moderators", "Companion mode", "Manual M-Pesa verification"],
  },
  {
    key: "team",
    name: "Team",
    badge: "Small Team",
    amount: 800,
    trialDays: 0,
    moderators: 3,
    hostLimit: 1,
    description:
      "For active sellers who need one host and up to three moderators during live sessions.",
    features: ["1 host", "3 moderators", "Companion window", "Order and payment queue"],
  },
  {
    key: "growth",
    name: "Growth",
    badge: "Scaling",
    amount: 2500,
    trialDays: 0,
    moderators: 10,
    hostLimit: 1,
    description:
      "For sellers running frequent live sessions with heavier product and order volume.",
    features: ["1 host", "10 moderators", "Priority workflow", "Advanced reports"],
  },
  {
    key: "pro_team",
    name: "Pro Team",
    badge: "Scale",
    amount: 6500,
    trialDays: 0,
    moderators: 25,
    hostLimit: 3,
    description:
      "For serious teams running many campaigns, live rooms and operators.",
    features: ["3 hosts", "25 moderators", "High-volume controls", "Admin support"],
  },
];

const defaultSellerForm = {
  seller_name: "",
  email: "",
  phone: "",
  plan_key: "basic",
  status: "trial",
  payment_status: "trial",
  mpesa_code: "",
  amount_paid: "",
  notes: "",
};

const statusOptions = ["trial", "pending", "active", "suspended", "expired"];
const paymentOptions = ["trial", "pending", "submitted", "verified", "rejected", "expired"];

function readLocal(key, fallback = []) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (error) {
    console.warn(`Failed to read ${key}`, error);
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to save ${key}`, error);
  }
}

function currency(amount) {
  return `KES ${Number(amount || 0).toLocaleString("en-KE")}`;
}

function makeId(prefix = "adm") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeKey(value = "basic") {
  const raw = String(value || "basic").toLowerCase().trim();

  if (raw === "pro team" || raw === "pro" || raw === "pro_team") return "pro_team";
  if (raw === "growth") return "growth";
  if (raw === "team") return "team";
  return "basic";
}

function getPlan(value = "basic") {
  const key = normalizeKey(value);
  return PLAN_CATALOG.find((plan) => plan.key === key) || PLAN_CATALOG[0];
}

function safeClass(value) {
  return String(value || "unknown").toLowerCase().replace(/\s+/g, "-");
}

function normalizePayment(payment = {}) {
  const plan = getPlan(payment.plan_key || payment.plan || payment.plan_name);

  return {
    id: payment.id || makeId("pay"),
    seller_id: payment.seller_id || payment.sellerId || "",
    seller_name:
      payment.seller_name ||
      payment.customer_name ||
      payment.business_name ||
      payment.sellerName ||
      payment.name ||
      "Unnamed Seller",
    email: payment.email || "",
    phone: payment.phone || "",
    plan_key: plan.key,
    plan_name: payment.plan_name || payment.plan || plan.name,
    amount: Number(payment.amount || payment.amount_paid || plan.amount || 0),
    mpesa_code:
      payment.mpesa_code ||
      payment.mpesaCode ||
      payment.transaction_code ||
      "",
    status: String(payment.status || payment.payment_status || "pending").toLowerCase(),
    notes: payment.notes || payment.note || "",
    moderators: Number(payment.moderators ?? plan.moderators),
    created_at: payment.created_at || payment.createdAt || nowIso(),
    updated_at: payment.updated_at || payment.updatedAt || nowIso(),
  };
}

function normalizeSeller(user = {}) {
  const plan = getPlan(user.plan_key || user.plan || user.plan_name);

  return {
    id: user.id || user.seller_id || makeId("seller"),
    seller_name:
      user.seller_name ||
      user.customer_name ||
      user.business_name ||
      user.name ||
      "Unnamed Seller",
    email: user.email || "",
    phone: user.phone || "",
    plan_key: plan.key,
    plan_name: user.plan_name || user.plan || plan.name,
    status: String(user.status || "pending").toLowerCase(),
    payment_status: String(user.payment_status || user.paymentStatus || "pending").toLowerCase(),
    mpesa_code: user.mpesa_code || user.mpesaCode || "",
    amount_paid: Number(user.amount_paid || user.amount || 0),
    moderators: Number(user.moderators ?? user.max_moderators ?? plan.moderators),
    trial_started_at: user.trial_started_at || user.trialStartedAt || "",
    expires_at: user.expires_at || user.expiresAt || "",
    notes: user.notes || "",
    created_at: user.created_at || user.createdAt || nowIso(),
    updated_at: user.updated_at || user.updatedAt || nowIso(),
  };
}

function makeAccessForSeller(seller, source = "admin") {
  const plan = getPlan(seller.plan_key || seller.plan_name);
  const activatedAt = nowIso();

  const expires = new Date();
  if (seller.status === "trial" || seller.payment_status === "trial") {
    expires.setDate(expires.getDate() + (plan.trialDays || 3));
  } else {
    expires.setDate(expires.getDate() + 30);
  }

  return {
    seller_id: seller.id,
    seller_name: seller.seller_name,
    email: seller.email,
    phone: seller.phone,
    plan_key: plan.key,
    plan_name: plan.name,
    amount: plan.amount,
    moderators: plan.moderators,
    host_limit: plan.hostLimit,
    status: seller.status,
    payment_status: seller.payment_status,
    mpesa_code: seller.mpesa_code,
    activated_at: activatedAt,
    expires_at: seller.expires_at || expires.toISOString(),
    source,
  };
}

function daysLeft(dateValue) {
  if (!dateValue) return "—";
  const end = new Date(dateValue).getTime();
  const diff = end - Date.now();

  if (!Number.isFinite(end)) return "—";
  if (diff <= 0) return "Expired";

  return `${Math.ceil(diff / 86400000)} days`;
}

function AdminPanel() {
  const [adminUsers, setAdminUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [activity, setActivity] = useState([]);
  const [sellerForm, setSellerForm] = useState(defaultSellerForm);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [syncMode, setSyncMode] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadAdminCenter();
  }, []);

  function showNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function loadAdminCenter() {
    setBusy(true);

    const localPayments = readLocal(PAYMENTS_KEY, []).map(normalizePayment);
    const localUsers = readLocal(ADMIN_USERS_KEY, []).map(normalizeSeller);
    const localOrders = readLocal(ORDERS_KEY, []);
    const localProducts = readLocal(PRODUCTS_KEY, []);
    const localModerators = readLocal(MODERATORS_KEY, []);
    const localActivity = readLocal(ADMIN_ACTIVITY_KEY, []);

    const usersFromPayments = localPayments.map((payment) =>
      normalizeSeller({
        id: payment.seller_id || `seller_${payment.id}`,
        seller_name: payment.seller_name,
        email: payment.email,
        phone: payment.phone,
        plan_key: payment.plan_key,
        plan_name: payment.plan_name,
        payment_status: payment.status,
        status: payment.status === "verified" ? "active" : "pending",
        mpesa_code: payment.mpesa_code,
        amount_paid: payment.amount,
        moderators: payment.moderators,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
      })
    );

    const mergedLocalUsers = mergeSellers(localUsers, usersFromPayments);

    setPayments(localPayments);
    setAdminUsers(mergedLocalUsers);
    setOrders(localOrders);
    setProducts(localProducts);
    setModerators(localModerators);
    setActivity(localActivity);

    writeLocal(ADMIN_USERS_KEY, mergedLocalUsers);

    try {
      const [usersResult, paymentsResult, ordersResult, productsResult, moderatorsResult, activityResult] =
        await Promise.allSettled([
          supabase.from("live_sellers").select("*").order("created_at", { ascending: false }),
          supabase.from("live_payments").select("*").order("created_at", { ascending: false }),
          supabase.from("live_orders").select("*").order("created_at", { ascending: false }),
          supabase.from("live_products").select("*").order("created_at", { ascending: false }),
          supabase.from("live_moderators").select("*").order("created_at", { ascending: false }),
          supabase.from("live_admin_activity").select("*").order("created_at", { ascending: false }),
        ]);

      const cloudUsers = (usersResult.value?.data || []).map(normalizeSeller);
      const cloudPayments = (paymentsResult.value?.data || []).map(normalizePayment);
      const cloudOrders = ordersResult.value?.data || [];
      const cloudProducts = productsResult.value?.data || [];
      const cloudModerators = moderatorsResult.value?.data || [];
      const cloudActivity = activityResult.value?.data || [];

      const hasCloudData =
        cloudUsers.length ||
        cloudPayments.length ||
        cloudOrders.length ||
        cloudProducts.length ||
        cloudModerators.length ||
        cloudActivity.length;

      if (hasCloudData) {
        const cloudUsersFromPayments = cloudPayments.map((payment) =>
          normalizeSeller({
            id: payment.seller_id || `seller_${payment.id}`,
            seller_name: payment.seller_name,
            email: payment.email,
            phone: payment.phone,
            plan_key: payment.plan_key,
            plan_name: payment.plan_name,
            payment_status: payment.status,
            status: payment.status === "verified" ? "active" : "pending",
            mpesa_code: payment.mpesa_code,
            amount_paid: payment.amount,
            moderators: payment.moderators,
            created_at: payment.created_at,
            updated_at: payment.updated_at,
          })
        );

        const mergedCloudUsers = mergeSellers(cloudUsers, cloudUsersFromPayments);

        setSyncMode("cloud");
        setAdminUsers(mergedCloudUsers);
        setPayments(cloudPayments);
        setOrders(cloudOrders);
        setProducts(cloudProducts);
        setModerators(cloudModerators);
        setActivity(cloudActivity);

        writeLocal(ADMIN_USERS_KEY, mergedCloudUsers);
        writeLocal(PAYMENTS_KEY, cloudPayments);
        writeLocal(ORDERS_KEY, cloudOrders);
        writeLocal(PRODUCTS_KEY, cloudProducts);
        writeLocal(MODERATORS_KEY, cloudModerators);
        writeLocal(ADMIN_ACTIVITY_KEY, cloudActivity);
      } else {
        setSyncMode("local");
      }
    } catch (error) {
      console.warn("Admin cloud sync unavailable. Running locally.", error);
      setSyncMode("local");
    } finally {
      setBusy(false);
    }
  }

  function mergeSellers(baseUsers = [], paymentUsers = []) {
    const map = new Map();

    [...baseUsers, ...paymentUsers].forEach((seller) => {
      const key = seller.email || seller.phone || seller.id;
      const existing = map.get(key);

      map.set(
        key,
        normalizeSeller({
          ...existing,
          ...seller,
          payment_status:
            seller.payment_status === "verified" || existing?.payment_status === "verified"
              ? "verified"
              : seller.payment_status || existing?.payment_status,
          status:
            seller.status === "active" || existing?.status === "active"
              ? "active"
              : seller.status || existing?.status,
        })
      );
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    );
  }

  async function logActivity(action, meta = {}) {
    const item = {
      id: makeId("log"),
      action,
      meta,
      created_at: nowIso(),
    };

    const next = [item, ...activity].slice(0, 80);
    setActivity(next);
    writeLocal(ADMIN_ACTIVITY_KEY, next);

    try {
      await supabase.from("live_admin_activity").insert(item);
      setSyncMode("cloud");
    } catch {
      setSyncMode("local");
    }
  }

  async function syncSeller(seller) {
    try {
      await supabase.from("live_sellers").upsert(seller);
      setSyncMode("cloud");
    } catch (error) {
      console.warn("Seller saved locally only.", error);
      setSyncMode("local");
    }
  }

  async function syncPayment(payment) {
    try {
      await supabase.from("live_payments").upsert(payment);
      setSyncMode("cloud");
    } catch (error) {
      console.warn("Payment saved locally only.", error);
      setSyncMode("local");
    }
  }

  function persistSellerAccess(seller, source = "admin") {
    const access = makeAccessForSeller(seller, source);

    writeLocal(SELLER_PROFILE_KEY, {
      id: seller.id,
      seller_name: seller.seller_name,
      email: seller.email,
      phone: seller.phone,
      plan_key: access.plan_key,
      plan_name: access.plan_name,
      status: seller.status,
      payment_status: seller.payment_status,
      max_moderators: access.moderators,
      expires_at: access.expires_at,
      updated_at: nowIso(),
    });

    writeLocal(SELECTED_PLAN_KEY, access.plan_key);
    localStorage.setItem("connecthive_live_seller_id", seller.id);

    return access;
  }

  async function saveSeller(event) {
    event.preventDefault();

    const plan = getPlan(sellerForm.plan_key);

    const cleanSeller = normalizeSeller({
      ...sellerForm,
      plan_key: plan.key,
      plan_name: plan.name,
      amount_paid: Number(sellerForm.amount_paid || 0),
      moderators: plan.moderators,
      updated_at: nowIso(),
    });

    if (!cleanSeller.seller_name.trim() || !cleanSeller.email.trim()) {
      showNotice("Add seller name and email first.");
      return;
    }

    let nextUsers;

    if (selectedUserId) {
      nextUsers = adminUsers.map((user) =>
        user.id === selectedUserId ? { ...user, ...cleanSeller, id: selectedUserId } : user
      );

      await syncSeller({ ...cleanSeller, id: selectedUserId });
      await logActivity("Updated seller account", { seller: cleanSeller.seller_name });
      showNotice("Seller account updated.");
    } else {
      const newSeller = {
        ...cleanSeller,
        id: makeId("seller"),
        created_at: nowIso(),
      };

      nextUsers = [newSeller, ...adminUsers];

      await syncSeller(newSeller);
      await logActivity("Created seller account", { seller: newSeller.seller_name });
      showNotice("Seller account created.");
    }

    setAdminUsers(nextUsers);
    writeLocal(ADMIN_USERS_KEY, nextUsers);

    if (cleanSeller.status === "active" || cleanSeller.payment_status === "verified" || cleanSeller.status === "trial") {
      persistSellerAccess(selectedUserId ? { ...cleanSeller, id: selectedUserId } : nextUsers[0], "manual-save");
    }

    setSellerForm(defaultSellerForm);
    setSelectedUserId(null);
  }

  function editSeller(user) {
    const seller = normalizeSeller(user);

    setSelectedUserId(seller.id);
    setSellerForm({
      seller_name: seller.seller_name,
      email: seller.email,
      phone: seller.phone,
      plan_key: seller.plan_key,
      status: seller.status,
      payment_status: seller.payment_status,
      mpesa_code: seller.mpesa_code,
      amount_paid: seller.amount_paid,
      notes: seller.notes,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function updateSeller(id, changes, activityLabel = "Updated seller") {
    const next = adminUsers.map((user) => {
      if (user.id !== id) return user;

      const plan = getPlan(changes.plan_key || user.plan_key);
      return normalizeSeller({
        ...user,
        ...changes,
        plan_key: plan.key,
        plan_name: plan.name,
        moderators: changes.moderators ?? plan.moderators,
        updated_at: nowIso(),
      });
    });

    const updatedUser = next.find((user) => user.id === id);

    setAdminUsers(next);
    writeLocal(ADMIN_USERS_KEY, next);

    if (updatedUser) {
      await syncSeller(updatedUser);

      if (updatedUser.status === "active" || updatedUser.status === "trial" || updatedUser.payment_status === "verified") {
        persistSellerAccess(updatedUser, activityLabel);
      }

      await logActivity(activityLabel, {
        seller: updatedUser.seller_name || updatedUser.email,
        plan: updatedUser.plan_name,
      });

      showNotice(activityLabel);
    }
  }

  async function verifyPayment(payment) {
    const plan = getPlan(payment.plan_key || payment.plan_name);

    const updatedPayment = normalizePayment({
      ...payment,
      plan_key: plan.key,
      plan_name: plan.name,
      amount: payment.amount || plan.amount,
      moderators: plan.moderators,
      status: "verified",
      payment_status: "verified",
      updated_at: nowIso(),
    });

    const nextPayments = payments.map((item) =>
      item.id === payment.id ? updatedPayment : item
    );

    setPayments(nextPayments);
    writeLocal(PAYMENTS_KEY, nextPayments);
    await syncPayment(updatedPayment);

    const matchingSeller =
      adminUsers.find(
        (user) =>
          user.email === updatedPayment.email ||
          user.phone === updatedPayment.phone ||
          user.id === updatedPayment.seller_id
      ) || {};

    const seller = normalizeSeller({
      ...matchingSeller,
      id: matchingSeller.id || updatedPayment.seller_id || `seller_${updatedPayment.id}`,
      seller_name: updatedPayment.seller_name,
      email: updatedPayment.email || matchingSeller.email,
      phone: updatedPayment.phone || matchingSeller.phone,
      plan_key: plan.key,
      plan_name: plan.name,
      status: "active",
      payment_status: "verified",
      amount_paid: updatedPayment.amount,
      mpesa_code: updatedPayment.mpesa_code,
      moderators: plan.moderators,
      updated_at: nowIso(),
    });

    const nextUsers = mergeSellers(
      adminUsers.filter((user) => user.id !== seller.id),
      [seller]
    );

    setAdminUsers(nextUsers);
    writeLocal(ADMIN_USERS_KEY, nextUsers);
    persistSellerAccess(seller, "payment-verified");

    await syncSeller(seller);
    await logActivity("Verified payment and activated seller", {
      seller: seller.seller_name,
      code: updatedPayment.mpesa_code,
      amount: updatedPayment.amount,
      plan: plan.name,
    });

    showNotice(`${seller.seller_name} activated on ${plan.name}.`);
  }

  async function rejectPayment(payment) {
    const updatedPayment = normalizePayment({
      ...payment,
      status: "rejected",
      payment_status: "rejected",
      updated_at: nowIso(),
    });

    const nextPayments = payments.map((item) =>
      item.id === payment.id ? updatedPayment : item
    );

    setPayments(nextPayments);
    writeLocal(PAYMENTS_KEY, nextPayments);
    await syncPayment(updatedPayment);

    await logActivity("Rejected payment", {
      seller: updatedPayment.seller_name,
      code: updatedPayment.mpesa_code,
    });

    showNotice("Payment rejected.");
  }

  async function deletePayment(paymentId) {
    const payment = payments.find((item) => item.id === paymentId);
    const nextPayments = payments.filter((item) => item.id !== paymentId);

    setPayments(nextPayments);
    writeLocal(PAYMENTS_KEY, nextPayments);

    try {
      await supabase.from("live_payments").delete().eq("id", paymentId);
      setSyncMode("cloud");
    } catch {
      setSyncMode("local");
    }

    await logActivity("Deleted payment record", {
      seller: payment?.seller_name,
      code: payment?.mpesa_code,
    });

    showNotice("Payment deleted.");
  }

  function startTrialForSeller() {
    const plan = getPlan("basic");
    setSellerForm((current) => ({
      ...current,
      plan_key: plan.key,
      status: "trial",
      payment_status: "trial",
      amount_paid: 0,
      notes: current.notes || "3-day Basic trial started from admin panel.",
    }));

    showNotice("Basic trial preset loaded.");
  }

  function exportUsers() {
    const rows = [
      [
        "Seller",
        "Email",
        "Phone",
        "Plan",
        "Status",
        "Payment Status",
        "Amount",
        "M-Pesa Code",
        "Moderators",
        "Expires",
        "Notes",
      ],
      ...adminUsers.map((user) => [
        user.seller_name,
        user.email,
        user.phone,
        user.plan_name,
        user.status,
        user.payment_status,
        user.amount_paid,
        user.mpesa_code,
        user.moderators,
        user.expires_at,
        user.notes,
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `connecthive-live-admin-${Date.now()}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  const filteredUsers = useMemo(() => {
    return adminUsers.filter((user) => {
      const term = search.toLowerCase();
      const matchesSearch = [
        user.seller_name,
        user.email,
        user.phone,
        user.plan_name,
        user.plan_key,
        user.status,
        user.payment_status,
        user.mpesa_code,
        user.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);

      const matchesFilter =
        filter === "All" ||
        user.status === filter.toLowerCase() ||
        user.payment_status === filter.toLowerCase() ||
        user.plan_key === normalizeKey(filter) ||
        user.plan_name === filter;

      return matchesSearch && matchesFilter;
    });
  }, [adminUsers, search, filter]);

  const pendingPayments = useMemo(() => {
    return payments.filter((payment) =>
      ["pending", "submitted"].includes(String(payment.status || "pending").toLowerCase())
    );
  }, [payments]);

  const verifiedPayments = useMemo(() => {
    return payments.filter((payment) => String(payment.status).toLowerCase() === "verified");
  }, [payments]);

  const totalVerifiedRevenue = verifiedPayments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  );

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter((order) => {
      const date = new Date(order.created_at || order.createdAt || Date.now()).toDateString();
      return date === today;
    });
  }, [orders]);

  const activeUsers = adminUsers.filter((user) => user.status === "active").length;
  const trialUsers = adminUsers.filter((user) => user.status === "trial").length;
  const activeProducts = products.filter((product) => product.status !== "Archived").length;
  const activeModerators = moderators.filter((mod) => mod.status !== "Paused").length;

  return (
    <DashboardLayout>
      <section className="admin-page admin-playfair-shell">
        {notice && <div className="admin-toast">{notice}</div>}

        <div className="admin-hero">
          <div>
            <div className="page-kicker">CONNECTHIVE LIVE ADMIN</div>

            <h1 className="page-title">
              Control the <span>whole app</span>
            </h1>

            <p className="page-subtitle">
              This panel now understands the new subscription logic: Basic has a 3-day
              trial then KES 500 monthly, Team is KES 800 monthly with 3 moderators,
              and sellers only unlock what has been trialed or verified.
            </p>

            <div className="admin-quick-rules">
              <span>Basic: 3 days free → KES 500/mo</span>
              <span>Team: KES 800/mo</span>
              <span>Companion mode ready</span>
              <span>Payment locking active</span>
            </div>
          </div>

          <div className="admin-hero-actions">
            <span className={`admin-sync-pill ${safeClass(syncMode)}`}>
              {syncMode === "cloud" ? "Cloud Sync" : syncMode === "local" ? "Local Mode" : "Checking"}
            </span>

            <button className="btn-secondary" onClick={loadAdminCenter} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </button>

            <button className="btn-primary" onClick={exportUsers}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="admin-command-grid">
          <article className="admin-metric-card">
            <p>Total Sellers</p>
            <strong>{adminUsers.length}</strong>
            <span>{activeUsers} active • {trialUsers} trial</span>
          </article>

          <article className="admin-metric-card">
            <p>Pending Payments</p>
            <strong>{pendingPayments.length}</strong>
            <span>{currency(pendingPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</span>
          </article>

          <article className="admin-metric-card">
            <p>Verified Revenue</p>
            <strong>{currency(totalVerifiedRevenue)}</strong>
            <span>{verifiedPayments.length} verified payments</span>
          </article>

          <article className="admin-metric-card">
            <p>Live Engine</p>
            <strong>{todayOrders.length}</strong>
            <span>{activeProducts} products • {activeModerators} moderators</span>
          </article>
        </div>

        <div className="admin-main-grid">
          <form className="admin-panel-card admin-form-card" onSubmit={saveSeller}>
            <div className="panel-header">
              <div>
                <span className="panel-eyebrow">Seller Access</span>
                <h2>{selectedUserId ? "Edit Seller Account" : "Create / Unlock Seller"}</h2>
                <p>
                  Use this when you need manual control: approve, start Basic trial,
                  activate Team, correct a phone number, or lock a seller back down.
                </p>
              </div>

              {selectedUserId && (
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => {
                    setSelectedUserId(null);
                    setSellerForm(defaultSellerForm);
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="admin-form-grid">
              <label>
                Seller / Business name
                <input
                  value={sellerForm.seller_name}
                  onChange={(event) =>
                    setSellerForm((current) => ({ ...current, seller_name: event.target.value }))
                  }
                  placeholder="e.g. Enky Solutions"
                />
              </label>

              <label>
                Seller email
                <input
                  type="email"
                  value={sellerForm.email}
                  onChange={(event) =>
                    setSellerForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="seller@email.com"
                />
              </label>

              <label>
                Phone / WhatsApp
                <input
                  value={sellerForm.phone}
                  onChange={(event) =>
                    setSellerForm((current) => ({ ...current, phone: event.target.value }))
                  }
                  placeholder="0768063078"
                />
              </label>

              <label>
                Plan
                <select
                  value={sellerForm.plan_key}
                  onChange={(event) => {
                    const plan = getPlan(event.target.value);
                    setSellerForm((current) => ({
                      ...current,
                      plan_key: plan.key,
                      amount_paid:
                        current.payment_status === "trial" ? 0 : current.amount_paid || plan.amount,
                    }));
                  }}
                >
                  {PLAN_CATALOG.map((plan) => (
                    <option key={plan.key} value={plan.key}>
                      {plan.name} — {plan.trialDays ? "3-day trial, then " : ""}
                      {currency(plan.amount)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Account status
                <select
                  value={sellerForm.status}
                  onChange={(event) =>
                    setSellerForm((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Payment status
                <select
                  value={sellerForm.payment_status}
                  onChange={(event) =>
                    setSellerForm((current) => ({ ...current, payment_status: event.target.value }))
                  }
                >
                  {paymentOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Amount paid
                <input
                  value={sellerForm.amount_paid}
                  onChange={(event) =>
                    setSellerForm((current) => ({ ...current, amount_paid: event.target.value }))
                  }
                  placeholder="500 / 800 / 2500"
                  inputMode="numeric"
                />
              </label>

              <label>
                M-Pesa code
                <input
                  value={sellerForm.mpesa_code}
                  onChange={(event) =>
                    setSellerForm((current) => ({
                      ...current,
                      mpesa_code: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="TRE567882S"
                />
              </label>

              <label className="admin-wide-field">
                Admin notes
                <textarea
                  value={sellerForm.notes}
                  onChange={(event) =>
                    setSellerForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="Verification remarks, support context, package correction..."
                />
              </label>
            </div>

            <div className="admin-form-actions">
              <button className="btn-secondary" type="button" onClick={startTrialForSeller}>
                Start Basic Trial
              </button>

              <button className="btn-primary" type="submit">
                {selectedUserId ? "Save Changes" : "Create / Unlock Seller"}
              </button>
            </div>
          </form>

          <aside className="admin-panel-card admin-plans-card">
            <div className="panel-header">
              <div>
                <span className="panel-eyebrow">Packages</span>
                <h2>Live Pricing Rules</h2>
                <p>These are the rules the admin panel uses when locking access.</p>
              </div>
            </div>

            <div className="admin-plan-list">
              {PLAN_CATALOG.map((plan) => (
                <article key={plan.key} className="admin-plan-item">
                  <div>
                    <div className="admin-plan-title-row">
                      <strong>{plan.name}</strong>
                      <span>{plan.badge}</span>
                    </div>
                    <p>{plan.description}</p>

                    <ul>
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  </div>

                  <b>{currency(plan.amount)}</b>
                </article>
              ))}
            </div>
          </aside>
        </div>

        <div className="admin-main-grid">
          <section className="admin-panel-card">
            <div className="panel-header">
              <div>
                <span className="panel-eyebrow">M-Pesa Queue</span>
                <h2>Payment Verification</h2>
                <p>
                  Approving a payment now activates the seller, writes the correct
                  plan limits and keeps the local app state aligned.
                </p>
              </div>

              <span className="status-pill">{pendingPayments.length} pending</span>
            </div>

            <div className="admin-payment-list">
              {pendingPayments.length === 0 ? (
                <div className="admin-empty-state">
                  No pending payments yet. When sellers submit M-Pesa codes, they appear here.
                </div>
              ) : (
                pendingPayments.slice(0, 8).map((payment) => {
                  const plan = getPlan(payment.plan_key || payment.plan_name);

                  return (
                    <article className="admin-payment-row" key={payment.id}>
                      <div>
                        <h3>{payment.seller_name || payment.email || "Seller"}</h3>
                        <p>{payment.phone || payment.email || "No contact provided"}</p>
                      </div>

                      <div>
                        <strong>{plan.name}</strong>
                        <p>{currency(payment.amount || plan.amount)} • {plan.moderators} mods</p>
                      </div>

                      <div>
                        <strong>{payment.mpesa_code || "No code"}</strong>
                        <p>{new Date(payment.created_at).toLocaleString()}</p>
                      </div>

                      <span className={`admin-payment ${safeClass(payment.status)}`}>
                        {payment.status}
                      </span>

                      <div className="admin-payment-actions">
                        <button onClick={() => verifyPayment(payment)}>Verify</button>
                        <button className="soft-danger" onClick={() => rejectPayment(payment)}>
                          Reject
                        </button>
                        <button className="btn-ghost-mini" onClick={() => deletePayment(payment.id)}>
                          Delete
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="admin-panel-card">
            <div className="panel-header">
              <div>
                <span className="panel-eyebrow">Audit Trail</span>
                <h2>Admin Activity</h2>
                <p>Every important approval, suspension and plan edit appears here.</p>
              </div>
            </div>

            <div className="admin-activity-list">
              {activity.length === 0 ? (
                <div className="admin-empty-state">No admin actions recorded yet.</div>
              ) : (
                activity.slice(0, 10).map((item) => (
                  <article className="admin-activity-item" key={item.id}>
                    <span />
                    <div>
                      <strong>{item.action}</strong>
                      <p>
                        {new Date(item.created_at).toLocaleString()}{" "}
                        {item.meta?.seller ? `• ${item.meta.seller}` : ""}
                        {item.meta?.plan ? ` • ${item.meta.plan}` : ""}
                      </p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="admin-users-panel">
          <div className="panel-header">
            <div>
              <span className="panel-eyebrow">Account Guard</span>
              <h2>User Management</h2>
              <p>
                Search, approve, suspend, downgrade or upgrade sellers. Selecting
                a plan alone does not unlock it; status and payment state must match.
              </p>
            </div>

            <span className="status-pill">Admin Only</span>
          </div>

          <div className="admin-toolbar">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search seller, email, phone, plan, M-Pesa code..."
            />

            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              {[
                "All",
                "trial",
                "pending",
                "active",
                "suspended",
                "expired",
                "verified",
                "submitted",
                "rejected",
                "Basic",
                "Team",
                "Growth",
                "Pro Team",
              ].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-users-list">
            {filteredUsers.length === 0 ? (
              <div className="admin-empty-state">
                No sellers match your current search. Add one above or refresh sync.
              </div>
            ) : (
              filteredUsers.map((user) => {
                const plan = getPlan(user.plan_key);
                const locked =
                  user.status !== "active" &&
                  user.status !== "trial" &&
                  user.payment_status !== "verified";

                return (
                  <article className={`admin-user-row ${locked ? "locked" : ""}`} key={user.id}>
                    <div className="admin-user-identity">
                      <h3>{user.seller_name || "Unnamed Seller"}</h3>
                      <p>{user.email || "No email"}</p>
                      <p>{user.phone || "No phone"}</p>
                    </div>

                    <div>
                      <strong>{plan.name}</strong>
                      <p>
                        {currency(plan.amount)} • {plan.moderators} mods
                      </p>
                    </div>

                    <div>
                      <strong>{user.mpesa_code || "—"}</strong>
                      <p>{currency(user.amount_paid || 0)}</p>
                    </div>

                    <span className={`admin-status ${safeClass(user.status)}`}>
                      {user.status || "pending"}
                    </span>

                    <span className={`admin-payment ${safeClass(user.payment_status)}`}>
                      {user.payment_status || "pending"}
                    </span>

                    <div className="admin-expiry-chip">
                      <strong>{daysLeft(user.expires_at)}</strong>
                      <p>Access left</p>
                    </div>

                    <div className="admin-user-actions">
                      <button
                        onClick={() =>
                          updateSeller(
                            user.id,
                            {
                              status: "active",
                              payment_status: "verified",
                              amount_paid: user.amount_paid || plan.amount,
                              expires_at: (() => {
                                const date = new Date();
                                date.setDate(date.getDate() + 30);
                                return date.toISOString();
                              })(),
                            },
                            "Approved seller"
                          )
                        }
                      >
                        Approve
                      </button>

                      <button onClick={() => editSeller(user)}>Edit</button>

                      <button
                        onClick={() =>
                          updateSeller(
                            user.id,
                            {
                              plan_key: "team",
                              amount_paid: 800,
                              status: "active",
                              payment_status: "verified",
                            },
                            "Set Team plan"
                          )
                        }
                      >
                        Set Team
                      </button>

                      <button
                        onClick={() =>
                          updateSeller(
                            user.id,
                            {
                              plan_key: "basic",
                              amount_paid: 0,
                              status: "trial",
                              payment_status: "trial",
                            },
                            "Started Basic trial"
                          )
                        }
                      >
                        Trial
                      </button>

                      <button
                        className="danger"
                        onClick={() =>
                          updateSeller(
                            user.id,
                            {
                              status: "suspended",
                            },
                            "Suspended seller"
                          )
                        }
                      >
                        Suspend
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </section>
    </DashboardLayout>
  );
}

export default AdminPanel;
