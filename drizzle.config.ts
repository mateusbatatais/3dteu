import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// `db:generate` só compara o schema.ts com o histórico em ./drizzle e não abre
// conexão nenhuma — funciona sem .env. `db:migrate`/`db:studio` precisam de
// DIRECT_DATABASE_URL (conexão direta, porta 5432; não o pooler da porta 6543
// usado em runtime — pgbouncer em modo transaction não é confiável para DDL).
// Se estiver ausente, o próprio drizzle-kit falha com um erro claro na hora
// de conectar, então não precisamos validar isso aqui.
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
