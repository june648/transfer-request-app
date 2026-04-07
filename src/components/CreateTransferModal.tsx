"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { LineItemDraft, Product, TransferStatus, WarehouseGroup } from "@/types/transfer";
import {
  generateTransferRequestId,
  createTransferRequest,
  createLineItemsFromGroups,
  searchProducts,
} from "@/lib/airtable";
import StatusBadge from "./StatusBadge";

interface CreateTransferModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type Step = 1 | 2 | 3;

function emptyGroup(): WarehouseGroup {
  return {
    from: "",
    to: "Amazon FBA",
    items: [{ asin: "", productDescription: "", quantity: 0 }],
  };
}

export default function CreateTransferModal({
  open,
  onClose,
  onCreated,
}: CreateTransferModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState("");

  // Step 1 fields
  const [description, setDescription] = useState("");

  // Step 2 fields — warehouse groups
  const [groups, setGroups] = useState<WarehouseGroup[]>([emptyGroup()]);
  const [activeAsinKey, setActiveAsinKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (open) {
      setStep(1);
      setDescription("");
      setGroups([emptyGroup()]);
      setRequestId("");
      setSaving(false);
      generateTransferRequestId().then(setRequestId).catch(() => {});
    }
  }, [open]);

  const handleAsinSearch = useCallback(
    (query: string, groupIdx: number, itemIdx: number) => {
      const key = `${groupIdx}-${itemIdx}`;
      setActiveAsinKey(key);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (query.length < 2) {
        setSuggestions([]);
        return;
      }
      setSearchLoading(true);
      searchTimeout.current = setTimeout(async () => {
        try {
          const results = await searchProducts(query);
          setSuggestions(results);
        } catch {
          setSuggestions([]);
        } finally {
          setSearchLoading(false);
        }
      }, 300);
    },
    []
  );

  const selectProduct = (
    groupIdx: number,
    itemIdx: number,
    product: Product
  ) => {
    const updated = [...groups];
    const items = [...updated[groupIdx].items];
    items[itemIdx] = {
      ...items[itemIdx],
      asin: product.asin,
      productDescription: product.productName,
    };
    updated[groupIdx] = { ...updated[groupIdx], items };
    setGroups(updated);
    setSuggestions([]);
    setActiveAsinKey(null);
  };

  const updateGroupField = (
    groupIdx: number,
    field: "from" | "to",
    value: string
  ) => {
    const updated = [...groups];
    updated[groupIdx] = { ...updated[groupIdx], [field]: value };
    setGroups(updated);
  };

  const updateLineItem = (
    groupIdx: number,
    itemIdx: number,
    field: keyof LineItemDraft,
    value: string | number
  ) => {
    const updated = [...groups];
    const items = [...updated[groupIdx].items];
    items[itemIdx] = { ...items[itemIdx], [field]: value };
    updated[groupIdx] = { ...updated[groupIdx], items };
    setGroups(updated);
  };

  const addLineItem = (groupIdx: number) => {
    const updated = [...groups];
    updated[groupIdx] = {
      ...updated[groupIdx],
      items: [
        ...updated[groupIdx].items,
        { asin: "", productDescription: "", quantity: 0 },
      ],
    };
    setGroups(updated);
  };

  const removeLineItem = (groupIdx: number, itemIdx: number) => {
    const updated = [...groups];
    if (updated[groupIdx].items.length <= 1) return;
    updated[groupIdx] = {
      ...updated[groupIdx],
      items: updated[groupIdx].items.filter((_, i) => i !== itemIdx),
    };
    setGroups(updated);
  };

  const addGroup = () => {
    setGroups([...groups, emptyGroup()]);
  };

  const removeGroup = (groupIdx: number) => {
    if (groups.length <= 1) return;
    setGroups(groups.filter((_, i) => i !== groupIdx));
  };

  const canProceedStep1 = description.trim();
  const canProceedStep2 = groups.every(
    (g) =>
      g.from.trim() &&
      g.to.trim() &&
      g.items.length > 0 &&
      g.items.every((li) => li.asin.trim() && li.quantity > 0)
  );

  // Derive summary From/To for the transfer request record
  const uniqueFroms = [...new Set(groups.map((g) => g.from.trim()))];
  const uniqueTos = [...new Set(groups.map((g) => g.to.trim()))];
  const summaryFrom =
    uniqueFroms.length === 1 ? uniqueFroms[0] : "Multiple";
  const summaryTo = uniqueTos.length === 1 ? uniqueTos[0] : "Multiple";

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await createTransferRequest({
        transferRequestId: requestId,
        from: summaryFrom,
        to: summaryTo,
        description,
        status: "Submitted" as TransferStatus,
      });
      await createLineItemsFromGroups(requestId, groups);
      onCreated();
      onClose();
    } catch (err) {
      alert("Error creating transfer request: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await createTransferRequest({
        transferRequestId: requestId,
        from: summaryFrom,
        to: summaryTo,
        description,
        status: "Draft" as TransferStatus,
      });
      const validGroups = groups
        .map((g) => ({
          ...g,
          items: g.items.filter((li) => li.asin.trim()),
        }))
        .filter((g) => g.items.length > 0);
      if (validGroups.length > 0) {
        await createLineItemsFromGroups(requestId, validGroups);
      }
      onCreated();
      onClose();
    } catch (err) {
      alert("Error saving draft: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);
  const totalUnits = groups.reduce(
    (sum, g) => sum + g.items.reduce((s, li) => s + li.quantity, 0),
    0
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            New Transfer Request
            {requestId && (
              <span
                style={{
                  marginLeft: 12,
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--primary)",
                }}
              >
                {requestId}
              </span>
            )}
          </h2>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            X
          </button>
        </div>

        {/* Stepper */}
        <div className="stepper">
          <div
            className={`stepper-step ${step === 1 ? "active" : step > 1 ? "done" : ""}`}
          >
            1. Description
          </div>
          <div
            className={`stepper-step ${step === 2 ? "active" : step > 2 ? "done" : ""}`}
          >
            2. Warehouse Groups
          </div>
          <div className={`stepper-step ${step === 3 ? "active" : ""}`}>
            3. Review & Submit
          </div>
        </div>

        <div className="modal-body">
          {/* Step 1: Description */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  className="form-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this transfer (e.g. Q2 FBA Restock)"
                  autoFocus
                />
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--gray-500)",
                  margin: 0,
                }}
              >
                In the next step you&apos;ll add warehouse groups — each group
                has its own source and destination with line items.
              </p>
            </div>
          )}

          {/* Step 2: Warehouse Groups */}
          {step === 2 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 20,
                maxHeight: "60vh",
                overflowY: "auto",
              }}
            >
              {groups.map((group, gIdx) => (
                <div
                  key={gIdx}
                  style={{
                    border: "1px solid var(--gray-200)",
                    borderRadius: "var(--radius-md)",
                    padding: 16,
                    background: "var(--gray-50)",
                  }}
                >
                  {/* Group header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--primary)",
                        textTransform: "uppercase",
                      }}
                    >
                      Warehouse Group {gIdx + 1}
                    </span>
                    {groups.length > 1 && (
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => removeGroup(gIdx)}
                        style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                      >
                        Remove Group
                      </button>
                    )}
                  </div>

                  {/* From / To */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">From (Warehouse / Vendor)</label>
                      <input
                        className="form-input"
                        value={group.from}
                        onChange={(e) =>
                          updateGroupField(gIdx, "from", e.target.value)
                        }
                        placeholder="e.g. Seattle WH, Vendor ABC"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">To</label>
                      <input
                        className="form-input"
                        value={group.to}
                        onChange={(e) =>
                          updateGroupField(gIdx, "to", e.target.value)
                        }
                        placeholder="e.g. Amazon FBA"
                      />
                    </div>
                  </div>

                  {/* Line items header */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr 90px 36px",
                      gap: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--gray-500)",
                      textTransform: "uppercase",
                      padding: "0 4px",
                      marginBottom: 6,
                    }}
                  >
                    <span>ASIN</span>
                    <span>Product Description</span>
                    <span>Quantity</span>
                    <span></span>
                  </div>

                  {/* Line items */}
                  {group.items.map((item, iIdx) => {
                    const key = `${gIdx}-${iIdx}`;
                    return (
                      <div
                        key={iIdx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "180px 1fr 90px 36px",
                          gap: 8,
                          alignItems: "start",
                          marginBottom: 6,
                        }}
                      >
                        <div className="autocomplete-wrapper">
                          <input
                            className="form-input"
                            style={{ width: "100%" }}
                            value={item.asin}
                            onChange={(e) => {
                              updateLineItem(gIdx, iIdx, "asin", e.target.value);
                              handleAsinSearch(e.target.value, gIdx, iIdx);
                            }}
                            onFocus={() => {
                              if (item.asin.length >= 2)
                                handleAsinSearch(item.asin, gIdx, iIdx);
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                if (activeAsinKey === key) {
                                  setSuggestions([]);
                                  setActiveAsinKey(null);
                                }
                              }, 200);
                            }}
                            placeholder="B0XXXXXXXX"
                          />
                          {activeAsinKey === key && suggestions.length > 0 && (
                            <div className="autocomplete-dropdown">
                              {suggestions.map((p) => (
                                <div
                                  key={p.id}
                                  className="autocomplete-item"
                                  onMouseDown={() =>
                                    selectProduct(gIdx, iIdx, p)
                                  }
                                >
                                  <span className="asin">{p.asin}</span>
                                  <span className="name">{p.productName}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {activeAsinKey === key && searchLoading && (
                            <div className="autocomplete-dropdown">
                              <div
                                className="autocomplete-item"
                                style={{ color: "var(--gray-400)" }}
                              >
                                Searching...
                              </div>
                            </div>
                          )}
                        </div>

                        <input
                          className="form-input"
                          style={{ width: "100%" }}
                          value={item.productDescription}
                          onChange={(e) =>
                            updateLineItem(
                              gIdx,
                              iIdx,
                              "productDescription",
                              e.target.value
                            )
                          }
                          placeholder="Auto-filled or enter manually"
                        />

                        <input
                          className="form-input"
                          style={{ width: "100%" }}
                          type="number"
                          min={1}
                          value={item.quantity || ""}
                          onChange={(e) =>
                            updateLineItem(
                              gIdx,
                              iIdx,
                              "quantity",
                              parseInt(e.target.value) || 0
                            )
                          }
                          placeholder="Qty"
                        />

                        <button
                          className="btn btn-sm btn-icon btn-outline"
                          onClick={() => removeLineItem(gIdx, iIdx)}
                          disabled={group.items.length <= 1}
                          title="Remove item"
                          style={{ marginTop: 2 }}
                        >
                          -
                        </button>
                      </div>
                    );
                  })}

                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => addLineItem(gIdx)}
                    style={{ marginTop: 4 }}
                  >
                    + Add Item
                  </button>
                </div>
              ))}

              <button
                className="btn btn-outline"
                onClick={addGroup}
                style={{
                  alignSelf: "flex-start",
                  borderStyle: "dashed",
                }}
              >
                + Add Warehouse Group
              </button>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 16,
                  padding: 16,
                  background: "var(--gray-50)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--gray-500)",
                      fontWeight: 600,
                    }}
                  >
                    REQUEST ID
                  </span>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--primary)",
                    }}
                  >
                    {requestId}
                  </div>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--gray-500)",
                      fontWeight: 600,
                    }}
                  >
                    STATUS
                  </span>
                  <div>
                    <StatusBadge status="Submitted" />
                  </div>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--gray-500)",
                      fontWeight: 600,
                    }}
                  >
                    WAREHOUSE GROUPS
                  </span>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {groups.length}
                  </div>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--gray-500)",
                      fontWeight: 600,
                    }}
                  >
                    DESCRIPTION
                  </span>
                  <div style={{ fontSize: 14 }}>{description}</div>
                </div>
              </div>

              {groups.map((group, gIdx) => (
                <div key={gIdx}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 8,
                      padding: "8px 12px",
                      background: "var(--gray-50)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--gray-200)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--primary)",
                      }}
                    >
                      Group {gIdx + 1}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--gray-600)" }}>
                      {group.from} &rarr; {group.to}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--gray-400)",
                        marginLeft: "auto",
                      }}
                    >
                      {group.items.length} item
                      {group.items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>ASIN</th>
                        <th>Product Description</th>
                        <th style={{ textAlign: "right" }}>Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item, iIdx) => (
                        <tr key={iIdx}>
                          <td>{iIdx + 1}</td>
                          <td
                            style={{
                              fontWeight: 600,
                              color: "var(--primary)",
                            }}
                          >
                            {item.asin}
                          </td>
                          <td>{item.productDescription}</td>
                          <td
                            style={{ textAlign: "right", fontWeight: 600 }}
                          >
                            {item.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 16,
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "8px 0",
                }}
              >
                <span>
                  Total Items:{" "}
                  <span style={{ color: "var(--primary)" }}>{totalItems}</span>
                </span>
                <span>
                  Total Units:{" "}
                  <span style={{ color: "var(--primary)" }}>{totalUnits}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step === 1 && (
            <>
              <button className="btn btn-outline" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!canProceedStep1}
                onClick={() => setStep(2)}
              >
                Next: Warehouse Groups
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button className="btn btn-outline" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="btn btn-outline"
                onClick={handleSaveDraft}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save as Draft"}
              </button>
              <button
                className="btn btn-primary"
                disabled={!canProceedStep2}
                onClick={() => setStep(3)}
              >
                Next: Review
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <button
                className="btn btn-outline"
                onClick={() => setStep(2)}
                disabled={saving}
              >
                Back
              </button>
              <button
                className="btn btn-success"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? "Submitting..." : "Submit Transfer Request"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
