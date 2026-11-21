import { execSync } from "node:child_process";
import { config } from "dotenv";
import pg from "pg";

/** Cria (se preciso) e migra o banco de teste `<db>_test`, isolado do banco de desenvolvimento. */
export default async function globalSetup() {
  config({ quiet: true });
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL ausente para os testes");
  const url = new URL(base);
  const testDb = `${url.pathname.slice(1)}_test`;
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDb]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${testDb}"`);
  await client.end();

  url.pathname = `/${testDb}`;
  process.env.TEST_DATABASE_URL = url.toString();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
}
