import {
  TransferRequest,
  TransferLineItem,
  Product,
  TransferStatus,
  LineItemDraft,
  WarehouseGroup,
  AsinNote,
  NoteStatus,
  NoteScreenshot,
} from "@/types/transfer";

const STORAGE_KEYS = {
  token: "scm_tr_token",
  baseId: "scm_tr_base_id",
  tableCache: "scm_tr_tables",
};

const PRODUCTS_BASE_ID = "appIi4INnoNSh9kru";
const PRODUCTS_TABLE_ID = "tblLixRBZkc3IViAG";

interface TableCache {
  transferRequests?: string;
  transferLineItems?: string;
  // Bumped (asinNotes -> V2 -> V3) whenever fields are added, so browsers
  // that cached the old table re-check for the new fields.
  asinNotesV3?: string;
}

export function getConfig() {
  if (typeof window === "undefined") return { token: "", baseId: "" };
  return {
    token: localStorage.getItem(STORAGE_KEYS.token) || "",
    baseId: localStorage.getItem(STORAGE_KEYS.baseId) || "",
  };
}

export function setConfig(token: string, baseId: string) {
  localStorage.setItem(STORAGE_KEYS.token, token);
  localStorage.setItem(STORAGE_KEYS.baseId, baseId);
}

export function isConfigured(): boolean {
  const { token, baseId } = getConfig();
  return !!(token && baseId);
}

function getTableCache(): TableCache {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEYS.tableCache) || "{}"
    );
  } catch {
    return {};
  }
}

function setTableCache(cache: TableCache) {
  localStorage.setItem(STORAGE_KEYS.tableCache, JSON.stringify(cache));
}

// Retries transient failures: network drops ("Failed to fetch"),
// Airtable rate limits (429), and server errors (5xx).
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error = new Error("Network error");
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        // 429 = rate limited; Airtable enforces a cooldown, so back off hard
        const base = res.status === 429 ? 2000 : 500;
        await new Promise((r) => setTimeout(r, base * 2 ** attempt));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }
  throw new Error(
    `Network error while contacting Airtable (${lastError.message}). Check your internet connection and try again.`
  );
}

async function airtableFetch(
  baseId: string,
  path: string,
  options: RequestInit = {}
) {
  const { token } = getConfig();
  if (!token) throw new Error("Airtable PAT not configured");

  const url = `https://api.airtable.com/v0/${baseId}/${path}`;
  const res = await fetchWithRetry(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Airtable error: ${res.status}`
    );
  }
  return res.json();
}

async function metaFetch(path: string, options: RequestInit = {}) {
  const { token } = getConfig();
  const url = `https://api.airtable.com/v0/meta/${path}`;
  const res = await fetchWithRetry(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Airtable meta error: ${res.status}`
    );
  }
  return res.json();
}

async function ensureTables(): Promise<{
  requestsTable: string;
  lineItemsTable: string;
}> {
  const cache = getTableCache();
  if (cache.transferRequests && cache.transferLineItems) {
    return {
      requestsTable: cache.transferRequests,
      lineItemsTable: cache.transferLineItems,
    };
  }

  const { baseId } = getConfig();
  const { tables } = await metaFetch(`bases/${baseId}/tables`);

  let requestsTable = tables.find(
    (t: { name: string }) => t.name === "Transfer_Requests"
  );
  let lineItemsTable = tables.find(
    (t: { name: string }) => t.name === "Transfer_Line_Items"
  );

  if (!requestsTable) {
    const created = await metaFetch(`bases/${baseId}/tables`, {
      method: "POST",
      body: JSON.stringify({
        name: "Transfer_Requests",
        fields: [
          { name: "TransferRequest_ID", type: "singleLineText" },
          { name: "From", type: "singleLineText" },
          { name: "To", type: "singleLineText" },
          { name: "Description", type: "singleLineText" },
          {
            name: "Status",
            type: "singleSelect",
            options: {
              choices: [
                { name: "Draft", color: "grayLight2" },
                { name: "Submitted", color: "blueLight2" },
                { name: "In Transit", color: "yellowLight2" },
                { name: "Received", color: "greenLight2" },
                { name: "Cancelled", color: "redLight2" },
              ],
            },
          },
          {
            name: "Created_Date",
            type: "dateTime",
            options: {
              timeZone: "America/Los_Angeles",
              dateFormat: { name: "iso" },
              timeFormat: { name: "24hour" },
            },
          },
          {
            name: "Updated_Date",
            type: "dateTime",
            options: {
              timeZone: "America/Los_Angeles",
              dateFormat: { name: "iso" },
              timeFormat: { name: "24hour" },
            },
          },
        ],
      }),
    });
    requestsTable = created;
  }

  if (!lineItemsTable) {
    const created = await metaFetch(`bases/${baseId}/tables`, {
      method: "POST",
      body: JSON.stringify({
        name: "Transfer_Line_Items",
        fields: [
          { name: "TransferRequest_ID", type: "singleLineText" },
          { name: "From", type: "singleLineText" },
          { name: "To", type: "singleLineText" },
          { name: "ASIN", type: "singleLineText" },
          { name: "Product_Description", type: "singleLineText" },
          { name: "Quantity", type: "number", options: { precision: 0 } },
        ],
      }),
    });
    lineItemsTable = created;
  } else {
    // Ensure From/To fields exist on existing table (backward compat)
    const tableId = lineItemsTable.id || lineItemsTable.name;
    const existingFieldNames = (lineItemsTable.fields || []).map(
      (f: { name: string }) => f.name
    );
    for (const fieldName of ["From", "To"]) {
      if (!existingFieldNames.includes(fieldName)) {
        try {
          await metaFetch(`bases/${baseId}/tables/${tableId}/fields`, {
            method: "POST",
            body: JSON.stringify({
              name: fieldName,
              type: "singleLineText",
            }),
          });
        } catch {
          // Field may already exist, ignore
        }
      }
    }
  }

  const newCache: TableCache = {
    ...cache,
    transferRequests: requestsTable.id || requestsTable.name,
    transferLineItems: lineItemsTable.id || lineItemsTable.name,
  };
  setTableCache(newCache);

  return {
    requestsTable: newCache.transferRequests!,
    lineItemsTable: newCache.transferLineItems!,
  };
}

function mapTransferRequest(record: {
  id: string;
  fields: Record<string, unknown>;
}): TransferRequest {
  const f = record.fields;
  return {
    id: record.id,
    transferRequestId: (f["TransferRequest_ID"] as string) || "",
    from: (f["From"] as string) || "",
    to: (f["To"] as string) || "",
    description: (f["Description"] as string) || "",
    status: (f["Status"] as TransferStatus) || "Draft",
    createdDate: (f["Created_Date"] as string) || "",
    updatedDate: (f["Updated_Date"] as string) || "",
  };
}

function mapLineItem(record: {
  id: string;
  fields: Record<string, unknown>;
}): TransferLineItem {
  const f = record.fields;
  return {
    id: record.id,
    transferRequestId: (f["TransferRequest_ID"] as string) || "",
    from: (f["From"] as string) || "",
    to: (f["To"] as string) || "",
    asin: (f["ASIN"] as string) || "",
    productDescription: (f["Product_Description"] as string) || "",
    quantity: (f["Quantity"] as number) || 0,
  };
}

// --- Transfer Requests ---

export async function fetchTransferRequests(): Promise<TransferRequest[]> {
  const { baseId } = getConfig();
  const { requestsTable } = await ensureTables();
  const allRecords: TransferRequest[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set("sort[0][field]", "Created_Date");
    params.set("sort[0][direction]", "desc");
    if (offset) params.set("offset", offset);

    const data = await airtableFetch(
      baseId,
      `${encodeURIComponent(requestsTable)}?${params.toString()}`
    );
    allRecords.push(...data.records.map(mapTransferRequest));
    offset = data.offset;
  } while (offset);

  return allRecords;
}

export async function generateTransferRequestId(): Promise<string> {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, "0") +
    today.getDate().toString().padStart(2, "0");
  const baseId = `TR-${dateStr}`;

  const existing = await fetchTransferRequests();
  const taken = new Set(
    existing
      .map((r) => r.transferRequestId)
      .filter((id) => id === baseId || id.startsWith(`${baseId}-`))
  );

  if (!taken.has(baseId)) return baseId;

  let n = 2;
  while (taken.has(`${baseId}-${n.toString().padStart(3, "0")}`)) n++;
  return `${baseId}-${n.toString().padStart(3, "0")}`;
}

export async function createTransferRequest(data: {
  transferRequestId: string;
  from: string;
  to: string;
  description: string;
  status: TransferStatus;
}): Promise<TransferRequest> {
  const { baseId } = getConfig();
  const { requestsTable } = await ensureTables();
  const now = new Date().toISOString();

  const result = await airtableFetch(
    baseId,
    encodeURIComponent(requestsTable),
    {
      method: "POST",
      body: JSON.stringify({
        fields: {
          TransferRequest_ID: data.transferRequestId,
          From: data.from,
          To: data.to,
          Description: data.description,
          Status: data.status,
          Created_Date: now,
          Updated_Date: now,
        },
      }),
    }
  );
  return mapTransferRequest(result);
}

export async function updateTransferRequest(
  recordId: string,
  fields: Partial<{
    from: string;
    to: string;
    description: string;
    status: TransferStatus;
  }>
): Promise<TransferRequest> {
  const { baseId } = getConfig();
  const { requestsTable } = await ensureTables();

  const airtableFields: Record<string, unknown> = {
    Updated_Date: new Date().toISOString(),
  };
  if (fields.from !== undefined) airtableFields["From"] = fields.from;
  if (fields.to !== undefined) airtableFields["To"] = fields.to;
  if (fields.description !== undefined)
    airtableFields["Description"] = fields.description;
  if (fields.status !== undefined) airtableFields["Status"] = fields.status;

  const result = await airtableFetch(
    baseId,
    `${encodeURIComponent(requestsTable)}/${recordId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: airtableFields }),
    }
  );
  return mapTransferRequest(result);
}

export async function deleteTransferRequest(recordId: string): Promise<void> {
  const { baseId } = getConfig();
  const { requestsTable } = await ensureTables();
  await airtableFetch(
    baseId,
    `${encodeURIComponent(requestsTable)}/${recordId}`,
    { method: "DELETE" }
  );
}

// --- Line Items ---

export async function fetchLineItems(
  transferRequestId: string
): Promise<TransferLineItem[]> {
  const { baseId } = getConfig();
  const { lineItemsTable } = await ensureTables();
  const allRecords: TransferLineItem[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set(
      "filterByFormula",
      `{TransferRequest_ID}="${transferRequestId}"`
    );
    if (offset) params.set("offset", offset);

    const data = await airtableFetch(
      baseId,
      `${encodeURIComponent(lineItemsTable)}?${params.toString()}`
    );
    allRecords.push(...data.records.map(mapLineItem));
    offset = data.offset;
  } while (offset);

  return allRecords;
}

export async function createLineItems(
  transferRequestId: string,
  items: LineItemDraft[],
  from?: string,
  to?: string
): Promise<TransferLineItem[]> {
  const { baseId } = getConfig();
  const { lineItemsTable } = await ensureTables();
  const created: TransferLineItem[] = [];

  // Batch in groups of 10
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10);
    const result = await airtableFetch(
      baseId,
      encodeURIComponent(lineItemsTable),
      {
        method: "POST",
        body: JSON.stringify({
          records: batch.map((item) => ({
            fields: {
              TransferRequest_ID: transferRequestId,
              From: from || "",
              To: to || "",
              ASIN: item.asin,
              Product_Description: item.productDescription,
              Quantity: item.quantity,
            },
          })),
        }),
      }
    );
    created.push(...result.records.map(mapLineItem));
  }

  return created;
}

export async function createLineItemsFromGroups(
  transferRequestId: string,
  groups: WarehouseGroup[]
): Promise<TransferLineItem[]> {
  const allCreated: TransferLineItem[] = [];
  for (const group of groups) {
    const created = await createLineItems(
      transferRequestId,
      group.items,
      group.from,
      group.to
    );
    allCreated.push(...created);
  }
  return allCreated;
}

export async function updateLineItem(
  recordId: string,
  fields: Partial<{ from: string; to: string; asin: string; productDescription: string; quantity: number }>
): Promise<TransferLineItem> {
  const { baseId } = getConfig();
  const { lineItemsTable } = await ensureTables();

  const airtableFields: Record<string, unknown> = {};
  if (fields.from !== undefined) airtableFields["From"] = fields.from;
  if (fields.to !== undefined) airtableFields["To"] = fields.to;
  if (fields.asin !== undefined) airtableFields["ASIN"] = fields.asin;
  if (fields.productDescription !== undefined)
    airtableFields["Product_Description"] = fields.productDescription;
  if (fields.quantity !== undefined)
    airtableFields["Quantity"] = fields.quantity;

  const result = await airtableFetch(
    baseId,
    `${encodeURIComponent(lineItemsTable)}/${recordId}`,
    { method: "PATCH", body: JSON.stringify({ fields: airtableFields }) }
  );
  return mapLineItem(result);
}

export async function updateLineItems(
  updates: {
    id: string;
    from: string;
    to: string;
    asin: string;
    productDescription: string;
    quantity: number;
  }[]
): Promise<void> {
  if (updates.length === 0) return;
  const { baseId } = getConfig();
  const { lineItemsTable } = await ensureTables();

  // Batch in groups of 10
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    await airtableFetch(baseId, encodeURIComponent(lineItemsTable), {
      method: "PATCH",
      body: JSON.stringify({
        records: batch.map((u) => ({
          id: u.id,
          fields: {
            From: u.from,
            To: u.to,
            ASIN: u.asin,
            Product_Description: u.productDescription,
            Quantity: u.quantity,
          },
        })),
      }),
    });
  }
}

export async function deleteLineItems(recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return;
  const { baseId } = getConfig();
  const { lineItemsTable } = await ensureTables();

  // Batch in groups of 10
  for (let i = 0; i < recordIds.length; i += 10) {
    const batch = recordIds.slice(i, i + 10);
    const params = batch.map((id) => `records[]=${id}`).join("&");
    await airtableFetch(
      baseId,
      `${encodeURIComponent(lineItemsTable)}?${params}`,
      { method: "DELETE" }
    );
  }
}

export async function deleteLineItem(recordId: string): Promise<void> {
  const { baseId } = getConfig();
  const { lineItemsTable } = await ensureTables();
  await airtableFetch(
    baseId,
    `${encodeURIComponent(lineItemsTable)}/${recordId}`,
    { method: "DELETE" }
  );
}

export async function deleteLineItemsByTransfer(
  transferRequestId: string
): Promise<void> {
  const items = await fetchLineItems(transferRequestId);
  await deleteLineItems(items.map((item) => item.id));
}

// --- ASIN Notes ---

const NOTE_STATUS_FIELD = {
  name: "Status",
  type: "singleSelect",
  options: {
    choices: [
      { name: "Open", color: "blueLight2" },
      { name: "In Progress", color: "yellowLight2" },
      { name: "Resolved", color: "greenLight2" },
    ],
  },
};

const NOTE_FEEDBACK_FIELD = { name: "Frances_Feedback", type: "multilineText" };
const NOTE_TR_FIELD = { name: "TransferRequest_ID", type: "singleLineText" };
const NOTE_SCREENSHOTS_FIELD = { name: "Screenshots", type: "multipleAttachments" };
const NOTE_LATER_FIELDS = [
  NOTE_STATUS_FIELD,
  NOTE_FEEDBACK_FIELD,
  NOTE_TR_FIELD,
  NOTE_SCREENSHOTS_FIELD,
];

async function ensureNotesTable(): Promise<string> {
  const cache = getTableCache();
  if (cache.asinNotesV3) return cache.asinNotesV3;

  const { baseId } = getConfig();
  const { tables } = await metaFetch(`bases/${baseId}/tables`);
  let table = tables.find((t: { name: string }) => t.name === "ASIN_Notes");

  if (!table) {
    table = await metaFetch(`bases/${baseId}/tables`, {
      method: "POST",
      body: JSON.stringify({
        name: "ASIN_Notes",
        fields: [
          { name: "ASIN", type: "singleLineText" },
          { name: "Product_Name", type: "singleLineText" },
          { name: "Note", type: "multilineText" },
          ...NOTE_LATER_FIELDS,
          {
            name: "Created_Date",
            type: "dateTime",
            options: {
              timeZone: "America/Los_Angeles",
              dateFormat: { name: "iso" },
              timeFormat: { name: "24hour" },
            },
          },
        ],
      }),
    });
  } else {
    // Add fields introduced after the table was first created
    const existingFieldNames = (table.fields || []).map(
      (f: { name: string }) => f.name
    );
    for (const field of NOTE_LATER_FIELDS) {
      if (!existingFieldNames.includes(field.name)) {
        await metaFetch(`bases/${baseId}/tables/${table.id}/fields`, {
          method: "POST",
          body: JSON.stringify(field),
        });
      }
    }
  }

  const tableId = table.id || table.name;
  setTableCache({ ...getTableCache(), asinNotesV3: tableId });
  return tableId;
}

function mapAsinNote(record: {
  id: string;
  fields: Record<string, unknown>;
}): AsinNote {
  const f = record.fields;
  return {
    id: record.id,
    asin: (f["ASIN"] as string) || "",
    productName: (f["Product_Name"] as string) || "",
    note: (f["Note"] as string) || "",
    status: (f["Status"] as NoteStatus) || "Open",
    francesFeedback: (f["Frances_Feedback"] as string) || "",
    transferRequestId: (f["TransferRequest_ID"] as string) || "",
    screenshots: (
      (f["Screenshots"] as {
        id: string;
        url: string;
        filename: string;
        thumbnails?: { large?: { url: string } };
      }[]) || []
    ).map(
      (a): NoteScreenshot => ({
        id: a.id,
        url: a.url,
        thumbUrl: a.thumbnails?.large?.url || a.url,
        filename: a.filename,
      })
    ),
    createdDate: (f["Created_Date"] as string) || "",
  };
}

export async function fetchAsinNote(recordId: string): Promise<AsinNote> {
  const { baseId } = getConfig();
  const notesTable = await ensureNotesTable();
  return mapAsinNote(
    await airtableFetch(baseId, `${encodeURIComponent(notesTable)}/${recordId}`)
  );
}

export async function fetchAsinNotes(): Promise<AsinNote[]> {
  const { baseId } = getConfig();
  const notesTable = await ensureNotesTable();
  const allRecords: AsinNote[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set("sort[0][field]", "Created_Date");
    params.set("sort[0][direction]", "desc");
    if (offset) params.set("offset", offset);

    const data = await airtableFetch(
      baseId,
      `${encodeURIComponent(notesTable)}?${params.toString()}`
    );
    allRecords.push(...data.records.map(mapAsinNote));
    offset = data.offset;
  } while (offset);

  return allRecords;
}

export async function createAsinNote(data: {
  asin: string;
  productName: string;
  note: string;
  status: NoteStatus;
}): Promise<AsinNote> {
  const { baseId } = getConfig();
  const notesTable = await ensureNotesTable();

  const result = await airtableFetch(baseId, encodeURIComponent(notesTable), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        ASIN: data.asin,
        Product_Name: data.productName,
        Note: data.note,
        Status: data.status,
        Created_Date: new Date().toISOString(),
      },
    }),
  });
  return mapAsinNote(result);
}

export async function updateAsinNote(
  recordId: string,
  fields: Partial<{
    asin: string;
    productName: string;
    note: string;
    status: NoteStatus;
    francesFeedback: string;
    transferRequestId: string;
    // Screenshots to keep, by attachment id (anything left out is removed)
    screenshotIds: string[];
  }>
): Promise<AsinNote> {
  const { baseId } = getConfig();
  const notesTable = await ensureNotesTable();

  const airtableFields: Record<string, unknown> = {};
  if (fields.asin !== undefined) airtableFields["ASIN"] = fields.asin;
  if (fields.productName !== undefined)
    airtableFields["Product_Name"] = fields.productName;
  if (fields.note !== undefined) airtableFields["Note"] = fields.note;
  if (fields.status !== undefined) airtableFields["Status"] = fields.status;
  if (fields.francesFeedback !== undefined)
    airtableFields["Frances_Feedback"] = fields.francesFeedback;
  if (fields.transferRequestId !== undefined)
    airtableFields["TransferRequest_ID"] = fields.transferRequestId;
  if (fields.screenshotIds !== undefined)
    airtableFields["Screenshots"] = fields.screenshotIds.map((id) => ({ id }));

  const result = await airtableFetch(
    baseId,
    `${encodeURIComponent(notesTable)}/${recordId}`,
    { method: "PATCH", body: JSON.stringify({ fields: airtableFields }) }
  );
  return mapAsinNote(result);
}

export async function deleteAsinNote(recordId: string): Promise<void> {
  const { baseId } = getConfig();
  const notesTable = await ensureNotesTable();
  await airtableFetch(
    baseId,
    `${encodeURIComponent(notesTable)}/${recordId}`,
    { method: "DELETE" }
  );
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read the image"));
    reader.readAsDataURL(file);
  });
}

// Airtable's direct upload endpoint takes files up to 5 MB
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export async function uploadNoteScreenshot(
  recordId: string,
  file: File
): Promise<AsinNote> {
  if (file.size > MAX_SCREENSHOT_BYTES) {
    throw new Error("The image is larger than 5 MB. Try a smaller screenshot.");
  }
  const { token, baseId } = getConfig();
  await ensureNotesTable();
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const filename =
    file.name && file.name !== "image.png"
      ? file.name
      : `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;

  const res = await fetchWithRetry(
    `https://content.airtable.com/v0/${baseId}/${recordId}/Screenshots/uploadAttachment`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contentType: file.type || "image/png",
        file: await fileToBase64(file),
        filename,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Airtable error: ${res.status}`);
  }
  // The upload response keys fields by ID, so re-read the note by name
  return fetchAsinNote(recordId);
}

// Gives an Open note its own Request ID on the Transfer Requests page
export async function createTransferForNote(note: AsinNote): Promise<AsinNote> {
  const transferRequestId = await generateTransferRequestId();
  await createTransferRequest({
    transferRequestId,
    from: "",
    to: "",
    description: `ASIN Note: ${note.asin}${note.productName ? ` - ${note.productName}` : ""}`,
    status: "Draft",
  });
  return updateAsinNote(note.id, { transferRequestId });
}

export async function deleteTransferByRequestId(
  transferRequestId: string
): Promise<void> {
  const match = (await fetchTransferRequests()).find(
    (t) => t.transferRequestId === transferRequestId
  );
  if (!match) return;
  await deleteLineItemsByTransfer(transferRequestId);
  await deleteTransferRequest(match.id);
}

// --- Products Catalog (cross-base) ---

export async function searchProducts(query: string): Promise<Product[]> {
  if (!query || query.length < 2) return [];

  const { token } = getConfig();
  if (!token) return [];

  const params = new URLSearchParams();
  params.set(
    "filterByFormula",
    `OR(FIND(UPPER("${query}"), UPPER({ASIN})), FIND(UPPER("${query}"), UPPER({Product Name})))`
  );
  params.set("maxRecords", "10");

  const url = `https://api.airtable.com/v0/${PRODUCTS_BASE_ID}/${PRODUCTS_TABLE_ID}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return [];
  const data = await res.json();

  return data.records.map(
    (r: { id: string; fields: Record<string, unknown> }) => ({
      id: r.id,
      asin: (r.fields["ASIN"] as string) || "",
      productName: (r.fields["Product Name"] as string) || "",
    })
  );
}
