type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, extra?: unknown): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = level === 'info' ? console.log : console.error;
  if (extra === undefined) out(line);
  else out(line, extra);
}

export const log = {
  info: (message: string, extra?: unknown) => write('info', message, extra),
  warn: (message: string, extra?: unknown) => write('warn', message, extra),
  error: (message: string, extra?: unknown) => write('error', message, extra),
};
