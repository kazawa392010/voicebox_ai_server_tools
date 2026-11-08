import test from 'node:test';
import assert from 'node:assert/strict';
import { Raster } from '../src/tools/graphics/raster.js';
import { compileExpression } from '../src/tools/graphics/expression.js';
import { renderGraph2d, graph2dSchema } from '../src/tools/graphics/graph-2d.js';
import { renderGraph3d, graph3dSchema } from '../src/tools/graphics/graph-3d.js';

test('RGB565 uses exactly two bytes per pixel and little endian order', () => {
  const raster = new Raster(128, 160, '#ff0000');
  const bytes = raster.toRgb565('LE');
  assert.equal(bytes.byteLength, 128 * 160 * 2);
  assert.deepEqual([...bytes.subarray(0, 2)], [0x00, 0xf8]);
  assert.deepEqual([...raster.toRgb565('BE').subarray(0, 2)], [0xf8, 0x00]);
});

test('safe expression parser evaluates arithmetic and math functions', () => {
  const linear = compileExpression('2*x + 3');
  assert.equal(linear(4), 11);
  assert.ok(Math.abs(compileExpression('sin(pi/2)')(0) - 1) < 1e-9);
  assert.equal(compileExpression('x^2 + y^2')(3, 4), 25);
  assert.equal(compileExpression('2x + 3')(4), 11);
  assert.equal(compileExpression('2(x + 1)')(4), 10);
  assert.equal(compileExpression('x²')(4), 16);
  assert.equal(compileExpression('-2^2')(0), -4);
  assert.equal(compileExpression('2^3^2')(0), 512);
  assert.equal(compileExpression('√(x)')(9), 3);
  assert.throws(() => compileExpression('process.exit()'));
  assert.throws(() => compileExpression('x;globalThis'));
});

test('2D and 3D graph renderers produce configured RGB565 frame sizes', () => {
  const g2 = renderGraph2d(graph2dSchema.parse({ expression: '2*x+3' }), 128, 160);
  const g3 = renderGraph3d(graph3dSchema.parse({ expression: 'x^2+y^2', resolution: 12 }), 128, 160);
  assert.equal(g2.toRgb565().length, 40960);
  assert.equal(g3.toRgb565().length, 40960);
});
