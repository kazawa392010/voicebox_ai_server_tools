import { z } from 'zod/v4';
import { decodeImageToRaster } from '../graphics/raster.js';
import { drawTinyText } from '../graphics/bitmap-font.js';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../core/errors.js';
import type { ToolRegistry } from '../../core/tool-registry.js';
import type { AssetStore } from '../../storage/asset-store.js';
import { fetchWithTimeout, readResponseBuffer } from '../../utils/fetch.js';
import { storeBitmap } from '../shared.js';

const snapshotSchema = z.object({ latitude: z.number().finite().min(-85).max(85), longitude: z.number().finite().min(-180).max(180), zoom: z.number().int().min(1).max(19).default(15) });
const routeSchema = z.object({ from_latitude: z.number().finite().min(-85).max(85), from_longitude: z.number().finite().min(-180).max(180), to_latitude: z.number().finite().min(-85).max(85), to_longitude: z.number().finite().min(-180).max(180), profile: z.enum(['driving','walking','cycling']).default('driving') });
const snapshotInput = { type: 'object', properties: { latitude: { type: 'number', minimum: -85, maximum: 85 }, longitude: { type: 'number', minimum: -180, maximum: 180 }, zoom: { type: 'integer', minimum: 1, maximum: 19, default: 15 } }, required: ['latitude','longitude'], additionalProperties: false };
const routeInput = { type: 'object', properties: { from_latitude: { type: 'number', minimum: -85, maximum: 85 }, from_longitude: { type: 'number', minimum: -180, maximum: 180 }, to_latitude: { type: 'number', minimum: -85, maximum: 85 }, to_longitude: { type: 'number', minimum: -180, maximum: 180 }, profile: { type: 'string', enum: ['driving','walking','cycling'], default: 'driving' } }, required: ['from_latitude','from_longitude','to_latitude','to_longitude'], additionalProperties: false };
const TILE_CACHE_LIMIT = 16;
const tileCache = new Map<string, { bytes: Buffer; expiresAt: number }>();
function getCachedTile(key: string): Buffer | undefined {
  const now = Date.now();
  for (const [cachedKey, item] of tileCache) if (item.expiresAt <= now) tileCache.delete(cachedKey);
  const item = tileCache.get(key);
  return item && item.expiresAt > now ? item.bytes : undefined;
}
function ensureTileCapacity(key: string): void {
  const now = Date.now();
  for (const [cachedKey, item] of tileCache) if (item.expiresAt <= now) tileCache.delete(cachedKey);
  if (!tileCache.has(key) && tileCache.size >= TILE_CACHE_LIMIT) {
    throw new AppError('MAP_CACHE_FULL', 'Bộ nhớ tile đã đạt giới hạn. Chờ tile hết hạn hoặc dùng provider bản đồ riêng.', 503);
  }
}
function cacheTile(key: string, bytes: Buffer, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return;
  ensureTileCapacity(key);
  // Never evict an unexpired OSM tile: a cache eviction could cause a refetch
  // before the minimum retention period. Refuse new unique tiles instead.
  tileCache.set(key, { bytes, expiresAt: Date.now() + ttlSeconds * 1000 });
}
interface OsrmResponse { code?: string; routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: number[][] } }>; }
export function registerMapTools(registry: ToolRegistry, config: AppConfig, assets: AssetStore): void {
  registry.register({
    name: 'voicebox.map.snapshot', description: 'Lấy một tile OpenStreetMap theo tọa độ, cache theo HTTP cache headers, đánh dấu vị trí và xuất bitmap RGB565 có attribution.',
    inputSchema: snapshotInput, validator: snapshotSchema, enabled: config.mapEnabled, timeoutMs: 10000,
    async execute(input, signal) {
      const point = snapshotSchema.parse(input);
      if (config.mapProvider !== 'osm') throw new AppError('MAP_PROVIDER_UNSUPPORTED', 'Map snapshot hiện hỗ trợ MAP_PROVIDER=osm.', 503);
      if (!config.osmContactEmail) throw new AppError('OSM_CONTACT_EMAIL_REQUIRED', 'Cần cấu hình OSM_CONTACT_EMAIL để định danh ứng dụng khi gọi tile.openstreetmap.org.', 503);
      const n = 2 ** point.zoom;
      const tileFloatX = (point.longitude + 180) / 360 * n;
      const latRad = point.latitude * Math.PI / 180;
      const tileFloatY = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n;
      const tileX = Math.max(0, Math.min(n - 1, Math.floor(tileFloatX)));
      const tileY = Math.max(0, Math.min(n - 1, Math.floor(tileFloatY)));
      const cacheKey = `${point.zoom}/${tileX}/${tileY}`;
      let bytes = getCachedTile(cacheKey);
      if (!bytes) {
        ensureTileCapacity(cacheKey);
        const url = `https://tile.openstreetmap.org/${point.zoom}/${tileX}/${tileY}.png`;
        const response = await fetchWithTimeout(url, { signal, headers: { accept: 'image/png', 'user-agent': `VoiceBox-AI-Tool-Server/1.0 (contact: ${config.osmContactEmail})` } }, 8500);
        if (!response.ok) throw new AppError('MAP_PROVIDER_ERROR', `OpenStreetMap tile server trả HTTP ${response.status}.`, 502);
        bytes = await readResponseBuffer(response, 1_000_000);
        if (!bytes.length) throw new AppError('MAP_PROVIDER_EMPTY', 'Tile bản đồ trả về dữ liệu rỗng.', 502);
        const cacheControl = response.headers.get('cache-control') ?? '';
        const expiresHeader = response.headers.get('expires');
        const forbidsStorage = /(?:^|,)\s*(?:no-store|no-cache)\b/i.test(cacheControl);
        const sharedMaxAge = cacheControl.match(/s-maxage=(\d+)/i);
        const maxAge = cacheControl.match(/max-age=(\d+)/i);
        const expiresAt = expiresHeader ? Date.parse(expiresHeader) : Number.NaN;
        const advertisedTtl = sharedMaxAge ? Number(sharedMaxAge[1])
          : maxAge ? Number(maxAge[1])
          : Number.isFinite(expiresAt) ? Math.max(0, (expiresAt - Date.now()) / 1000)
          : !cacheControl.trim() && !expiresHeader ? 7 * 24 * 60 * 60 : 0;
        const ageSeconds = Number(response.headers.get('age') ?? 0);
        const ttl = Math.max(0, advertisedTtl - (Number.isFinite(ageSeconds) ? ageSeconds : 0));
        // Honor Cache-Control / Expires / Age. OSM's seven-day fallback applies only
        // when the response supplies no cache lifetime at all.
        if (!forbidsStorage && ttl > 0) cacheTile(cacheKey, bytes, ttl);
      }
      const raster = decodeImageToRaster(bytes, config.displayWidth, config.displayHeight);
      // The marker denotes the requested coordinate within the current OSM tile.
      const scale = Math.min(config.displayWidth / 256, config.displayHeight / 256);
      const drawWidth = 256 * scale, drawHeight = 256 * scale;
      const offsetX = (config.displayWidth - drawWidth) / 2, offsetY = (config.displayHeight - drawHeight) / 2;
      const localX = offsetX + (tileFloatX - tileX) * drawWidth;
      const localY = offsetY + (tileFloatY - tileY) * drawHeight;
      raster.circle(localX, localY, 4, '#e32636', true);
      raster.circle(localX, localY, 6, '#ffffff', false);
      raster.rect(0, config.displayHeight - 8, config.displayWidth, 8, '#ffffff', true);
      drawTinyText(raster, 2, config.displayHeight - 7, '© OpenStreetMap contributors', '#111111');
      const display = storeBitmap(assets, config, raster.toRgb565(config.bitmapEndian), raster.width, raster.height, 'map');
      return { speechText: `Đã tạo bản đồ thu nhỏ tại tọa độ ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}.`, display, data: { latitude: point.latitude, longitude: point.longitude, zoom: point.zoom, updated_at: new Date().toISOString(), attribution: '© OpenStreetMap contributors' } };
    }
  });
  registry.register({
    name: 'voicebox.map.route', description: 'Tính khoảng cách và thời gian tuyến đường qua dịch vụ OSRM tương thích. Không cung cấp dữ liệu giao thông thời gian thực.',
    inputSchema: routeInput, validator: routeSchema, enabled: config.mapEnabled, timeoutMs: 10000,
    async execute(input, signal) {
      const route = routeSchema.parse(input);
      if (!config.mapRoutingUrl && route.profile !== 'driving') throw new AppError('MAP_PROFILE_UNSUPPORTED', 'OSRM demo mặc định chỉ hỗ trợ profile driving; cấu hình MAP_ROUTING_URL riêng cho walking/cycling.', 400);
      const base = config.mapRoutingUrl ?? 'https://router.project-osrm.org';
      const profile = route.profile === 'driving' ? 'driving' : route.profile === 'cycling' ? 'cycling' : 'foot';
      const url = new URL(`/route/v1/${profile}/${route.from_longitude},${route.from_latitude};${route.to_longitude},${route.to_latitude}`, base);
      url.searchParams.set('overview', 'simplified'); url.searchParams.set('geometries', 'geojson'); url.searchParams.set('steps', 'false');
      const response = await fetchWithTimeout(url, { signal, headers: { accept: 'application/json' } }, 8500);
      if (!response.ok) throw new AppError('MAP_ROUTING_ERROR', `Routing provider trả HTTP ${response.status}.`, 502);
      const body = JSON.parse((await readResponseBuffer(response, 1_000_000)).toString('utf8')) as OsrmResponse;
      if (body.code !== 'Ok' || !body.routes?.[0]) throw new AppError('ROUTE_NOT_FOUND', 'Không tìm thấy tuyến đường phù hợp.', 404);
      const result = body.routes[0];
      if (!Number.isFinite(result.distance) || result.distance < 0 || !Number.isFinite(result.duration) || result.duration < 0) {
        throw new AppError('MAP_ROUTING_INVALID_RESPONSE', 'Routing provider trả khoảng cách hoặc thời gian không hợp lệ.', 502);
      }
      return { speechText: `Khoảng cách tuyến đường là ${(result.distance / 1000).toFixed(1)} km, thời gian ước tính ${(result.duration / 60).toFixed(0)} phút. Đây không phải dữ liệu giao thông thời gian thực.`, display: { type: 'text', content: `Khoảng cách: ${(result.distance / 1000).toFixed(1)} km\nThời gian ước tính: ${(result.duration / 60).toFixed(0)} phút\nLưu ý: không có dữ liệu giao thông thời gian thực.` }, data: { distance_meters: result.distance, duration_seconds: result.duration, geometry: result.geometry?.coordinates?.slice(0, 500) ?? [], provider: 'OSRM-compatible', traffic_realtime: false } };
    }
  });
}
