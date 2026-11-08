import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ToolExecutor } from '../core/tool-executor.js';
import type { ToolRegistry } from '../core/tool-registry.js';
import { randomId } from '../utils/id.js';

const executeSchema = z.object({ name: z.string().min(3).max(120), input: z.unknown().optional() }).strict();
export function registerToolRoutes(app: FastifyInstance, registry: ToolRegistry, executor: ToolExecutor): void {
  app.get('/v1/tools', async (_request, reply) => {
    return { ok: true, tools: registry.list(true).map(({ name, description, inputSchema, enabled }) => ({ name, description, inputSchema, enabled })) };
  });
  app.post('/v1/tools/execute', async (request, reply) => {
    const parsed = executeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: { code: 'INVALID_REQUEST', message: 'Body cần có name và input hợp lệ.' } });
    const result = await executor.execute(parsed.data.name, parsed.data.input ?? {}, randomId());
    const code = result.error?.code;
    const status = result.ok ? 200
      : ['TOOL_NOT_FOUND', 'SEARCH_NO_RESULTS', 'TRACK_NOT_FOUND', 'ROUTE_NOT_FOUND'].includes(code ?? '') ? 404
      : ['TOOL_DISABLED', 'SERVER_BUSY', 'MUSIC_PROVIDER_NOT_CONFIGURED', 'MUSIC_PROVIDER_UNSUPPORTED', 'IMAGE_PROVIDER_NOT_CONFIGURED', 'MAP_PROVIDER_UNSUPPORTED', 'MAP_CACHE_FULL', 'OSM_CONTACT_EMAIL_REQUIRED', 'VIETSCHOOL_API_CONTRACT_REQUIRED'].includes(code ?? '') ? 503
      : ['INVALID_ARGUMENTS', 'INVALID_BITMAP_SIZE', 'INVALID_COLOR', 'INVALID_SHAPE', 'EXPRESSION_SYNTAX', 'EXPRESSION_FUNCTION', 'EXPRESSION_NUMBER', 'EXPRESSION_TOO_LONG', 'EXPRESSION_TOO_COMPLEX', 'CSV_INVALID', 'CSV_EMPTY', 'CSV_COLUMNS_MISSING', 'CSV_NO_VALID_ROWS', 'MAP_PROFILE_UNSUPPORTED', 'INVALID_DRAW_COMMAND'].includes(code ?? '') ? 400
      : ['TOOL_TIMEOUT', 'UPSTREAM_TIMEOUT'].includes(code ?? '') ? 504
      : ['ASSET_TOO_LARGE', 'IMAGE_TOO_LARGE', 'CSV_TOO_LARGE', 'CSV_TOO_MANY_ROWS', 'INVALID_BITMAP_SIZE', 'INVALID_PIXEL_FORMAT', 'INVALID_BITMAP_LENGTH'].includes(code ?? '') ? 413
      : 502;
    return reply.code(status).send(result);
  });
}
