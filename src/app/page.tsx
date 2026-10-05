"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TransferRequest,
  TransferStatus,
  TRANSFER_STATUSES,
} from "@/types/transfer";
import {
  isConfigured,
  fetchTransferRequests,
  updateTransferRequest,
} from "@/lib/airtable";
import TopBar from "@/components/TopBar";
import SettingsModal from "@/components/SettingsModal";
import TransferTable from "@/components/TransferTable";
import CreateTransferModal from "@/components/CreateTransferModal";
import EditTransferModal from "@/components/EditTransferModal";
import ViewTransferModal from "@/components/ViewTransferModal";
import StatusBadge from "@/components/StatusBadge";

export default function Home() {
  const [transfers, setTransfers] = useState<TransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  // Modals
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTransfer, setEditTransfer] = useState<TransferRequest | null>(null);
  const [viewTransfer, setViewTransfer] = useState<TransferRequest | null>(null);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransferStatus | "All">("All");

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTransferRequests();
      setTransfers(data);
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
      loadTransfers();
    } else {
      setLoading(false);
    }
  }, [loadTransfers]);

  const handleSettingsSave = () => {
    setConfigured(true);
    loadTransfers();
  };

  const handleStatusChange = async (
    transfer: TransferRequest,
    newStatus: string
  ) => {
    try {
      await updateTransferRequest(transfer.id, {
        status: newStatus as TransferStatus,
      });
      loadTransfers();
    } catch (err) {
      alert("Error updating status: " + (err as Error).message);
    }
  };

  // Filtered transfers
  const filtered = transfers.filter((tr) => {
    const matchesSearch =
      !searchText ||
      tr.transferRequestId.toLowerCase().includes(searchText.toLowerCase()) ||
      tr.from.toLowerCase().includes(searchText.toLowerCase()) ||
      tr.to.toLowerCase().includes(searchText.toLowerCase()) ||
      tr.description.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || tr.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Summary counts
  const statusCounts = TRANSFER_STATUSES.reduce(
    (acc, s) => {
      acc[s] = transfers.filter((t) => t.status === s).length;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar onSettingsClick={() => setSettingsOpen(true)} />

      <main style={{ flex: 1, padding: "24px", maxWidth: 1600, margin: "0 auto", width: "100%" }}>
        {!configured ? (
          <div
            style={{
              textAlign: "center",
              padding: "80px 20px",
              color: "var(--gray-500)",
            }}
          >
            <h2 style={{ fontSize: 18, marginBottom: 8, color: "var(--gray-700)" }}>
              Welcome to Transfer Requests
            </h2>
            <p style={{ marginBottom: 20 }}>
              Configure your Airtable connection to get started.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setSettingsOpen(true)}
            >
              Open Settings
            </button>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 20,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 20px",
                  boxShadow: "var(--shadow-sm)",
                  minWidth: 120,
                }}
              >
                <div style={{ fontSize: 11, color: "var(--gray-500)", fontWeight: 600 }}>
                  TOTAL
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--primary)" }}>
                  {transfers.length}
                </div>
              </div>
              {TRANSFER_STATUSES.map((s) =>
                statusCounts[s] > 0 ? (
                  <div
                    key={s}
                    style={{
                      background: "white",
                      borderRadius: "var(--radius-md)",
                      padding: "14px 20px",
                      boxShadow: "var(--shadow-sm)",
                      minWidth: 100,
                    }}
                  >
                    <div style={{ fontSize: 11, marginBottom: 4 }}>
                      <StatusBadge status={s} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {statusCounts[s]}
                    </div>
                  </div>
                ) : null
              )}
            </div>

            {/* Toolbar */}
            <div
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 16,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                className="form-input"
                style={{ flex: 1, minWidth: 200 }}
                placeholder="Search by ID, from, to, description..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <select
                className="form-input"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as TransferStatus | "All")
                }
                style={{ width: 160 }}
              >
                <option value="All">All Statuses</option>
                {TRANSFER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-outline"
                onClick={loadTransfers}
                disabled={loading}
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setCreateOpen(true)}
              >
                + New Transfer Request
              </button>
            </div>

            {/* Error */}
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

            {/* Table */}
            <div
              style={{
                background: "white",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-sm)",
                overflow: "hidden",
              }}
            >
              {loading && transfers.length === 0 ? (
                <div
                  style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    color: "var(--gray-400)",
                  }}
                >
                  Loading transfer requests...
                </div>
              ) : (
                <TransferTable
                  transfers={filtered}
                  onView={(tr) => setViewTransfer(tr)}
                  onEdit={(tr) => setEditTransfer(tr)}
                  onStatusChange={handleStatusChange}
                />
              )}
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSettingsSave}
      />
      <CreateTransferModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={loadTransfers}
      />
      <EditTransferModal
        open={!!editTransfer}
        onClose={() => setEditTransfer(null)}
        onUpdated={loadTransfers}
        transfer={editTransfer}
      />
      <ViewTransferModal
        open={!!viewTransfer}
        onClose={() => setViewTransfer(null)}
        transfer={viewTransfer}
      />
    </div>
  );
}
