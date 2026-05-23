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

const ModeratorsContext = createContext(null);

const MODERATORS_TABLE = "live_moderators";
const SUPPORT_NOTES_TABLE = "live_support_notes";
const SELLERS_TABLE = "live_sellers";

const LOCAL_MODERATORS_KEY = "connecthive_live_moderators_v1";
const LEGACY_MODERATORS_KEY = "connecthive_live_moderators";
const LOCAL_NOTES_KEY = "connecthive_live_support_notes_v1";
const SELLER_ID_KEY = "connecthive_live_seller_id";
const SELLER_PROFILE_KEY = "connecthive_live_seller_profile";

export const MODERATOR_ROLES = [
  "owner",
  "manager",
  "moderator",
  "support",
  "payment_checker",
];

export const MODERATOR_STATUS = ["active", "paused", "invited", "removed"];

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"];

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

function normalizeModerator(moderator = {}) {
  return {
    id: moderator.id || crypto.randomUUID(),
    seller_id: moderator.seller_id || null,

    name: moderator.name || moderator.full_name || "",
    email: moderator.email || "",
    phone: moderator.phone || "",
    role: moderator.role || "moderator",
    status: moderator.status || "active",
    permissions: moderator.permissions || {},

    created_at: moderator.created_at || moderator.createdAt || new Date().toISOString(),
    updated_at: moderator.updated_at || moderator.updatedAt || new Date().toISOString(),
  };
}

function normalizeNote(note = {}) {
  return {
    id: note.id || crypto.randomUUID(),
    seller_id: note.seller_id || null,
    moderator_id: note.moderator_id || null,
    order_id: note.order_id || null,

    note: note.note || note.message || "",
    priority: note.priority || "normal",

    created_at: note.created_at || note.createdAt || new Date().toISOString(),
  };
}

function readLocalModerators() {
  const primary = readLocal(LOCAL_MODERATORS_KEY, null);
  if (Array.isArray(primary)) return primary.map(normalizeModerator);

  const legacy = readLocal(LEGACY_MODERATORS_KEY, null);
  if (Array.isArray(legacy)) return legacy.map(normalizeModerator);

  return [];
}

function readLocalNotes() {
  const notes = readLocal(LOCAL_NOTES_KEY, null);
  return Array.isArray(notes) ? notes.map(normalizeNote) : [];
}

function saveLocalModerators(moderators) {
  const normalized = moderators.map(normalizeModerator);
  writeLocal(LOCAL_MODERATORS_KEY, normalized);
  writeLocal(LEGACY_MODERATORS_KEY, normalized);
  window.dispatchEvent(new Event("connecthive-moderators-updated"));
}

function saveLocalNotes(notes) {
  const normalized = notes.map(normalizeNote);
  writeLocal(LOCAL_NOTES_KEY, normalized);
  window.dispatchEvent(new Event("connecthive-support-notes-updated"));
}

function buildDbModerator(moderator, sellerId) {
  const normalized = normalizeModerator(moderator);

  return {
    seller_id: sellerId,
    name: normalized.name,
    email: normalized.email,
    phone: normalized.phone,
    role: normalized.role,
    status: normalized.status,
    permissions: normalized.permissions || {},
  };
}

function buildDbNote(note, sellerId) {
  const normalized = normalizeNote(note);

  return {
    seller_id: sellerId,
    moderator_id: normalized.moderator_id,
    order_id: normalized.order_id,
    note: normalized.note,
    priority: normalized.priority,
  };
}

export function ModeratorsProvider({ children }) {
  const { user } = useAuth();

  const [moderators, setModerators] = useState(() => readLocalModerators());
  const [supportNotes, setSupportNotes] = useState(() => readLocalNotes());
  const [sellerId, setSellerId] = useState(() => readLocal(SELLER_ID_KEY, null));
  const [syncStatus, setSyncStatus] = useState("Local ready");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeModerators = useMemo(() => {
    return moderators.filter((moderator) => moderator.status === "active");
  }, [moderators]);

  const moderatorStats = useMemo(() => {
    return {
      total: moderators.length,
      active: moderators.filter((moderator) => moderator.status === "active").length,
      paused: moderators.filter((moderator) => moderator.status === "paused").length,
      invited: moderators.filter((moderator) => moderator.status === "invited").length,
      removed: moderators.filter((moderator) => moderator.status === "removed").length,
      urgentNotes: supportNotes.filter((note) => note.priority === "urgent").length,
      notes: supportNotes.length,
    };
  }, [moderators, supportNotes]);

  const sortedModerators = useMemo(() => {
    const roleWeight = {
      owner: 1,
      manager: 2,
      payment_checker: 3,
      support: 4,
      moderator: 5,
    };

    return [...moderators].sort((a, b) => {
      const statusWeightA = a.status === "active" ? 0 : 1;
      const statusWeightB = b.status === "active" ? 0 : 1;

      if (statusWeightA !== statusWeightB) return statusWeightA - statusWeightB;

      return (roleWeight[a.role] || 9) - (roleWeight[b.role] || 9);
    });
  }, [moderators]);

  const sortedSupportNotes = useMemo(() => {
    const priorityWeight = {
      urgent: 1,
      high: 2,
      normal: 3,
      low: 4,
    };

    return [...supportNotes].sort((a, b) => {
      const prioritySort = (priorityWeight[a.priority] || 9) - (priorityWeight[b.priority] || 9);

      if (prioritySort !== 0) return prioritySort;

      const left = new Date(a.created_at || 0).getTime();
      const right = new Date(b.created_at || 0).getTime();

      return right - left;
    });
  }, [supportNotes]);

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
      console.info("Moderators seller bridge unavailable:", sellerError?.message);
      return null;
    }

    writeLocal(SELLER_ID_KEY, seller.id);
    setSellerId(seller.id);

    return seller.id;
  }, [user]);

  const loadModerators = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const currentSellerId = await resolveSellerId();

      if (!currentSellerId) {
        setModerators(readLocalModerators());
        setSupportNotes(readLocalNotes());
        setSyncStatus("Local mode");
        return;
      }

      setSyncStatus("Syncing...");

      const [moderatorResult, notesResult] = await Promise.all([
        supabase
          .from(MODERATORS_TABLE)
          .select("*")
          .eq("seller_id", currentSellerId)
          .order("created_at", { ascending: false }),

        supabase
          .from(SUPPORT_NOTES_TABLE)
          .select("*")
          .eq("seller_id", currentSellerId)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      if (moderatorResult.error) throw moderatorResult.error;
      if (notesResult.error) throw notesResult.error;

      const nextModerators = (moderatorResult.data || []).map(normalizeModerator);
      const nextNotes = (notesResult.data || []).map(normalizeNote);

      setModerators(nextModerators);
      setSupportNotes(nextNotes);

      saveLocalModerators(nextModerators);
      saveLocalNotes(nextNotes);

      setSyncStatus("Cloud synced");
    } catch (loadError) {
      console.info("Moderators cloud load fallback:", loadError?.message || loadError);
      setError(loadError?.message || "");
      setModerators(readLocalModerators());
      setSupportNotes(readLocalNotes());
      setSyncStatus("Local mode");
    } finally {
      setLoading(false);
    }
  }, [resolveSellerId]);

  const createModerator = useCallback(
    async (payload) => {
      setError("");

      const now = new Date().toISOString();
      const draft = normalizeModerator({
        ...payload,
        id: crypto.randomUUID(),
        status: payload.status || "active",
        role: payload.role || "moderator",
        created_at: now,
        updated_at: now,
      });

      setModerators((current) => {
        const next = [draft, ...current];
        saveLocalModerators(next);
        return next;
      });

      try {
        const currentSellerId = await resolveSellerId();

        if (!currentSellerId) {
          setSyncStatus("Local mode");
          return draft;
        }

        const { data, error: insertError } = await supabase
          .from(MODERATORS_TABLE)
          .insert(buildDbModerator(draft, currentSellerId))
          .select()
          .single();

        if (insertError) throw insertError;

        const saved = normalizeModerator(data);

        setModerators((current) => {
          const next = current.map((item) => (item.id === draft.id ? saved : item));
          saveLocalModerators(next);
          return next;
        });

        setSyncStatus("Cloud synced");
        return saved;
      } catch (insertError) {
        console.info("Moderator saved locally after cloud insert failed:", insertError?.message);
        setError(insertError?.message || "");
        setSyncStatus("Local mode");
        return draft;
      }
    },
    [resolveSellerId]
  );

  const updateModerator = useCallback(
    async (moderatorId, changes) => {
      setError("");

      const now = new Date().toISOString();

      setModerators((current) => {
        const next = current.map((moderator) =>
          moderator.id === moderatorId
            ? normalizeModerator({ ...moderator, ...changes, updated_at: now })
            : moderator
        );

        saveLocalModerators(next);
        return next;
      });

      try {
        const current = moderators.find((moderator) => moderator.id === moderatorId);
        const merged = normalizeModerator({ ...current, ...changes, updated_at: now });

        const { error: updateError } = await supabase
          .from(MODERATORS_TABLE)
          .update({
            name: merged.name,
            email: merged.email,
            phone: merged.phone,
            role: merged.role,
            status: merged.status,
            permissions: merged.permissions || {},
            updated_at: now,
          })
          .eq("id", moderatorId);

        if (updateError) throw updateError;

        setSyncStatus("Cloud synced");
      } catch (updateError) {
        console.info("Moderator update saved locally:", updateError?.message);
        setError(updateError?.message || "");
        setSyncStatus("Local mode");
      }
    },
    [moderators]
  );

  const pauseModerator = useCallback(
    async (moderatorId) => updateModerator(moderatorId, { status: "paused" }),
    [updateModerator]
  );

  const activateModerator = useCallback(
    async (moderatorId) => updateModerator(moderatorId, { status: "active" }),
    [updateModerator]
  );

  const removeModerator = useCallback(
    async (moderatorId) => updateModerator(moderatorId, { status: "removed" }),
    [updateModerator]
  );

  const deleteModerator = useCallback(async (moderatorId) => {
    setModerators((current) => {
      const next = current.filter((moderator) => moderator.id !== moderatorId);
      saveLocalModerators(next);
      return next;
    });

    try {
      const { error: deleteError } = await supabase
        .from(MODERATORS_TABLE)
        .delete()
        .eq("id", moderatorId);

      if (deleteError) throw deleteError;

      setSyncStatus("Cloud synced");
    } catch (deleteError) {
      console.info("Moderator delete local only:", deleteError?.message);
      setSyncStatus("Local mode");
    }
  }, []);

  const createSupportNote = useCallback(
    async (payload) => {
      setError("");

      const draft = normalizeNote({
        ...payload,
        id: crypto.randomUUID(),
        priority: payload.priority || "normal",
        created_at: new Date().toISOString(),
      });

      setSupportNotes((current) => {
        const next = [draft, ...current];
        saveLocalNotes(next);
        return next;
      });

      try {
        const currentSellerId = await resolveSellerId();

        if (!currentSellerId) {
          setSyncStatus("Local mode");
          return draft;
        }

        const { data, error: insertError } = await supabase
          .from(SUPPORT_NOTES_TABLE)
          .insert(buildDbNote(draft, currentSellerId))
          .select()
          .single();

        if (insertError) throw insertError;

        const saved = normalizeNote(data);

        setSupportNotes((current) => {
          const next = current.map((item) => (item.id === draft.id ? saved : item));
          saveLocalNotes(next);
          return next;
        });

        setSyncStatus("Cloud synced");
        return saved;
      } catch (insertError) {
        console.info("Support note saved locally after cloud insert failed:", insertError?.message);
        setError(insertError?.message || "");
        setSyncStatus("Local mode");
        return draft;
      }
    },
    [resolveSellerId]
  );

  const deleteSupportNote = useCallback(async (noteId) => {
    setSupportNotes((current) => {
      const next = current.filter((note) => note.id !== noteId);
      saveLocalNotes(next);
      return next;
    });

    try {
      const { error: deleteError } = await supabase
        .from(SUPPORT_NOTES_TABLE)
        .delete()
        .eq("id", noteId);

      if (deleteError) throw deleteError;

      setSyncStatus("Cloud synced");
    } catch (deleteError) {
      console.info("Support note delete local only:", deleteError?.message);
      setSyncStatus("Local mode");
    }
  }, []);

  useEffect(() => {
    loadModerators();
  }, [loadModerators]);

  useEffect(() => {
    if (!sellerId) return undefined;

    const moderatorsChannel = supabase
      .channel(`live-moderators-${sellerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: MODERATORS_TABLE,
          filter: `seller_id=eq.${sellerId}`,
        },
        () => loadModerators()
      )
      .subscribe();

    const notesChannel = supabase
      .channel(`live-support-notes-${sellerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: SUPPORT_NOTES_TABLE,
          filter: `seller_id=eq.${sellerId}`,
        },
        () => loadModerators()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(moderatorsChannel);
      supabase.removeChannel(notesChannel);
    };
  }, [sellerId, loadModerators]);

  const value = {
    moderators,
    sortedModerators,
    activeModerators,
    supportNotes,
    sortedSupportNotes,
    moderatorStats,
    sellerId,
    loading,
    error,
    syncStatus,

    loadModerators,
    createModerator,
    updateModerator,
    pauseModerator,
    activateModerator,
    removeModerator,
    deleteModerator,
    createSupportNote,
    deleteSupportNote,
    resolveSellerId,

    normalizeModerator,
    normalizeNote,
  };

  return (
    <ModeratorsContext.Provider value={value}>
      {children}
    </ModeratorsContext.Provider>
  );
}

export function useModerators() {
  const context = useContext(ModeratorsContext);

  if (!context) {
    throw new Error("useModerators must be used inside ModeratorsProvider");
  }

  return context;
}

export default ModeratorsContext;
