import { loadConfig } from './config/env.js';
import { buildApp } from './app.js';
import { safeLog } from './utils/logger.js';

const config = loadConfig();
const { app } = await buildApp(config);
try {
  await app.listen({ port: config.port, host: config.host });
  safeLog.info('VoiceBox AI Tool Server started', { host: config.host, port: config.port, mode: config.nodeEnv });
} catch (error) {
  safeLog.error('Server startup failed', { error: error instanceof Error ? error.message : 'unknown' });
  process.exitCode = 1;
  await app.close();
}

const shutdown = async (signal: string) => {
  safeLog.info('Shutting down', { signal });
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
