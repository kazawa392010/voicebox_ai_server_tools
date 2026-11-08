import test from 'node:test';
import assert from 'node:assert/strict';
import { readResponseBuffer } from '../src/utils/fetch.js';
import { AppError } from '../src/core/errors.js';

test('bounded response reader accepts data under its byte cap', async () => {
  const bytes = await readResponseBuffer(new Response('abc'), 3);
  assert.equal(bytes.toString('utf8'), 'abc');
});

test('bounded response reader rejects streamed data over its byte cap', async () => {
  await assert.rejects(
    readResponseBuffer(new Response('this body is too large'), 4),
    (error: unknown) => error instanceof AppError && error.code === 'UPSTREAM_TOO_LARGE'
  );
});
