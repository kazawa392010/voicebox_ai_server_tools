import { randomId } from '../utils/id.js';
import { AppError } from '../core/errors.js';

interface Asset { bytes: Buffer; width: number; height: number; format: string; expiresAt: number; }
export class AssetStore {
  private readonly assets = new Map<string, Asset>();
  private totalBytes = 0;
  constructor(private readonly ttlSeconds: number, private readonly maxCount: number, private readonly maxBytes: number) {}

  put(bytes: Buffer, width: number, height: number, format: string): { id: string; expiresIn: number } {
    this.sweep();
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 320 || height > 320) {
      throw new AppError('INVALID_BITMAP_SIZE', 'Kích thước bitmap không hợp lệ.', 400);
    }
    if (format !== 'RGB565_LE' && format !== 'RGB565_BE') {
      throw new AppError('INVALID_PIXEL_FORMAT', 'Asset store chỉ nhận RGB565_LE hoặc RGB565_BE.', 400);
    }
    if (bytes.byteLength !== width * height * 2) {
      throw new AppError('INVALID_BITMAP_LENGTH', `Bitmap RGB565 cần đúng ${width * height * 2} byte.`, 400);
    }
    if (bytes.byteLength > this.maxBytes) throw new AppError('ASSET_TOO_LARGE', 'Bitmap vượt giới hạn bộ nhớ asset.', 413);
    while (this.assets.size >= this.maxCount || this.totalBytes + bytes.byteLength > this.maxBytes) {
      const oldest = this.assets.keys().next().value as string | undefined;
      if (!oldest) break;
      this.remove(oldest);
    }
    const id = randomId(16);
    this.assets.set(id, { bytes, width, height, format, expiresAt: Date.now() + this.ttlSeconds * 1000 });
    this.totalBytes += bytes.byteLength;
    return { id, expiresIn: this.ttlSeconds };
  }
  get(id: string): Asset | undefined {
    const item = this.assets.get(id);
    if (!item) return undefined;
    if (item.expiresAt <= Date.now()) { this.remove(id); return undefined; }
    return item;
  }
  private remove(id: string): void { const old = this.assets.get(id); if (old) this.totalBytes -= old.bytes.byteLength; this.assets.delete(id); }
  private sweep(): void { for (const [id, item] of this.assets) if (item.expiresAt <= Date.now()) this.remove(id); }
  stats(): { count: number; bytes: number } { this.sweep(); return { count: this.assets.size, bytes: this.totalBytes }; }
}
