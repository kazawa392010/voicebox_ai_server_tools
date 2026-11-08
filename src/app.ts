import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig } from './config/env.js';
import { ToolRegistry } from './core/tool-registry.js';
import { ToolExecutor } from './core/tool-executor.js';
import { AssetStore } from './storage/asset-store.js';
import { authenticate } from './security/auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerToolRoutes } from './routes/tools.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerMcpRoute } from './mcp/mcp-server.js';
import { registerSearchTool } from './tools/search/index.js';
import { registerVietSchoolTool } from './tools/vietschool/index.js';
import { registerMusicTools } from './tools/music/index.js';
import { registerGraphicsTools } from './tools/graphics/index.js';
import { registerImageTool } from './tools/image/index.js';
import { registerMapTools } from './tools/map/index.js';

export interface AppContext { app: FastifyInstance; registry: ToolRegistry; executor: ToolExecutor; assets: AssetStore; }
export async function buildApp(config: AppConfig): Promise<AppContext> {
  const app: FastifyInstance = Fastify({ logger: false, bodyLimit: config.requestBodyLimitBytes, disableRequestLogging: true, trustProxy: false });
  const assets = new AssetStore(config.assetTtlSeconds, config.assetMaxCount, config.assetMaxBytes);
  const registry = new ToolRegistry();
  registerSearchTool(registry, config);
  registerVietSchoolTool(registry, config);
  registerMusicTools(registry, config);
  registerGraphicsTools(registry, config, assets);
  registerImageTool(registry, config, assets);
  registerMapTools(registry, config, assets);
  const executor = new ToolExecutor(registry, config.maxConcurrentTools, config.requestTimeoutMs);

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    allowList: (request) => request.url.split('?')[0] === '/health'
  });
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (path === '/health' || path.startsWith('/v1/assets/')) return;
    if (!authenticate(config, request, reply)) return reply;
  });
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      && typeof error.statusCode === 'number' ? error.statusCode : undefined;
    const message = error instanceof Error ? error.message : 'Lỗi không xác định.';
    if (statusCode === 413) return reply.code(413).send({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request vượt giới hạn kích thước.' } });
    const status = statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    return reply.code(status).send({ ok: false, error: { code: 'INTERNAL_ERROR', message: status >= 500 ? 'Server gặp lỗi nội bộ.' : message } });
  });

  registerHealthRoutes(app, registry, assets);
  registerToolRoutes(app, registry, executor);
  registerAssetRoutes(app, assets);
  registerMcpRoute(app, registry, executor);
  return { app, registry, executor, assets };
}
