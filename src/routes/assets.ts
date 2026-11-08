import type { FastifyInstance } from 'fastify';
import type { AssetStore } from '../storage/asset-store.js';
export function registerAssetRoutes(app: FastifyInstance, assets: AssetStore): void {
  app.get<{ Params: { id: string } }>('/v1/assets/:id', async (request, reply) => {
    if (!/^[a-f0-9]{32}$/.test(request.params.id)) return reply.code(404).send({ ok: false, error: { code: 'ASSET_NOT_FOUND', message: 'Không tìm thấy ảnh hoặc asset đã hết hạn.' } });
    const item = assets.get(request.params.id);
    if (!item) return reply.code(404).send({ ok: false, error: { code: 'ASSET_NOT_FOUND', message: 'Không tìm thấy ảnh hoặc asset đã hết hạn.' } });
    return reply.header('content-type', 'application/octet-stream')
      .header('content-length', item.bytes.byteLength)
      .header('cache-control', 'private, max-age=15, no-store')
      .header('x-image-width', String(item.width))
      .header('x-image-height', String(item.height))
      .header('x-pixel-format', item.format)
      .send(item.bytes);
  });
}
