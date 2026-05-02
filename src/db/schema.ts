import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Auth.js tables (Drizzle adapter shape) ────────────────────────────
export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const accounts = sqliteTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// ─── App tables ────────────────────────────────────────────────────────
export const songs = sqliteTable(
  "songs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    musicbrainzId: text("musicbrainz_id").unique(),
    title: text("title").notNull(),
    primaryArtist: text("primary_artist").notNull(),
    featuredArtists: text("featured_artists", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    album: text("album"),
    releaseDate: text("release_date"),
    artUrl: text("art_url"),
    previewUrl: text("preview_url"),
    deezerTrackId: integer("deezer_track_id"),
    durationMs: integer("duration_ms"),
    eminemRole: text("eminem_role", { enum: ["primary", "feature"] }).notNull(),
  },
  (t) => [
    index("songs_title_idx").on(t.title),
    index("songs_eminem_role_idx").on(t.eminemRole),
  ],
);

export const rankings = sqliteTable(
  "rankings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("rankings_user_song_uq").on(t.userId, t.songId),
    uniqueIndex("rankings_user_position_uq").on(t.userId, t.position),
  ],
);

export const comparisons = sqliteTable(
  "comparisons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    winnerSongId: integer("winner_song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    loserSongId: integer("loser_song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    sessionId: integer("session_id").references(() => insertionSessions.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("comparisons_user_idx").on(t.userId)],
);

export const insertionSessions = sqliteTable(
  "insertion_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetSongId: integer("target_song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    low: integer("low").notNull(),
    high: integer("high").notNull(),
    skippedOpponentIds: text("skipped_opponent_ids", { mode: "json" })
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'`),
    status: text("status", { enum: ["active", "completed", "abandoned"] })
      .notNull()
      .default("active"),
    isRecompare: integer("is_recompare", { mode: "boolean" })
      .notNull()
      .default(false),
    questionsAsked: integer("questions_asked").notNull().default(0),
    maxQuestions: integer("max_questions").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (t) => [
    index("insertion_sessions_user_status_idx").on(t.userId, t.status),
  ],
);

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;
export type Ranking = typeof rankings.$inferSelect;
export type Comparison = typeof comparisons.$inferSelect;
export type InsertionSession = typeof insertionSessions.$inferSelect;
