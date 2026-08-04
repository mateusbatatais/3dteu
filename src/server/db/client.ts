import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// DATABASE_URL deve apontar para o connection pooler do Supabase (porta 6543,
// modo "transaction") em runtime serverless/edge; use a porta 5432 direta
// apenas para rodar migrations localmente (ver drizzle.config.ts).
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não definida. Configure o .env com a connection string do Supabase (veja .env.example).",
  );
}

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
