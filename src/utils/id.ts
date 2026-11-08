import { randomBytes } from 'node:crypto';
export function randomId(bytes = 12): string { return randomBytes(bytes).toString('hex'); }
