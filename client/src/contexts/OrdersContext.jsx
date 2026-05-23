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

const OrdersContext = createContext(null);

const ORDER_TABLE = "live_orders";
const SELLER_TABLE = "live_sellers";
const LOCAL_ORDERS_KEY = "connecthive-live-orders-v1";
const LOCAL_ORDERS_KEY_ALT = "connecthive_live_orders_v1";
const SELLER_ID_KEY = "connecthive_live_seller_id";
const SELLER_PROFILE_KEY = "connecthive_live_seller_profile";

export const STATUS_FLOW = ["New", "Confirmed", "Paid", "Processing", "Delivered"];

export const SOURCE_OPTIONS = [
  "TikTok Comment",
  "Instagram Live",
  "Facebook Live",
  "YouTube Live",
  "WhatsApp",
  "Phone Call",
  "Manual",
];

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
    // Some browsers can block localStorage. The app should still run.
  }
}

function normalizeAmount(value) {
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  return Number(cleaned) || 0;
}

function toTitleStatus(status) {
  const value = String(status || "New").toLowerCase();

  const map = {
    new: "New",
    confirmed: "Confirmed",
    paid: "Paid",
    processing: "Processing",
    packing: "Processing",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  return map[value] || status || "New";
}

function toDbOrderStatus(status) {
  const value = String(status || "new").toLowerCase();

  const map = {
    new: "new",
    confirmed: "confirmed",
    paid: "paid",
    processing: "packing",
    packing: "packing",
    delivered: "delivered",
    cancelled: "cancelled",
  };

  return map[value] || "new";
}

function toDbPaymentStatus(status) {
  const value = String(status || "").toLowerCase();

  if (value === "paid" || value === "delivered") return "paid";
  if (value === "confirmed") return "submitted";

  return "pending";
}

function normalizeOrder(order = {}) {
  const status = toTitleStatus(order.status || order.order_status);

  return {
    id: order.id || crypto.randomUUID(),
    seller_id: order.seller_id || null,
    product_id: order.product_id || null,
    assigned_moderator_id: order.assigned_moderator_id || null,

    customer_name:
      order.customer_name ||
      order.customer ||
      order.customerName ||
      order.username ||
      "",
    phone: order.phone || order.customer_phone || "",
    location: order.location || order.customer_location || "",

    product: order.product || order.product_name || order.item || "",
    quantity: Number(order.quantity || 1),
    amount: normalizeAmount(order.amount ?? order.price ?? order.total),

    status,
    payment_status: order.payment_status || toDbPaymentStatus(status),
    source: order.source || order.source_platform || "Manual",
    comment_text: order.comment_text || order.comment || "",
    note: order.note || order.notes || "",

    captured_by: order.captured_by || order.capturedBy || "Host",
    created_at: order.created_at || order.createdAt || new Date().toISOString(),
    updated_at: order.updated_at || order.updatedAt || new Date().toISOString(),
  };
}

function readLocalOrders() {
  const primary = readLocal(LOCAL_ORDERS_KEY, null);
  if (Array.isArray(primary)) return primary.map(normalizeOrder);

  const alt = readLocal(LOCAL_ORDERS_KEY_ALT, null);
  if (Array.isArray(alt)) return alt.map(normalizeOrder);

  return [];
}

function saveLocalOrders(orders) {
  const normalized = orders.map(normalizeOrder);
  writeLocal(LOCAL_ORDERS_KEY, normalized);
  writeLocal(LOCAL_ORDERS_KEY_ALT, normalized);
  window.dispatchEvent(new Event("connecthive-orders-updated"));
}

function buildDbOrder(order, sellerId) {
  const normalized = normalizeOrder(order);

  return {
    seller_id: sellerId,
    product_id: normalized.product_id,
    assigned_moderator_id: normalized.assigned_moderator_id,

    customer_name: normalized.customer_name,
    customer_phone: normalized.phone,
    customer_location: normalized.location,

    product_name: normalized.product,
    quantity: normalized.quantity || 1,
    amount: normalized.amount,

    payment_status: normalized.payment_status || toDbPaymentStatus(normalized.status),
    order_status: toDbOrderStatus(normalized.status),

    source_platform: normalized.source || "Manual",
    comment_text: normalized.comment_text || "",
    notes: normalized.note || "",
  };
}

export function OrdersProvider({ children }) {
  const { user } = useAuth();

  const [orders, setOrders] = useState(() => readLocalOrders());
  const [sellerId, setSellerId] = useState(() => readLocal(SELLER_ID_KEY, null));
  const [syncStatus, setSyncStatus] = useState("Local ready");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const left = new Date(a.created_at || 0).getTime();
      const right = new Date(b.created_at || 0).getTime();
      return right - left;
    });
  }, [orders]);

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

  const resolveSellerId = useCallback(async () => {
    const savedSellerId = readLocal(SELLER_ID_KEY, null);

    if (savedSellerId) {
      setSellerId(savedSellerId);
      return savedSellerId;
    }

    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData?.user || user;

    if (!authUser?.id) {
      return null;
    }

    const { data: existingSeller, error: existingError } = await supabase
      .from(SELLER_TABLE)
      .select("id")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (!existingError && existingSeller?.id) {
      writeLocal(SELLER_ID_KEY, existingSeller.id);
      setSellerId(existingSeller.id);
      return existingSeller.id;
    }

    const profile = readLocal(SELLER_PROFILE_KEY, {}) || {};

    const { data: seller, error: sellerError } = await supabase
      .from(SELLER_TABLE)
      .upsert(
        {
          user_id: authUser.id,
          full_name: profile.fullName || authUser.email,
          business_name:
            profile.businessName || profile.fullName || "ConnectHive Seller",
          phone: profile.phone || "",
          email: profile.email || authUser.email,
          county: profile.county || "",
          platform: profile.platform || "",
          live_handle: profile.liveHandle || "",
          plan_key: profile.selectedPlanKey || "basic",
          plan_name: profile.selectedPlanName || "Basic",
          plan_price: Number(profile.selectedPlanPrice || 0),
          max_moderators: Number(profile.maxModerators || 3),
          approval_status: Number(profile.selectedPlanPrice || 0) === 0 ? "approved" : "pending",
        },
        { onConflict: "user_id" }
      )
      .select("id")
      .single();

    if (sellerError || !seller?.id) {
      console.info("Orders seller bridge unavailable:", sellerError?.message);
      return null;
    }

    writeLocal(SELLER_ID_KEY, seller.id);
    setSellerId(seller.id);

    return seller.id;
  }, [user]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const currentSellerId = await resolveSellerId();

      if (!currentSellerId) {
        setOrders(readLocalOrders());
        setSyncStatus("Local mode");
        return;
      }

      setSyncStatus("Syncing...");

      const { data, error: loadError } = await supabase
        .from(ORDER_TABLE)
        .select("*")
        .eq("seller_id", currentSellerId)
        .order("created_at", { ascending: false })
        .limit(300);

      if (loadError) throw loadError;

      const nextOrders = Array.isArray(data) ? data.map(normalizeOrder) : [];

      setOrders(nextOrders);
      saveLocalOrders(nextOrders);
      setSyncStatus("Cloud synced");
    } catch (loadError) {
      console.info("Orders cloud load fallback:", loadError?.message || loadError);
      setError(loadError?.message || "");
      setOrders(readLocalOrders());
      setSyncStatus("Local mode");
    } finally {
      setLoading(false);
    }
  }, [resolveSellerId]);

  const createOrder = useCallback(
    async (payload) => {
      setError("");

      const now = new Date().toISOString();
      const draft = normalizeOrder({
        ...payload,
        id: crypto.randomUUID(),
        status: payload.status || "New",
        captured_by: payload.captured_by || "Orders Desk",
        created_at: now,
        updated_at: now,
      });

      setOrders((current) => {
        const next = [draft, ...current];
        saveLocalOrders(next);
        return next;
      });

      try {
        const currentSellerId = await resolveSellerId();

        if (!currentSellerId) {
          setSyncStatus("Local mode");
          return draft;
        }

        const { data, error: insertError } = await supabase
          .from(ORDER_TABLE)
          .insert(buildDbOrder(draft, currentSellerId))
          .select()
          .single();

        if (insertError) throw insertError;

        const saved = normalizeOrder(data);

        setOrders((current) => {
          const next = current.map((item) => (item.id === draft.id ? saved : item));
          saveLocalOrders(next);
          return next;
        });

        setSyncStatus("Cloud synced");
        return saved;
      } catch (insertError) {
        console.info("Order saved locally after cloud insert failed:", insertError?.message);
        setError(insertError?.message || "");
        setSyncStatus("Local mode");
        return draft;
      }
    },
    [resolveSellerId]
  );

  const updateOrderStatus = useCallback(async (orderId, status) => {
    setError("");

    const now = new Date().toISOString();

    setOrders((current) => {
      const next = current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status,
              payment_status: toDbPaymentStatus(status),
              updated_at: now,
            }
          : order
      );

      saveLocalOrders(next);
      return next;
    });

    try {
      const { error: updateError } = await supabase
        .from(ORDER_TABLE)
        .update({
          order_status: toDbOrderStatus(status),
          payment_status: toDbPaymentStatus(status),
          updated_at: now,
        })
        .eq("id", orderId);

      if (updateError) throw updateError;

      setSyncStatus("Cloud synced");
    } catch (updateError) {
      console.info("Order status saved locally:", updateError?.message);
      setError(updateError?.message || "");
      setSyncStatus("Local mode");
    }
  }, []);

  const updateOrder = useCallback(async (orderId, changes) => {
    setError("");

    const now = new Date().toISOString();

    setOrders((current) => {
      const next = current.map((order) =>
        order.id === orderId ? normalizeOrder({ ...order, ...changes, updated_at: now }) : order
      );

      saveLocalOrders(next);
      return next;
    });

    try {
      const current = orders.find((order) => order.id === orderId);
      const merged = normalizeOrder({ ...current, ...changes });

      const { error: updateError } = await supabase
        .from(ORDER_TABLE)
        .update({
          product_name: merged.product,
          customer_name: merged.customer_name,
          customer_phone: merged.phone,
          customer_location: merged.location,
          amount: merged.amount,
          quantity: merged.quantity,
          source_platform: merged.source,
          comment_text: merged.comment_text,
          notes: merged.note,
          updated_at: now,
        })
        .eq("id", orderId);

      if (updateError) throw updateError;

      setSyncStatus("Cloud synced");
    } catch (updateError) {
      console.info("Order update saved locally:", updateError?.message);
      setError(updateError?.message || "");
      setSyncStatus("Local mode");
    }
  }, [orders]);

  const deleteOrder = useCallback(async (orderId) => {
    setOrders((current) => {
      const next = current.filter((order) => order.id !== orderId);
      saveLocalOrders(next);
      return next;
    });

    try {
      const { error: deleteError } = await supabase
        .from(ORDER_TABLE)
        .delete()
        .eq("id", orderId);

      if (deleteError) throw deleteError;

      setSyncStatus("Cloud synced");
    } catch (deleteError) {
      console.info("Order delete local only:", deleteError?.message);
      setSyncStatus("Local mode");
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!sellerId) return undefined;

    const channel = supabase
      .channel(`live-orders-${sellerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: ORDER_TABLE,
          filter: `seller_id=eq.${sellerId}`,
        },
        () => loadOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, loadOrders]);

  const value = {
    orders,
    sortedOrders,
    totals,
    sellerId,
    loading,
    error,
    syncStatus,

    loadOrders,
    createOrder,
    updateOrder,
    updateOrderStatus,
    deleteOrder,
    resolveSellerId,

    normalizeOrder,
    normalizeAmount,
  };

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders() {
  const context = useContext(OrdersContext);

  if (!context) {
    throw new Error("useOrders must be used inside OrdersProvider");
  }

  return context;
}

export default OrdersContext;
