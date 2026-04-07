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
        padding: "12px 28px",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <a
          href="https://scm-dashboard-sigma.vercel.app/"
          title="Back to Team Dashboard"
          style={{ display: "flex", alignItems: "center" }}
        >
          <img
            src="/scm-logo.png"
            alt="Seattle Cell Market"
            style={{
              height: 36,
              objectFit: "contain",
              filter: "brightness(0) invert(1)",
            }}
          />
        </a>
        <div
          style={{
            width: 1,
            height: 32,
            background: "rgba(255,255,255,0.3)",
          }}
        />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
            Transfer Requests
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Internal Tools</div>
        </div>
        <span style={{ flex: 1 }} />
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
      </div>
    </header>
  );
}
