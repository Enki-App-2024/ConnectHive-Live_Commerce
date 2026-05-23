import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { supabase } from "../services/supabaseClient";

const ORDER_TABLE = "live_orders";
const LOCAL_ORDERS_KEY = "connecthive-live-orders-v1";

const STATUS_FLOW = ["New", "Confirmed", "Paid", "Processing", "Delivered"];
const SOURCE_OPTIONS = [
  "TikTok Comment",
  "Instagram Live",
  "Facebook Live",
  "YouTube Live",
  "WhatsApp",
  "Phone Call",
  "Manual",
];

const emptyOrder = {
  customer_name: "",
  phone: "",
  product: "",
  amount: "",
  location: "",
  source: "TikTok Comment",
  note: "",
};

function readLocalOrders() {
  try {
    const stored = localStorage.getItem(LOCAL_ORDERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveLocalOrders(orders) {
  try {
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(orders));
  } catch {
    // Some browsers can block localStorage. The page should still run.
  }
}

function normalizeAmount(value) {
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  return Number(cleaned) || 0;
}

function normalizeOrder(order) {
  return {
    ...order,
    customer_name: order.customer_name ?? order.customer ?? order.customerName ?? "",
    product: order.product ?? "",
    phone: order.phone ?? "",
    amount: normalizeAmount(order.amount ?? order.price),
    location: order.location ?? "",
    status: order.status ?? "New",
    source: order.source ?? "Manual",
    note: order.note ?? "",
    captured_by: order.captured_by ?? order.capturedBy ?? "Host",
    created_at: order.created_at ?? order.createdAt ?? new Date().toISOString(),
    updated_at: order.updated_at ?? order.updatedAt ?? new Date().toISOString(),
  };
}

function getStatusClass(status) {
  return String(status || "new").toLowerCase().replace(/\s+/g, "-");
}

function formatMoney(value) {
  return `KES ${normalizeAmount(value).toLocaleString()}`;
}

function formatTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Just now";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nextStatus(currentStatus) {
  const currentIndex = STATUS_FLOW.indexOf(currentStatus);
  if (currentIndex < 0 || currentIndex === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[currentIndex + 1];
}

function Orders() {
  const [orders, setOrders] = useState(() => readLocalOrders().map(normalizeOrder));
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState("Local ready");
  const [toast, setToast] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [orderForm, setOrderForm] = useState(emptyOrder);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const left = new Date(a.created_at || 0).getTime();
      const right = new Date(b.created_at || 0).getTime();
      return right - left;
    });
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sortedOrders.filter((order) => {
      const matchesFilter = filter === "All" || order.status === filter;
      const searchText = [
        order.customer_name,
        order.phone,
        order.product,
        order.location,
        order.source,
        order.note,
      ]
        .join(" ")
        .toLowerCase();

      return matchesFilter && (!query || searchText.includes(query));
    });
  }, [filter, search, sortedOrders]);

  const totals = useMemo(() => {
    const paidOrders = orders.filter((order) => order.status === "Paid");
    const openOrders = orders.filter((order) =>
      ["New", "Confirmed", "Processing"].includes(order.status)
    );

    return {
      all: orders.length,
      open: openOrders.length,
      paid: paidOrders.length,
      delivered: orders.filter((order) => order.status === "Delivered").length,
      paidRevenue: paidOrders.reduce((sum, order) => sum + normalizeAmount(order.amount), 0),
      pipelineRevenue: orders.reduce((sum, order) => sum + normalizeAmount(order.amount), 0),
    };
  }, [orders]);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    saveLocalOrders(orders);
  }, [orders]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  async function loadOrders() {
    if (!supabase) {
      setSyncStatus("Local mode");
      return;
    }

    try {
      setSyncStatus("Syncing...");

      const { data, error } = await supabase
        .from(ORDER_TABLE)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      setOrders(Array.isArray(data) ? data.map(normalizeOrder) : []);
      setSyncStatus("Cloud synced");
    } catch (error) {
      console.warn("Orders sync fallback:", error?.message || error);
      setSyncStatus("Local mode");
      setOrders(readLocalOrders().map(normalizeOrder));
    }
  }

  async function persistOrder(order) {
    if (!supabase) return order;

    try {
      const { data, error } = await supabase
        .from(ORDER_TABLE)
        .insert(order)
        .select()
        .single();

      if (error) throw error;
      setSyncStatus("Cloud synced");
      return normalizeOrder(data);
    } catch (error) {
      console.warn("Order saved locally:", error?.message || error);
      setSyncStatus("Local mode");
      return order;
    }
  }

  async function persistStatus(orderId, status) {
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from(ORDER_TABLE)
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;
      setSyncStatus("Cloud synced");
    } catch (error) {
      console.warn("Status saved locally:", error?.message || error);
      setSyncStatus("Local mode");
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setOrderForm((previous) => ({ ...previous, [name]: value }));
  }

  async function addOrder(event) {
    event.preventDefault();

    if (!orderForm.customer_name.trim() || !orderForm.product.trim()) {
      setToast("Add customer name and product first.");
      return;
    }

    setIsSaving(true);

    const now = new Date().toISOString();
    const draftOrder = normalizeOrder({
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
      customer_name: orderForm.customer_name.trim(),
      phone: orderForm.phone.trim(),
      product: orderForm.product.trim(),
      amount: normalizeAmount(orderForm.amount),
      location: orderForm.location.trim(),
      source: orderForm.source,
      note: orderForm.note.trim(),
      status: "New",
      captured_by: "Orders Desk",
      created_at: now,
      updated_at: now,
    });

    setOrders((previous) => [draftOrder, ...previous]);

    const savedOrder = await persistOrder(draftOrder);
    setOrders((previous) =>
      previous.map((order) => (order.id === draftOrder.id ? savedOrder : order))
    );

    setOrderForm(emptyOrder);
    setShowCapture(false);
    setToast("Order captured");
    setIsSaving(false);
  }

  async function updateStatus(orderId, status) {
    const now = new Date().toISOString();

    setOrders((previous) =>
      previous.map((order) =>
        order.id === orderId ? { ...order, status, updated_at: now } : order
      )
    );

    await persistStatus(orderId, status);
    setToast(`Order marked ${status}`);
  }

  function exportCsv() {
    const headings = [
      "Customer",
      "Phone",
      "Product",
      "Amount",
      "Location",
      "Status",
      "Source",
      "Note",
      "Created At",
    ];

    const rows = filteredOrders.map((order) => [
      order.customer_name,
      order.phone,
      order.product,
      order.amount,
      order.location,
      order.status,
      order.source,
      order.note,
      order.created_at,
    ]);

    const csv = [headings, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `connecthive-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout>
      <section className="orders-page orders-live-desk">
        {toast && <div className="orders-toast">{toast}</div>}

        <div className="orders-header orders-command-header">
          <div>
            <div className="page-kicker">ORDERS COMMAND CENTER</div>
            <h1 className="page-title">
              Manage every <span>live order</span>
            </h1>
            <p className="page-subtitle">
              Orders captured inside the Live Session appear here. Confirm,
              mark payment, export, and follow up without touching TikTok APIs.
            </p>
          </div>

          <div className="orders-header-actions">
            <span className={`orders-sync ${syncStatus === "Cloud synced" ? "online" : ""}`}>
              <i></i>
              {syncStatus}
            </span>
            <button className="btn-secondary" type="button" onClick={loadOrders}>
              Refresh
            </button>
            <button className="btn-secondary" type="button" onClick={exportCsv}>
              Export CSV
            </button>
            <button
              className="btn-primary"
              type="button"
              onClick={() => setShowCapture((value) => !value)}
            >
              {showCapture ? "Close Capture" : "+ Manual Order"}
            </button>
          </div>
        </div>

        <div className="orders-summary">
          <div>
            <p>Total Orders</p>
            <strong>{totals.all}</strong>
          </div>
          <div>
            <p>Pipeline Value</p>
            <strong>{formatMoney(totals.pipelineRevenue)}</strong>
          </div>
          <div>
            <p>Open Orders</p>
            <strong>{totals.open}</strong>
          </div>
          <div>
            <p>Paid Revenue</p>
            <strong>{formatMoney(totals.paidRevenue)}</strong>
          </div>
        </div>

        {showCapture && (
          <form className="orders-capture-panel" onSubmit={addOrder}>
            <div>
              <h2>Capture a manual order</h2>
              <p>Use this when a moderator needs to add an order outside the live room.</p>
            </div>

            <div className="orders-capture-grid">
              <input
                className="form-input"
                name="customer_name"
                value={orderForm.customer_name}
                onChange={handleChange}
                placeholder="Customer / username"
                autoFocus
              />
              <input
                className="form-input"
                name="phone"
                value={orderForm.phone}
                onChange={handleChange}
                placeholder="Phone number"
              />
              <input
                className="form-input"
                name="product"
                value={orderForm.product}
                onChange={handleChange}
                placeholder="Product"
              />
              <input
                className="form-input"
                name="amount"
                value={orderForm.amount}
                onChange={handleChange}
                placeholder="Amount in KES"
                inputMode="numeric"
              />
              <input
                className="form-input"
                name="location"
                value={orderForm.location}
                onChange={handleChange}
                placeholder="Delivery location"
              />
              <select
                className="form-input"
                name="source"
                value={orderForm.source}
                onChange={handleChange}
              >
                {SOURCE_OPTIONS.map((source) => (
                  <option key={source}>{source}</option>
                ))}
              </select>
              <textarea
                className="form-textarea orders-capture-note"
                name="note"
                value={orderForm.note}
                onChange={handleChange}
                placeholder="Size, color, rider note, payment reference..."
                rows="3"
              />
            </div>

            <button className="btn-primary" type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Capture Order"}
            </button>
          </form>
        )}

        <div className="orders-toolbar orders-smart-toolbar">
          <input
            className="form-input"
            placeholder="Search customer, phone, product, location, source..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="orders-filter-tabs">
            {["All", ...STATUS_FLOW].map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "active" : ""}
                onClick={() => setFilter(item)}
              >
                {item}
                <span>
                  {item === "All"
                    ? totals.all
                    : orders.filter((order) => order.status === item).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="orders-table orders-live-table">
          {filteredOrders.length === 0 ? (
            <div className="orders-empty-state">
              <strong>No orders found</strong>
              <p>
                Start a live session or capture a manual order. The order desk is ready;
                it just needs customers to start buzzing.
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const next = nextStatus(order.status);

              return (
                <article className="order-row order-live-row" key={order.id}>
                  <div className="order-customer-cell">
                    <h3>{order.customer_name || "Unnamed customer"}</h3>
                    <p>{order.phone || "No phone yet"}</p>
                    <small>{formatTime(order.created_at)}</small>
                  </div>

                  <div>
                    <strong>{order.product || "No product"}</strong>
                    <p>{order.location || "No location"}</p>
                    {order.note && <small>{order.note}</small>}
                  </div>

                  <div>
                    <strong>{formatMoney(order.amount)}</strong>
                    <p>{order.source || "Manual"}</p>
                    <small>By {order.captured_by || "Host"}</small>
                  </div>

                  <span className={`order-status ${getStatusClass(order.status)}`}>
                    {order.status}
                  </span>

                  <div className="order-row-actions">
                    {next && (
                      <button type="button" onClick={() => updateStatus(order.id, next)}>
                        Move to {next}
                      </button>
                    )}

                    {STATUS_FLOW.filter((status) => status !== order.status)
                      .slice(0, 3)
                      .map((status) => (
                        <button
                          key={status}
                          type="button"
                          className="order-mini-action"
                          onClick={() => updateStatus(order.id, status)}
                        >
                          {status}
                        </button>
                      ))}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </DashboardLayout>
  );
}

export default Orders;
