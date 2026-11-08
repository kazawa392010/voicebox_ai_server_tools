import { AppError } from '../../core/errors.js';
import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';

export class Raster {
  readonly pixels: Uint16Array;
  constructor(readonly width: number, readonly height: number, background = '#ffffff') {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > 320 || height > 320) throw new AppError('INVALID_BITMAP_SIZE', 'Kích thước bitmap phải trong khoảng 16..320 pixel.');
    this.pixels = new Uint16Array(width * height); this.clear(background);
  }
  static color(hex: string): number {
    const clean = hex.replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new AppError('INVALID_COLOR', `Mã màu không hợp lệ: ${hex}`);
    const r = Number.parseInt(clean.slice(0, 2), 16), g = Number.parseInt(clean.slice(2, 4), 16), b = Number.parseInt(clean.slice(4, 6), 16);
    return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
  }
  clear(color = '#ffffff'): void { this.pixels.fill(Raster.color(color)); }
  pixel(x: number, y: number, color: string | number): void {
    const px = Math.round(x), py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    this.pixels[py * this.width + px] = typeof color === 'number' ? color : Raster.color(color);
  }
  line(x0: number, y0: number, x1: number, y1: number, color = '#111111'): void {
    let x = Math.round(x0), y = Math.round(y0); const endX = Math.round(x1), endY = Math.round(y1);
    const dx = Math.abs(endX - x), sx = x < endX ? 1 : -1, dy = -Math.abs(endY - y), sy = y < endY ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < this.width + this.height + Math.abs(dx) + Math.abs(dy); i += 1) {
      this.pixel(x, y, color); if (x === endX && y === endY) break;
      const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  rect(x: number, y: number, w: number, h: number, color = '#111111', filled = false): void {
    const x2 = x + w, y2 = y + h;
    if (filled) {
      for (let py = Math.max(0, Math.floor(y)); py <= Math.min(this.height - 1, Math.ceil(y2)); py += 1)
        for (let px = Math.max(0, Math.floor(x)); px <= Math.min(this.width - 1, Math.ceil(x2)); px += 1) this.pixel(px, py, color);
    } else { this.line(x, y, x2, y, color); this.line(x2, y, x2, y2, color); this.line(x2, y2, x, y2, color); this.line(x, y2, x, y, color); }
  }
  circle(cx: number, cy: number, radius: number, color = '#111111', filled = false): void {
    if (radius < 0 || radius > Math.max(this.width, this.height)) throw new AppError('INVALID_SHAPE', 'Bán kính hình tròn không hợp lệ.');
    let x = Math.round(radius), y = 0, err = 1 - x;
    while (x >= y) {
      if (filled) {
        this.line(cx - x, cy + y, cx + x, cy + y, color); this.line(cx - x, cy - y, cx + x, cy - y, color);
        this.line(cx - y, cy + x, cx + y, cy + x, color); this.line(cx - y, cy - x, cx + y, cy - x, color);
      } else {
        for (const [px, py] of [[x,y], [y,x], [-y,x], [-x,y], [-x,-y], [-y,-x], [y,-x], [x,-y]]) this.pixel(cx + px, cy + py, color);
      }
      y += 1; if (err < 0) err += 2 * y + 1; else { x -= 1; err += 2 * (y - x) + 1; }
    }
  }
  triangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, color = '#111111', filled = false): void {
    if (!filled) { this.line(ax, ay, bx, by, color); this.line(bx, by, cx, cy, color); this.line(cx, cy, ax, ay, color); return; }
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(this.height - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = minY; y <= maxY; y += 1) {
      const intersections: number[] = [];
      for (const [x1,y1,x2,y2] of [[ax,ay,bx,by],[bx,by,cx,cy],[cx,cy,ax,ay]]) {
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) intersections.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
      }
      if (intersections.length >= 2) this.line(Math.min(...intersections), y, Math.max(...intersections), y, color);
    }
  }
  toRgb565(endian: 'LE' | 'BE' = 'LE'): Buffer {
    const output = Buffer.allocUnsafe(this.pixels.length * 2);
    for (let i = 0; i < this.pixels.length; i += 1) {
      const color = this.pixels[i]!;
      if (endian === 'LE') output.writeUInt16LE(color, i * 2); else output.writeUInt16BE(color, i * 2);
    }
    return output;
  }
}

export function decodeImageToRaster(bytes: Buffer, width: number, height: number, background = '#ffffff'): Raster {
  let sourceWidth = 0;
  let sourceHeight = 0;
  let rgba: Uint8Array;
  try {
    if (bytes.length >= 24 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') {
      // Check dimensions from IHDR before inflating image data.
      sourceWidth = bytes.readUInt32BE(16);
      sourceHeight = bytes.readUInt32BE(20);
      if (sourceWidth < 1 || sourceHeight < 1 || sourceWidth * sourceHeight > 4_000_000) {
        throw new AppError('IMAGE_DIMENSIONS_INVALID', 'Ảnh đầu vào vượt giới hạn 4 megapixel.', 413);
      }
      const decoded = PNG.sync.read(bytes);
      rgba = decoded.data;
    } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      // jpeg-js enforces both a pixel ceiling and a decoder memory ceiling.
      const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 4, maxMemoryUsageInMB: 16 });
      sourceWidth = decoded.width;
      sourceHeight = decoded.height;
      rgba = decoded.data;
    } else {
      throw new AppError('IMAGE_FORMAT_UNSUPPORTED', 'Provider phải trả PNG hoặc JPEG.');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('IMAGE_DECODE_FAILED', 'Không thể giải mã ảnh từ image provider.', 502);
  }
  if (sourceWidth < 1 || sourceHeight < 1 || sourceWidth * sourceHeight > 4_000_000) {
    throw new AppError('IMAGE_DIMENSIONS_INVALID', 'Ảnh đầu vào vượt giới hạn 4 megapixel.', 413);
  }
  const raster = new Raster(width, height, background);
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = Math.max(1, Math.floor(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.floor(sourceHeight * scale));
  const offsetX = Math.floor((width - drawWidth) / 2);
  const offsetY = Math.floor((height - drawHeight) / 2);
  for (let y = 0; y < drawHeight; y += 1) {
    for (let x = 0; x < drawWidth; x += 1) {
      const sx = Math.min(sourceWidth - 1, Math.floor(x / scale));
      const sy = Math.min(sourceHeight - 1, Math.floor(y / scale));
      const i = (sy * sourceWidth + sx) * 4;
      const alpha = rgba[i + 3]! / 255;
      const red = Math.round(rgba[i]! * alpha + 255 * (1 - alpha));
      const green = Math.round(rgba[i + 1]! * alpha + 255 * (1 - alpha));
      const blue = Math.round(rgba[i + 2]! * alpha + 255 * (1 - alpha));
      raster.pixel(offsetX + x, offsetY + y, ((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3));
    }
  }
  return raster;
}
