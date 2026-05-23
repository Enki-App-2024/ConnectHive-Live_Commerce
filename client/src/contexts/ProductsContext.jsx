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

const ProductsContext = createContext(null);

const PRODUCTS_TABLE = "live_products";
const SELLERS_TABLE = "live_sellers";

const LOCAL_PRODUCTS_KEY = "connecthive_live_products_v1";
const LEGACY_PRODUCTS_KEY = "connecthive-live-products-v1";
const SELLER_ID_KEY = "connecthive_live_seller_id";
const SELLER_PROFILE_KEY = "connecthive_live_seller_profile";

export const PRODUCT_STATUS_OPTIONS = ["active", "draft", "sold_out", "archived"];

export const PRODUCT_CATEGORY_OPTIONS = [
  "Fashion",
  "Beauty",
  "Electronics",
  "Food",
  "Home",
  "Services",
  "Other",
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
    // Browser storage can fail in private mode.
  }
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : fallback;
}

function normalizeProduct(product = {}) {
  return {
    id: product.id || crypto.randomUUID(),
    seller_id: product.seller_id || null,

    name: product.name || product.product_name || "",
    sku: product.sku || "",
    price: normalizeNumber(product.price),
    stock: Number(product.stock ?? product.quantity ?? 0),
    category: product.category || "Other",
    image_url: product.image_url || product.imageUrl || "",
    status: product.status || "active",
    is_pinned: Boolean(product.is_pinned ?? product.isPinned ?? false),
    notes: product.notes || product.note || "",

    created_at: product.created_at || product.createdAt || new Date().toISOString(),
    updated_at: product.updated_at || product.updatedAt || new Date().toISOString(),
  };
}

function readLocalProducts() {
  const primary = readLocal(LOCAL_PRODUCTS_KEY, null);
  if (Array.isArray(primary)) return primary.map(normalizeProduct);

  const legacy = readLocal(LEGACY_PRODUCTS_KEY, null);
  if (Array.isArray(legacy)) return legacy.map(normalizeProduct);

  return [];
}

function saveLocalProducts(products) {
  const normalized = products.map(normalizeProduct);
  writeLocal(LOCAL_PRODUCTS_KEY, normalized);
  writeLocal(LEGACY_PRODUCTS_KEY, normalized);
  window.dispatchEvent(new Event("connecthive-products-updated"));
}

function buildDbProduct(product, sellerId) {
  const normalized = normalizeProduct(product);

  return {
    seller_id: sellerId,
    name: normalized.name,
    sku: normalized.sku,
    price: normalized.price,
    stock: normalized.stock,
    category: normalized.category,
    image_url: normalized.image_url,
    status: normalized.status,
    is_pinned: normalized.is_pinned,
    notes: normalized.notes,
  };
}

export function ProductsProvider({ children }) {
  const { user } = useAuth();

  const [products, setProducts] = useState(() => readLocalProducts());
  const [sellerId, setSellerId] = useState(() => readLocal(SELLER_ID_KEY, null));
  const [syncStatus, setSyncStatus] = useState("Local ready");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;

      const left = new Date(a.updated_at || a.created_at || 0).getTime();
      const right = new Date(b.updated_at || b.created_at || 0).getTime();

      return right - left;
    });
  }, [products]);

  const pinnedProduct = useMemo(() => {
    return products.find((product) => product.is_pinned) || null;
  }, [products]);

  const productStats = useMemo(() => {
    const active = products.filter((product) => product.status === "active");
    const soldOut = products.filter((product) => product.status === "sold_out");
    const archived = products.filter((product) => product.status === "archived");

    return {
      total: products.length,
      active: active.length,
      soldOut: soldOut.length,
      archived: archived.length,
      stockValue: products.reduce(
        (sum, product) => sum + normalizeNumber(product.price) * Number(product.stock || 0),
        0
      ),
      lowStock: products.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 5).length,
    };
  }, [products]);

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
      .from(SELLERS_TABLE)
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
      .from(SELLERS_TABLE)
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
          approval_status:
            Number(profile.selectedPlanPrice || 0) === 0 ? "approved" : "pending",
        },
        { onConflict: "user_id" }
      )
      .select("id")
      .single();

    if (sellerError || !seller?.id) {
      console.info("Products seller bridge unavailable:", sellerError?.message);
      return null;
    }

    writeLocal(SELLER_ID_KEY, seller.id);
    setSellerId(seller.id);

    return seller.id;
  }, [user]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const currentSellerId = await resolveSellerId();

      if (!currentSellerId) {
        setProducts(readLocalProducts());
        setSyncStatus("Local mode");
        return;
      }

      setSyncStatus("Syncing...");

      const { data, error: loadError } = await supabase
        .from(PRODUCTS_TABLE)
        .select("*")
        .eq("seller_id", currentSellerId)
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(500);

      if (loadError) throw loadError;

      const nextProducts = Array.isArray(data) ? data.map(normalizeProduct) : [];

      setProducts(nextProducts);
      saveLocalProducts(nextProducts);
      setSyncStatus("Cloud synced");
    } catch (loadError) {
      console.info("Products cloud load fallback:", loadError?.message || loadError);
      setError(loadError?.message || "");
      setProducts(readLocalProducts());
      setSyncStatus("Local mode");
    } finally {
      setLoading(false);
    }
  }, [resolveSellerId]);

  const createProduct = useCallback(
    async (payload) => {
      setError("");

      const now = new Date().toISOString();
      const draft = normalizeProduct({
        ...payload,
        id: crypto.randomUUID(),
        status: payload.status || "active",
        created_at: now,
        updated_at: now,
      });

      setProducts((current) => {
        const next = [draft, ...current];
        saveLocalProducts(next);
        return next;
      });

      try {
        const currentSellerId = await resolveSellerId();

        if (!currentSellerId) {
          setSyncStatus("Local mode");
          return draft;
        }

        const { data, error: insertError } = await supabase
          .from(PRODUCTS_TABLE)
          .insert(buildDbProduct(draft, currentSellerId))
          .select()
          .single();

        if (insertError) throw insertError;

        const saved = normalizeProduct(data);

        setProducts((current) => {
          const next = current.map((item) => (item.id === draft.id ? saved : item));
          saveLocalProducts(next);
          return next;
        });

        setSyncStatus("Cloud synced");
        return saved;
      } catch (insertError) {
        console.info("Product saved locally after cloud insert failed:", insertError?.message);
        setError(insertError?.message || "");
        setSyncStatus("Local mode");
        return draft;
      }
    },
    [resolveSellerId]
  );

  const updateProduct = useCallback(
    async (productId, changes) => {
      setError("");

      const now = new Date().toISOString();

      setProducts((current) => {
        const next = current.map((product) =>
          product.id === productId
            ? normalizeProduct({ ...product, ...changes, updated_at: now })
            : product
        );

        saveLocalProducts(next);
        return next;
      });

      try {
        const current = products.find((product) => product.id === productId);
        const merged = normalizeProduct({ ...current, ...changes, updated_at: now });

        const { error: updateError } = await supabase
          .from(PRODUCTS_TABLE)
          .update({
            name: merged.name,
            sku: merged.sku,
            price: merged.price,
            stock: merged.stock,
            category: merged.category,
            image_url: merged.image_url,
            status: merged.status,
            is_pinned: merged.is_pinned,
            notes: merged.notes,
            updated_at: now,
          })
          .eq("id", productId);

        if (updateError) throw updateError;

        setSyncStatus("Cloud synced");
      } catch (updateError) {
        console.info("Product update saved locally:", updateError?.message);
        setError(updateError?.message || "");
        setSyncStatus("Local mode");
      }
    },
    [products]
  );

  const pinProduct = useCallback(
    async (productId) => {
      setError("");

      const now = new Date().toISOString();

      setProducts((current) => {
        const next = current.map((product) => ({
          ...product,
          is_pinned: product.id === productId,
          updated_at: product.id === productId ? now : product.updated_at,
        }));

        saveLocalProducts(next);
        return next;
      });

      try {
        const currentSellerId = await resolveSellerId();

        if (!currentSellerId) {
          setSyncStatus("Local mode");
          return;
        }

        const { error: clearError } = await supabase
          .from(PRODUCTS_TABLE)
          .update({ is_pinned: false })
          .eq("seller_id", currentSellerId);

        if (clearError) throw clearError;

        const { error: pinError } = await supabase
          .from(PRODUCTS_TABLE)
          .update({ is_pinned: true, updated_at: now })
          .eq("id", productId);

        if (pinError) throw pinError;

        setSyncStatus("Cloud synced");
      } catch (pinError) {
        console.info("Product pin saved locally:", pinError?.message);
        setError(pinError?.message || "");
        setSyncStatus("Local mode");
      }
    },
    [resolveSellerId]
  );

  const unpinProduct = useCallback(async (productId) => {
    await updateProduct(productId, { is_pinned: false });
  }, [updateProduct]);

  const archiveProduct = useCallback(async (productId) => {
    await updateProduct(productId, { status: "archived", is_pinned: false });
  }, [updateProduct]);

  const duplicateProduct = useCallback(
    async (productId) => {
      const product = products.find((item) => item.id === productId);

      if (!product) return null;

      return createProduct({
        ...product,
        id: undefined,
        name: `${product.name} Copy`,
        sku: product.sku ? `${product.sku}-copy` : "",
        is_pinned: false,
        status: "draft",
      });
    },
    [products, createProduct]
  );

  const deleteProduct = useCallback(async (productId) => {
    setProducts((current) => {
      const next = current.filter((product) => product.id !== productId);
      saveLocalProducts(next);
      return next;
    });

    try {
      const { error: deleteError } = await supabase
        .from(PRODUCTS_TABLE)
        .delete()
        .eq("id", productId);

      if (deleteError) throw deleteError;

      setSyncStatus("Cloud synced");
    } catch (deleteError) {
      console.info("Product delete local only:", deleteError?.message);
      setSyncStatus("Local mode");
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!sellerId) return undefined;

    const channel = supabase
      .channel(`live-products-${sellerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: PRODUCTS_TABLE,
          filter: `seller_id=eq.${sellerId}`,
        },
        () => loadProducts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, loadProducts]);

  const value = {
    products,
    sortedProducts,
    pinnedProduct,
    productStats,
    sellerId,
    loading,
    error,
    syncStatus,

    loadProducts,
    createProduct,
    updateProduct,
    pinProduct,
    unpinProduct,
    archiveProduct,
    duplicateProduct,
    deleteProduct,
    resolveSellerId,

    normalizeProduct,
    normalizeNumber,
  };

  return (
    <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductsContext);

  if (!context) {
    throw new Error("useProducts must be used inside ProductsProvider");
  }

  return context;
}

export default ProductsContext;
