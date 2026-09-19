import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/app.db";
if (url.startsWith("file:")) mkdirSync("data", { recursive: true });

export const db = drizzle(createClient({ url }), { schema });
export * from "./schema";
