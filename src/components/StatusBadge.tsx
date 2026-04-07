"use client";

import { TransferStatus } from "@/types/transfer";

const STATUS_STYLES: Record<TransferStatus, { bg: string; color: string }> = {
  Draft: { bg: "var(--gray-100)", color: "var(--gray-600)" },
  Submitted: { bg: "var(--primary-light)", color: "var(--primary)" },
  "In Transit": { bg: "var(--warning-light)", color: "#b8860b" },
  Received: { bg: "var(--success-light)", color: "var(--success)" },
  Cancelled: { bg: "var(--danger-light)", color: "var(--danger)" },
};

export default function StatusBadge({ status }: { status: TransferStatus }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.Draft;
  return (
    <span
      className="badge"
      style={{ background: style.bg, color: style.color }}
    >
      {status}
    </span>
  );
}
