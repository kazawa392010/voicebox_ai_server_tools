import { randomId } from '../utils/id.js';
import { AppError } from './errors.js';
import { errorResponse, successResponse } from './response.js';
import type { ToolResponse } from './types.js';
import { ToolRegistry } from './tool-registry.js';

export class ToolExecutor {
  private active = 0;
  constructor(private readonly registry: ToolRegistry, private readonly maxConcurrent: number, private readonly defaultTimeoutMs: number) {}

  async execute(name: string, input: unknown, requestId = randomId()): Promise<ToolResponse> {
    const tool = this.registry.get(name);
    if (!tool) return errorResponse(requestId, name, 'TOOL_NOT_FOUND', `Không tìm thấy tool: ${name}`);
    if (!tool.enabled) return errorResponse(requestId, name, 'TOOL_DISABLED', `Tool ${name} đang bị tắt trong cấu hình.`);
    if (this.active >= this.maxConcurrent) return errorResponse(requestId, name, 'SERVER_BUSY', 'Server đang xử lý quá nhiều yêu cầu. Thử lại sau.');
    const parsed = tool.validator.safeParse(input ?? {});
    if (!parsed.success) return errorResponse(requestId, name, 'INVALID_ARGUMENTS', parsed.error.issues.map((x) => `${x.path.join('.') || 'input'}: ${x.message}`).join('; '));

    this.active += 1;
    const controller = new AbortController();
    const timeout = tool.timeoutMs ?? this.defaultTimeoutMs;
    let timer: NodeJS.Timeout | undefined;
    // Release a concurrency slot only when the underlying operation actually settles.
    // A timed-out provider that ignores AbortSignal must not silently exceed the cap.
    const operation = Promise.resolve().then(() => tool.execute(parsed.data, controller.signal));
    void operation.then(
      () => { this.active -= 1; },
      () => { this.active -= 1; }
    );
    try {
      const timed = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AppError('TOOL_TIMEOUT', `Tool vượt quá ${timeout} ms.`, 504));
        }, timeout);
        timer.unref?.();
      });
      const output = await Promise.race([operation, timed]);
      return successResponse(requestId, name, output);
    } catch (error) {
      const e = error instanceof AppError ? error : new AppError('TOOL_EXECUTION_FAILED', 'Tool gặp lỗi khi thực thi.', 502);
      return errorResponse(requestId, name, e.code, e.message);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
