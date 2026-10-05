"use client";

import { useState, useEffect } from "react";
import { getConfig, setConfig } from "@/lib/airtable";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function SettingsModal({
  open,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [token, setToken] = useState("");
  const [baseId, setBaseId] = useState("");

  useEffect(() => {
    if (open) {
      const cfg = getConfig();
      setToken(cfg.token);
      setBaseId(cfg.baseId);
    }
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    setConfig(token.trim(), baseId.trim());
    // Clear table cache so it re-discovers tables
    localStorage.removeItem("scm_tr_tables");
    onSave();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Airtable Settings</h2>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 12, color: "var(--gray-500)" }}>
            Enter your Airtable Personal Access Token and the Base ID where
            transfer request tables will be created.
          </p>
          <div className="form-group">
            <label className="form-label">Personal Access Token</label>
            <input
              className="form-input"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="patXXXXXXXXXXXXXX"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Base ID</label>
            <input
              className="form-input"
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              placeholder="appXXXXXXXXXXXXXX"
            />
          </div>
          <p style={{ fontSize: 11, color: "var(--gray-400)" }}>
            Tables &quot;Transfer_Requests&quot; and &quot;Transfer_Line_Items&quot; will be
            auto-created in this base if they don&apos;t exist. Products catalog is
            read from the shared SCM base for ASIN auto-suggest.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!token.trim() || !baseId.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
