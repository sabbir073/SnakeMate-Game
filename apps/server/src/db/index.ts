import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { logger } from "../logger.js";

/** PostgreSQL access (spec §31, §33). OPTIONAL: without DATABASE_URL (or when
 *  unreachable) the server runs memory-only — persistence quietly disabled,
 *  gameplay unaffected. Never touches the realtime loop (ADR-005): all writes
 *  are queued and flushed in batches by persistence.ts. */

let pool: pg.Pool | null = null;
let available = false;

export function dbAvailable(): boolean {
  return available;
}

export function getPool(): pg.Pool | null {
  return pool;
}

/** Ordered .sql migration runner with history table (spec §69).
 *  Files apply once, in name order; applied files are immutable. */
function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MIGRATIONS_DIR,               // explicit override
    path.resolve(here, "../../migrations"),  // running from src/db (tsx dev)
    path.resolve(here, "../migrations"),     // running from dist bundle
    path.resolve(process.cwd(), "migrations"),
  ].filter((c): c is string => !!c);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(`migrations directory not found (tried: ${candidates.join(", ")})`);
}

async function migrate(p: pg.Pool): Promise<void> {
  const dir = migrationsDir();
  await p.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const applied = new Set(
    (await p.query("SELECT name FROM schema_migrations")).rows.map((r: { name: string }) => r.name),
  );
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), "utf8");
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      logger.info({ migration: file, event: "db_migrate" }, "migration applied");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}

export async function initDb(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    logger.warn({ event: "db_disabled" }, "DATABASE_URL not set — persistence disabled");
    return false;
  }
  try {
    pool = new pg.Pool({
      connectionString: url,
      max: 8,
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (err) => {
      logger.error({ err, event: "db_pool_error" }, "postgres pool error");
    });
    await pool.query("SELECT 1");
    await migrate(pool);
    available = true;
    logger.info({ event: "db_ready" }, "postgres connected + migrated");
    return true;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, event: "db_unreachable" },
      "postgres unreachable — persistence disabled",
    );
    pool = null;
    available = false;
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await pool?.end().catch(() => undefined);
  pool = null;
  available = false;
}
