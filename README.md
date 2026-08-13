# Transfer Request App

A supply chain management tool for creating, tracking, and managing inventory transfer requests between locations. Built with Next.js and backed by Airtable.

## Features

- **Transfer Requests** — Create and manage transfer requests with auto-generated IDs (e.g. `TR-20260525`; same-day collisions fall back to `TR-20260525-002`, `-003`, …)
- **Status Tracking** — Track requests through a workflow: Draft → Submitted → In Transit → Received → Cancelled
- **Line Items** — Add products to each transfer with ASIN, description, and quantity
- **Product Catalog Search** — Look up products by ASIN or name from a shared Airtable catalog
- **Filtering & Search** — Filter transfers by status or search by ID, location, and description
- **Dashboard Summary** — View transfer counts by status at a glance

## Tech Stack

- [Next.js 15](https://nextjs.org/) (App Router)
- [React 18](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Airtable](https://airtable.com/) (backend database via REST API)

## Getting Started

### Prerequisites

- Node.js 18+
- An [Airtable](https://airtable.com/) account with a Personal Access Token (PAT)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Configuration

On first launch, click **Open Settings** to configure:

1. **Airtable Personal Access Token** — Generate one at [airtable.com/create/tokens](https://airtable.com/create/tokens) with read/write access to your base and the metadata API.
2. **Airtable Base ID** — Found in your Airtable base URL (`https://airtable.com/<BASE_ID>/...`).

Configuration is stored in your browser's `localStorage`. The required tables (`Transfer_Requests` and `Transfer_Line_Items`) are automatically created in your Airtable base if they don't already exist.

## Project Structure

```
src/
├── app/
│   ├── globals.css        # Global styles and CSS variables
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page (dashboard, filters, table)
├── components/
│   ├── CreateTransferModal.tsx   # New transfer request form
│   ├── EditTransferModal.tsx     # Edit transfer and manage line items
│   ├── SettingsModal.tsx         # Airtable configuration
│   ├── StatusBadge.tsx           # Status pill component
│   ├── TopBar.tsx                # App header/navigation
│   └── TransferTable.tsx         # Transfer requests data table
├── lib/
│   └── airtable.ts        # Airtable API client (CRUD for requests, line items, products)
└── types/
    └── transfer.ts        # TypeScript interfaces and status definitions
```
