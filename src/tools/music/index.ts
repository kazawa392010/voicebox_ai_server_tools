import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../core/errors.js';
import type { ToolRegistry } from '../../core/tool-registry.js';
import { fetchJson } from '../../utils/fetch.js';

const searchSchema = z.object({ query: z.string().trim().min(1).max(180), limit: z.number().int().min(1).max(8).default(5) });
const playSchema = z.object({ track_id: z.string().min(1).max(80) });
const searchInput = { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 180 }, limit: { type: 'integer', minimum: 1, maximum: 8, default: 5 } }, required: ['query'], additionalProperties: false };
const playInput = { type: 'object', properties: { track_id: { type: 'string', minLength: 1, maxLength: 80 } }, required: ['track_id'], additionalProperties: false };
interface JamendoTrack { id: string; name: string; artist_name: string; duration: number | string; album_image?: string; audio?: string; license_ccurl?: string; }
interface JamendoResponse { results?: JamendoTrack[]; headers?: { status?: string; error_message?: string }; }
function isJamendoUrl(value: string | undefined): value is string {
  if (!value) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'jamendo.com' || url.hostname.endsWith('.jamendo.com')); }
  catch { return false; }
}

async function jamendo(config: AppConfig, params: URLSearchParams, signal: AbortSignal): Promise<JamendoTrack[]> {
  if (!config.musicJamendoClientId) throw new AppError('MUSIC_PROVIDER_NOT_CONFIGURED', 'Thiếu MUSIC_JAMENDO_CLIENT_ID để dùng provider Jamendo.', 503);
  params.set('client_id', config.musicJamendoClientId); params.set('format', 'json'); params.set('audioformat', 'mp32');
  const url = `https://api.jamendo.com/v3.0/tracks/?${params.toString()}`;
  const body = await fetchJson<JamendoResponse>(url, { signal }, 8000);
  if (body.headers?.status && body.headers.status !== 'success') throw new AppError('MUSIC_PROVIDER_ERROR', body.headers.error_message ?? 'Jamendo API báo lỗi.', 502);
  return (body.results ?? []).filter((track) => isJamendoUrl(track.audio) && Boolean(track.license_ccurl));
}
export function registerMusicTools(registry: ToolRegistry, config: AppConfig): void {
  registry.register({
    name: 'voicebox.music.search', description: 'Tìm kiếm nhạc có giấy phép Creative Commons trên provider Jamendo đã cấu hình; trả metadata và stream URL hợp lệ.',
    inputSchema: searchInput, validator: searchSchema, enabled: config.musicEnabled, timeoutMs: 10000,
    async execute(input, signal) {
      const { query, limit } = searchSchema.parse(input);
      if (config.musicProvider !== 'jamendo') throw new AppError('MUSIC_PROVIDER_UNSUPPORTED', 'Provider hiện chỉ hỗ trợ jamendo.', 503);
      const params = new URLSearchParams({ search: query, limit: String(limit), order: 'popularity_total', include: 'licenses' });
      const tracks = await jamendo(config, params, signal);
      const results = tracks.slice(0, limit).map((t) => ({ id: t.id, title: t.name, artist: t.artist_name, duration: Number(t.duration), cover_url: isJamendoUrl(t.album_image) ? t.album_image : null, stream_url: t.audio!, format: 'mp3', license_url: t.license_ccurl! }));
      return { speechText: results.length ? `Tìm thấy ${results.length} bài nhạc có giấy phép Creative Commons. ${results.slice(0, 3).map((t) => `${t.title} của ${t.artist}`).join('; ')}` : 'Không tìm thấy bản nhạc phù hợp có giấy phép hợp lệ.', display: { type: 'text', content: results.map((t) => `${t.title} - ${t.artist} (${t.duration}s)`).join('\n') }, data: { tracks: results } };
    }
  });
  registry.register({
    name: 'voicebox.music.play', description: 'Chọn một bài hát từ kết quả tìm kiếm Jamendo và trả audio stream URL cho ESP32 phát trực tiếp.',
    inputSchema: playInput, validator: playSchema, enabled: config.musicEnabled, timeoutMs: 9000,
    async execute(input, signal) {
      const { track_id } = playSchema.parse(input);
      if (config.musicProvider !== 'jamendo') throw new AppError('MUSIC_PROVIDER_UNSUPPORTED', 'Provider hiện chỉ hỗ trợ jamendo.', 503);
      const tracks = await jamendo(config, new URLSearchParams({ id: track_id, limit: '1', include: 'licenses' }), signal);
      const track = tracks[0];
      if (!track) throw new AppError('TRACK_NOT_FOUND', 'Không tìm thấy bài hát hoặc bài hát không có stream/giấy phép phù hợp.', 404);
      return { speechText: `Đang phát ${track.name} của ${track.artist_name}.`, display: { type: 'audio', stream_url: track.audio!, format: 'mp3' }, data: { track: { id: track.id, title: track.name, artist: track.artist_name, duration: Number(track.duration), cover_url: isJamendoUrl(track.album_image) ? track.album_image : null, stream_url: track.audio, format: 'mp3', license_url: track.license_ccurl } } };
    }
  });
}
