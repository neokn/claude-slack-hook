import pino, { type Logger } from 'pino';

let logger: Logger;

export function initLogger(level = 'info') {
  logger = pino({
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
    level,
  });
  return logger;
}

export { logger };
