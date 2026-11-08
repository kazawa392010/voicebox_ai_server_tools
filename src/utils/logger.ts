export const safeLog = {
  info(message: string, fields: Record<string, unknown> = {}) { process.stdout.write(`${JSON.stringify({ level: 'info', message, ...fields })}\n`); },
  error(message: string, fields: Record<string, unknown> = {}) { process.stderr.write(`${JSON.stringify({ level: 'error', message, ...fields })}\n`); }
};
