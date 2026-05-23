import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { useOrders } from "../contexts/OrdersContext";
import { useProducts } from "../contexts/ProductsContext";
import { useModerators } from "../contexts/ModeratorsContext";
import useDeviceMode from "../hooks/useDeviceMode";
import FeatureGuide from "../components/guidance/FeatureGuide";
import "../styles/live-session.css";

const LOCAL_SESSION_KEY = "connecthive-live-session-v4";
const LOCAL_PLAN_LOCK_KEY = "connecthive-live-plan-lock-v1";

const emptyOrder = {
  customer_name: "",
  phone: "",
  product: "",
  amount: "",
  location: "",
  note: "",
  source: "TikTok Comment",
};

const emptySession = {
  title: "TikTok Companion Room",
  platform: "TikTok",
  handle: "",
  is_active: false,
  started_at: null,
  ended_at: null,
  mode: "companion",
};

const platforms = [
  "TikTok",
  "Facebook Live",
  "Instagram Live",
  "YouTube Live",
  "WhatsApp Live",
  "Other",
];

const quickSources = [
  "TikTok Comment",
  "Instagram Live",
  "Facebook Live",
  "YouTube Live",
  "WhatsApp",
  "Manual",
];

const priorityPrompts = [
  "How much?",
  "I want this",
  "Available?",
  "Deliver to me",
  "Size/color?",
  "Payment sent",
];

const planRules = {
  basic: {
    label: "Basic",
    paidAmount: 800,
    moderators: 2,
    maxOpenOrders: 60,
    canUseCompanion: true,
    canUseWideCompanion: true,
    canUseReports: false,
    description: "1 host + 2 moderators. Best for a single seller live room.",
  },
  team: {
    label: "Team",
    paidAmount: 1500,
    moderators: 6,
    maxOpenOrders: 180,
    canUseCompanion: true,
    canUseWideCompanion: true,
    canUseReports: true,
    description: "For growing teams with several moderators and higher order flow.",
  },
  pro: {
    label: "Pro Company",
    paidAmount: 3000,
    moderators: Infinity,
    maxOpenOrders: Infinity,
    canUseCompanion: true,
    canUseWideCompanion: true,
    canUseReports: true,
    description: "Company mode. Unlimited moderators and heavier live operations.",
  },
};

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage can fail in private mode. The page should still render.
  }
}

function formatMoney(value) {
  const amount = Number(String(value || "").replace(/[^\d.]/g, "")) || 0;
  return `KES ${amount.toLocaleString("en-KE")}`;
}

function formatTime(value) {
  if (!value) return "Not started";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not started";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function elapsedTime(startedAt, active) {
  if (!startedAt || !active) return "00:00";

  const diff = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

function statusClass(status) {
  return String(status || "new").toLowerCase().replace(/\s+/g, "-");
}

function getNextStatus(status) {
  const flow = ["New", "Confirmed", "Paid", "Processing", "Delivered"];
  const index = flow.indexOf(status);

  if (index < 0 || index === flow.length - 1) return null;

  return flow[index + 1];
}

function getInitialPlanLock() {
  const saved = readLocal(LOCAL_PLAN_LOCK_KEY, null);

  if (saved?.planId && planRules[saved.planId]) {
    return saved;
  }

  /*
    MVP containment rule:
    The app must not allow users to switch themselves into Pro just because
    a select/button exists. Until PaymentContext is wired here, default verified
    access is locked to Basic. Later, this object should come directly from the
    payment/subscription table after admin/payment verification.
  */
  return {
    planId: "basic",
    status: "verified",
    paidAmount: 800,
    paymentRef: "manual-basic-800",
    lockedAt: new Date().toISOString(),
  };
}

function getPlanLimitText(value) {
  return value === Infinity ? "Unlimited" : value;
}

function LiveSession() {
  const deviceMode = useDeviceMode();
  const urlParams = new URLSearchParams(window.location.search);
  const requestedMode = urlParams.get("mode");
  const requestedShape = urlParams.get("shape") || "slim";
  const isCompanionWindow = requestedMode === "companion";

  const {
    orders = [],
    sortedOrders = [],
    totals = {},
    createOrder,
    updateOrderStatus,
    syncStatus: ordersSyncStatus = "Local ready",
    loading: ordersLoading,
  } = useOrders();

  const {
    products = [],
    sortedProducts = [],
    pinnedProduct,
    pinProduct,
    productStats = {},
    syncStatus: productsSyncStatus = "Local ready",
  } = useProducts();

  const {
    activeModerators = [],
    sortedModerators = [],
    createSupportNote,
    moderatorStats = {},
    syncStatus: moderatorsSyncStatus = "Local ready",
  } = useModerators();

  const [session, setSession] = useState(() =>
    readLocal(LOCAL_SESSION_KEY, emptySession)
  );

  const [planLock, setPlanLock] = useState(getInitialPlanLock);
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [commentDraft, setCommentDraft] = useState("");
  const [supportNote, setSupportNote] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedModeratorId, setSelectedModeratorId] = useState("");
  const [isFloatingOpen, setIsFloatingOpen] = useState(true);
  const [isCompactMode, setIsCompactMode] = useState(isCompanionWindow);
  const [companionShape, setCompanionShape] = useState(requestedShape);
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState(() => Date.now());

  const activePlan = planRules[planLock.planId] || planRules.basic;
  const allowedModerators = activePlan.moderators;
  const allowedActiveModerators =
    allowedModerators === Infinity
      ? activeModerators
      : activeModerators.slice(0, allowedModerators);

  const liveOrders = useMemo(() => {
    return sortedOrders.slice(0, isCompanionWindow ? 5 : 8);
  }, [sortedOrders, isCompanionWindow]);

  const latestOrder = liveOrders[0];

  const pendingOrders = useMemo(() => {
    return orders.filter((order) =>
      ["New", "Confirmed", "Processing"].includes(order.status)
    );
  }, [orders]);

  const paidOrders = useMemo(() => {
    return orders.filter((order) => order.status === "Paid");
  }, [orders]);

  const activeProducts = useMemo(() => {
    return sortedProducts.filter((product) => product.status === "active");
  }, [sortedProducts]);

  const currentElapsed = useMemo(
    () => elapsedTime(session.started_at, session.is_active),
    [session.started_at, session.is_active, clock]
  );

  const companionHealth = useMemo(() => {
    const checks = [
      ordersSyncStatus === "Cloud synced",
      productsSyncStatus === "Cloud synced",
      moderatorsSyncStatus === "Cloud synced",
    ];

    const cloudCount = checks.filter(Boolean).length;

    if (cloudCount === 3) return "Cloud synced";
    if (cloudCount > 0) return "Partly synced";
    return "Local ready";
  }, [ordersSyncStatus, productsSyncStatus, moderatorsSyncStatus]);

  const planWarnings = useMemo(() => {
    const warnings = [];

    if (activeModerators.length > allowedActiveModerators.length) {
      warnings.push(
        `${activeModerators.length - allowedActiveModerators.length} moderator(s) hidden by ${activePlan.label} plan limit.`
      );
    }

    if (
      activePlan.maxOpenOrders !== Infinity &&
      pendingOrders.length >= activePlan.maxOpenOrders
    ) {
      warnings.push(
        `${activePlan.label} open order limit reached. Upgrade must be verified before more orders are accepted.`
      );
    }

    return warnings;
  }, [
    activeModerators.length,
    allowedActiveModerators.length,
    activePlan.label,
    activePlan.maxOpenOrders,
    pendingOrders.length,
  ]);

  useEffect(() => {
    writeLocal(LOCAL_SESSION_KEY, session);
  }, [session]);

  useEffect(() => {
    writeLocal(LOCAL_PLAN_LOCK_KEY, planLock);
  }, [planLock]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isCompanionWindow) return;

    document.body.classList.add("connecthive-companion-body");

    return () => {
      document.body.classList.remove("connecthive-companion-body");
    };
  }, [isCompanionWindow]);

  function updateSession(field, value) {
    setSession((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startSession() {
    const startedAt = new Date().toISOString();

    setSession((current) => ({
      ...current,
      is_active: true,
      started_at: current.started_at || startedAt,
      ended_at: null,
    }));

    setToast("Live companion started");
  }

  function endSession() {
    setSession((current) => ({
      ...current,
      is_active: false,
      ended_at: new Date().toISOString(),
    }));

    setToast("Live companion ended");
  }

  function resetSession() {
    setSession(emptySession);
    setOrderForm(emptyOrder);
    setCommentDraft("");
    setSupportNote("");
    setSelectedProductId("");
    setSelectedModeratorId("");
    setToast("Session reset");
  }

  function updateOrderForm(field, value) {
    setOrderForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyProductToOrder(productId) {
    const product = products.find((item) => item.id === productId);

    setSelectedProductId(productId);

    if (!product) return;

    setOrderForm((current) => ({
      ...current,
      product: product.name,
      amount: product.price || current.amount,
    }));
  }

  function parseCommentToOrder(comment) {
    const clean = comment.trim();

    if (!clean) {
      return null;
    }

    const phoneMatch = clean.match(/(?:\+?254|0)?7\d{8}/);
    const amountMatch =
      clean.match(/(?:kes|ksh|sh)\s?(\d+)/i) || clean.match(/(\d{2,6})/);

    const selectedProduct = selectedProductId
      ? products.find((product) => product.id === selectedProductId)
      : null;

    const product =
      pinnedProduct?.name || orderForm.product || selectedProduct?.name || "";

    return {
      customer_name: clean.split(/[:,-]/)[0].slice(0, 48) || "Live customer",
      phone: phoneMatch?.[0] || orderForm.phone,
      product: product || "Live item",
      amount: amountMatch?.[1] || pinnedProduct?.price || orderForm.amount || "",
      location: orderForm.location,
      note: clean,
      source: session.platform ? `${session.platform} Comment` : "Live Comment",
    };
  }

  function canCaptureMoreOrders() {
    if (activePlan.maxOpenOrders === Infinity) return true;
    return pendingOrders.length < activePlan.maxOpenOrders;
  }

  async function captureFromComment(commentText = commentDraft) {
    if (!canCaptureMoreOrders()) {
      setToast("Plan order limit reached. Verify upgrade before capturing more.");
      return;
    }

    const parsed = parseCommentToOrder(commentText);

    if (!parsed) {
      setToast("Paste or type a customer comment first.");
      return;
    }

    await createOrder({
      ...parsed,
      status: "New",
      captured_by: "Live Companion",
    });

    setCommentDraft("");
    setToast("Comment captured as order");
  }

  async function captureManualOrder(event) {
    event.preventDefault();

    if (!canCaptureMoreOrders()) {
      setToast("Plan order limit reached. Verify upgrade before capturing more.");
      return;
    }

    if (!orderForm.customer_name.trim() || !orderForm.product.trim()) {
      setToast("Customer name and product are required.");
      return;
    }

    await createOrder({
      ...orderForm,
      customer_name: orderForm.customer_name.trim(),
      product: orderForm.product.trim(),
      amount: orderForm.amount,
      status: "New",
      captured_by: selectedModeratorId
        ? allowedActiveModerators.find((mod) => mod.id === selectedModeratorId)?.name ||
          "Moderator"
        : "Live Companion",
    });

    setOrderForm(emptyOrder);
    setToast("Manual order captured");
  }

  async function moveOrder(order) {
    const next = getNextStatus(order.status);

    if (!next) return;

    await updateOrderStatus(order.id, next);
    setToast(`Order moved to ${next}`);
  }

  async function addSupportNote(priority = "normal") {
    if (!supportNote.trim()) {
      setToast("Write a support note first.");
      return;
    }

    await createSupportNote({
      note: supportNote.trim(),
      priority,
      moderator_id: selectedModeratorId || null,
      order_id: latestOrder?.id || null,
    });

    setSupportNote("");
    setToast("Support note added");
  }

  async function pinSelectedProduct(productId) {
    await pinProduct(productId);
    setToast("Product pinned for live selling");
  }

  function openCompanionWindow(shape = "slim") {
    const shapeMap = {
      bee: { width: 92, height: 160 },
      slim: { width: 390, height: 760 },
      wide: { width: 520, height: 760 },
      desk: { width: 680, height: 820 },
    };

    const selected = shapeMap[shape] || shapeMap.slim;
    const left = Math.max(0, window.screen.width - selected.width - 24);
    const top = 72;

    const child = window.open(
      `/live-session?mode=companion&shape=${shape}`,
      "ConnectHiveLiveCompanion",
      `width=${selected.width},height=${selected.height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!child) {
      setToast("Popup blocked. Allow popups, then open companion again.");
      return;
    }

    child.focus();
    setToast(`${shape === "bee" ? "Bee" : "Companion"} window opened`);
  }

  function requestShapeChange(shape) {
    setCompanionShape(shape);

    const shapeMap = {
      bee: { width: 92, height: 160 },
      slim: { width: 390, height: 760 },
      wide: { width: 520, height: 760 },
      desk: { width: 680, height: 820 },
    };

    const selected = shapeMap[shape];

    try {
      if (selected) window.resizeTo(selected.width, selected.height);
    } catch {
      // Some browsers block resizeTo. CSS still changes the internal layout.
    }
  }

  function lockPlanLocally(planId, amount, ref = "manual-admin-lock") {
    /*
      This button is intentionally not shown as a public upgrade switch.
      Keep it for your admin testing only if you expose it later behind admin auth.
      Public users should never upgrade themselves by changing UI state.
    */
    setPlanLock({
      planId,
      status: "verified",
      paidAmount: amount,
      paymentRef: ref,
      lockedAt: new Date().toISOString(),
    });
  }

  function renderPlanGuard() {
    return (
      <article className="live-plan-guard">
        <div>
          <span>Payment containment</span>
          <h3>{activePlan.label} locked</h3>
          <p>
            Verified payment: {formatMoney(planLock.paidAmount)} · Ref:{" "}
            {planLock.paymentRef || "Manual verification"}
          </p>
        </div>

        <div className="plan-limit-grid">
          <strong>
            {getPlanLimitText(activePlan.moderators)}
            <small>Moderators</small>
          </strong>
          <strong>
            {getPlanLimitText(activePlan.maxOpenOrders)}
            <small>Open orders</small>
          </strong>
        </div>

        {planWarnings.length > 0 && (
          <div className="live-plan-warning">
            {planWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}

        <p className="plan-note">
          Users cannot switch themselves into Team/Pro here. Upgrade must come
          from the verified payment/subscription record.
        </p>
      </article>
    );
  }

  function renderCommentCapture(compact = false) {
    return (
      <article className={`live-panel quick-comment-panel ${compact ? "compact" : ""}`}>
        <div className="section-heading">
          <div>
            <span>Fast capture</span>
            <h2>Turn comments into orders</h2>
          </div>
        </div>

        <textarea
          className="live-comment-input"
          value={commentDraft}
          onChange={(event) => setCommentDraft(event.target.value)}
          placeholder='Paste comment: "Mary want black bag 800 Rongai 0712345678"'
          rows={compact ? 3 : 5}
        />

        {!compact && (
          <div className="quick-prompt-row">
            {priorityPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() =>
                  setCommentDraft((current) =>
                    current ? `${current} ${prompt}` : prompt
                  )
                }
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="voice-btn"
          onClick={() => captureFromComment()}
        >
          Capture Comment
        </button>

        {!compact && (
          <p className="live-helper-text">
            No API friction. Moderators copy/paste important comments while the
            seller keeps entertaining the audience.
          </p>
        )}
      </article>
    );
  }

  function renderOrdersQueue(compact = false) {
    return (
      <section className={`live-panel orders-queue-panel ${compact ? "compact" : ""}`}>
        <div className="section-heading">
          <div>
            <span>Live queue</span>
            <h2>{compact ? "Orders" : "Recent live orders"}</h2>
          </div>

          <strong>{ordersLoading ? "Loading..." : `${liveOrders.length} shown`}</strong>
        </div>

        <div className="live-orders-list">
          {liveOrders.length === 0 ? (
            <div className="live-empty-state">
              <h3>No orders yet</h3>
              <p>Paste a comment or capture a manual order.</p>
            </div>
          ) : (
            liveOrders.map((order) => {
              const next = getNextStatus(order.status);

              return (
                <article className="live-order-card" key={order.id}>
                  <div>
                    <div className="order-card-top">
                      <h3>{order.customer_name || "Live customer"}</h3>
                      <span className={statusClass(order.status)}>{order.status}</span>
                    </div>

                    <p>
                      {order.product || "No product"} ·{" "}
                      {order.location || "No location"}
                    </p>

                    {!compact && order.note && <small>{order.note}</small>}
                  </div>

                  <strong>{formatMoney(order.amount)}</strong>

                  <div className="order-actions">
                    {next && (
                      <button type="button" onClick={() => moveOrder(order)}>
                        {compact ? next : `Move to ${next}`}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => updateOrderStatus(order.id, "Paid")}
                    >
                      Paid
                    </button>

                    {!compact && (
                      <button
                        type="button"
                        onClick={() => updateOrderStatus(order.id, "Delivered")}
                      >
                        Delivered
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    );
  }

  function renderPinnedProduct(compact = false) {
    return (
      <article className={`live-panel product-pin-panel ${compact ? "compact" : ""}`}>
        <div className="section-heading">
          <div>
            <span>Catalog</span>
            <h2>{compact ? "Pinned" : "Live products"}</h2>
          </div>

          <strong>{productStats.active || activeProducts.length} active</strong>
        </div>

        {pinnedProduct ? (
          <div className="pinned-product-card">
            <span>Pinned now</span>
            <h3>{pinnedProduct.name}</h3>
            <p>
              {formatMoney(pinnedProduct.price)} · {pinnedProduct.stock} in stock
            </p>
          </div>
        ) : (
          <div className="pinned-product-card empty">
            <span>No product pinned</span>
            <h3>Pick the current item</h3>
            <p>Pinning helps moderators capture orders faster.</p>
          </div>
        )}

        {!compact && (
          <div className="live-product-list">
            {activeProducts.slice(0, 8).map((product) => (
              <button
                key={product.id}
                type="button"
                className={product.is_pinned ? "active" : ""}
                onClick={() => pinSelectedProduct(product.id)}
              >
                <div>
                  <strong>{product.name}</strong>
                  <span>
                    {formatMoney(product.price)} · {product.stock} left
                  </span>
                </div>

                <small>{product.is_pinned ? "Pinned" : "Pin"}</small>
              </button>
            ))}

            {activeProducts.length === 0 && (
              <div className="live-empty-mini">
                Add products in Products first, then pin them here.
              </div>
            )}
          </div>
        )}
      </article>
    );
  }

  function renderCompanionWindow() {
    const beeOnly = companionShape === "bee";

    return (
      <main className={`companion-window companion-shape-${companionShape}`}>
        {toast && <div className="live-toast companion-toast">{toast}</div>}

        {beeOnly ? (
          <button
            className="companion-bee-only"
            type="button"
            onClick={() => requestShapeChange("slim")}
            title="Open ConnectHive Companion"
          >
            🐝
            <span>{pendingOrders.length}</span>
          </button>
        ) : (
          <>
            <header className="companion-topbar">
              <button
                type="button"
                className="companion-bee-mark"
                onClick={() => requestShapeChange("bee")}
                title="Collapse to bee"
              >
                🐝
              </button>

              <div>
                <strong>ConnectHive Live</strong>
                <span>
                  {session.platform} · {session.handle || "seller"} ·{" "}
                  {currentElapsed}
                </span>
              </div>

              <button
                type="button"
                className={session.is_active ? "live-pill active" : "live-pill"}
                onClick={session.is_active ? endSession : startSession}
              >
                {session.is_active ? "LIVE" : "START"}
              </button>
            </header>

            <section className="companion-shape-controls">
              <button
                type="button"
                className={companionShape === "slim" ? "active" : ""}
                onClick={() => requestShapeChange("slim")}
              >
                Slim
              </button>
              <button
                type="button"
                className={companionShape === "wide" ? "active" : ""}
                onClick={() => requestShapeChange("wide")}
              >
                Wide
              </button>
              <button
                type="button"
                className={companionShape === "desk" ? "active" : ""}
                onClick={() => requestShapeChange("desk")}
              >
                Desk
              </button>
            </section>

            <section className="companion-mini-stats">
              <strong>
                {pendingOrders.length}
                <small>Open</small>
              </strong>
              <strong>
                {paidOrders.length}
                <small>Paid</small>
              </strong>
              <strong>
                {activePlan.label}
                <small>Plan</small>
              </strong>
            </section>

            {renderPinnedProduct(true)}
            {renderCommentCapture(true)}
            {renderOrdersQueue(true)}

            <footer className="companion-footer">
              <button type="button" onClick={() => window.close()}>
                Close
              </button>
              <button type="button" onClick={() => window.opener?.focus?.()}>
                Focus Main
              </button>
            </footer>
          </>
        )}
      </main>
    );
  }

  const fullRoom = (
    <section
      className={`live-session-page live-companion-room ${
        isCompactMode ? "live-compact-mode" : ""
      }`}
    >
      {toast && <div className="live-toast">{toast}</div>}

      <header className="live-hero live-command-hero">
        <div>
          <div className="page-kicker">LIVE COMPANION ROOM</div>
          <h1 className="page-title">
            Sell live. <span>Capture fast.</span>
          </h1>
          <p className="page-subtitle">
            Keep TikTok, Instagram, Facebook, YouTube or WhatsApp Live open
            beside ConnectHive. This room captures orders, pins products,
            coordinates moderators and keeps payment follow-up moving.
          </p>

          <div className="live-device-strip">
            <span>{deviceMode.isStandalone ? "Installed PWA" : "Browser mode"}</span>
            <span>{deviceMode.isMobile ? "Mobile" : deviceMode.isTablet ? "Tablet" : "Desktop"}</span>
            <span>{deviceMode.canUseFloatingCompanion ? "Companion ready" : "Use side-by-side"}</span>
          </div>
        </div>

        <aside className="live-control-card">
          <span className={session.is_active ? "live-dot active" : "live-dot"}></span>
          <div>
            <strong>{session.is_active ? "Companion Active" : "Ready to Start"}</strong>
            <p>{session.platform} · {session.handle || "No handle set"}</p>
          </div>

          <div className="live-timer">
            <small>Live timer</small>
            <b>{currentElapsed}</b>
          </div>

          <div className="live-control-actions">
            {session.is_active ? (
              <button type="button" className="btn-secondary" onClick={endSession}>
                End
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={startSession}>
                Start
              </button>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsCompactMode((value) => !value)}
            >
              {isCompactMode ? "Full Room" : "Compact"}
            </button>
          </div>
        </aside>
      </header>

      <section className="live-companion-launcher live-panel">
        <div>
          <span>Seller focus mode</span>
          <h2>Open the companion beside your live screen</h2>
          <p>
            This opens a separate small window. Place TikTok on the left and
            ConnectHive on the right. No platform friction, no overlay fights.
          </p>
        </div>

        <div className="companion-launch-actions">
          <button type="button" onClick={() => openCompanionWindow("bee")}>
            🐝 Bee
          </button>
          <button type="button" onClick={() => openCompanionWindow("slim")}>
            Slim Companion
          </button>
          <button type="button" onClick={() => openCompanionWindow("wide")}>
            Wide Companion
          </button>
          <button type="button" onClick={() => openCompanionWindow("desk")}>
            Desk Mode
          </button>
        </div>
      </section>

     <FeatureGuide feature="companionMode" />

        <section className="live-status-row live-command-stats">
        <article className="live-status-card">
          <p>Orders today</p>
          <strong>{totals.all || orders.length}</strong>
          <span>{ordersSyncStatus}</span>
        </article>

        <article className="live-status-card">
          <p>Pipeline value</p>
          <strong>{formatMoney(totals.pipelineRevenue)}</strong>
          <span>{pendingOrders.length} open orders</span>
        </article>

        <article className="live-status-card">
          <p>Paid orders</p>
          <strong>{paidOrders.length}</strong>
          <span>{formatMoney(totals.paidRevenue)} paid</span>
        </article>

        <article className="live-status-card">
          <p>Companion health</p>
          <strong>{companionHealth}</strong>
          <span>{moderatorStats.active || activeModerators.length} active mods</span>
        </article>
      </section>

      {renderPlanGuard()}

      <section className="live-session-config live-panel">
        <div className="section-heading">
          <div>
            <span>Session setup</span>
            <h2>Platform companion settings</h2>
          </div>

          <button type="button" className="btn-secondary" onClick={resetSession}>
            Reset Room
          </button>
        </div>

        <div className="live-config-grid">
          <label>
            Session title
            <input
              value={session.title}
              onChange={(event) => updateSession("title", event.target.value)}
              placeholder="TikTok shoe sale"
            />
          </label>

          <label>
            Platform
            <select
              value={session.platform}
              onChange={(event) => updateSession("platform", event.target.value)}
            >
              {platforms.map((platform) => (
                <option key={platform}>{platform}</option>
              ))}
            </select>
          </label>

          <label>
            Handle / page
            <input
              value={session.handle}
              onChange={(event) => updateSession("handle", event.target.value)}
              placeholder="@yourshop"
            />
          </label>

          <label>
            Companion mode
            <select
              value={session.mode}
              onChange={(event) => updateSession("mode", event.target.value)}
            >
              <option value="companion">Companion side panel</option>
              <option value="moderator">Moderator desk</option>
              <option value="seller">Seller quick room</option>
            </select>
          </label>
        </div>
      </section>

      <section className="live-main-grid live-command-grid">
        {renderCommentCapture(false)}

        <article className="live-panel order-form-panel">
          <div className="section-heading">
            <div>
              <span>Manual order</span>
              <h2>Order capture form</h2>
            </div>
          </div>

          <form className="live-form-grid" onSubmit={captureManualOrder}>
            <input
              value={orderForm.customer_name}
              onChange={(event) =>
                updateOrderForm("customer_name", event.target.value)
              }
              placeholder="Customer / username"
            />

            <input
              value={orderForm.phone}
              onChange={(event) => updateOrderForm("phone", event.target.value)}
              placeholder="Phone number"
            />

            <select
              value={selectedProductId}
              onChange={(event) => applyProductToOrder(event.target.value)}
            >
              <option value="">Select product from catalog</option>
              {activeProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {formatMoney(product.price)} · {product.stock} left
                </option>
              ))}
            </select>

            <input
              value={orderForm.product}
              onChange={(event) => updateOrderForm("product", event.target.value)}
              placeholder="Product name"
            />

            <input
              value={orderForm.amount}
              onChange={(event) => updateOrderForm("amount", event.target.value)}
              placeholder="Amount"
              inputMode="numeric"
            />

            <input
              value={orderForm.location}
              onChange={(event) => updateOrderForm("location", event.target.value)}
              placeholder="Delivery location"
            />

            <select
              value={orderForm.source}
              onChange={(event) => updateOrderForm("source", event.target.value)}
            >
              {quickSources.map((source) => (
                <option key={source}>{source}</option>
              ))}
            </select>

            <select
              value={selectedModeratorId}
              onChange={(event) => setSelectedModeratorId(event.target.value)}
            >
              <option value="">Assign moderator / captured by</option>
              {allowedActiveModerators.map((moderator) => (
                <option key={moderator.id} value={moderator.id}>
                  {moderator.name} · {moderator.role}
                </option>
              ))}
            </select>

            <textarea
              value={orderForm.note}
              onChange={(event) => updateOrderForm("note", event.target.value)}
              placeholder="Color, size, rider note, payment reference..."
              rows="3"
            />

            <button type="submit" className="btn-primary">
              Save Order
            </button>
          </form>
        </article>
      </section>

      <section className="live-bottom-grid live-ops-grid">
        {renderPinnedProduct(false)}

        <article className="live-panel moderator-panel">
          <div className="section-heading">
            <div>
              <span>Support desk</span>
              <h2>Moderators & notes</h2>
            </div>

            <strong>
              {allowedActiveModerators.length}/{getPlanLimitText(activePlan.moderators)} allowed
            </strong>
          </div>

          <div className="moderator-list">
            {allowedActiveModerators.slice(0, 6).map((moderator) => (
              <div key={moderator.id}>
                <strong>{moderator.name}</strong>
                <span>
                  {moderator.role} · {moderator.status}
                </span>
              </div>
            ))}

            {sortedModerators.length === 0 && (
              <div>
                <strong>No moderators yet</strong>
                <span>Add moderators to speed up live support.</span>
              </div>
            )}
          </div>

          <textarea
            className="support-note-input"
            value={supportNote}
            onChange={(event) => setSupportNote(event.target.value)}
            placeholder="Support note: customer asking delivery, payment sent, stock question..."
            rows="3"
          />

          <div className="support-note-actions">
            <button type="button" onClick={() => addSupportNote("normal")}>
              Add Note
            </button>
            <button type="button" onClick={() => addSupportNote("urgent")}>
              Urgent
            </button>
          </div>
        </article>
      </section>

      {renderOrdersQueue(false)}

      <aside className={`live-floating-companion ${isFloatingOpen ? "open" : ""}`}>
        <button
          className="floating-toggle"
          type="button"
          onClick={() => setIsFloatingOpen((value) => !value)}
          aria-label="Toggle live companion"
        >
          🐝
          <span>{pendingOrders.length}</span>
        </button>

        {isFloatingOpen && (
          <div className="floating-panel">
            <div>
              <strong>{session.is_active ? "Live active" : "Ready"}</strong>
              <p>{currentElapsed} · {pendingOrders.length} open orders</p>
            </div>

            {pinnedProduct && (
              <div className="floating-product">
                <span>PINNED</span>
                <strong>{pinnedProduct.name}</strong>
                <p>{formatMoney(pinnedProduct.price)}</p>
              </div>
            )}

            {latestOrder ? (
              <div className="floating-order">
                <span>Latest order</span>
                <strong>{latestOrder.customer_name || "Customer"}</strong>
                <p>
                  {latestOrder.product} · {formatMoney(latestOrder.amount)}
                </p>
              </div>
            ) : (
              <div className="floating-order">
                <span>No orders yet</span>
                <strong>Companion ready</strong>
                <p>Capture the first comment order.</p>
              </div>
            )}

            <button type="button" onClick={() => openCompanionWindow("slim")}>
              Open Side Companion
            </button>
          </div>
        )}
      </aside>
    </section>
  );

  if (isCompanionWindow) {
    return renderCompanionWindow();
  }

  return <DashboardLayout>{fullRoom}</DashboardLayout>;
}

export default LiveSession;
