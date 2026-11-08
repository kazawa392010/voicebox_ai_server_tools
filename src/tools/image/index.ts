import { z } from 'zod/v4';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../core/errors.js';
import type { ToolRegistry } from '../../core/tool-registry.js';
import type { AssetStore } from '../../storage/asset-store.js';
import { fetchWithTimeout, readResponseBuffer } from '../../utils/fetch.js';
import { decodeImageToRaster } from '../graphics/raster.js';
import { storeBitmap } from '../shared.js';

const schema = z.object({ prompt: z.string().trim().min(4).max(800), style: z.string().max(80).optional() });
const inputSchema = { type: 'object', properties: { prompt: { type: 'string', minLength: 4, maxLength: 800, description: 'Mô tả ảnh cần tạo.' }, style: { type: 'string', maxLength: 80 } }, required: ['prompt'], additionalProperties: false };
interface ImageProviderResult { image_base64?: string; mime_type?: string; }
export function registerImageTool(registry: ToolRegistry, config: AppConfig, assets: AssetStore): void {
  registry.register({
    name: 'voicebox.image.generate', description: 'Yêu cầu image provider được cấu hình tạo ảnh; chuyển PNG/JPEG sang bitmap RGB565 cho TFT. Không chạy model tại Render.',
    inputSchema, validator: schema, enabled: config.imageEnabled, timeoutMs: 20000,
    async execute(input, signal) {
      const { prompt, style } = schema.parse(input);
      if (!config.imageApiUrl) throw new AppError('IMAGE_PROVIDER_NOT_CONFIGURED', 'Chưa cấu hình dịch vụ tạo ảnh.', 503);
      const response = await fetchWithTimeout(config.imageApiUrl, {
        method: 'POST', signal, headers: { 'content-type': 'application/json', accept: 'application/json', ...(config.imageApiKey ? { authorization: `Bearer ${config.imageApiKey}` } : {}) },
        body: JSON.stringify({ prompt, style, width: config.displayWidth * 2, height: config.displayHeight * 2, response_format: 'base64' })
      }, 18000);
      if (!response.ok) throw new AppError('IMAGE_PROVIDER_ERROR', `Image provider trả HTTP ${response.status}.`, 502);
      const responseBytes = await readResponseBuffer(response, Math.ceil(config.imageMaxBytes * 4 / 3) + 131072);
      let result: ImageProviderResult;
      try { result = JSON.parse(responseBytes.toString('utf8')) as ImageProviderResult; }
      catch { throw new AppError('IMAGE_PROVIDER_FORMAT', 'Image provider trả JSON không hợp lệ.', 502); }
      if (typeof result.image_base64 !== 'string') throw new AppError('IMAGE_PROVIDER_FORMAT', 'Provider phải trả JSON có trường image_base64.', 502);
      const encoded = result.image_base64.replace(/^data:image\/(?:png|jpeg);base64,/i, '');
      const unpaddedLength = encoded.replace(/=+$/, '').length;
      const paddingLength = encoded.length - unpaddedLength;
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || paddingLength > 2 || unpaddedLength % 4 === 1 || (paddingLength > 0 && encoded.length % 4 !== 0) || encoded.length > Math.ceil(config.imageMaxBytes * 4 / 3)) {
        throw new AppError('IMAGE_TOO_LARGE', 'Ảnh base64 không hợp lệ hoặc vượt giới hạn.', 413);
      }
      const bytes = Buffer.from(encoded, 'base64');
      if (!bytes.length || bytes.length > config.imageMaxBytes) throw new AppError('IMAGE_TOO_LARGE', 'Ảnh vượt giới hạn dung lượng.', 413);
      const raster = decodeImageToRaster(bytes, config.displayWidth, config.displayHeight);
      const display = storeBitmap(assets, config, raster.toRgb565(config.bitmapEndian), raster.width, raster.height);
      return { speechText: 'Đã tạo ảnh minh họa và chuyển sang định dạng phù hợp với màn hình.', display, data: { prompt, source_format: result.mime_type ?? 'image/png', pixel_bytes: raster.width * raster.height * 2 } };
    }
  });
}
