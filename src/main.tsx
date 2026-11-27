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
const quickPlay = params.has("quick");
const hostKey = params.get("key");
type Ack = {
  ok?: boolean;
  error?: string;
  token?: string;
  name?: string;
  code?: string;
};

function App() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(localStorage.getItem("va-name") ?? "");
  const [avatar, setAvatar] = useState(
    Number(localStorage.getItem("va-avatar") ?? 0),
  );
  const [joining, setJoining] = useState(false);
  const [connected, setConnected] = useState(true);
  const [sound, setSound] = useState(
    localStorage.getItem("va-sound") !== "off",
  );
  const [seconds, setSeconds] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const lastGameRef = useRef<{
    hand: number;
    phase: string;
    board: number;
    turn: number;
    pot: number;
    allIns: string[];
  } | null>(null);

  useEffect(() => {
    if (!tableCode && !joinCode && !quickPlay) return;
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
      const current = next.game;
      const previous = lastGameRef.current;
      const enabled = localStorage.getItem("va-sound") !== "off";
      if (current && previous) {
        const addedChips =
          current.hand === previous.hand
            ? Math.max(0, current.pot - previous.pot)
            : 0;
        if (addedChips > 0) playSound("chip", enabled, addedChips);
        const newAllIn = current.players.some(
          (player) =>
            player.lastAction === "ALL IN" &&
            (current.hand !== previous.hand ||
              !previous.allIns.includes(player.id)),
        );
        if (newAllIn)
          setTimeout(() => playSound("allin", enabled), addedChips ? 250 : 0);
        if (current.phase === "showdown" && previous.phase !== "showdown") {
          if (newAllIn) setTimeout(() => playSound("win", enabled), 750);
          else playSound("win", enabled);
        } else if (
          current.hand !== previous.hand ||
          current.board.length > previous.board
        )
          playSound("deal", enabled);
        else if (current.turn !== previous.turn && current.turn >= 0)
          playSound("turn", enabled);
      }
      lastGameRef.current = current
        ? {
            hand: current.hand,
            phase: current.phase,
            board: current.board.length,
            turn: current.turn,
            pot: current.pot,
            allIns: current.players
              .filter((player) => player.lastAction === "ALL IN")
              .map((player) => player.id),
          }
        : null;
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
    });
  }
  function join() {
    if ((!joinCode && !quickPlay) || name.trim().length < 2) {
      setError("Enter a name with at least two characters.");
      return;
    }
    setJoining(true);
    if (quickPlay) {
      socketRef.current?.emit(
        "player:quick-join",
        { name: name.trim(), avatar },
        (result: Ack) => {
          if (result?.error || !result?.code || !result?.token) {
            setError(result?.error ?? "Could not find a seat.");
            setJoining(false);
            return;
          }
          localStorage.setItem(`va-token-${result.code}`, result.token);
          localStorage.setItem("va-name", result.name ?? name.trim());
          location.replace(`/?join=${result.code}`);
        },
      );
    } else emitJoin(joinCode!, name.trim());
  }
  function emitJoin(code: string, playerName: string) {
    socketRef.current?.emit(
      "player:join",
      { code, name: playerName, avatar },
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
    if (next) playSound("chip", true, 100);
  };
  return (
    <>
      {!tableCode && !joinCode && !quickPlay ? (
        <Home onError={setError} />
      ) : tableCode ? (
        <Table
          room={room}
          seconds={seconds}
          connected={connected}
          sound={sound}
          toggleSound={toggleSound}
        />
      ) : room && !quickPlay ? (
        <Player
          room={room}
          seconds={seconds}
          connected={connected}
          onAction={(type, total) => emit("player:action", { type, total })}
          onAvatarChange={(choice) => emit("player:avatar", { avatar: choice })}
          onSocial={(kind, content) => emit("player:social", { kind, content })}
          onShow={() => emit("player:show", {})}
          onMuck={() => emit("player:muck", {})}
          sound={sound}
          toggleSound={toggleSound}
        />
      ) : (
        <Join
          code={joinCode ?? ""}
          quick={quickPlay}
          name={name}
          avatar={avatar}
          setAvatar={(choice) => {
            setAvatar(choice);
            localStorage.setItem("va-avatar", String(choice));
          }}
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
