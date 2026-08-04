import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// `db:generate` só compara o schema.ts com o histórico em ./drizzle e não abre
// conexão nenhuma — funciona sem .env. `db:migrate`/`db:studio` precisam da
// conexão direta (porta 5432; não o pooler da porta 6543 usado em runtime —
// pgbouncer em modo transaction não é confiável para DDL): DIRECT_DATABASE_URL
// no .env local, ou POSTGRES_URL_NON_POOLING (nome usado pela integração
// nativa Vercel↔Supabase). Se nenhuma existir, o próprio drizzle-kit falha
// com um erro claro na hora de conectar.
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? "",
  },
  strict: true,
  verbose: true,
});
