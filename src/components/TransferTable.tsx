"use client";

import { TransferRequest } from "@/types/transfer";
import StatusBadge from "./StatusBadge";

interface TransferTableProps {
  transfers: TransferRequest[];
  onView: (transfer: TransferRequest) => void;
  onEdit: (transfer: TransferRequest) => void;
  onStatusChange: (transfer: TransferRequest, status: string) => void;
}

export default function TransferTable({
  transfers,
  onView,
  onEdit,
  onStatusChange,
}: TransferTableProps) {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (transfers.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "60px 20px",
          color: "var(--gray-400)",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>No transfer requests yet</div>
        <p style={{ fontSize: 14 }}>
          Click &quot;New Transfer Request&quot; to create one.
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Request ID</th>
            <th>From</th>
            <th>To</th>
            <th>Description</th>
            <th>Status</th>
            <th>Created</th>
            <th style={{ textAlign: "center" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((tr) => (
            <tr key={tr.id}>
              <td style={{ fontWeight: 600, color: "var(--primary)", whiteSpace: "nowrap" }}>
                {tr.transferRequestId}
              </td>
              <td>{tr.from}</td>
              <td>{tr.to}</td>
              <td style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tr.description}
              </td>
              <td>
                <StatusBadge status={tr.status} />
              </td>
              <td style={{ whiteSpace: "nowrap" }}>{formatDate(tr.createdDate)}</td>
              <td style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => onView(tr)}
                  title="View"
                >
                  View
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => onEdit(tr)}
                  title="Edit"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
