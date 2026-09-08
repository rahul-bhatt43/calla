import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.logLevel,
  base: { node: env.nodeId },
  // Pretty output in dev only — in production this goes to stdout as JSON for
  // the Docker log driver to collect.
  transport: env.isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
      },
});
