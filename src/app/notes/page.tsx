"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AsinNote, Product } from "@/types/transfer";
import {
  isConfigured,
  fetchAsinNotes,
  createAsinNote,
  deleteAsinNote,
  searchProducts,
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
  const [saving, setSaving] = useState(false);

  // ASIN autocomplete
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const [searchText, setSearchText] = useState("");

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

  const handleAdd = async () => {
    if (!asin.trim() || !noteText.trim()) return;
    setSaving(true);
    try {
      await createAsinNote({
        asin: asin.trim().toUpperCase(),
        productName,
        note: noteText.trim(),
      });
      setAsin("");
      setProductName("");
      setNoteText("");
      loadNotes();
    } catch (err) {
      alert("Could not save the note: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (note: AsinNote) => {
    if (!confirm(`Delete this note for ${note.asin}?`)) return;
    try {
      await deleteAsinNote(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (err) {
      alert("Could not delete the note: " + (err as Error).message);
    }
  };

  const q = searchText.trim().toLowerCase();
  const filtered = notes.filter(
    (n) =>
      !q ||
      n.asin.toLowerCase().includes(q) ||
      n.productName.toLowerCase().includes(q) ||
      n.note.toLowerCase().includes(q)
  );

  const card = {
    background: "white",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-sm)",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar onSettingsClick={() => setSettingsOpen(true)} />

      <main style={{ flex: 1, padding: "24px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        {!configured ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--gray-500)" }}>
            <h2 style={{ fontSize: 20, marginBottom: 8, color: "var(--gray-700)" }}>
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
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
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
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
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
                    placeholder="What happened, what was decided, what to do next..."
                    style={{ resize: "vertical" }}
                  />
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
                placeholder="Search by ASIN, product, or note text..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
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
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}

            {/* Notes list */}
            <div style={{ ...card, overflow: "hidden" }}>
              {loading && notes.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--gray-400)" }}>
                  Loading notes...
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--gray-400)" }}>
                  {notes.length === 0 ? "No notes yet. Add the first one above." : "No notes match your search."}
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 170 }}>Date</th>
                      <th style={{ width: 220 }}>ASIN</th>
                      <th>Note</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((n) => (
                      <tr key={n.id}>
                        <td style={{ color: "var(--gray-500)", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          {formatDate(n.createdDate)}
                        </td>
                        <td style={{ verticalAlign: "top" }}>
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
                              fontSize: 14,
                            }}
                          >
                            {n.asin}
                          </button>
                          {n.productName && (
                            <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                              {n.productName}
                            </div>
                          )}
                        </td>
                        <td style={{ whiteSpace: "pre-wrap", verticalAlign: "top" }}>{n.note}</td>
                        <td style={{ verticalAlign: "top" }}>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleDelete(n)}
                            title="Delete note"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
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
