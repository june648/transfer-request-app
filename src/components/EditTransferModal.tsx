"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  TransferRequest,
  TransferStatus,
  TRANSFER_STATUSES,
  Product,
  WarehouseGroupEditable,
  EditableLineItem,
} from "@/types/transfer";
import {
  updateTransferRequest,
  fetchLineItems,
  createLineItems,
  deleteLineItem,
  updateLineItem as updateLineItemApi,
  searchProducts,
} from "@/lib/airtable";

interface EditTransferModalProps {
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  transfer: TransferRequest | null;
}

export default function EditTransferModal({
  open,
  onClose,
  onUpdated,
  transfer,
}: EditTransferModalProps) {
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TransferStatus>("Draft");
  const [groups, setGroups] = useState<WarehouseGroupEditable[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeAsinKey, setActiveAsinKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const searchTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (open && transfer) {
      setDescription(transfer.description);
      setStatus(transfer.status);
      setLoading(true);
      fetchLineItems(transfer.transferRequestId)
        .then((lineItems) => {
          // Group line items by From+To
          const groupMap = new Map<string, WarehouseGroupEditable>();
          for (const li of lineItems) {
            const key = `${li.from}|||${li.to}`;
            if (!groupMap.has(key)) {
              groupMap.set(key, {
                from: li.from || transfer.from,
                to: li.to || transfer.to,
                items: [],
              });
            }
            groupMap.get(key)!.items.push({
              id: li.id,
              asin: li.asin,
              productDescription: li.productDescription,
              quantity: li.quantity,
            });
          }
          const result = Array.from(groupMap.values());
          if (result.length === 0) {
            result.push({
              from: transfer.from,
              to: transfer.to,
              items: [
                {
                  asin: "",
                  productDescription: "",
                  quantity: 0,
                  isNew: true,
                },
              ],
            });
          }
          setGroups(result);
        })
        .catch(() =>
          setGroups([
            {
              from: transfer.from,
              to: transfer.to,
              items: [
                {
                  asin: "",
                  productDescription: "",
                  quantity: 0,
                  isNew: true,
                },
              ],
            },
          ])
        )
        .finally(() => setLoading(false));
    }
  }, [open, transfer]);

  const handleAsinSearch = useCallback(
    (query: string, groupIdx: number, itemIdx: number) => {
      const key = `${groupIdx}-${itemIdx}`;
      setActiveAsinKey(key);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (query.length < 2) {
        setSuggestions([]);
        return;
      }
      searchTimeout.current = setTimeout(async () => {
        try {
          const results = await searchProducts(query);
          setSuggestions(results);
        } catch {
          setSuggestions([]);
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

  const updateItem = (
    groupIdx: number,
    itemIdx: number,
    field: string,
    value: string | number
  ) => {
    const updated = [...groups];
    const items = [...updated[groupIdx].items];
    items[itemIdx] = { ...items[itemIdx], [field]: value };
    updated[groupIdx] = { ...updated[groupIdx], items };
    setGroups(updated);
  };

  const addItem = (groupIdx: number) => {
    const updated = [...groups];
    updated[groupIdx] = {
      ...updated[groupIdx],
      items: [
        ...updated[groupIdx].items,
        { asin: "", productDescription: "", quantity: 0, isNew: true },
      ],
    };
    setGroups(updated);
  };

  const removeItem = (groupIdx: number, itemIdx: number) => {
    const updated = [...groups];
    const items = [...updated[groupIdx].items];
    if (items[itemIdx].id) {
      items[itemIdx] = { ...items[itemIdx], isDeleted: true };
    } else {
      items.splice(itemIdx, 1);
    }
    updated[groupIdx] = { ...updated[groupIdx], items };
    setGroups(updated);
  };

  const addGroup = () => {
    setGroups([
      ...groups,
      {
        from: "",
        to: "Amazon FBA",
        items: [
          { asin: "", productDescription: "", quantity: 0, isNew: true },
        ],
      },
    ]);
  };

  const removeGroup = (groupIdx: number) => {
    if (groups.length <= 1) return;
    // Mark all existing items in the group as deleted rather than dropping them
    const group = groups[groupIdx];
    const hasExisting = group.items.some((i) => i.id);
    if (hasExisting) {
      const updated = [...groups];
      updated[groupIdx] = {
        ...updated[groupIdx],
        items: updated[groupIdx].items.map((i) =>
          i.id ? { ...i, isDeleted: true } : i
        ),
      };
      // Keep the group but hidden so deletes get processed on save
      // Actually, let's just collect deleted IDs and remove the group visually
      setGroups(updated.filter((_, i) => i !== groupIdx));
      // We need to track the deleted items — merge them into another group
      const deletedItems = group.items.filter((i) => i.id);
      if (deletedItems.length > 0) {
        setGroups((prev) => {
          const copy = [...prev];
          if (copy.length > 0) {
            copy[0] = {
              ...copy[0],
              items: [
                ...copy[0].items,
                ...deletedItems.map((i) => ({ ...i, isDeleted: true })),
              ],
            };
          }
          return copy;
        });
      }
    } else {
      setGroups(groups.filter((_, i) => i !== groupIdx));
    }
  };

  const handleSave = async () => {
    if (!transfer) return;
    setSaving(true);
    try {
      // Compute summary from/to
      const uniqueFroms = [
        ...new Set(groups.map((g) => g.from.trim())),
      ];
      const uniqueTos = [...new Set(groups.map((g) => g.to.trim()))];
      const summaryFrom =
        uniqueFroms.length === 1 ? uniqueFroms[0] : "Multiple";
      const summaryTo =
        uniqueTos.length === 1 ? uniqueTos[0] : "Multiple";

      await updateTransferRequest(transfer.id, {
        from: summaryFrom,
        to: summaryTo,
        description,
        status,
      });

      // Collect all items across groups for save operations
      for (const group of groups) {
        // Delete removed items
        const deletedItems = group.items.filter(
          (i) => i.isDeleted && i.id
        );
        for (const item of deletedItems) {
          await deleteLineItem(item.id!);
        }

        // Update existing items (include from/to in case group changed)
        const existingItems = group.items.filter(
          (i) => i.id && !i.isDeleted && !i.isNew
        );
        for (const item of existingItems) {
          await updateLineItemApi(item.id!, {
            from: group.from,
            to: group.to,
            asin: item.asin,
            productDescription: item.productDescription,
            quantity: item.quantity,
          });
        }

        // Create new items
        const newItems = group.items.filter(
          (i) => i.isNew && !i.isDeleted && i.asin.trim()
        );
        if (newItems.length > 0) {
          await createLineItems(
            transfer.transferRequestId,
            newItems.map((i) => ({
              asin: i.asin,
              productDescription: i.productDescription,
              quantity: i.quantity,
            })),
            group.from,
            group.to
          );
        }
      }

      onUpdated();
      onClose();
    } catch (err) {
      alert("Error saving: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !transfer) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            Edit Transfer Request
            <span
              style={{
                marginLeft: 12,
                fontSize: 14,
                fontWeight: 500,
                color: "var(--primary)",
              }}
            >
              {transfer.transferRequestId}
            </span>
          </h2>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            X
          </button>
        </div>
        <div
          className="modal-body"
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* Transfer Details */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-input"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as TransferStatus)
                }
              >
                {TRANSFER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Warehouse Groups */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Warehouse Groups
            </h3>
            {loading ? (
              <p style={{ color: "var(--gray-400)", fontSize: 13 }}>
                Loading items...
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  maxHeight: "45vh",
                  overflowY: "auto",
                }}
              >
                {groups.map((group, gIdx) => {
                  const visibleItems = group.items.filter(
                    (i) => !i.isDeleted
                  );
                  return (
                    <div
                      key={gIdx}
                      style={{
                        border: "1px solid var(--gray-200)",
                        borderRadius: "var(--radius-md)",
                        padding: 14,
                        background: "var(--gray-50)",
                      }}
                    >
                      {/* Group header */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 10,
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
                          Group {gIdx + 1}
                        </span>
                        {groups.length > 1 && (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => removeGroup(gIdx)}
                            style={{
                              color: "var(--danger)",
                              borderColor: "var(--danger)",
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      {/* From / To */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 10,
                          marginBottom: 12,
                        }}
                      >
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">From</label>
                          <input
                            className="form-input"
                            value={group.from}
                            onChange={(e) =>
                              updateGroupField(
                                gIdx,
                                "from",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">To</label>
                          <input
                            className="form-input"
                            value={group.to}
                            onChange={(e) =>
                              updateGroupField(
                                gIdx,
                                "to",
                                e.target.value
                              )
                            }
                          />
                        </div>
                      </div>

                      {/* Line items header */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "160px 1fr 80px 36px",
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
                        <span>Qty</span>
                        <span></span>
                      </div>

                      {visibleItems.map((item) => {
                        const realIdx = group.items.indexOf(item);
                        const key = `${gIdx}-${realIdx}`;
                        return (
                          <div
                            key={realIdx}
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "160px 1fr 80px 36px",
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
                                  updateItem(
                                    gIdx,
                                    realIdx,
                                    "asin",
                                    e.target.value
                                  );
                                  handleAsinSearch(
                                    e.target.value,
                                    gIdx,
                                    realIdx
                                  );
                                }}
                                onBlur={() => {
                                  setTimeout(() => {
                                    if (activeAsinKey === key) {
                                      setSuggestions([]);
                                      setActiveAsinKey(null);
                                    }
                                  }, 200);
                                }}
                              />
                              {activeAsinKey === key &&
                                suggestions.length > 0 && (
                                  <div className="autocomplete-dropdown">
                                    {suggestions.map((p) => (
                                      <div
                                        key={p.id}
                                        className="autocomplete-item"
                                        onMouseDown={() =>
                                          selectProduct(
                                            gIdx,
                                            realIdx,
                                            p
                                          )
                                        }
                                      >
                                        <span className="asin">
                                          {p.asin}
                                        </span>
                                        <span className="name">
                                          {p.productName}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                            </div>
                            <input
                              className="form-input"
                              style={{ width: "100%" }}
                              value={item.productDescription}
                              onChange={(e) =>
                                updateItem(
                                  gIdx,
                                  realIdx,
                                  "productDescription",
                                  e.target.value
                                )
                              }
                            />
                            <input
                              className="form-input"
                              style={{ width: "100%" }}
                              type="number"
                              min={1}
                              value={item.quantity || ""}
                              onChange={(e) =>
                                updateItem(
                                  gIdx,
                                  realIdx,
                                  "quantity",
                                  parseInt(e.target.value) || 0
                                )
                              }
                            />
                            <button
                              className="btn btn-sm btn-icon btn-outline"
                              onClick={() => removeItem(gIdx, realIdx)}
                              title="Remove"
                              style={{ marginTop: 2 }}
                            >
                              -
                            </button>
                          </div>
                        );
                      })}
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => addItem(gIdx)}
                        style={{ marginTop: 4 }}
                      >
                        + Add Item
                      </button>
                    </div>
                  );
                })}

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
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
