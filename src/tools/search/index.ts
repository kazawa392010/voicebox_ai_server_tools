import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import type { ToolRegistry } from '../../core/tool-registry.js';
import { AppError } from '../../core/errors.js';
import { MemoryCache } from '../../storage/memory-cache.js';
import { fetchJson } from '../../utils/fetch.js';

interface SearchItem { title: string; url: string; snippet: string; source: string; updated_at?: string; }
const cache = new MemoryCache<SearchItem[]>(80);
const schema = z.object({ query: z.string().trim().min(2).max(240), limit: z.number().int().min(1).max(8).default(5) });
const inputSchema = { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 240, description: 'Câu hỏi hoặc từ khóa cần tìm.' }, limit: { type: 'integer', minimum: 1, maximum: 8, default: 5 } }, required: ['query'], additionalProperties: false };

function cleanHtml(value: string): string { return value.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); }
function normalize(value: string): string { return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

async function searchWikipedia(query: string, limit: number, signal: AbortSignal): Promise<SearchItem[]> {
  const makeUrl = (host: 'vi.wikipedia.org' | 'en.wikipedia.org') => {
    const url = new URL('https://' + host + '/w/api.php');
    url.search = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, format: 'json', srlimit: String(limit), utf8: '1' }).toString();
    return url;
  };
  const request = async (target: URL) => fetchJson<{ query?: { search?: Array<{ title: string; snippet: string; timestamp?: string }> } }>(target, { signal }, 6500);
  let response: Awaited<ReturnType<typeof request>> | undefined;
  let lastError: unknown;
  for (const host of ['vi.wikipedia.org', 'en.wikipedia.org'] as const) {
    try {
      response = await request(makeUrl(host));
      lastError = undefined;
      if (response.query?.search?.length) {
        return response.query.search.map((item) => {
          const encoded = encodeURIComponent(item.title.replace(/ /g, '_'));
          const result: SearchItem = { title: item.title, url: `https://${host}/wiki/${encoded}`, snippet: cleanHtml(item.snippet), source: host };
          if (item.timestamp) result.updated_at = item.timestamp;
          return result;
        });
      }
    } catch (error) { lastError = error; }
  }
  if (lastError) throw new Error('Wikipedia sources are unavailable.');
  return [];
}

async function searchSearx(base: string, query: string, limit: number, signal: AbortSignal): Promise<SearchItem[]> {
  const endpoint = new URL('/search', base);
  endpoint.search = new URLSearchParams({ q: query, format: 'json', language: 'auto', safesearch: '1' }).toString();
  const response = await fetchJson<{ results?: Array<{ title?: string; url?: string; content?: string; engine?: string; publishedDate?: string }> }>(endpoint, { signal, headers: { accept: 'application/json' } }, 7000);
  return (response.results ?? []).slice(0, limit).flatMap((item) => {
    if (!item.title || !item.url) return [];
    let parsed: URL;
    try { parsed = new URL(item.url); } catch { return []; }
    if (!['https:', 'http:'].includes(parsed.protocol)) return [];
    const result: SearchItem = { title: item.title.slice(0, 240), url: parsed.toString(), snippet: (item.content ?? '').slice(0, 600), source: item.engine ?? parsed.hostname };
    if (item.publishedDate) result.updated_at = item.publishedDate;
    return [result];
  });
}

export function registerSearchTool(registry: ToolRegistry, config: AppConfig): void {
  registry.register({
    name: 'voicebox.search_web', description: 'Tìm kiếm web bằng tiếng Việt/Anh, ưu tiên kết quả từ SearXNG đã cấu hình và Wikipedia. Trả nguồn để kiểm chứng.',
    inputSchema, validator: schema, enabled: config.searchEnabled, timeoutMs: 10000,
    async execute(input, signal) {
      const { query, limit } = schema.parse(input);
      const key = `${query.toLocaleLowerCase('vi')}:${limit}`;
      let results = cache.get(key);
      if (!results) {
        const errors: string[] = [];
        const collected: SearchItem[] = [];
        if (config.searxngBaseUrl) {
          try { collected.push(...await searchSearx(config.searxngBaseUrl, query, limit, signal)); }
          catch { errors.push('searxng'); }
        }
        try { collected.push(...await searchWikipedia(query, limit, signal)); }
        catch { errors.push('wikipedia'); }
        const seen = new Set<string>();
        results = collected.filter((item) => {
          const keyTitle = normalize(item.title);
          if (!keyTitle || seen.has(keyTitle)) return false;
          seen.add(keyTitle); return true;
        }).slice(0, limit);
        if (!results.length) {
          if (errors.length) throw new AppError('SEARCH_UNAVAILABLE', 'Các nguồn tìm kiếm hiện không phản hồi.', 502);
          throw new AppError('SEARCH_NO_RESULTS', 'Không tìm thấy kết quả phù hợp.', 404);
        }
        cache.set(key, results, config.searchCacheTtlSeconds * 1000);
      }
      const summary = results.slice(0, 3).map((item, i) => `${i + 1}. ${item.title}: ${item.snippet}`).join(' ');
      return { speechText: `Tìm thấy ${results.length} kết quả cho ${query}. ${summary.slice(0, 700)}`, display: { type: 'text', content: results.map((x) => `${x.title}\n${x.snippet}\n${x.url}`).join('\n\n') }, data: { query, summary: summary.slice(0, 1200), sources: results } };
    }
  });
}
