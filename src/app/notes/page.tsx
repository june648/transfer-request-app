"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AsinNote, NoteStatus, NOTE_STATUSES, Product } from "@/types/transfer";
import {
  isConfigured,
  fetchAsinNotes,
  createAsinNote,
  updateAsinNote,
  deleteAsinNote,
  searchProducts,
  uploadNoteScreenshot,
  createTransferForNote,
  deleteTransferByRequestId,
} from "@/lib/airtable";
import TopBar from "@/components/TopBar";
import SettingsModal from "@/components/SettingsModal";

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Checklist lines are stored in the note text as "[ ] item" / "[x] item".
// Older notes written as numbered or bulleted lists show as unchecked items.
const CHECK_LINE = /^\s*(?:\d+[.)]\s*|[-*•]\s*)?\[([ xX])\]\s?(.*)$/;
const LIST_LINE = /^\s*(?:\d+[.)]|[-*•])\s+(.*)$/;

function parseChecklistLine(line: string): { checked: boolean; text: string } | null {
  const c = line.match(CHECK_LINE);
  if (c) return { checked: c[1] !== " ", text: c[2] };
  const l = line.match(LIST_LINE);
  if (l) return { checked: false, text: l[1] };
  return null;
}

// Turn numbered/bulleted lines into checklist items before saving
function toChecklist(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const item = parseChecklistLine(line);
      return item ? `[${item.checked ? "x" : " "}] ${item.text}` : line;
    })
    .join("\n");
}

function toggleChecklistLine(text: string, index: number): string {
  const lines = text.split("\n");
  const item = parseChecklistLine(lines[index]);
  if (!item) return text;
  lines[index] = `[${item.checked ? " " : "x"}] ${item.text}`;
  return lines.join("\n");
}

interface LogRow {
  index: number; // line number in the note text, for ticking boxes
  num: number | null; // checklist item number, null for plain text lines
  checked: boolean;
  text: string;
}

// Each non-empty line of a note becomes its own row in the log table
function noteRows(text: string): LogRow[] {
  let num = 0;
  const rows: LogRow[] = [];
  text.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    const item = parseChecklistLine(line);
    rows.push(
      item
        ? { index, num: ++num, checked: item.checked, text: item.text }
        : { index, num: null, checked: false, text: line }
    );
  });
  return rows.length ? rows : [{ index: -1, num: null, checked: false, text: "" }];
}

function clipboardImages(e: React.ClipboardEvent): File[] {
  return Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
}

function ScreenshotsCell({
  note,
  uploading,
  onAdd,
  onRemove,
}: {
  note: AsinNote;
  uploading: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (shotId: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 120 }}>
      {note.screenshots.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {note.screenshots.map((sh) => (
            <div key={sh.id} style={{ position: "relative" }}>
              <a href={sh.url} target="_blank" rel="noreferrer" title="Open full size">
                <img
                  src={sh.thumbUrl}
                  alt={sh.filename}
                  style={{
                    width: 56,
                    height: 42,
                    objectFit: "cover",
                    borderRadius: 3,
                    border: "1px solid var(--gray-300)",
                    display: "block",
                  }}
                />
              </a>
              <button
                onClick={() => onRemove(sh.id)}
                title="Remove screenshot"
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: "none",
                  background: "var(--gray-600)",
                  color: "white",
                  fontSize: 10,
                  lineHeight: "16px",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className="paste-zone"
        tabIndex={0}
        onPaste={(e) => {
          const imgs = clipboardImages(e);
          if (imgs.length) {
            e.preventDefault();
            onAdd(imgs);
          }
        }}
        onDoubleClick={() => fileInput.current?.click()}
        title="Click here, then press Ctrl+V (⌘+V on Mac). Double-click to pick a file."
      >
        {uploading ? "Uploading..." : "Click, then paste"}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length) onAdd(files);
        }}
      />
    </div>
  );
}

const STATUS_COLORS: Record<NoteStatus, { bg: string; fg: string }> = {
  Open: { bg: "var(--primary-light)", fg: "var(--primary)" },
  "In Progress": { bg: "var(--warning-light)", fg: "#9a6b00" },
  Resolved: { bg: "var(--success-light)", fg: "var(--success)" },
};

export default function NotesPage() {
  const [notes, setNotes] = useState<AsinNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // New note form
  const [asin, setAsin] = useState("");
  const [productName, setProductName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [newStatus, setNewStatus] = useState<NoteStatus>("Open");
  const [newShots, setNewShots] = useState<{ file: File; preview: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Notes with a screenshot upload in progress
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [creatingIdFor, setCreatingIdFor] = useState<string | null>(null);

  // ASIN autocomplete
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<NoteStatus | "All">("All");

  // Note being edited (one row at a time)
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [asinDraft, setAsinDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // Frances feedback being edited (one row at a time)
  const [feedbackEditId, setFeedbackEditId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotes(await fetchAsinNotes());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Coming from a Request ID on the Transfer Requests page (?tr=TR-...)
  useEffect(() => {
    const tr = new URLSearchParams(window.location.search).get("tr");
    if (tr) setSearchText(tr);
  }, []);

  useEffect(() => {
    const cfg = isConfigured();
    setConfigured(cfg);
    if (cfg) {
      loadNotes();
    } else {
      setLoading(false);
    }
  }, [loadNotes]);

  const handleAsinChange = (value: string) => {
    setAsin(value);
    setProductName("");
    setShowSuggestions(true);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        setSuggestions(await searchProducts(value));
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const selectProduct = (p: Product) => {
    setAsin(p.asin);
    setProductName(p.productName);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const addNewShots = (files: File[]) =>
    setNewShots((prev) => [
      ...prev,
      ...files.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);

  const removeNewShot = (i: number) =>
    setNewShots((prev) => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, j) => j !== i);
    });

  const handleAdd = async () => {
    if (!asin.trim() || !noteText.trim()) return;
    setSaving(true);
    try {
      let note = await createAsinNote({
        asin: asin.trim().toUpperCase(),
        productName,
        note: toChecklist(noteText.trim()),
        status: newStatus,
      });
      const problems: string[] = [];
      if (note.status === "Open") {
        try {
          note = await createTransferForNote(note);
        } catch (err) {
          problems.push("the Request ID could not be created (" + (err as Error).message + ")");
        }
      }
      for (const shot of newShots) {
        try {
          note = await uploadNoteScreenshot(note.id, shot.file);
        } catch (err) {
          problems.push("a screenshot could not be uploaded (" + (err as Error).message + ")");
        }
      }
      if (problems.length) {
        alert("The note was saved, but " + problems.join("; ") + ".");
      }
      newShots.forEach((s) => URL.revokeObjectURL(s.preview));
      setAsin("");
      setProductName("");
      setNoteText("");
      setNewStatus("Open");
      setNewShots([]);
      loadNotes();
    } catch (err) {
      alert("Could not save the note: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const replaceNote = (updated: AsinNote) =>
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));

  const handleStatusChange = async (note: AsinNote, status: NoteStatus) => {
    let updated: AsinNote;
    try {
      updated = await updateAsinNote(note.id, { status });
      replaceNote(updated);
    } catch (err) {
      alert("Could not change the status: " + (err as Error).message);
      return;
    }
    if (status === "Open" && !updated.transferRequestId) handleCreateId(updated);
  };

  const handleCreateId = async (note: AsinNote) => {
    setCreatingIdFor(note.id);
    try {
      replaceNote(await createTransferForNote(note));
    } catch (err) {
      alert("Could not create the Request ID: " + (err as Error).message);
    } finally {
      setCreatingIdFor(null);
    }
  };

  const handleAddShots = async (note: AsinNote, files: File[]) => {
    setUploadingIds((prev) => new Set(prev).add(note.id));
    try {
      for (const file of files) replaceNote(await uploadNoteScreenshot(note.id, file));
    } catch (err) {
      alert("Could not upload the screenshot: " + (err as Error).message);
    } finally {
      setUploadingIds((prev) => {
        const next = new Set(prev);
        next.delete(note.id);
        return next;
      });
    }
  };

  const handleRemoveShot = async (note: AsinNote, shotId: string) => {
    if (!confirm("Remove this screenshot?")) return;
    try {
      replaceNote(
        await updateAsinNote(note.id, {
          screenshotIds: note.screenshots.filter((s) => s.id !== shotId).map((s) => s.id),
        })
      );
    } catch (err) {
      alert("Could not remove the screenshot: " + (err as Error).message);
    }
  };

  const handleToggleItem = async (note: AsinNote, index: number) => {
    const newText = toggleChecklistLine(note.note, index);
    // Tick the box right away; put it back if saving fails
    replaceNote({ ...note, note: newText });
    try {
      replaceNote(await updateAsinNote(note.id, { note: newText }));
    } catch (err) {
      replaceNote(note);
      alert("Could not save the checklist: " + (err as Error).message);
    }
  };

  const startNoteEdit = (note: AsinNote) => {
    setNoteEditId(note.id);
    setAsinDraft(note.asin);
    setNoteDraft(note.note);
  };

  const saveNoteEdit = async (note: AsinNote) => {
    const newAsin = asinDraft.trim().toUpperCase();
    if (!newAsin || !noteDraft.trim()) {
      alert("ASIN and note can't be empty.");
      return;
    }
    setNoteSaving(true);
    try {
      replaceNote(
        await updateAsinNote(note.id, {
          asin: newAsin,
          // Product name belonged to the old ASIN; drop it if the ASIN changed
          productName: newAsin === note.asin ? note.productName : "",
          note: toChecklist(noteDraft.trim()),
        })
      );
      setNoteEditId(null);
    } catch (err) {
      alert("Could not save your changes: " + (err as Error).message);
    } finally {
      setNoteSaving(false);
    }
  };

  const startFeedbackEdit = (note: AsinNote) => {
    setFeedbackEditId(note.id);
    setFeedbackDraft(note.francesFeedback);
  };

  const saveFeedback = async (note: AsinNote) => {
    setFeedbackSaving(true);
    try {
      replaceNote(
        await updateAsinNote(note.id, { francesFeedback: feedbackDraft.trim() })
      );
      setFeedbackEditId(null);
    } catch (err) {
      alert("Could not save the feedback: " + (err as Error).message);
    } finally {
      setFeedbackSaving(false);
    }
  };

  const handleDelete = async (note: AsinNote) => {
    const msg = note.transferRequestId
      ? `Delete this note for ${note.asin}? Its request ${note.transferRequestId} will also be removed from Transfer Requests.`
      : `Delete this note for ${note.asin}?`;
    if (!confirm(msg)) return;
    try {
      await deleteAsinNote(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (err) {
      alert("Could not delete the note: " + (err as Error).message);
      return;
    }
    if (note.transferRequestId) {
      try {
        await deleteTransferByRequestId(note.transferRequestId);
      } catch (err) {
        alert(
          `The note was deleted, but request ${note.transferRequestId} could not be removed: ` +
            (err as Error).message
        );
      }
    }
  };

  const q = searchText.trim().toLowerCase();
  const filtered = notes.filter(
    (n) =>
      (statusFilter === "All" || n.status === statusFilter) &&
      (!q ||
        n.asin.toLowerCase().includes(q) ||
        n.transferRequestId.toLowerCase().includes(q) ||
        n.productName.toLowerCase().includes(q) ||
        n.note.toLowerCase().includes(q) ||
        n.francesFeedback.toLowerCase().includes(q))
  );

  const card = {
    background: "white",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-sm)",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar onSettingsClick={() => setSettingsOpen(true)} />

      <main style={{ flex: 1, padding: "24px", maxWidth: 1600, margin: "0 auto", width: "100%" }}>
        {!configured ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--gray-500)" }}>
            <h2 style={{ fontSize: 18, marginBottom: 8, color: "var(--gray-700)" }}>
              Welcome to ASIN Notes
            </h2>
            <p style={{ marginBottom: 20 }}>
              Configure your Airtable connection to get started.
            </p>
            <button className="btn btn-primary" onClick={() => setSettingsOpen(true)}>
              Open Settings
            </button>
          </div>
        ) : (
          <>
            {/* New note */}
            <div style={{ ...card, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                Add a note
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div className="form-group" style={{ width: 260 }}>
                  <label className="form-label">ASIN</label>
                  <div className="autocomplete-wrapper">
                    <input
                      className="form-input"
                      style={{ width: "100%" }}
                      value={asin}
                      onChange={(e) => handleAsinChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="B0XXXXXXXX or product name"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="autocomplete-dropdown">
                        {suggestions.map((p) => (
                          <div
                            key={p.id}
                            className="autocomplete-item"
                            onMouseDown={() => selectProduct(p)}
                          >
                            <span className="asin">{p.asin}</span>
                            <span className="name">{p.productName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {productName && (
                    <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                      {productName}
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 260 }}>
                  <label className="form-label">Note</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onPaste={(e) => {
                      const imgs = clipboardImages(e);
                      if (!imgs.length) return;
                      // A copied screenshot has no text; keep normal text pastes working
                      if (!e.clipboardData.getData("text/plain")) e.preventDefault();
                      addNewShots(imgs);
                    }}
                    placeholder={"What happened, what was decided...\n1. To-do item\n2. Another to-do item"}
                    style={{ resize: "vertical" }}
                  />
                  <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                    Each line becomes a row. Start a line with a number (1.) or a dash (-) and it
                    becomes a checkbox. Paste a screenshot (Ctrl+V / ⌘+V) right into this box.
                  </div>
                  {newShots.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                      {newShots.map((sh, i) => (
                        <div key={sh.preview} style={{ position: "relative" }}>
                          <img
                            src={sh.preview}
                            alt="Screenshot to attach"
                            style={{
                              width: 80,
                              height: 60,
                              objectFit: "cover",
                              borderRadius: 4,
                              border: "1px solid var(--gray-300)",
                              display: "block",
                            }}
                          />
                          <button
                            onClick={() => removeNewShot(i)}
                            title="Remove"
                            style={{
                              position: "absolute",
                              top: -6,
                              right: -6,
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              border: "none",
                              background: "var(--gray-600)",
                              color: "white",
                              fontSize: 10,
                              lineHeight: "16px",
                              padding: 0,
                              cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ width: 150 }}>
                  <label className="form-label">Status</label>
                  <select
                    className="form-input"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as NoteStatus)}
                  >
                    {NOTE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  {newStatus === "Open" && (
                    <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                      Gets a Request ID on the Transfer Requests page.
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleAdd}
                  disabled={saving || !asin.trim() || !noteText.trim()}
                >
                  {saving ? "Saving..." : "Add Note"}
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="form-input"
                style={{ flex: 1, minWidth: 200 }}
                placeholder="Search by Request ID, ASIN, product, note, or feedback..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <select
                className="form-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as NoteStatus | "All")}
                style={{ width: 160 }}
              >
                <option value="All">All Statuses</option>
                {NOTE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              {searchText && (
                <button className="btn btn-outline" onClick={() => setSearchText("")}>
                  Clear
                </button>
              )}
              <button className="btn btn-outline" onClick={loadNotes} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {error && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "var(--danger-light)",
                  color: "var(--danger)",
                  borderRadius: "var(--radius-md)",
                  marginBottom: 16,
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            {/* Notes list */}
            <div style={{ ...card, overflowX: "auto" }}>
              {loading && notes.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--gray-400)" }}>
                  Loading notes...
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--gray-400)" }}>
                  {notes.length === 0 ? "No notes yet. Add the first one above." : "No notes match your search or filter."}
                </div>
              ) : (
                <table className="log-table">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Date</th>
                      <th style={{ width: 120 }}>Request ID</th>
                      <th style={{ width: 190 }}>ASIN</th>
                      <th style={{ width: 32 }}>#</th>
                      <th style={{ width: 44 }}>Done</th>
                      <th>Action / Note</th>
                      <th style={{ width: 120 }}>Status</th>
                      <th style={{ width: 150 }}>Screenshots</th>
                      <th style={{ width: 240 }}>Frances Feedback</th>
                      <th style={{ width: 70 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.flatMap((n) => {
                      const editing = noteEditId === n.id;
                      const rows = editing ? [null] : noteRows(n.note);
                      const span = rows.length;
                      const items = rows.filter((r) => r && r.num !== null);
                      const doneCount = items.filter((r) => r!.checked).length;

                      const shared = (
                        <>
                          <td rowSpan={span} className="shared" style={{ color: "var(--gray-500)", whiteSpace: "nowrap" }}>
                            {formatDate(n.createdDate)}
                          </td>
                          <td rowSpan={span} className="shared" style={{ whiteSpace: "nowrap" }}>
                            {n.transferRequestId ? (
                              <span style={{ fontWeight: 700, color: "var(--primary)" }}>
                                {n.transferRequestId}
                              </span>
                            ) : n.status === "Open" ? (
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() => handleCreateId(n)}
                                disabled={creatingIdFor === n.id}
                                title="Add this note to the Transfer Requests page"
                              >
                                {creatingIdFor === n.id ? "Creating..." : "+ Create ID"}
                              </button>
                            ) : (
                              <span style={{ color: "var(--gray-400)" }}>-</span>
                            )}
                          </td>
                          <td rowSpan={span} className="shared">
                            {editing ? (
                              <input
                                className="form-input"
                                style={{ width: "100%" }}
                                value={asinDraft}
                                onChange={(e) => setAsinDraft(e.target.value)}
                              />
                            ) : (
                              <>
                                <button
                                  onClick={() => setSearchText(n.asin)}
                                  title="Show all notes for this ASIN"
                                  style={{
                                    background: "none",
                                    border: "none",
                                    padding: 0,
                                    cursor: "pointer",
                                    fontWeight: 600,
                                    color: "var(--primary)",
                                    fontSize: 12,
                                  }}
                                >
                                  {n.asin}
                                </button>
                                {n.productName && (
                                  <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                                    {n.productName}
                                  </div>
                                )}
                                {items.length > 1 && (
                                  <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>
                                    {doneCount}/{items.length} done
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                        </>
                      );

                      const trailing = (
                        <>
                          <td rowSpan={span} className="shared">
                            <select
                              className="form-input"
                              value={n.status}
                              onChange={(e) => handleStatusChange(n, e.target.value as NoteStatus)}
                              style={{
                                padding: "3px 6px",
                                fontSize: 12,
                                fontWeight: 600,
                                background: STATUS_COLORS[n.status].bg,
                                color: STATUS_COLORS[n.status].fg,
                                border: "none",
                              }}
                            >
                              {NOTE_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td rowSpan={span} className="shared">
                            <ScreenshotsCell
                              note={n}
                              uploading={uploadingIds.has(n.id)}
                              onAdd={(files) => handleAddShots(n, files)}
                              onRemove={(id) => handleRemoveShot(n, id)}
                            />
                          </td>
                          <td rowSpan={span} className="shared">
                            {feedbackEditId === n.id ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <textarea
                                  className="form-input"
                                  rows={3}
                                  autoFocus
                                  value={feedbackDraft}
                                  onChange={(e) => setFeedbackDraft(e.target.value)}
                                  placeholder="Frances's feedback..."
                                  style={{ resize: "vertical" }}
                                />
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => saveFeedback(n)}
                                    disabled={feedbackSaving}
                                  >
                                    {feedbackSaving ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline"
                                    onClick={() => setFeedbackEditId(null)}
                                    disabled={feedbackSaving}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : n.francesFeedback ? (
                              <div>
                                <div style={{ whiteSpace: "pre-wrap" }}>{n.francesFeedback}</div>
                                <button
                                  className="btn btn-sm btn-outline"
                                  onClick={() => startFeedbackEdit(n)}
                                  style={{ marginTop: 6 }}
                                >
                                  Edit
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() => startFeedbackEdit(n)}
                              >
                                + Add feedback
                              </button>
                            )}
                          </td>
                          <td rowSpan={span} className="shared">
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {editing ? (
                                <>
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => saveNoteEdit(n)}
                                    disabled={noteSaving}
                                  >
                                    {noteSaving ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline"
                                    onClick={() => setNoteEditId(null)}
                                    disabled={noteSaving}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="btn btn-sm btn-outline"
                                    onClick={() => startNoteEdit(n)}
                                    title="Edit note"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline"
                                    onClick={() => handleDelete(n)}
                                    title="Delete note"
                                    style={{ justifyContent: "center" }}
                                  >
                                    ✕
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </>
                      );

                      return rows.map((r, i) => (
                        <tr key={`${n.id}-${i}`} className={i === 0 ? "note-first" : undefined}>
                          {i === 0 && shared}
                          {r === null ? (
                            <td colSpan={3} className="band">
                              <textarea
                                className="form-input"
                                rows={Math.max(4, n.note.split("\n").length + 1)}
                                autoFocus
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                style={{ width: "100%", resize: "vertical" }}
                              />
                            </td>
                          ) : (
                            <>
                              <td className="band" style={{ textAlign: "center", color: "var(--gray-500)" }}>
                                {r.num ?? ""}
                              </td>
                              <td className="band" style={{ textAlign: "center" }}>
                                {r.num !== null && (
                                  <input
                                    type="checkbox"
                                    checked={r.checked}
                                    onChange={() => handleToggleItem(n, r.index)}
                                    style={{ cursor: "pointer", marginTop: 2 }}
                                  />
                                )}
                              </td>
                              <td
                                className={`band${r.checked ? " done" : ""}`}
                                style={{ whiteSpace: "pre-wrap" }}
                              >
                                {r.text}
                              </td>
                            </>
                          )}
                          {i === 0 && trailing}
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={() => {
          setConfigured(true);
          loadNotes();
        }}
      />
    </div>
  );
}
