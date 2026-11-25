import { useState } from "react";
import { Brand, Card } from "./ui";

export function Home({ onError }: { onError: (message: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const response = await fetch("/api/rooms", { method: "POST" });
      const data = (await response.json()) as {
        tableUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.tableUrl)
        throw new Error(data.error ?? "Could not create a table.");
      location.href = data.tableUrl;
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
            Live Texas Hold’em with friends. Put the table on your TV, scan the
            code and play your cards from your phone.
          </p>
          <button className="gold-button" onClick={create} disabled={busy}>
            {busy ? "OPENING TABLE…" : "CREATE A TABLE"} <span>→</span>
          </button>
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
          <small>2–6 players · Private room · Fictional chips</small>
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
