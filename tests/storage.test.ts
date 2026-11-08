import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetStore } from '../src/storage/asset-store.js';
import { MemoryCache } from '../src/storage/memory-cache.js';

test('asset store enforces FIFO count and aggregate byte caps', () => {
  const store = new AssetStore(90, 1, 8);
  const first = store.put(Buffer.alloc(8, 1), 2, 2, 'RGB565_LE');
  const second = store.put(Buffer.alloc(8, 2), 2, 2, 'RGB565_LE');
  assert.equal(store.get(first.id), undefined);
  assert.equal(store.get(second.id)?.bytes[0], 2);
  assert.deepEqual(store.stats(), { count: 1, bytes: 8 });
  assert.throws(() => store.put(Buffer.alloc(18), 3, 3, 'RGB565_LE'));
  assert.throws(() => store.put(Buffer.alloc(7), 2, 2, 'RGB565_LE'));
  assert.throws(() => store.put(Buffer.alloc(8), 2, 2, 'JPEG')); 
});

test('memory cache expires entries and respects capacity', async () => {
  const cache = new MemoryCache<string>(1);
  cache.set('short', 'value', 10);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(cache.get('short'), undefined);
  cache.set('first', '1', 1000);
  cache.set('second', '2', 1000);
  assert.equal(cache.get('first'), undefined);
  assert.equal(cache.get('second'), '2');
});
