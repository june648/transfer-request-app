"use client";

import { useState, useEffect, useRef } from "react";
import { TransferRequest, TransferLineItem } from "@/types/transfer";
import { fetchLineItems } from "@/lib/airtable";

interface ViewTransferModalProps {
  open: boolean;
  onClose: () => void;
  transfer: TransferRequest | null;
}

interface ShipmentGroup {
  from: string;
  to: string;
  items: TransferLineItem[];
}

export default function ViewTransferModal({
  open,
  onClose,
  transfer,
}: ViewTransferModalProps) {
  const [groups, setGroups] = useState<ShipmentGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && transfer) {
      setLoading(true);
      setCopied(false);
      fetchLineItems(transfer.transferRequestId)
        .then((items) => {
          const groupMap = new Map<string, ShipmentGroup>();
          for (const li of items) {
            const from = li.from || transfer.from;
            const to = li.to || transfer.to;
            const key = `${from}|||${to}`;
            if (!groupMap.has(key)) {
              groupMap.set(key, { from, to, items: [] });
            }
            groupMap.get(key)!.items.push(li);
          }
          setGroups(Array.from(groupMap.values()));
        })
        .catch(() => setGroups([]))
        .finally(() => setLoading(false));
    }
  }, [open, transfer]);

  const handleCopy = async () => {
    if (!contentRef.current) return;

    try {
      // Copy as rich text (HTML) for email clients, with plain text fallback
      const html = contentRef.current.innerHTML;
      const plain = buildPlainText();

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select text for manual copy
      const range = document.createRange();
      range.selectNodeContents(contentRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  const buildPlainText = () => {
    if (!transfer) return "";
    const lines: string[] = [];
    lines.push(`TRANSFER REQUEST — ${transfer.transferRequestId}`);
    if (transfer.description) lines.push(transfer.description);
    lines.push("");

    groups.forEach((group, idx) => {
      lines.push(
        `SHIPMENT ${idx + 1} — ${group.from} to ${group.to}`
      );
      lines.push("-".repeat(60));

      const header = "ASIN\tProduct\tQuantity";
      lines.push(header);

      for (const item of group.items) {
        lines.push(`${item.asin}\t${item.productDescription}\t${item.quantity}`);
      }

      const groupTotal = group.items.reduce((s, i) => s + i.quantity, 0);
      lines.push(`\t\tTotal: ${groupTotal}`);
      lines.push("");
    });

    const grandTotal = groups.reduce(
      (s, g) => s + g.items.reduce((s2, i) => s2 + i.quantity, 0),
      0
    );
    lines.push(`GRAND TOTAL: ${grandTotal} units`);
    return lines.join("\n");
  };

  if (!open || !transfer) return null;

  const grandTotal = groups.reduce(
    (s, g) => s + g.items.reduce((s2, i) => s2 + i.quantity, 0),
    0
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <div className="modal-header">
          <h2 style={{ fontSize: 14 }}>Transfer Request View</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleCopy}
              style={{ minWidth: 120 }}
            >
              {copied ? "Copied!" : "Copy for Email"}
            </button>
            <button className="btn btn-sm btn-outline" onClick={onClose}>
              X
            </button>
          </div>
        </div>

        <div
          className="modal-body"
          style={{ padding: "20px 24px", maxHeight: "70vh", overflowY: "auto" }}
        >
          {loading ? (
            <p style={{ color: "var(--gray-400)", textAlign: "center", padding: 40 }}>
              Loading...
            </p>
          ) : (
            <div
              ref={contentRef}
              style={{
                fontFamily: "Calibri, Arial, Helvetica, sans-serif",
                fontSize: 13,
                color: "#222",
                lineHeight: 1.5,
                maxWidth: 560,
              }}
            >
              {/* Request Header */}
              <div
                style={{
                  borderBottom: "2px solid #2b5797",
                  paddingBottom: 8,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#2b5797",
                    letterSpacing: 0.3,
                  }}
                >
                  TRANSFER REQUEST — {transfer.transferRequestId}
                </div>
                {transfer.description && (
                  <div
                    style={{
                      fontSize: 12,
                      fontStyle: "italic",
                      color: "#555",
                      marginTop: 4,
                    }}
                  >
                    {transfer.description}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 11,
                    color: "#888",
                    marginTop: 4,
                  }}
                >
                  Status: {transfer.status} &nbsp;|&nbsp; Created:{" "}
                  {transfer.createdDate
                    ? new Date(transfer.createdDate).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      )
                    : "-"}
                </div>
              </div>

              {/* Shipment Groups */}
              {groups.map((group, gIdx) => {
                const groupTotal = group.items.reduce(
                  (s, i) => s + i.quantity,
                  0
                );
                return (
                  <div key={gIdx} style={{ marginBottom: 20 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#2b5797",
                        marginBottom: 2,
                      }}
                    >
                      SHIPMENT {gIdx + 1} — {group.from} to {group.to}
                    </div>

                    <table
                      style={{
                        borderCollapse: "collapse",
                        fontSize: 12,
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            borderBottom: "1px solid #bbb",
                            textAlign: "left",
                          }}
                        >
                          <th
                            style={{
                              padding: "6px 8px",
                              fontWeight: 700,
                              color: "#333",
                              fontSize: 11,
                              width: 130,
                            }}
                          >
                            ASIN
                          </th>
                          <th
                            style={{
                              padding: "6px 8px",
                              fontWeight: 700,
                              color: "#333",
                              fontSize: 11,
                            }}
                          >
                            Product
                          </th>
                          <th
                            style={{
                              padding: "6px 8px",
                              fontWeight: 700,
                              color: "#333",
                              fontSize: 11,
                              textAlign: "right",
                              width: 80,
                            }}
                          >
                            Quantity
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item, iIdx) => (
                          <tr
                            key={iIdx}
                            style={{
                              borderBottom: "1px solid #e5e5e5",
                              background:
                                iIdx % 2 === 0 ? "#fafbfc" : "#fff",
                            }}
                          >
                            <td
                              style={{
                                padding: "5px 8px",
                                fontFamily:
                                  "Consolas, 'Courier New', monospace",
                                fontSize: 11,
                                color: "#2b5797",
                                fontWeight: 600,
                              }}
                            >
                              {item.asin}
                            </td>
                            <td style={{ padding: "5px 8px" }}>
                              {item.productDescription}
                            </td>
                            <td
                              style={{
                                padding: "5px 8px",
                                textAlign: "right",
                                fontWeight: 600,
                              }}
                            >
                              {item.quantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr
                          style={{
                            borderTop: "1px solid #bbb",
                          }}
                        >
                          <td
                            colSpan={2}
                            style={{
                              padding: "5px 8px",
                              textAlign: "right",
                              fontWeight: 600,
                              fontSize: 11,
                              color: "#555",
                            }}
                          >
                            Subtotal:
                          </td>
                          <td
                            style={{
                              padding: "5px 8px",
                              textAlign: "right",
                              fontWeight: 700,
                              color: "#2b5797",
                            }}
                          >
                            {groupTotal}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })}

              {/* Grand Total */}
              {groups.length > 1 && (
                <div
                  style={{
                    borderTop: "2px solid #2b5797",
                    paddingTop: 8,
                    textAlign: "right",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#2b5797",
                  }}
                >
                  GRAND TOTAL: {grandTotal} units
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
