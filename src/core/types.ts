import type { ZodType } from 'zod';

export type DisplayResult =
  | { type: 'text'; content: string }
  | { type: 'bitmap'; width: number; height: number; format: string; asset_url: string; expires_in: number }
  | { type: 'audio'; stream_url: string; format: string }
  | { type: 'map'; width: number; height: number; format: string; asset_url: string; expires_in: number; attribution: string }
  | { type: 'chart'; width: number; height: number; format: string; asset_url: string; expires_in: number };

export interface ToolOutput {
  speechText: string;
  display?: DisplayResult;
  data?: unknown;
}

export interface ToolDefinition<T extends ZodType = ZodType> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  validator: T;
  enabled: boolean;
  timeoutMs?: number;
  execute(input: unknown, signal: AbortSignal): Promise<ToolOutput>;
}

export interface ToolResponse {
  ok: boolean;
  request_id: string;
  tool: string;
  speech_text?: string;
  display?: DisplayResult;
  data?: unknown;
  error?: { code: string; message: string };
}
