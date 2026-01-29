import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

@Injectable()
export class StructuredLoggerService implements NestLoggerService {
  private logger: winston.Logger;
  private context?: string;

  private readonly sensitiveKeys = ['password', 'privatekey', 'token', 'secret', 'mnemonic'];

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        this.redactFormat()(), // Added extra () to execute the format
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
        new winston.transports.DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '14d',
        }),
      ],
    });
  }

  setContext(context: string) {
    this.context = context;
  }

  log(message: any, ...params: any[]) {
    this.logger.info(message, { context: this.context, ...params });
  }

  error(message: any, stack?: string) {
    this.logger.error(message, { stack, context: this.context });
  }

  warn(message: any, ...params: any[]) {
    this.logger.warn(message, { context: this.context, ...params });
  }

  debug(message: any, ...params: any[]) {
    this.logger.debug(message, { context: this.context, ...params });
  }

  // Adding these to satisfy the new interface from the upstream merge
  verbose(message: any, ...params: any[]) {
    this.logger.verbose(message, { context: this.context, ...params });
  }

  fatal(message: any, ...params: any[]) {
    this.logger.error(message, { context: this.context, fatal: true, ...params });
  }

  private redactFormat() {
    return winston.format((info) => {
      const redact = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) return obj;
        const newObj = { ...obj };
        for (const key in newObj) {
          if (this.sensitiveKeys.includes(key.toLowerCase())) {
            newObj[key] = '[REDACTED]';
          }
        }
        return newObj;
      };
      return redact(info);
    });
  }
}