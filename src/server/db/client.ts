import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// DATABASE_URL (ou POSTGRES_URL, nome usado pela integração nativa
// Vercel↔Supabase) deve apontar para o connection pooler do Supabase (porta
// 6543, modo "transaction") em runtime serverless/edge; use a porta 5432
// direta apenas para rodar migrations localmente (ver drizzle.config.ts).
//
// A conexão é criada de forma preguiçosa (só no primeiro uso real) para que
// simplesmente importar este módulo — como o Next.js faz ao coletar dados de
// build de toda rota — não quebre o build antes da env var existir.
let instance: PostgresJsDatabase<typeof schema> | undefined;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!instance) {
    const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL (ou POSTGRES_URL) não definida. Configure o .env (ou as env vars da Vercel) com a connection string do Supabase — veja .env.example.",
      );
    }
    instance = drizzle(postgres(connectionString, { prepare: false }), { schema });
  }
  return instance;
}

export const db: PostgresJsDatabase<typeof schema> = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
