import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCM Transfer Requests",
  description: "Transfer Request Management - Warehouse/Vendor to FBA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
