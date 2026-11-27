import { AvatarPicker, Brand } from "./ui";
export function Join({
  code,
  quick,
  name,
  avatar,
  setAvatar,
  setName,
  joining,
  onJoin,
}: {
  code: string;
  quick?: boolean;
  name: string;
  avatar: number;
  setAvatar: (value: number) => void;
  setName: (value: string) => void;
  joining: boolean;
  onJoin: () => void;
}) {
  return (
    <main className="join-screen">
      <Brand />
      <div className="join-panel">
        <span className="eyebrow">
          {quick ? "QUICK PLAY · OPEN TABLE" : `TABLE ${code} · PRIVATE GAME`}
        </span>
        <h1>{quick ? "Play now." : "Take your seat."}</h1>
        <p>
          {quick
            ? "Join an open table with players. If none is available, play against 2–3 bots."
            : "Choose a name. Your hole cards stay private on this screen."}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onJoin();
          }}
        >
          <label htmlFor="player-name">YOUR NAME</label>
          <input
            id="player-name"
            value={name}
            maxLength={18}
            onChange={(event) => setName(event.target.value)}
            placeholder="What should we call you?"
            autoComplete="nickname"
          />
          <label>CHOOSE YOUR CHARACTER</label>
          <AvatarPicker value={avatar} onChange={setAvatar} />
          <button className="gold-button" disabled={joining}>
            {joining ? "JOINING…" : quick ? "FIND A SEAT →" : "JOIN TABLE →"}
          </button>
        </form>
      </div>
      <small>NO ACCOUNT NEEDED · FICTIONAL CHIPS</small>
    </main>
  );
}
