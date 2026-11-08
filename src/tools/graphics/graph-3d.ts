import { z } from 'zod/v4';
import { compileExpression } from './expression.js';
import { Raster } from './raster.js';
import { drawTinyText } from './bitmap-font.js';
export const graph3dSchema = z.object({ expression: z.string().min(1).max(256), x_min: z.number().finite().min(-50).max(50).default(-4), x_max: z.number().finite().min(-50).max(50).default(4), y_min: z.number().finite().min(-50).max(50).default(-4), y_max: z.number().finite().min(-50).max(50).default(4), angle: z.number().finite().min(0).max(6.283).default(0.72), elevation: z.number().finite().min(0.15).max(1.4).default(0.65), resolution: z.number().int().min(6).max(24).default(16) }).refine((v) => v.x_max > v.x_min && v.y_max > v.y_min, { message: 'Miền x/y phải có max lớn hơn min.' });
export const graph3dInputSchema = { type: 'object', properties: { expression: { type: 'string', maxLength: 256, description: 'Ví dụ: x^2+y^2 hoặc sin(x)*cos(y).' }, x_min: { type: 'number', default: -4 }, x_max: { type: 'number', default: 4 }, y_min: { type: 'number', default: -4 }, y_max: { type: 'number', default: 4 }, angle: { type: 'number', minimum: 0, maximum: 6.283, default: 0.72 }, elevation: { type: 'number', minimum: 0.15, maximum: 1.4, default: 0.65 }, resolution: { type: 'integer', minimum: 6, maximum: 24, default: 16 } }, required: ['expression'], additionalProperties: false };
export function renderGraph3d(input: z.infer<typeof graph3dSchema>, width: number, height: number): Raster {
  const raster = new Raster(width, height, '#ffffff');
  const fn = compileExpression(input.expression), n = input.resolution;
  const values: number[][] = []; let minZ = Infinity, maxZ = -Infinity;
  for (let j = 0; j <= n; j += 1) {
    const row: number[] = [];
    for (let i = 0; i <= n; i += 1) {
      const x = input.x_min + i / n * (input.x_max - input.x_min), y = input.y_min + j / n * (input.y_max - input.y_min);
      let z = fn(x, y); if (!Number.isFinite(z)) z = 0; z = Math.max(-1000, Math.min(1000, z));
      row.push(z); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    values.push(row);
  }
  const range = Math.max(0.001, maxZ - minZ); const mid = (maxZ + minZ) / 2;
  const cx = width / 2, cy = height * 0.66, scale = Math.min(width, height) * 0.085;
  const project = (i: number, j: number, z: number) => {
    const xx = (i / n - 0.5) * 2, yy = (j / n - 0.5) * 2, zz = (z - mid) / range;
    const xr = xx * Math.cos(input.angle) - yy * Math.sin(input.angle);
    const yr = (xx * Math.sin(input.angle) + yy * Math.cos(input.angle)) * input.elevation;
    return { x: cx + xr * scale * 2.1, y: cy + yr * scale * 1.65 - zz * scale * 2.2 };
  };
  const colorAt = (z: number) => {
    const t = (z - minZ) / range; const r = Math.round(30 + t * 180), g = Math.round(90 + (1 - t) * 100), b = Math.round(210 - t * 140);
    return `#${[r,g,b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  // Draw a coarse wireframe from far to near rows to keep the rasterizer bounded.
  for (let j = 0; j <= n; j += 1) for (let i = 0; i < n; i += 1) {
    const a = project(i, j, values[j]![i]!), b = project(i + 1, j, values[j]![i + 1]!);
    raster.line(a.x, a.y, b.x, b.y, colorAt((values[j]![i]! + values[j]![i + 1]!) / 2));
  }
  for (let i = 0; i <= n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = project(i, j, values[j]![i]!), b = project(i, j + 1, values[j + 1]![i]!);
    raster.line(a.x, a.y, b.x, b.y, '#526779');
  }
  drawTinyText(raster, 3, 3, `z=${input.expression.slice(0, 20)}`, '#111111');
  return raster;
}
