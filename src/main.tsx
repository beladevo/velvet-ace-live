import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import type { RoomView } from "../shared/types";
import { Home } from "./Home";
import { Join } from "./Join";
import { Player } from "./Player";
import { Table } from "./Table";
import { playSound } from "./sound";
import "./styles.scss";

const params = new URLSearchParams(location.search);
const tableCode = params.get("table")?.toUpperCase();
const joinCode = params.get("join")?.toUpperCase();
const hostKey = params.get("key");
type Ack = { ok?: boolean; error?: string; token?: string; name?: string };

function App() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(localStorage.getItem("va-name") ?? "");
  const [joining, setJoining] = useState(false);
  const [connected, setConnected] = useState(true);
  const [sound, setSound] = useState(
    localStorage.getItem("va-sound") !== "off",
  );
  const [seconds, setSeconds] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const lastRef = useRef("");

  useEffect(() => {
    if (!tableCode && !joinCode) return;
    const socket = io();
    socketRef.current = socket;
    const request = (event: string, payload: object) =>
      socket.emit(event, payload, (result: Ack) => {
        if (result?.error) {
          setError(result.error);
          if (event === "player:join") {
            localStorage.removeItem(`va-token-${joinCode}`);
            setJoining(false);
          }
        }
        if (event === "player:join" && result?.token) {
          localStorage.setItem(`va-token-${joinCode}`, result.token);
          localStorage.setItem("va-name", result.name ?? "");
          setJoining(true);
        }
      });
    socket.on("connect", () => {
      setConnected(true);
      if (tableCode) request("host:watch", { code: tableCode, key: hostKey });
      if (joinCode) {
        const token = localStorage.getItem(`va-token-${joinCode}`);
        if (token)
          request("player:join", {
            code: joinCode,
            name: localStorage.getItem("va-name"),
            token,
          });
      }
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (next: RoomView) => {
      const turnKey = `${next.game?.hand}:${next.game?.phase}:${next.game?.turn}`;
      if (
        lastRef.current &&
        turnKey !== lastRef.current &&
        next.game?.turn !== undefined &&
        next.game.turn >= 0
      )
        playSound("turn", localStorage.getItem("va-sound") !== "off");
      if (
        lastRef.current &&
        next.game?.phase === "showdown" &&
        !lastRef.current.includes("showdown")
      )
        playSound("win", localStorage.getItem("va-sound") !== "off");
      lastRef.current = turnKey;
      setRoom(next);
      setError("");
    });
    socket.on("room:deadline", (deadline: number) =>
      setRoom((current) => (current ? { ...current, deadline } : current)),
    );
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(
      () =>
        setSeconds(
          room?.deadline
            ? Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000))
            : 0,
        ),
      250,
    );
    return () => clearInterval(timer);
  }, [room?.deadline]);

  function emit(event: string, payload: object) {
    socketRef.current?.emit(event, payload, (result: Ack) => {
      if (result?.error) setError(result.error);
      else if (event === "player:action") playSound("chip", sound);
    });
  }
  function join() {
    if (!joinCode || name.trim().length < 2) {
      setError("Enter a name with at least two characters.");
      return;
    }
    setJoining(true);
    emitJoin(joinCode, name.trim());
  }
  function emitJoin(code: string, playerName: string) {
    socketRef.current?.emit(
      "player:join",
      { code, name: playerName },
      (result: Ack) => {
        if (result?.error) {
          setError(result.error);
          setJoining(false);
          return;
        }
        localStorage.setItem(`va-token-${code}`, result.token ?? "");
        localStorage.setItem("va-name", result.name ?? playerName);
      },
    );
  }
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    localStorage.setItem("va-sound", next ? "on" : "off");
  };
  return (
    <>
      {!tableCode && !joinCode ? (
        <Home onError={setError} />
      ) : tableCode ? (
        <Table
          room={room}
          seconds={seconds}
          connected={connected}
          onDeal={(fresh) => emit("host:deal", { fresh })}
          sound={sound}
          toggleSound={toggleSound}
        />
      ) : room ? (
        <Player
          room={room}
          seconds={seconds}
          connected={connected}
          onAction={(type, total) => emit("player:action", { type, total })}
          sound={sound}
          toggleSound={toggleSound}
        />
      ) : (
        <Join
          code={joinCode!}
          name={name}
          setName={setName}
          joining={joining}
          onJoin={join}
        />
      )}
      {error && (
        <div className="toast" role="alert" onClick={() => setError("")}>
          {error} <span>×</span>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
