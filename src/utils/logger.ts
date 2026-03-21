/**
 * Structured logging via Pino.
 */

import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';

export const logger = pino({
  level,
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

/**
 * Create a child logger with a specific module name.
 */
export function createLogger(module: string): pino.Logger {
  return logger.child({ module });
}
