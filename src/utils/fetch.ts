import { AppError } from '../core/errors.js';

export async function fetchWithTimeout(url: string | URL, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  try {
    const headers = new Headers(init.headers);
    if (!headers.has('user-agent')) headers.set('user-agent', 'VoiceBox-AI-Tool-Server/1.0 (+https://github.com/)');
    return await fetch(url, {
      ...init,
      signal,
      // Providers are configured by the operator. Refuse redirects so a compromised
      // endpoint cannot bounce the server into private-network addresses.
      redirect: init.redirect ?? 'error',
      headers
    });
  } catch (error) {
    if (signal.aborted) throw new AppError('UPSTREAM_TIMEOUT', 'Nhà cung cấp phản hồi quá thời gian.', 504);
    throw new AppError('UPSTREAM_UNAVAILABLE', 'Không thể kết nối nhà cung cấp bên ngoài.', 502);
  }
}

/** Read a response body without allowing an unbounded arrayBuffer()/json() allocation. */
export async function readResponseBuffer(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) throw new AppError('UPSTREAM_TOO_LARGE', 'Dữ liệu từ nhà cung cấp quá lớn.', 502);
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('Response exceeded configured byte limit').catch(() => undefined);
        throw new AppError('UPSTREAM_TOO_LARGE', 'Dữ liệu từ nhà cung cấp quá lớn.', 502);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new AppError('UPSTREAM_TIMEOUT', 'Nhà cung cấp phản hồi quá thời gian.', 504);
    }
    throw new AppError('UPSTREAM_READ_FAILED', 'Không thể đọc dữ liệu từ nhà cung cấp.', 502);
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function fetchJson<T>(url: string | URL, init: RequestInit = {}, timeoutMs = 8000, maxBytes = 2_000_000): Promise<T> {
  const response = await fetchWithTimeout(url, init, timeoutMs);
  if (!response.ok) throw new AppError('UPSTREAM_ERROR', `Nhà cung cấp trả HTTP ${response.status}.`, 502);
  const bytes = await readResponseBuffer(response, maxBytes);
  try { return JSON.parse(bytes.toString('utf8')) as T; }
  catch { throw new AppError('UPSTREAM_INVALID_JSON', 'Nhà cung cấp trả dữ liệu JSON không hợp lệ.', 502); }
}
