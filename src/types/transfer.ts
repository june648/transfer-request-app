export interface TransferRequest {
  id: string;
  transferRequestId: string;
  from: string;
  to: string;
  description: string;
  status: TransferStatus;
  createdDate: string;
  updatedDate: string;
}

export type TransferStatus =
  | "Draft"
  | "Submitted"
  | "In Transit"
  | "Received"
  | "Cancelled";

export const TRANSFER_STATUSES: TransferStatus[] = [
  "Draft",
  "Submitted",
  "In Transit",
  "Received",
  "Cancelled",
];

export interface TransferLineItem {
  id: string;
  transferRequestId: string;
  from: string;
  to: string;
  asin: string;
  productDescription: string;
  quantity: number;
}

export interface Product {
  id: string;
  asin: string;
  productName: string;
}

export interface LineItemDraft {
  asin: string;
  productDescription: string;
  quantity: number;
}

export interface WarehouseGroup {
  from: string;
  to: string;
  items: LineItemDraft[];
}

export interface WarehouseGroupEditable {
  from: string;
  to: string;
  items: EditableLineItem[];
}

export interface EditableLineItem {
  id?: string;
  asin: string;
  productDescription: string;
  quantity: number;
  isNew?: boolean;
  isDeleted?: boolean;
}

export interface AsinNote {
  id: string;
  asin: string;
  productName: string;
  note: string;
  createdDate: string;
}
