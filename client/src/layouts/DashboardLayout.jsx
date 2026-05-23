import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import OnboardingOverlay from "../components/guidance/OnboardingOverlay";

const PLAN_KEY_PRIMARY = "connecthive_live_selected_plan";
const PLAN_KEY_LEGACY = "connecthive-live-active-plan-v1";

const pricingPlans = [
  {
    key: "basic",
    name: "Basic",
    label: "Solo Seller",
    price: 0,
    priceText: "KES 0",
    moderators: 3,
    hostText: "1 Host + 3 Mods",
    description: "One seller account with basic live order tools and 3 moderators.",
  },
  {
    key: "team",
    name: "Team",
    label: "Small Team",
    price: 800,
    priceText: "KES 800",
    moderators: 10,
    hostText: "1 Host + 10 Mods",
    description: "Seller plus 10 moderators for busy live sessions.",
  },
  {
    key: "growth",
    name: "Growth",
    label: "Pro",
    price: 2500,
    priceText: "KES 2,500",
    moderators: 10,
    hostText: "1 Host + 10 Mods",
    description: "More controls, priority support and advanced live workflow.",
  },
  {
    key: "pro_team",
    name: "Pro Team",
    label: "Serious Sellers",
    price: 6500,
    priceText: "KES 6,500",
    moderators: 25,
    hostText: "1 Host + 25 Mods",
    description: "For frequent live sessions, bigger teams and serious selling.",
  },
];

function safeRead(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage may fail in private mode. The UI should still render.
  }
}

function normalizePlanKey(value) {
  if (!value) return "basic";

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return value.key || value.id || value.plan_key || value.plan || "basic";
  }

  return "basic";
}

function getInitialPlanKey() {
  const selected = safeRead(PLAN_KEY_PRIMARY, null);
  const legacy = safeRead(PLAN_KEY_LEGACY, null);
  return normalizePlanKey(selected || legacy || "basic");
}

function DashboardLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, isAdmin } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return safeRead("connecthive_sidebar_collapsed_v1", false);
  });
  const [activePlanKey, setActivePlanKey] = useState(getInitialPlanKey);

  useEffect(() => {
    safeWrite("connecthive_sidebar_collapsed_v1", sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    const refreshPlan = () => setActivePlanKey(getInitialPlanKey());

    window.addEventListener("storage", refreshPlan);
    window.addEventListener("connecthive-plan-updated", refreshPlan);
    window.addEventListener("connecthive-payment-updated", refreshPlan);

    return () => {
      window.removeEventListener("storage", refreshPlan);
      window.removeEventListener("connecthive-plan-updated", refreshPlan);
      window.removeEventListener("connecthive-payment-updated", refreshPlan);
    };
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const activePlan = useMemo(() => {
    return (
      pricingPlans.find((plan) => plan.key === activePlanKey) ||
      pricingPlans.find((plan) => plan.key === "basic") ||
      pricingPlans[0]
    );
  }, [activePlanKey]);

  const navItems = [
    { label: "Dashboard", path: "/dashboard", icon: "⌂" },
    { label: "Live Sessions", path: "/live", icon: "●", badge: "Live" },
    { label: "Orders", path: "/orders", icon: "🛒" },
    { label: "Products", path: "/products", icon: "□" },
    { label: "Moderators", path: "/moderators", icon: "👥" },
    { label: "Payments", path: "/payments", icon: "💳" },
  ];

  const routeTitle =
    navItems.find((item) => item.path === location.pathname)?.label ||
    (location.pathname === "/admin" ? "Admin Panel" : "ConnectHive Live");

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const goTo = (path) => navigate(path);
  const isActive = (path) => location.pathname === path;

  return (
    <>
      <OnboardingOverlay />

      <main
        className={`dashboard-layout ${
          sidebarCollapsed ? "sidebar-is-collapsed" : ""
        } ${sidebarOpen ? "mobile-sidebar-open" : ""}`}
      >
      <button
        className="mobile-menu-trigger"
        type="button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open navigation"
      >
        ☰
      </button>

      <aside className="dashboard-sidebar" aria-label="ConnectHive navigation">
        <div className="sidebar-top-row">
          <button
            className="sidebar-logo-button"
            type="button"
            onClick={() => goTo("/dashboard")}
            aria-label="Go to dashboard"
          >
            <div className="sidebar-logo-mark" aria-hidden="true">
              ⬢
            </div>

            <div className="sidebar-brand">
              <h2>
                Connect<span>Hive</span>
              </h2>
              <p>Live Commerce OS</p>
            </div>
          </button>

          <button
            className="sidebar-close-mobile"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        <button
          className="sidebar-collapse-toggle"
          type="button"
          onClick={() => setSidebarCollapsed((value) => !value)}
        >
          <span>{sidebarCollapsed ? "Expand" : "Collapse"}</span>
          <strong>{sidebarCollapsed ? "→" : "←"}</strong>
        </button>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.path}
              className={isActive(item.path) ? "active" : ""}
              type="button"
              onClick={() => goTo(item.path)}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.badge && <small>{item.badge}</small>}
            </button>
          ))}

          {isAdmin && (
            <button
              className={isActive("/admin") ? "active" : ""}
              type="button"
              onClick={() => goTo("/admin")}
              title="Admin Panel"
            >
              <span className="nav-icon">⚙</span>
              <span className="nav-label">Admin Panel</span>
              <small>Owner</small>
            </button>
          )}
        </nav>

        <section className="sidebar-plan-card">
          <span className="sidebar-plan-eyebrow">Current Plan</span>

          <div className="sidebar-plan-header">
            <div>
              <h3>{activePlan.name}</h3>
              <p>{activePlan.label}</p>
            </div>

            <strong>{activePlan.priceText}</strong>
          </div>

          <div className="plan-capacity">
            <span>{activePlan.moderators}</span>
            <small>moderators allowed</small>
          </div>

          <button type="button" onClick={() => goTo("/payments")}>
            Manage Plan
          </button>
        </section>

        <section className="sidebar-note">
          <strong>Companion Mode</strong>
          <p>
            Sellers keep TikTok, Instagram, Facebook or YouTube open normally.
            ConnectHive handles orders, products, moderators and payment follow-up
            beside the live.
          </p>
        </section>
      </aside>

      <button
        className="sidebar-backdrop"
        type="button"
        aria-label="Close sidebar"
        onClick={() => setSidebarOpen(false)}
      />

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="topbar-left">
            <p className="topbar-label">{routeTitle}</p>
            <h3>{user?.email || "Seller account"}</h3>
          </div>

          <div className="topbar-actions">
            <button
              className="topbar-live-btn"
              type="button"
              onClick={() => goTo("/live")}
            >
              Start Live Room
            </button>

            <span className="status-pill plan-status-pill">
              {activePlan.name} · {activePlan.moderators} mods
            </span>

            {isAdmin && <span className="status-pill">Admin Access</span>}

            <button className="btn-secondary logout-btn" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <section className="dashboard-content">{children}</section>
      </section>
      </main>
    </>
  );
}

export default DashboardLayout;
