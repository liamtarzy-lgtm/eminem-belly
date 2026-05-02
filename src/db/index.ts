import { createDbClient } from "./client";
import * as schemaModule from "./schema";

export const db = createDbClient();
export const schema = schemaModule;
