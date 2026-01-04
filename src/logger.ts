import pino, { type Logger } from 'pino';

let logger: Logger;

export function initLogger(level = 'info') {
  logger = pino({
    level,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return logger;
}

export { logger };
