import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ToolExecutor } from '../src/core/tool-executor.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

const inputSchema = z.object({ value: z.number() });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('executor validates input before invoking a tool', async () => {
  const registry = new ToolRegistry();
  let invoked = false;
  registry.register({ name: 'test.validate', description: 'test', inputSchema: {}, validator: inputSchema, enabled: true, async execute() { invoked = true; return { speechText: 'ok' }; } });
  const result = await new ToolExecutor(registry, 1, 100).execute('test.validate', { value: 'wrong' });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'INVALID_ARGUMENTS');
  assert.equal(invoked, false);
});

test('executor enforces timeout and keeps the slot until the timed-out task settles', async () => {
  const registry = new ToolRegistry();
  registry.register({ name: 'test.slow', description: 'test', inputSchema: {}, validator: inputSchema, enabled: true, timeoutMs: 15, async execute() { await pause(60); return { speechText: 'late' }; } });
  const executor = new ToolExecutor(registry, 1, 100);
  const first = await executor.execute('test.slow', { value: 1 });
  assert.equal(first.ok, false);
  assert.equal(first.error?.code, 'TOOL_TIMEOUT');
  const busy = await executor.execute('test.slow', { value: 2 });
  assert.equal(busy.error?.code, 'SERVER_BUSY');
  await pause(70);
  const recovered = await executor.execute('test.slow', { value: 3 });
  assert.equal(recovered.ok, false);
  assert.equal(recovered.error?.code, 'TOOL_TIMEOUT');
});

test('executor converts provider exceptions into normalized errors', async () => {
  const registry = new ToolRegistry();
  registry.register({ name: 'test.failure', description: 'test', inputSchema: {}, validator: inputSchema, enabled: true, async execute() { throw new Error('private provider detail'); } });
  const result = await new ToolExecutor(registry, 1, 100).execute('test.failure', { value: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'TOOL_EXECUTION_FAILED');
  assert.doesNotMatch(result.error?.message ?? '', /private provider detail/);
});
