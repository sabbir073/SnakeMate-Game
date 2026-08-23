import { pino } from "pino";

/** Structured JSON logs (spec §58). Pretty-printing is a dev-only concern —
 *  production emits raw JSON for collection/rotation. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "nibblio-server" },
});
