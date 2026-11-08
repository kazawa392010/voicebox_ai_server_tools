import type { AppConfig } from '../config/env.js';
import type { AssetStore } from '../storage/asset-store.js';
import type { DisplayResult } from '../core/types.js';
export function storeBitmap(assets: AssetStore, config: AppConfig, bytes: Buffer, width: number, height: number, type: 'bitmap' | 'chart' | 'map' = 'bitmap'): DisplayResult {
  const asset = assets.put(bytes, width, height, `RGB565_${config.bitmapEndian}`);
  const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME;
  const base = config.publicBaseUrl ?? (renderHost ? `https://${renderHost}` : `http://localhost:${config.port}`);
  const common = { width, height, format: `RGB565_${config.bitmapEndian}`, asset_url: `${base}/v1/assets/${asset.id}`, expires_in: asset.expiresIn };
  if (type === 'map') return { type, ...common, attribution: '© OpenStreetMap contributors' };
  return { type, ...common };
}
