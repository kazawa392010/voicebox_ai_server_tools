import { z } from 'zod/v4';

const bool = (fallback: boolean) => z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}, z.boolean());
const int = (fallback: number, min: number, max: number) => z.preprocess((v) => v === undefined || v === '' ? fallback : Number(v), z.number().int().min(min).max(max));
const optionalUrl = z.preprocess((v) => v === '' ? undefined : v, z.string().url().optional());
const optionalEmail = z.preprocess((v) => v === '' ? undefined : v, z.string().email().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(10000, 1, 65535),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_BASE_URL: optionalUrl,
  DEVICE_API_KEY: z.string().default(''),
  REQUEST_BODY_LIMIT_BYTES: int(262144, 1024, 2_000_000),
  REQUEST_TIMEOUT_MS: int(12000, 500, 60000),
  MAX_CONCURRENT_TOOLS: int(4, 1, 32),
  RATE_LIMIT_MAX: int(60, 1, 10000),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  DISPLAY_WIDTH: int(128, 16, 320),
  DISPLAY_HEIGHT: int(160, 16, 320),
  BITMAP_FORMAT: z.enum(['RGB565']).default('RGB565'),
  BITMAP_ENDIAN: z.enum(['LE', 'BE']).default('LE'),
  ASSET_TTL_SECONDS: int(90, 5, 3600),
  ASSET_MAX_COUNT: int(24, 1, 256),
  ASSET_MAX_BYTES: int(2097152, 40960, 20_000_000),
  SEARCH_ENABLED: bool(true),
  SEARXNG_BASE_URL: optionalUrl,
  SEARCH_CACHE_TTL_SECONDS: int(180, 0, 3600),
  VIETSCHOOL_ENABLED: bool(false),
  VIETSCHOOL_API_BASE_URL: optionalUrl,
  VIETSCHOOL_API_TOKEN: z.string().default(''),
  MUSIC_ENABLED: bool(false),
  MUSIC_PROVIDER: z.string().default('jamendo'),
  MUSIC_JAMENDO_CLIENT_ID: z.string().default(''),
  IMAGE_ENABLED: bool(false),
  IMAGE_API_URL: optionalUrl,
  IMAGE_API_KEY: z.string().default(''),
  IMAGE_MAX_BYTES: int(5242880, 1024, 20_000_000),
  MAP_ENABLED: bool(false),
  MAP_PROVIDER: z.string().default('osm'),
  OSM_CONTACT_EMAIL: optionalEmail,
  MAP_ROUTING_URL: optionalUrl
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number; host: string; publicBaseUrl?: string; deviceApiKey: string;
  requestBodyLimitBytes: number; requestTimeoutMs: number; maxConcurrentTools: number;
  rateLimitMax: number; rateLimitWindow: string;
  displayWidth: number; displayHeight: number; bitmapFormat: 'RGB565'; bitmapEndian: 'LE' | 'BE';
  assetTtlSeconds: number; assetMaxCount: number; assetMaxBytes: number;
  searchEnabled: boolean; searxngBaseUrl?: string; searchCacheTtlSeconds: number;
  vietschoolEnabled: boolean; vietschoolApiBaseUrl?: string; vietschoolApiToken: string;
  musicEnabled: boolean; musicProvider: string; musicJamendoClientId: string;
  imageEnabled: boolean; imageApiUrl?: string; imageApiKey: string; imageMaxBytes: number;
  mapEnabled: boolean; mapProvider: string; osmContactEmail: string; mapRoutingUrl?: string;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(source);
  const config: AppConfig = {
    nodeEnv: parsed.NODE_ENV, port: parsed.PORT, host: parsed.HOST,
    deviceApiKey: parsed.DEVICE_API_KEY,
    requestBodyLimitBytes: parsed.REQUEST_BODY_LIMIT_BYTES,
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS, maxConcurrentTools: parsed.MAX_CONCURRENT_TOOLS,
    rateLimitMax: parsed.RATE_LIMIT_MAX, rateLimitWindow: parsed.RATE_LIMIT_WINDOW,
    displayWidth: parsed.DISPLAY_WIDTH, displayHeight: parsed.DISPLAY_HEIGHT,
    bitmapFormat: parsed.BITMAP_FORMAT, bitmapEndian: parsed.BITMAP_ENDIAN,
    assetTtlSeconds: parsed.ASSET_TTL_SECONDS, assetMaxCount: parsed.ASSET_MAX_COUNT,
    assetMaxBytes: parsed.ASSET_MAX_BYTES, searchEnabled: parsed.SEARCH_ENABLED,
    searchCacheTtlSeconds: parsed.SEARCH_CACHE_TTL_SECONDS,
    vietschoolEnabled: parsed.VIETSCHOOL_ENABLED, vietschoolApiToken: parsed.VIETSCHOOL_API_TOKEN,
    musicEnabled: parsed.MUSIC_ENABLED, musicProvider: parsed.MUSIC_PROVIDER,
    musicJamendoClientId: parsed.MUSIC_JAMENDO_CLIENT_ID,
    imageEnabled: parsed.IMAGE_ENABLED, imageApiKey: parsed.IMAGE_API_KEY,
    imageMaxBytes: parsed.IMAGE_MAX_BYTES, mapEnabled: parsed.MAP_ENABLED,
    mapProvider: parsed.MAP_PROVIDER, osmContactEmail: parsed.OSM_CONTACT_EMAIL ?? ''
  };
  if (parsed.PUBLIC_BASE_URL) config.publicBaseUrl = parsed.PUBLIC_BASE_URL.replace(/\/$/, '');
  if (parsed.SEARXNG_BASE_URL) config.searxngBaseUrl = parsed.SEARXNG_BASE_URL.replace(/\/$/, '');
  if (parsed.VIETSCHOOL_API_BASE_URL) config.vietschoolApiBaseUrl = parsed.VIETSCHOOL_API_BASE_URL.replace(/\/$/, '');
  if (parsed.IMAGE_API_URL) config.imageApiUrl = parsed.IMAGE_API_URL;
  if (parsed.MAP_ROUTING_URL) config.mapRoutingUrl = parsed.MAP_ROUTING_URL.replace(/\/$/, '');
  if (config.nodeEnv === 'production' && !config.deviceApiKey) {
    throw new Error('DEVICE_API_KEY is required in production');
  }
  for (const raw of [config.publicBaseUrl, config.searxngBaseUrl, config.imageApiUrl, config.mapRoutingUrl, config.vietschoolApiBaseUrl]) {
    if (!raw) continue;
    const u = new URL(raw);
    if (u.protocol !== 'https:' && !(config.nodeEnv !== 'production' && u.hostname === 'localhost')) {
      throw new Error(`Provider URL must use HTTPS: ${u.hostname}`);
    }
  }
  return config;
}
