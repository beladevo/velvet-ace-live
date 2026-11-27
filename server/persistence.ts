import { createHash } from "node:crypto";
import pg from "pg";
import type { PokerGameState } from "./game.js";

export const secretHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export interface SavedRoom {
  version: 1;
  id: string;
  hostKeyHash: string;
  createdAt: number;
  lastActiveAt: number;
  roster: {
    id: string;
    tokenHash: string;
    name: string;
    seat: number;
    avatar: number;
    ip: string;
    userAgent: string;
    firstSeenAt: number;
    lastSeenAt: number;
  }[];
  game: PokerGameState | null;
  config: {
    paused: boolean;
    locked: boolean;
    autoDeal: boolean;
    turnSeconds: number;
    startingStack: number;
  };
}

export interface Ban {
  kind: "ip" | "guest";
  value: string;
  label?: string;
  reason: string;
  createdAt: number;
}

export interface RoomStore {
  load(): Promise<SavedRoom[]>;
  save(room: SavedRoom): Promise<void>;
  delete(id: string): Promise<void>;
  loadBans(): Promise<Ban[]>;
  saveBans(bans: Ban[]): Promise<void>;
}

export class PostgresRoomStore implements RoomStore {
  private pool: pg.Pool;
  private ready = false;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 2,
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
    });
  }

  private async ensureTable(): Promise<void> {
    if (this.ready) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS velvet_ace_rooms (
        code text PRIMARY KEY,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        expires_at bigint NOT NULL,
        state jsonb NOT NULL
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS velvet_ace_moderation (
        id integer PRIMARY KEY CHECK (id = 1),
        bans jsonb NOT NULL
      )
    `);
    this.ready = true;
  }

  async load(): Promise<SavedRoom[]> {
    await this.ensureTable();
    await this.pool.query(
      "DELETE FROM velvet_ace_rooms WHERE expires_at <= $1",
      [Date.now()],
    );
    const result = await this.pool.query<{ state: SavedRoom }>(
      "SELECT state FROM velvet_ace_rooms WHERE expires_at > $1",
      [Date.now()],
    );
    return result.rows.map((row) => row.state);
  }

  async save(room: SavedRoom): Promise<void> {
    await this.ensureTable();
    await this.pool.query(
      `INSERT INTO velvet_ace_rooms (code, created_at, updated_at, expires_at, state)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (code) DO UPDATE SET
         updated_at = EXCLUDED.updated_at,
         expires_at = EXCLUDED.expires_at,
         state = EXCLUDED.state`,
      [
        room.id,
        room.createdAt,
        Date.now(),
        room.lastActiveAt + 8 * 60 * 60 * 1000,
        JSON.stringify(room),
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await this.ensureTable();
    await this.pool.query("DELETE FROM velvet_ace_rooms WHERE code = $1", [id]);
  }

  async loadBans(): Promise<Ban[]> {
    await this.ensureTable();
    const result = await this.pool.query<{ bans: Ban[] }>(
      "SELECT bans FROM velvet_ace_moderation WHERE id = 1",
    );
    return result.rows[0]?.bans ?? [];
  }

  async saveBans(bans: Ban[]): Promise<void> {
    await this.ensureTable();
    await this.pool.query(
      `INSERT INTO velvet_ace_moderation (id, bans) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET bans = EXCLUDED.bans`,
      [JSON.stringify(bans)],
    );
  }
}
