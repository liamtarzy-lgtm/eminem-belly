import "dotenv/config";
import type { Config } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "file:./data/eminem-belly.db";
const isRemote = !url.startsWith("file:");

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: isRemote ? "turso" : "sqlite",
  dbCredentials: isRemote
    ? { url, authToken: process.env.TURSO_AUTH_TOKEN! }
    : { url: url.replace(/^file:/, "") },
} satisfies Config;
