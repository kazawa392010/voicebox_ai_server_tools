import { z } from 'zod';
import { AppError } from '../../core/errors.js';
import type { AppConfig } from '../../config/env.js';
import type { ToolRegistry } from '../../core/tool-registry.js';
import type { AssetStore } from '../../storage/asset-store.js';
import { storeBitmap } from '../shared.js';
import { Raster } from './raster.js';
import { graph2dInputSchema, graph2dSchema, renderGraph2d } from './graph-2d.js';
import { graph3dInputSchema, graph3dSchema, renderGraph3d } from './graph-3d.js';

const drawSchema = z.object({ background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'), commands: z.array(z.record(z.string(), z.unknown())).min(1).max(80) });
const drawInputSchema = { type: 'object', properties: { background: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', default: '#ffffff' }, commands: { type: 'array', maxItems: 80, description: 'Các primitive: line, rect, circle, triangle, arrow.', items: { type: 'object', additionalProperties: true } } }, required: ['commands'], additionalProperties: false };
function number(command: Record<string, unknown>, key: string): number {
  const value = command[key]; if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1024) throw new AppError('INVALID_DRAW_COMMAND', `Trường ${key} phải là số hữu hạn trong khoảng ±1024.`, 400); return value;
}
function color(command: Record<string, unknown>): string { const value = command.color ?? '#111111'; if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new AppError('INVALID_COLOR', 'color phải có dạng #RRGGBB.', 400); return value; }
export function registerGraphicsTools(registry: ToolRegistry, config: AppConfig, assets: AssetStore): void {
  registry.register({
    name: 'voicebox.graphics.draw', description: 'Vẽ hình học cơ bản và sơ đồ đơn giản rồi xuất bitmap RGB565 cho TFT ESP32.',
    inputSchema: drawInputSchema, validator: drawSchema, enabled: true, timeoutMs: 3000,
    async execute(input) {
      const parsed = drawSchema.parse(input); const raster = new Raster(config.displayWidth, config.displayHeight, parsed.background);
      for (const raw of parsed.commands) {
        const c = raw as Record<string, unknown>; const type = c.type; const ink = color(c); const filled = c.filled === true;
        if (type === 'line') raster.line(number(c,'x1'), number(c,'y1'), number(c,'x2'), number(c,'y2'), ink);
        else if (type === 'arrow') {
          const x1=number(c,'x1'), y1=number(c,'y1'), x2=number(c,'x2'), y2=number(c,'y2'); raster.line(x1,y1,x2,y2,ink);
          const a=Math.atan2(y2-y1,x2-x1), size=6; raster.line(x2,y2,x2-size*Math.cos(a-0.55),y2-size*Math.sin(a-0.55),ink); raster.line(x2,y2,x2-size*Math.cos(a+0.55),y2-size*Math.sin(a+0.55),ink);
        } else if (type === 'rect') raster.rect(number(c,'x'), number(c,'y'), number(c,'width'), number(c,'height'), ink, filled);
        else if (type === 'circle') raster.circle(number(c,'x'), number(c,'y'), number(c,'radius'), ink, filled);
        else if (type === 'triangle') raster.triangle(number(c,'x1'),number(c,'y1'),number(c,'x2'),number(c,'y2'),number(c,'x3'),number(c,'y3'),ink,filled);
        else throw new AppError('INVALID_DRAW_COMMAND', `Primitive không được hỗ trợ: ${String(type)}.`, 400);
      }
      const display = storeBitmap(assets, config, raster.toRgb565(config.bitmapEndian), raster.width, raster.height);
      return { speechText: `Đã vẽ ${parsed.commands.length} đối tượng hình học lên bitmap ${raster.width} nhân ${raster.height}.`, display, data: { command_count: parsed.commands.length, pixel_bytes: raster.width * raster.height * 2 } };
    }
  });
  registry.register({
    name: 'voicebox.graphics.plot_2d', description: 'Phân tích biểu thức toán an toàn và vẽ đồ thị hàm y=f(x), trả bitmap RGB565.',
    inputSchema: graph2dInputSchema, validator: graph2dSchema, enabled: true, timeoutMs: 5000,
    async execute(input) {
      const parsed = graph2dSchema.parse(input); const raster = renderGraph2d(parsed, config.displayWidth, config.displayHeight);
      const display = storeBitmap(assets, config, raster.toRgb565(config.bitmapEndian), raster.width, raster.height, 'chart');
      return { speechText: `Đã tạo đồ thị hàm số y bằng ${parsed.expression}.`, display, data: { expression: parsed.expression, x_range: [parsed.x_min, parsed.x_max], y_range: [parsed.y_min, parsed.y_max], pixel_bytes: raster.width * raster.height * 2 } };
    }
  });
  registry.register({
    name: 'voicebox.graphics.plot_3d', description: 'Vẽ wireframe bề mặt z=f(x,y) bằng phép chiếu 3D nhẹ, xuất bitmap RGB565.',
    inputSchema: graph3dInputSchema, validator: graph3dSchema, enabled: true, timeoutMs: 5000,
    async execute(input) {
      const parsed = graph3dSchema.parse(input); const raster = renderGraph3d(parsed, config.displayWidth, config.displayHeight);
      const display = storeBitmap(assets, config, raster.toRgb565(config.bitmapEndian), raster.width, raster.height, 'chart');
      return { speechText: `Đã tạo bề mặt đồ thị z bằng ${parsed.expression}.`, display, data: { expression: parsed.expression, resolution: parsed.resolution, samples: (parsed.resolution + 1) ** 2, pixel_bytes: raster.width * raster.height * 2 } };
    }
  });
}
