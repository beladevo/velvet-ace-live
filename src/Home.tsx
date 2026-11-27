import { useState } from "react";
import { Brand, Card } from "./ui";

export function Home({ onError }: { onError: (message: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(display: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/rooms", { method: "POST" });
      const data = (await response.json()) as {
        tableUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.tableUrl)
        throw new Error(data.error ?? "Could not create a table.");
      if (display) {
        location.href = data.tableUrl;
      } else {
        const roomCode = new URL(data.tableUrl).searchParams.get("table");
        if (!roomCode) throw new Error("Could not open the new table.");
        localStorage.setItem(`va-table-url-${roomCode}`, data.tableUrl);
        location.href = `/?join=${roomCode}`;
      }
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "Could not create a table.",
      );
      setBusy(false);
    }
  }
  function go() {
    if (code.trim().length === 6)
      location.href = `/?join=${encodeURIComponent(code.trim().toUpperCase())}`;
    else onError("Enter the six-character table code.");
  }
  return (
    <main className="home-screen">
      <header className="home-header">
        <Brand />
        <span>PRIVATE POKER CLUB</span>
      </header>
      <div className="home-content">
        <div className="home-copy">
          <span className="eyebrow">♠ &nbsp; YOUR NIGHT. YOUR TABLE.</span>
          <h1>
            Take a seat
            <br />
            at the <em>good table.</em>
          </h1>
          <p>
            Play Texas Hold’em on your phone or PC. Find an open table, invite
            friends to a private one, or put the table on your TV.
          </p>
          <button
            className="gold-button"
            onClick={() => (location.href = "/?quick=1")}
            disabled={busy}
          >
            PLAY NOW <span>→</span>
          </button>
          <div className="home-other-actions">
            <button onClick={() => create(false)} disabled={busy}>
              CREATE PRIVATE TABLE
            </button>
            <button onClick={() => create(true)} disabled={busy}>
              DISPLAY TABLE ON THIS SCREEN
            </button>
          </div>
          <div className="code-entry">
            <label htmlFor="room-code">HAVE A TABLE CODE?</label>
            <div>
              <input
                id="room-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                onKeyDown={(event) => event.key === "Enter" && go()}
                placeholder="ENTER CODE"
              />
              <button onClick={go}>JOIN TABLE</button>
            </div>
          </div>
          <small>
            2–6 players · Quick play or private room · Fictional chips
          </small>
        </div>
        <div className="home-preview">
          <div className="preview-glow" />
          <div className="preview-table">
            <div className="preview-felt">
              <div className="preview-cards">
                <Card card={{ rank: "A", suit: "♠", value: 14 }} />
                <Card card={{ rank: "K", suit: "♥", value: 13 }} />
              </div>
              <span>VELVET ACE</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
