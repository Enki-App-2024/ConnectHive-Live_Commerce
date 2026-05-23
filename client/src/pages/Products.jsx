import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { supabase } from "../services/supabaseClient";

const LOCAL_MODERATORS_KEY = "connecthive_live_moderators";
const LOCAL_NOTES_KEY = "connecthive_live_moderator_notes";

const ROLE_PRESETS = [
  "Order Capture",
  "Payment Follow-up",
  "Customer Support",
  "Inventory Runner",
  "Delivery Coordinator",
  "Lead Moderator",
];

const STATUS_OPTIONS = [
  "Active",
  "Pending Invite",
  "Offline",
  "Paused",
];

const defaultModeratorForm = {
  name: "",
  email: "",
  phone: "",
  role: "Order Capture",
  device: "Unknown",
  status: "Pending Invite",
  access_level: "Moderator",
  shift: "Current Live",
  notes: "",
};

const defaultNoteForm = {
  title: "",
  priority: "Normal",
  note: "",
};

function safeRead(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save ${key}`, error);
  }
}

function makeModeratorPayload(formData) {
  const now = new Date().toISOString();

  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()),
    name: formData.name.trim(),
    email: formData.email.trim(),
    phone: formData.phone.trim(),
    role: formData.role,
    device: formData.device || "Unknown",
    status: formData.status || "Pending Invite",
    access_level: formData.access_level || "Moderator",
    shift: formData.shift || "Current Live",
    notes: formData.notes.trim(),
    orders_handled: 0,
    payments_confirmed: 0,
    support_replies: 0,
    last_seen: now,
    created_at: now,
  };
}

function makeNotePayload(formData) {
  const now = new Date().toISOString();

  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `note-${Date.now()}`,
    title: formData.title.trim(),
    priority: formData.priority,
    note: formData.note.trim(),
    status: "Open",
    created_at: now,
  };
}

function formatTime(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function Moderators() {
  const [moderators, setModerators] = useState([]);
  const [supportNotes, setSupportNotes] = useState([]);
  const [formData, setFormData] = useState(defaultModeratorForm);
  const [noteForm, setNoteForm] = useState(defaultNoteForm);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [editingId, setEditingId] = useState(null);
  const [syncState, setSyncState] = useState("Checking");
  const [errorMessage, setErrorMessage] = useState("");

  const isCloudMode = syncState === "Cloud";

  useEffect(() => {
    loadModerators();
    loadSupportNotes();
  }, []);

  useEffect(() => {
    safeWrite(LOCAL_MODERATORS_KEY, moderators);
  }, [moderators]);

  useEffect(() => {
    safeWrite(LOCAL_NOTES_KEY, supportNotes);
  }, [supportNotes]);

  async function loadModerators() {
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("live_moderators")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setModerators(data || []);
      setSyncState("Cloud");
    } catch (error) {
      console.warn("Using local moderator mode:", error.message);
      setModerators(safeRead(LOCAL_MODERATORS_KEY, []));
      setSyncState("Local");
      setErrorMessage(
        "Local mode active. Create the live_moderators table when ready to sync this team to Supabase."
      );
    }
  }

  async function loadSupportNotes() {
    try {
      const { data, error } = await supabase
        .from("live_support_notes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) throw error;

      setSupportNotes(data || []);
    } catch (error) {
      console.warn("Using local support notes:", error.message);
      setSupportNotes(safeRead(LOCAL_NOTES_KEY, []));
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleNoteChange(event) {
    const { name, value } = event.target;

    setNoteForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function saveModerator(event) {
    event.preventDefault();

    if (!formData.name.trim()) {
      setErrorMessage("Add the moderator name before saving.");
      return;
    }

    const payload = makeModeratorPayload(formData);

    if (editingId) {
      const updatedPayload = {
        ...payload,
        id: editingId,
        created_at:
          moderators.find((moderator) => moderator.id === editingId)
            ?.created_at || payload.created_at,
      };

      setModerators((previous) =>
        previous.map((moderator) =>
          moderator.id === editingId
            ? {
                ...moderator,
                ...updatedPayload,
              }
            : moderator
        )
      );

      if (isCloudMode) {
        const { error } = await supabase
          .from("live_moderators")
          .update({
            name: updatedPayload.name,
            email: updatedPayload.email,
            phone: updatedPayload.phone,
            role: updatedPayload.role,
            device: updatedPayload.device,
            status: updatedPayload.status,
            access_level: updatedPayload.access_level,
            shift: updatedPayload.shift,
            notes: updatedPayload.notes,
            last_seen: updatedPayload.last_seen,
          })
          .eq("id", editingId);

        if (error) {
          setErrorMessage(error.message);
        }
      }
    } else {
      setModerators((previous) => [payload, ...previous]);

      if (isCloudMode) {
        const { error } = await supabase
          .from("live_moderators")
          .insert(payload);

        if (error) {
          setErrorMessage(error.message);
        }
      }
    }

    setEditingId(null);
    setFormData(defaultModeratorForm);
  }

  function editModerator(moderator) {
    setEditingId(moderator.id);
    setFormData({
      name: moderator.name || "",
      email: moderator.email || "",
      phone: moderator.phone || "",
      role: moderator.role || "Order Capture",
      device: moderator.device || "Unknown",
      status: moderator.status || "Pending Invite",
      access_level: moderator.access_level || "Moderator",
      shift: moderator.shift || "Current Live",
      notes: moderator.notes || "",
    });
  }

  async function updateModeratorStatus(id, status) {
    const now = new Date().toISOString();

    setModerators((previous) =>
      previous.map((moderator) =>
        moderator.id === id
          ? {
              ...moderator,
              status,
              last_seen: now,
            }
          : moderator
      )
    );

    if (isCloudMode) {
      const { error } = await supabase
        .from("live_moderators")
        .update({ status, last_seen: now })
        .eq("id", id);

      if (error) {
        setErrorMessage(error.message);
      }
    }
  }

  async function removeModerator(id) {
    const shouldRemove = window.confirm(
      "Remove this moderator from the live support team?"
    );

    if (!shouldRemove) return;

    setModerators((previous) =>
      previous.filter((moderator) => moderator.id !== id)
    );

    if (isCloudMode) {
      const { error } = await supabase
        .from("live_moderators")
        .delete()
        .eq("id", id);

      if (error) {
        setErrorMessage(error.message);
      }
    }
  }

  async function addSupportNote(event) {
    event.preventDefault();

    if (!noteForm.title.trim() || !noteForm.note.trim()) {
      setErrorMessage("Add a title and note before posting to support chat.");
      return;
    }

    const payload = makeNotePayload(noteForm);

    setSupportNotes((previous) => [payload, ...previous]);

    if (isCloudMode) {
      const { error } = await supabase
        .from("live_support_notes")
        .insert(payload);

      if (error) {
        setErrorMessage(error.message);
      }
    }

    setNoteForm(defaultNoteForm);
  }

  async function closeSupportNote(id) {
    setSupportNotes((previous) =>
      previous.map((note) =>
        note.id === id
          ? {
              ...note,
              status: note.status === "Closed" ? "Open" : "Closed",
            }
          : note
      )
    );

    if (isCloudMode) {
      const current = supportNotes.find((note) => note.id === id);
      const nextStatus = current?.status === "Closed" ? "Open" : "Closed";

      const { error } = await supabase
        .from("live_support_notes")
        .update({ status: nextStatus })
        .eq("id", id);

      if (error) {
        setErrorMessage(error.message);
      }
    }
  }

  function exportModerators() {
    const rows = [
      [
        "Name",
        "Email",
        "Phone",
        "Role",
        "Status",
        "Device",
        "Shift",
        "Orders Handled",
        "Payments Confirmed",
        "Support Replies",
      ],
      ...filteredModerators.map((moderator) => [
        moderator.name || "",
        moderator.email || "",
        moderator.phone || "",
        moderator.role || "",
        moderator.status || "",
        moderator.device || "",
        moderator.shift || "",
        moderator.orders_handled || 0,
        moderator.payments_confirmed || 0,
        moderator.support_replies || 0,
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `connecthive-moderators-${Date.now()}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  const filteredModerators = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return moderators.filter((moderator) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          moderator.name,
          moderator.email,
          moderator.phone,
          moderator.role,
          moderator.device,
          moderator.shift,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesRole =
        roleFilter === "All" || moderator.role === roleFilter;

      const matchesStatus =
        statusFilter === "All" || moderator.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [moderators, roleFilter, searchTerm, statusFilter]);

  const summary = useMemo(() => {
    const active = moderators.filter(
      (moderator) => moderator.status === "Active"
    ).length;

    const pending = moderators.filter(
      (moderator) => moderator.status === "Pending Invite"
    ).length;

    const availableRoles = new Set(
      moderators.map((moderator) => moderator.role).filter(Boolean)
    ).size;

    const handledOrders = moderators.reduce(
      (sum, moderator) => sum + Number(moderator.orders_handled || 0),
      0
    );

    return {
      total: moderators.length,
      active,
      pending,
      availableRoles,
      handledOrders,
    };
  }, [moderators]);

  return (
    <DashboardLayout>
      <section className="moderators-page">
        <div className="moderators-hero">
          <div>
            <div className="page-kicker">LIVE SUPPORT TEAM</div>

            <h1 className="page-title">
              Build the team that keeps <span>sales moving</span>
            </h1>

            <p className="page-subtitle">
              Assign moderators to capture orders, confirm payments, track
              delivery questions and keep the seller focused on the live show.
            </p>
          </div>

          <div className="moderators-hero-actions">
            <span
              className={`sync-pill ${
                isCloudMode ? "sync-pill-cloud" : "sync-pill-local"
              }`}
            >
              {isCloudMode ? "Cloud sync" : "Local mode"}
            </span>

            <button
              className="btn-secondary"
              type="button"
              onClick={loadModerators}
            >
              Refresh
            </button>

            <button
              className="btn-primary"
              type="button"
              onClick={exportModerators}
            >
              Export Team
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="moderator-alert">
            {errorMessage}
          </div>
        )}

        <div className="moderators-summary">
          <article>
            <p>Total Team</p>
            <strong>{summary.total}</strong>
            <span>All live support users</span>
          </article>

          <article>
            <p>Active Now</p>
            <strong>{summary.active}</strong>
            <span>Ready for today&apos;s live</span>
          </article>

          <article>
            <p>Pending Invites</p>
            <strong>{summary.pending}</strong>
            <span>Need onboarding</span>
          </article>

          <article>
            <p>Orders Handled</p>
            <strong>{summary.handledOrders}</strong>
            <span>Team activity counter</span>
          </article>
        </div>

        <div className="moderators-command-grid">
          <form
            className="moderator-form-card"
            onSubmit={saveModerator}
          >
            <div className="panel-header">
              <div>
                <h2>{editingId ? "Edit Moderator" : "Add Moderator"}</h2>
                <p>
                  Keep roles simple so everyone knows exactly what to do during
                  a busy live session.
                </p>
              </div>

              <span className="status-pill">
                {editingId ? "Editing" : "Team Access"}
              </span>
            </div>

            <div className="moderator-form-grid">
              <input
                className="form-input"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Moderator name"
              />

              <input
                className="form-input"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Email address"
                type="email"
              />

              <input
                className="form-input"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Phone / WhatsApp number"
              />

              <select
                className="form-select"
                name="role"
                value={formData.role}
                onChange={handleChange}
              >
                {ROLE_PRESETS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>

              <select
                className="form-select"
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>

              <select
                className="form-select"
                name="device"
                value={formData.device}
                onChange={handleChange}
              >
                <option value="Unknown">Unknown Device</option>
                <option value="Android">Android</option>
                <option value="iPhone">iPhone</option>
                <option value="Laptop">Laptop</option>
                <option value="Tablet">Tablet</option>
              </select>

              <input
                className="form-input"
                name="shift"
                value={formData.shift}
                onChange={handleChange}
                placeholder="Shift e.g. 8PM Live"
              />

              <select
                className="form-select"
                name="access_level"
                value={formData.access_level}
                onChange={handleChange}
              >
                <option value="Moderator">Moderator</option>
                <option value="Lead Moderator">Lead Moderator</option>
                <option value="Seller Assistant">Seller Assistant</option>
                <option value="Read Only">Read Only</option>
              </select>

              <textarea
                className="form-textarea moderator-notes-input"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Notes e.g. Handles M-Pesa follow-ups and delivery comments"
              />
            </div>

            <div className="moderator-form-actions">
              <button className="btn-primary" type="submit">
                {editingId ? "Save Changes" : "Add Moderator"}
              </button>

              {editingId && (
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setFormData(defaultModeratorForm);
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <aside className="support-room-card">
            <div className="panel-header">
              <div>
                <h2>Live Support Chat</h2>
                <p>
                  A fast internal note room for delivery issues, payment checks
                  and customer questions.
                </p>
              </div>

              <span className="support-count">
                {supportNotes.filter((note) => note.status !== "Closed").length}
              </span>
            </div>

            <form
              className="support-note-form"
              onSubmit={addSupportNote}
            >
              <input
                className="form-input"
                name="title"
                value={noteForm.title}
                onChange={handleNoteChange}
                placeholder="Short alert title"
              />

              <select
                className="form-select"
                name="priority"
                value={noteForm.priority}
                onChange={handleNoteChange}
              >
                <option value="Normal">Normal</option>
                <option value="Urgent">Urgent</option>
                <option value="Payment">Payment</option>
                <option value="Delivery">Delivery</option>
              </select>

              <textarea
                className="form-textarea"
                name="note"
                value={noteForm.note}
                onChange={handleNoteChange}
                placeholder="Example: Customer Mary asked for delivery to Nakuru. Confirm fee before payment."
              />

              <button className="btn-primary" type="submit">
                Post Note
              </button>
            </form>

            <div className="support-notes-list">
              {supportNotes.length === 0 ? (
                <div className="empty-support-state">
                  No support notes yet. During a live, this becomes the team
                  memory.
                </div>
              ) : (
                supportNotes.map((note) => (
                  <article
                    className={`support-note-card ${
                      note.status === "Closed" ? "is-closed" : ""
                    }`}
                    key={note.id}
                  >
                    <div>
                      <strong>{note.title}</strong>
                      <p>{note.note}</p>
                      <span>
                        {note.priority} • {formatTime(note.created_at)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => closeSupportNote(note.id)}
                    >
                      {note.status === "Closed" ? "Reopen" : "Close"}
                    </button>
                  </article>
                ))
              )}
            </div>
          </aside>
        </div>

        <div className="moderators-toolbar">
          <input
            className="form-input"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search moderators by name, role, phone or device..."
          />

          <select
            className="form-select"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="All">All Roles</option>
            {ROLE_PRESETS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <select
            className="form-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="All">All Statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="moderators-list">
          {filteredModerators.length === 0 ? (
            <div className="empty-moderators-state">
              <h3>No moderators found</h3>
              <p>
                Add your first sales assistant, payment checker or delivery
                coordinator above.
              </p>
            </div>
          ) : (
            filteredModerators.map((moderator) => (
              <article
                className="moderator-card"
                key={moderator.id}
              >
                <div className="moderator-card-top">
                  <div className="moderator-avatar">
                    {moderator.name?.charAt(0)?.toUpperCase() || "M"}
                  </div>

                  <div>
                    <h3>{moderator.name}</h3>
                    <p>{moderator.role}</p>
                  </div>

                  <span
                    className={`moderator-status ${String(
                      moderator.status || "offline"
                    )
                      .toLowerCase()
                      .replace(/\s/g, "-")}`}
                  >
                    {moderator.status || "Offline"}
                  </span>
                </div>

                <div className="moderator-contact">
                  <span>{moderator.email || "No email added"}</span>
                  <span>{moderator.phone || "No phone added"}</span>
                </div>

                {moderator.notes && (
                  <p className="moderator-note">
                    {moderator.notes}
                  </p>
                )}

                <div className="moderator-meta">
                  <div>
                    <span>Device</span>
                    <strong>{moderator.device || "Unknown"}</strong>
                  </div>

                  <div>
                    <span>Access</span>
                    <strong>{moderator.access_level || "Moderator"}</strong>
                  </div>

                  <div>
                    <span>Shift</span>
                    <strong>{moderator.shift || "Current Live"}</strong>
                  </div>

                  <div>
                    <span>Last Seen</span>
                    <strong>{formatTime(moderator.last_seen)}</strong>
                  </div>
                </div>

                <div className="moderator-performance">
                  <div>
                    <strong>{moderator.orders_handled || 0}</strong>
                    <span>Orders</span>
                  </div>

                  <div>
                    <strong>{moderator.payments_confirmed || 0}</strong>
                    <span>Payments</span>
                  </div>

                  <div>
                    <strong>{moderator.support_replies || 0}</strong>
                    <span>Replies</span>
                  </div>
                </div>

                <div className="moderator-actions">
                  <button
                    type="button"
                    onClick={() =>
                      updateModeratorStatus(moderator.id, "Active")
                    }
                  >
                    Mark Active
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateModeratorStatus(moderator.id, "Paused")
                    }
                  >
                    Pause
                  </button>

                  <button
                    type="button"
                    onClick={() => editModerator(moderator)}
                  >
                    Edit
                  </button>

                  <button
                    className="danger-action"
                    type="button"
                    onClick={() => removeModerator(moderator.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </DashboardLayout>
  );
}

export default Moderators;
