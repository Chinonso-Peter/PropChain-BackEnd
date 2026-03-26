export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  data?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerOptions {
  context?: string;
  minLevel?: LogLevel;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

// Read from env: LOG_LEVEL=debug|info|warn|error|silent
const ENV_LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

class Logger {
  private context?: string;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.context = options.context;
    this.minLevel = options.minLevel ?? ENV_LOG_LEVEL;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private buildEntry(level: LogLevel, message: string, data?: unknown, error?: Error): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(this.context && { context: this.context }),
      ...(data !== undefined && { data }),
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      };
    }

    return entry;
  }

  private write(entry: LogEntry): void {
    const output = JSON.stringify(entry);
    if (entry.level === 'error' || entry.level === 'warn') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }

  debug(message: string, data?: unknown): void {
    if (!this.shouldLog('debug')) return;
    this.write(this.buildEntry('debug', message, data));
  }

  info(message: string, data?: unknown): void {
    if (!this.shouldLog('info')) return;
    this.write(this.buildEntry('info', message, data));
  }

  warn(message: string, data?: unknown): void {
    if (!this.shouldLog('warn')) return;
    this.write(this.buildEntry('warn', message, data));
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    if (!this.shouldLog('error')) return;
    const err = error instanceof Error ? error : undefined;
    const extra = error instanceof Error ? data : error;
    this.write(this.buildEntry('error', message, extra, err));
  }

  /** Create a child logger with a specific context label */
  child(context: string): Logger {
    return new Logger({ context, minLevel: this.minLevel });
  }
}

// Singleton root logger — import and use directly, or call .child()
export const logger = new Logger();
export { Logger };
