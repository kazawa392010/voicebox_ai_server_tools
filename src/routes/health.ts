import type { FastifyInstance } from 'fastify';
import type { AssetStore } from '../storage/asset-store.js';
import type { ToolRegistry } from '../core/tool-registry.js';
export function registerHealthRoutes(app: FastifyInstance, registry: ToolRegistry, assets: AssetStore): void {
  app.get('/health', async () => ({
    ok: true,
    service: 'voicebox-ai-tool-server',
    status: 'healthy',
    uptime_seconds: Math.floor(process.uptime()),
    tools_enabled: registry.list().length,
    assets: assets.stats(),
    timestamp: new Date().toISOString()
  }));
}
