import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScoresCsv } from '../src/tools/vietschool/csv.js';

test('CSV importer handles quoted Vietnamese fields and computes valid score rows', () => {
  const rows = parseScoresCsv('Môn học,Loại,Điểm,Ngày,Học kỳ\n"Ngữ văn","Giữa kỳ",8.5,2026-10-01,1\nToán,15 phút,9,2026-10-02,1');
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.subject, 'Ngữ văn');
  assert.equal(rows[0]?.score, 8.5);
});

test('CSV importer rejects missing score columns and out-of-range-only data', () => {
  assert.throws(() => parseScoresCsv('mon,diem\nToan,11'));
  assert.throws(() => parseScoresCsv('ten,loai\nToan,15p'));
});


test('VietSchool tool reports CSV import mode when official API is unavailable', async () => {
  const { buildApp } = await import('../src/app.js');
  const { loadConfig } = await import('../src/config/env.js');
  const ctx = await buildApp(loadConfig({ NODE_ENV: 'test', DEVICE_API_KEY: 'vietschool-test', SEARCH_ENABLED: 'false', MUSIC_ENABLED: 'false', IMAGE_ENABLED: 'false', MAP_ENABLED: 'false', VIETSCHOOL_ENABLED: 'false' }));
  try {
    const result = await ctx.executor.execute('voicebox.vietschool.get_scores', {});
    assert.equal(result.ok, true);
    assert.match(result.speech_text ?? '', /CSV/);
    assert.equal((result.data as { mode: string }).mode, 'csv_import_required');
  } finally { await ctx.app.close(); }
});


test('CSV importer supports semicolon delimiter, decimal comma, and quoted newlines', () => {
  const rows = parseScoresCsv('Môn học;Loại;Điểm;Học kỳ\n\"Ngữ\nvăn\";Giữa kỳ;8,5;1\nToán;Miệng;9,25;1');
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.subject, 'Ngữ\nvăn');
  assert.equal(rows[0]?.score, 8.5);
  assert.equal(rows[1]?.score, 9.25);
});

test('CSV importer rejects malformed quotes instead of silently shifting columns', () => {
  assert.throws(() => parseScoresCsv('mon,diem\n\"Toan\"oops,9'));
});
