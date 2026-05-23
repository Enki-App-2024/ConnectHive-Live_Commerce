import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import { supabase } from "../services/supabaseClient";
import FeatureGuide from "../components/guidance/FeatureGuide";
import "../styles/dashboard.css";

const PLAN_KEY_PRIMARY = "connecthive_live_selected_plan";
const PLAN_KEY_LEGACY = "connecthive-live-active-plan-v1";

const ORDER_KEYS = [
  "connecthive-live-orders-v2",
  "connecthive-live-orders-v1",
  "connecthive_live_orders_v1",
];

const PRODUCT_KEYS = [
  "connecthive_live_products_v1",
  "connecthive_live_products_v1",
];

const MODERATOR_KEYS = [
  "connecthive_live_moderators",
  "connecthive_live_moderators_v1",
];

const PAYMENT_KEYS = [
  "connecthive_live_payments",
  "connecthive_live_payments_v1",
];

const plans = [
  {
    key: "basic",
    name: "Basic",
    priceText: "KES 0",
    moderators: 3,
    teamText: "1 Host + 3 Mods",
  },
  {
    key: "team",
    name: "Team",
    priceText: "KES 800",
    moderators: 10,
    teamText: "1 Host + 10 Mods",
  },
  {
    key: "growth",
    name: "Growth",
    priceText: "KES 2,500",
    moderators: 10,
    teamText: "1 Host + 10 Mods",
  },
  {
    key: "pro_team",
    name: "Pro Team",
    priceText: "KES 6,500",
    moderators: 25,
    teamText: "1 Host + 25 Mods",
  },
];

function safeRead(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function firstArray(keys) {
  for (const key of keys) {
    const value = safeRead(key, null);
    if (Array.isArray(value)) return value;
  }

  return [];
}

function normalizePlanKey(value) {
  if (!value) return "basic";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return value.key || value.id || value.plan_key || value.plan || "basic";
  }
  return "basic";
}

function formatMoney(value) {
  const number = Number(value || 0);
  return `KES ${number.toLocaleString("en-KE")}`;
}

function getAmount(order) {
  return Number(order.amount || order.total || order.price || 0);
}

function getOrderStatus(order) {
  return String(order.status || "New").toLowerCase();
}

function Dashboard() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState(() => firstArray(ORDER_KEYS));
  const [products, setProducts] = useState(() => firstArray(PRODUCT_KEYS));
  const [moderators, setModerators] = useState(() => firstArray(MODERATOR_KEYS));
  const [payments, setPayments] = useState(() => firstArray(PAYMENT_KEYS));
  const [syncState, setSyncState] = useState("Local mode");
  const [lastUpdated, setLastUpdated] = useState("Just now");

  const activePlanKey = normalizePlanKey(
    safeRead(PLAN_KEY_PRIMARY, null) || safeRead(PLAN_KEY_LEGACY, null)
  );

  const activePlan =
    plans.find((plan) => plan.key === activePlanKey) ||
    plans.find((plan) => plan.key === "basic") ||
    plans[0];

  useEffect(() => {
    let active = true;

    async function loadCloudData() {
      try {
        const [ordersRes, productsRes, moderatorsRes, paymentsRes] =
          await Promise.allSettled([
            supabase.from("live_orders").select("*").order("created_at", { ascending: false }),
            supabase.from("live_products").select("*").order("created_at", { ascending: false }),
            supabase.from("live_moderators").select("*").order("created_at", { ascending: false }),
            supabase.from("live_payments").select("*").order("created_at", { ascending: false }),
          ]);

        if (!active) return;

        const nextOrders =
          ordersRes.status === "fulfilled" && !ordersRes.value.error
            ? ordersRes.value.data || []
            : firstArray(ORDER_KEYS);

        const nextProducts =
          productsRes.status === "fulfilled" && !productsRes.value.error
            ? productsRes.value.data || []
            : firstArray(PRODUCT_KEYS);

        const nextModerators =
          moderatorsRes.status === "fulfilled" && !moderatorsRes.value.error
            ? moderatorsRes.value.data || []
            : firstArray(MODERATOR_KEYS);

        const nextPayments =
          paymentsRes.status === "fulfilled" && !paymentsRes.value.error
            ? paymentsRes.value.data || []
            : firstArray(PAYMENT_KEYS);

        setOrders(nextOrders);
        setProducts(nextProducts);
        setModerators(nextModerators);
        setPayments(nextPayments);

        const anyCloud =
          (ordersRes.status === "fulfilled" && !ordersRes.value.error) ||
          (productsRes.status === "fulfilled" && !productsRes.value.error) ||
          (moderatorsRes.status === "fulfilled" && !moderatorsRes.value.error) ||
          (paymentsRes.status === "fulfilled" && !paymentsRes.value.error);

        setSyncState(anyCloud ? "Cloud ready" : "Local mode");
        setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      } catch {
        if (!active) return;
        setOrders(firstArray(ORDER_KEYS));
        setProducts(firstArray(PRODUCT_KEYS));
        setModerators(firstArray(MODERATOR_KEYS));
        setPayments(firstArray(PAYMENT_KEYS));
        setSyncState("Local mode");
      }
    }

    loadCloudData();

    const refresh = () => {
      setOrders(firstArray(ORDER_KEYS));
      setProducts(firstArray(PRODUCT_KEYS));
      setModerators(firstArray(MODERATOR_KEYS));
      setPayments(firstArray(PAYMENT_KEYS));
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    };

    window.addEventListener("storage", refresh);
    window.addEventListener("connecthive-orders-updated", refresh);
    window.addEventListener("connecthive-products-updated", refresh);
    window.addEventListener("connecthive-moderators-updated", refresh);
    window.addEventListener("connecthive-payment-updated", refresh);

    return () => {
      active = false;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("connecthive-orders-updated", refresh);
      window.removeEventListener("connecthive-products-updated", refresh);
      window.removeEventListener("connecthive-moderators-updated", refresh);
      window.removeEventListener("connecthive-payment-updated", refresh);
    };
  }, []);

  const metrics = useMemo(() => {
    const paidOrders = orders.filter((order) => getOrderStatus(order) === "paid");
    const pendingOrders = orders.filter((order) => {
      const status = getOrderStatus(order);
      return status === "new" || status === "pending" || status === "confirmed";
    });

    const revenue = paidOrders.reduce((sum, order) => sum + getAmount(order), 0);
    const pendingRevenue = pendingOrders.reduce((sum, order) => sum + getAmount(order), 0);

    const activeProducts = products.filter((product) => {
      const status = String(product.status || "Active").toLowerCase();
      return status !== "archived" && status !== "draft";
    });

    const activeModerators = moderators.filter((mod) => {
      const status = String(mod.status || "Active").toLowerCase();
      return status === "active" || status === "online";
    });

    return {
      totalOrders: orders.length,
      paidOrders: paidOrders.length,
      pendingOrders: pendingOrders.length,
      revenue,
      pendingRevenue,
      activeProducts: activeProducts.length,
      activeModerators: activeModerators.length,
      paymentSubmissions: payments.length,
    };
  }, [orders, products, moderators, payments]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => {
        const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
        const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 5);
  }, [orders]);

  return (
    <DashboardLayout>
      <section className="dashboard-wired-page">
        <div className="dashboard-wired-hero">
          <div>
            <div className="page-kicker">SELLER COMMAND CENTER</div>

            <h1>
              Organize the live. <span>Capture the money.</span>
            </h1>

            <p>
              This dashboard now reads from your working order, product,
              moderator and payment flows. It falls back locally until Supabase
              tables are ready, then switches into cloud-backed mode.
            </p>

            <div className="dashboard-hero-actions">
              <button className="btn-primary" type="button" onClick={() => navigate("/live")}>
                Start Live Room
              </button>

              <button className="btn-secondary" type="button" onClick={() => navigate("/orders")}>
                Open Orders
              </button>

              <button className="btn-secondary" type="button" onClick={() => navigate("/products")}>
                Prepare Catalog
              </button>
            </div>
          </div>

          <aside className="dashboard-readiness-card">
            <span>{syncState}</span>
            <h2>{activePlan.name}</h2>
            <p>{activePlan.priceText} · {activePlan.teamText}</p>

            <div className="readiness-grid">
              <div>
                <strong>{metrics.activeProducts}</strong>
                <small>Products ready</small>
              </div>
              <div>
                <strong>{metrics.activeModerators}</strong>
                <small>Moderators active</small>
              </div>
            </div>

            <button type="button" onClick={() => navigate("/payments")}>
              Manage subscription
            </button>
          </aside>
        </div>

        <FeatureGuide feature="dashboard" />

        <div className="dashboard-metric-grid">
          <article>
            <p>Total Orders</p>
            <strong>{metrics.totalOrders}</strong>
            <small>{metrics.pendingOrders} need follow-up</small>
          </article>

          <article>
            <p>Paid Revenue</p>
            <strong>{formatMoney(metrics.revenue)}</strong>
            <small>{metrics.paidOrders} paid orders</small>
          </article>

          <article>
            <p>Pending Value</p>
            <strong>{formatMoney(metrics.pendingRevenue)}</strong>
            <small>Confirm before dispatch</small>
          </article>

          <article>
            <p>Payment Submissions</p>
            <strong>{metrics.paymentSubmissions}</strong>
            <small>Last sync {lastUpdated}</small>
          </article>
        </div>

        <div className="dashboard-workflow-grid">
          <article className="dashboard-workflow-card">
            <div>
              <span>01</span>
              <h2>Before Live</h2>
              <p>
                Add products, prices, stock and moderator roles. This keeps the
                live session fast because nobody is typing everything from zero.
              </p>
            </div>

            <button type="button" onClick={() => navigate("/products")}>
              Prepare products
            </button>
          </article>

          <article className="dashboard-workflow-card">
            <div>
              <span>02</span>
              <h2>During Live</h2>
              <p>
                Keep the streaming platform open beside ConnectHive. Capture
                comment orders, confirm details and push follow-ups quickly.
              </p>
            </div>

            <button type="button" onClick={() => navigate("/live")}>
              Open live room
            </button>
          </article>

          <article className="dashboard-workflow-card">
            <div>
              <span>03</span>
              <h2>After Live</h2>
              <p>
                Review paid, pending and delivery-ready orders. Export records
                or continue customer follow-up from the order room.
              </p>
            </div>

            <button type="button" onClick={() => navigate("/orders")}>
              Review orders
            </button>
          </article>
        </div>

        <div className="dashboard-lower-grid">
          <section className="dashboard-panel wired-recent-panel">
            <div className="panel-header">
              <div>
                <h2>Recent Orders</h2>
                <p>Real orders from live capture or local fallback.</p>
              </div>

              <button className="btn-secondary" type="button" onClick={() => navigate("/orders")}>
                View All
              </button>
            </div>

            {recentOrders.length > 0 ? (
              <div className="wired-order-list">
                {recentOrders.map((order, index) => (
                  <div className="wired-order-row" key={order.id || `${order.customer_name}-${index}`}>
                    <div>
                      <strong>{order.customer_name || order.name || "Unnamed customer"}</strong>
                      <p>{order.product || order.item || "No product selected"}</p>
                    </div>

                    <div>
                      <strong>{formatMoney(getAmount(order))}</strong>
                      <span>{order.status || "New"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-dashboard-state">
                <h3>No orders yet</h3>
                <p>
                  Start a live room and capture your first comment order. No fake
                  numbers here — clean slate, clean wiring.
                </p>
                <button type="button" onClick={() => navigate("/live")}>
                  Capture first order
                </button>
              </div>
            )}
          </section>

          <section className="dashboard-panel wiring-panel">
            <h2>Wiring Checklist</h2>

            <div className="wiring-list">
              <div>
                <span className={orders.length ? "ready" : ""} />
                <p>Orders connected</p>
                <strong>{orders.length}</strong>
              </div>

              <div>
                <span className={products.length ? "ready" : ""} />
                <p>Products connected</p>
                <strong>{products.length}</strong>
              </div>

              <div>
                <span className={moderators.length ? "ready" : ""} />
                <p>Moderators connected</p>
                <strong>{moderators.length}</strong>
              </div>

              <div>
                <span className={payments.length ? "ready" : ""} />
                <p>Payments connected</p>
                <strong>{payments.length}</strong>
              </div>
            </div>

            <p className="wiring-note">
              live_orders, live_products,
              live_moderators, live_payments.
            </p>
          </section>
        </div>
      </section>
    </DashboardLayout>
  );
}

export default Dashboard;
