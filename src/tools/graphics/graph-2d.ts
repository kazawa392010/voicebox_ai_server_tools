import { z } from 'zod/v4';
import { compileExpression } from './expression.js';
import { Raster } from './raster.js';
import { drawTinyText } from './bitmap-font.js';

export const graph2dSchema = z.object({ expression: z.string().min(1).max(256), x_min: z.number().finite().min(-1000).max(1000).default(-10), x_max: z.number().finite().min(-1000).max(1000).default(10), y_min: z.number().finite().min(-1000).max(1000).default(-10), y_max: z.number().finite().min(-1000).max(1000).default(10), title: z.string().max(80).optional() }).refine((v) => v.x_max > v.x_min && v.y_max > v.y_min, { message: 'Miền x/y phải có max lớn hơn min.' });
export const graph2dInputSchema = { type: 'object', properties: { expression: { type: 'string', maxLength: 256, description: 'Ví dụ: 2*x+3, sin(x), x^2.' }, x_min: { type: 'number', default: -10 }, x_max: { type: 'number', default: 10 }, y_min: { type: 'number', default: -10 }, y_max: { type: 'number', default: 10 }, title: { type: 'string', maxLength: 80 } }, required: ['expression'], additionalProperties: false };
export function renderGraph2d(input: z.infer<typeof graph2dSchema>, width: number, height: number): Raster {
  const raster = new Raster(width, height, '#ffffff');
  const plot = { left: 13, right: width - 5, top: 15, bottom: height - 12 };
  const px = (x: number) => plot.left + (x - input.x_min) / (input.x_max - input.x_min) * (plot.right - plot.left);
  const py = (y: number) => plot.bottom - (y - input.y_min) / (input.y_max - input.y_min) * (plot.bottom - plot.top);
  const grid = '#dce3e8';
  for (let i = 0; i <= 8; i += 1) {
    const x = plot.left + i / 8 * (plot.right - plot.left), y = plot.top + i / 8 * (plot.bottom - plot.top);
    raster.line(x, plot.top, x, plot.bottom, grid); raster.line(plot.left, y, plot.right, y, grid);
  }
  if (input.x_min <= 0 && input.x_max >= 0) raster.line(px(0), plot.top, px(0), plot.bottom, '#444444');
  if (input.y_min <= 0 && input.y_max >= 0) raster.line(plot.left, py(0), plot.right, py(0), '#444444');
  if (input.title) drawTinyText(raster, 3, 3, input.title, '#111111');
  drawTinyText(raster, 3, height - 7, 'x', '#111111'); drawTinyText(raster, width - 8, 3, 'y', '#111111');
  const fn = compileExpression(input.expression); let previous: { x: number; y: number } | undefined;
  const samples = Math.max(96, (plot.right - plot.left) * 2);
  for (let i = 0; i <= samples; i += 1) {
    const x = input.x_min + i / samples * (input.x_max - input.x_min);
    const y = fn(x);
    if (Number.isFinite(y) && y >= input.y_min - (input.y_max - input.y_min) && y <= input.y_max + (input.y_max - input.y_min)) {
      const point = { x: px(x), y: py(y) };
      if (previous && Math.abs(point.y - previous.y) < height * 2) raster.line(previous.x, previous.y, point.x, point.y, '#0756c7');
      previous = point;
    } else previous = undefined;
  }
  return raster;
}
