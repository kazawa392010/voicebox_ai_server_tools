import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { FastifyInstance } from 'fastify';
import type { ToolExecutor } from '../core/tool-executor.js';
import type { ToolRegistry } from '../core/tool-registry.js';

export function registerMcpRoute(app: FastifyInstance, registry: ToolRegistry, executor: ToolExecutor): void {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'voicebox-ai-tool-server', version: '1.0.0' });
    for (const tool of registry.list()) {
      server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: tool.validator as never
      }, async (args) => {
        const result = await executor.execute(tool.name, args);
        const response: { content: Array<{ type: 'text'; text: string }>; isError?: boolean; structuredContent?: Record<string, unknown> } = {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result as unknown as Record<string, unknown>
        };
        if (!result.ok) response.isError = true;
        return response;
      });
    }
    return server;
  });
  const nodeHandler = toNodeHandler(handler);
  app.all('/mcp', async (request, reply) => {
    await nodeHandler(request.raw, reply.raw, request.body);
  });
  app.addHook('onClose', async () => { await handler.close(); });
}
