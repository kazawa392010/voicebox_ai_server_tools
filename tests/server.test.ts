import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/env.js';
import { buildApp } from '../src/app.js';

function config() {
  return loadConfig({ NODE_ENV: 'test', DEVICE_API_KEY: 'unit-test-key', PUBLIC_BASE_URL: 'https://voicebox.example.test', SEARCH_ENABLED: 'false', MUSIC_ENABLED: 'false', IMAGE_ENABLED: 'false', MAP_ENABLED: 'false' });
}

test('Fastify boots and exposes public health but protects tools', async () => {
  const ctx = await buildApp(config());
  try {
    const health = await ctx.app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().ok, true);
    const denied = await ctx.app.inject({ method: 'GET', url: '/v1/tools' });
    assert.equal(denied.statusCode, 401);
    const accepted = await ctx.app.inject({ method: 'GET', url: '/v1/tools', headers: { authorization: 'Bearer unit-test-key' } });
    assert.equal(accepted.statusCode, 200);
    assert.ok(accepted.json().tools.length >= 8);
  } finally { await ctx.app.close(); }
});

test('REST tool call creates an image asset that can be downloaded as binary', async () => {
  const ctx = await buildApp(config());
  try {
    const result = await ctx.app.inject({ method: 'POST', url: '/v1/tools/execute', headers: { authorization: 'Bearer unit-test-key' }, payload: { name: 'voicebox.graphics.plot_2d', input: { expression: '2*x+3' } } });
    assert.equal(result.statusCode, 200);
    const body = result.json();
    assert.equal(body.ok, true);
    assert.equal(body.display.format, 'RGB565_LE');
    const asset = await ctx.app.inject({ method: 'GET', url: new URL(body.display.asset_url).pathname });
    assert.equal(asset.statusCode, 200);
    assert.equal(asset.rawPayload.length, 128 * 160 * 2);
    assert.equal(asset.headers['x-pixel-format'], 'RGB565_LE');
  } finally { await ctx.app.close(); }
});

test('disabled map provider returns a visible error, not fabricated results', async () => {
  const ctx = await buildApp(config());
  try {
    const response = await ctx.executor.execute('voicebox.map.snapshot', { latitude: 10.7, longitude: 106.6 });
    assert.equal(response.ok, false);
    assert.equal(response.error?.code, 'TOOL_DISABLED');
  } finally { await ctx.app.close(); }
});

test('MCP accepts initialize and tools/list using Streamable HTTP', async () => {
  const ctx = await buildApp(config());
  try {
    const denied = await ctx.app.inject({ method: 'POST', url: '/mcp', headers: { 'content-type': 'application/json' }, payload: { jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} } });
    assert.equal(denied.statusCode, 401);
    const headers = { authorization: 'Bearer unit-test-key', 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    const init = await ctx.app.inject({ method: 'POST', url: '/mcp', headers, payload: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2026-07-28', capabilities: {}, clientInfo: { name: 'voicebox-test', version: '1.0' } } } });
    assert.equal(init.statusCode, 200);
    assert.match(init.payload, /protocolVersion/);
    const tools = await ctx.app.inject({ method: 'POST', url: '/mcp', headers, payload: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} } });
    assert.equal(tools.statusCode, 200);
    assert.match(tools.payload, /voicebox\.graphics\.plot_2d/);
    const call = await ctx.app.inject({ method: 'POST', url: '/mcp', headers, payload: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'voicebox.graphics.plot_2d', arguments: { expression: 'x^2' } } } });
    assert.equal(call.statusCode, 200);
    assert.match(call.payload, /RGB565_LE/);
  } finally { await ctx.app.close(); }
});

test('REST assets use the unguessable capability URL without exposing the API key in the URL', async () => {
  const ctx = await buildApp(config());
  try {
    const result = await ctx.executor.execute('voicebox.graphics.plot_2d', { expression: 'x' });
    assert.equal(result.ok, true);
    const url = result.display && 'asset_url' in result.display ? result.display.asset_url : '';
    assert.ok(url);
    assert.doesNotMatch(url, /unit-test-key/);
    const asset = await ctx.app.inject({ method: 'GET', url: new URL(url).pathname });
    assert.equal(asset.statusCode, 200);
    assert.equal(asset.rawPayload.length, 40960);
  } finally { await ctx.app.close(); }
});

test('request body limit rejects oversized payloads', async () => {
  const limited = loadConfig({ NODE_ENV: 'test', DEVICE_API_KEY: 'unit-test-key', REQUEST_BODY_LIMIT_BYTES: '1024' });
  const ctx = await buildApp(limited);
  try {
    const response = await ctx.app.inject({ method: 'POST', url: '/v1/tools/execute', headers: { authorization: 'Bearer unit-test-key' }, payload: { name: 'voicebox.graphics.plot_2d', input: { expression: 'x'.repeat(3000) } } });
    assert.equal(response.statusCode, 413);
    assert.equal(response.json().error.code, 'PAYLOAD_TOO_LARGE');
  } finally { await ctx.app.close(); }
});
