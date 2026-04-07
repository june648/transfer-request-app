"use client";

interface TopBarProps {
  onSettingsClick: () => void;
}

export default function TopBar({ onSettingsClick }: TopBarProps) {
  return (
    <header
      style={{
        background: "var(--primary)",
        color: "white",
        padding: "0 24px",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>SCM</span>
        <span
          style={{
            width: 1,
            height: 24,
            background: "rgba(255,255,255,0.3)",
          }}
        />
        <span style={{ fontSize: 15, fontWeight: 500, opacity: 0.95 }}>
          Transfer Requests
        </span>
      </div>
      <button
        onClick={onSettingsClick}
        className="btn btn-sm"
        style={{
          background: "rgba(255,255,255,0.15)",
          color: "white",
          border: "1px solid rgba(255,255,255,0.25)",
        }}
      >
        Settings
      </button>
    </header>
  );
}
