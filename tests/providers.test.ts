import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const originalFetch = globalThis.fetch;
function mockFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => handler(new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url), init)) as typeof fetch;
}

test('Wikipedia web search normalizes provider results and speech text', async () => {
  const ctx = await buildApp(loadConfig({ NODE_ENV: 'test', DEVICE_API_KEY: 'provider-test', SEARCH_ENABLED: 'true', MUSIC_ENABLED: 'false', IMAGE_ENABLED: 'false', MAP_ENABLED: 'false' }));
  try {
    mockFetch((url) => new Response(JSON.stringify({ query: { search: [{ title: 'ESP32-S3', snippet: 'Vi điều khiển &lt;b&gt;Wi-Fi&lt;/b&gt;', timestamp: '2026-01-01T00:00:00Z' }] } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const result = await ctx.executor.execute('voicebox.search_web', { query: 'ESP32-S3', limit: 2 });
    assert.equal(result.ok, true);
    assert.match(result.speech_text ?? '', /ESP32-S3/);
    const data = result.data as { sources: Array<{ url: string; snippet: string }> };
    assert.match(data.sources[0]!.url, /^https:\/\/vi\.wikipedia\.org\//);
    assert.match(data.sources[0]!.snippet, /Wi-Fi/);
  } finally {
    globalThis.fetch = originalFetch;
    await ctx.app.close();
  }
});

test('Jamendo search returns only HTTPS Creative Commons streams from Jamendo', async () => {
  const ctx = await buildApp(loadConfig({ NODE_ENV: 'test', DEVICE_API_KEY: 'provider-test', SEARCH_ENABLED: 'false', MUSIC_ENABLED: 'true', MUSIC_JAMENDO_CLIENT_ID: 'test-client', MUSIC_PROVIDER: 'jamendo', IMAGE_ENABLED: 'false', MAP_ENABLED: 'false' }));
  try {
    mockFetch((url) => {
      assert.equal(url.hostname, 'api.jamendo.com');
      return new Response(JSON.stringify({
        headers: { status: 'success' },
        results: [
          { id: '123', name: 'Demo Track', artist_name: 'Demo Artist', duration: 123, audio: 'https://prod-1.storage.jamendo.com/?trackid=123', album_image: 'https://usercontent.jamendo.com/image/123', license_ccurl: 'https://creativecommons.org/licenses/by/4.0/' },
          { id: 'bad', name: 'Bad Link', artist_name: 'Unknown', duration: 1, audio: 'http://127.0.0.1/private', license_ccurl: 'https://creativecommons.org/licenses/by/4.0/' }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const result = await ctx.executor.execute('voicebox.music.search', { query: 'demo' });
    assert.equal(result.ok, true);
    const data = result.data as { tracks: Array<{ id: string; stream_url: string }> };
    assert.equal(data.tracks.length, 1);
    assert.equal(data.tracks[0]!.id, '123');
    assert.match(data.tracks[0]!.stream_url, /^https:\/\//);
    const play = await ctx.executor.execute('voicebox.music.play', { track_id: '123' });
    assert.equal(play.ok, true);
    assert.equal(play.display?.type, 'audio');
  } finally {
    globalThis.fetch = originalFetch;
    await ctx.app.close();
  }
});

test('upstream HTTP failures are converted to normalized tool errors', async () => {
  const ctx = await buildApp(loadConfig({ NODE_ENV: 'test', DEVICE_API_KEY: 'provider-test', SEARCH_ENABLED: 'true', MUSIC_ENABLED: 'false', IMAGE_ENABLED: 'false', MAP_ENABLED: 'false' }));
  try {
    mockFetch(() => new Response('upstream down', { status: 503 }));
    const result = await ctx.executor.execute('voicebox.search_web', { query: 'test upstream outage' });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'SEARCH_UNAVAILABLE');
    assert.doesNotMatch(result.error?.message ?? '', /upstream down/i);
  } finally {
    globalThis.fetch = originalFetch;
    await ctx.app.close();
  }
});
