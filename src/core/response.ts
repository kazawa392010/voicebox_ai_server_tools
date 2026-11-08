import type { ToolOutput, ToolResponse } from './types.js';
export function successResponse(requestId: string, tool: string, output: ToolOutput): ToolResponse {
  const result: ToolResponse = { ok: true, request_id: requestId, tool, speech_text: output.speechText };
  if (output.display) result.display = output.display;
  if (output.data !== undefined) result.data = output.data;
  return result;
}
export function errorResponse(requestId: string, tool: string, code: string, message: string): ToolResponse {
  return { ok: false, request_id: requestId, tool, error: { code, message } };
}
