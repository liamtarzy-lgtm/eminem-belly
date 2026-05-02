import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

export function createDbClient() {
  const url = process.env.DATABASE_URL ?? "file:./data/eminem-belly.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // For local file URLs, make sure the parent directory exists.
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    mkdirSync(dirname(path), { recursive: true });
  }

  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}
