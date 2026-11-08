import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';

function constantEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function authenticate(config: AppConfig, request: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.deviceApiKey) {
    void reply.code(503).send({ ok: false, error: { code: 'AUTH_NOT_CONFIGURED', message: 'Server chưa cấu hình DEVICE_API_KEY.' } });
    return false;
  }
  const auth = request.headers.authorization;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const provided = request.headers['x-api-key'] ?? bearer;
  if (typeof provided !== 'string' || !constantEqual(provided, config.deviceApiKey)) {
    void reply.code(401).send({ ok: false, error: { code: 'UNAUTHORIZED', message: 'API key không hợp lệ.' } });
    return false;
  }
  return true;
}
