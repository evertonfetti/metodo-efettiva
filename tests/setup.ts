import { config } from "dotenv";

config({ quiet: true });
// Sempre usar o banco de teste: nunca rodar testes contra o banco de desenvolvimento.
const url = new URL(process.env.DATABASE_URL!);
if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
process.env.DATABASE_URL = url.toString();
process.env.APP_URL = "http://localhost:3000";
