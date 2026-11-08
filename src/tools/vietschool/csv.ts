import { AppError } from '../../core/errors.js';

export interface ScoreRow { subject: string; category: string; score: number; date?: string; term?: string; }
type Delimiter = ',' | ';';

function detectDelimiter(text: string): Delimiter {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && char === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}

/** Parse RFC-4180-style quoted cells, including escaped quotes and newlines. */
function parseCsvRows(text: string, delimiter: Delimiter): string[][] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let quoteClosed = false;

  const pushField = () => {
    row.push(field.trim());
    field = '';
    quoteClosed = false;
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell.length > 0)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i]!;
    if (quoted) {
      if (char === '"' && normalized[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field.trim().length > 0 || quoteClosed) {
        throw new AppError('CSV_INVALID', 'CSV có dấu ngoặc kép sai vị trí.', 400);
      }
      field = '';
      quoted = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else if (quoteClosed && !/\s/.test(char)) {
      throw new AppError('CSV_INVALID', 'CSV có ký tự thừa sau dấu ngoặc kép.', 400);
    } else if (!quoteClosed) {
      field += char;
    }
  }

  if (quoted) throw new AppError('CSV_INVALID', 'CSV có dấu ngoặc kép chưa đóng.', 400);
  if (field.length > 0 || row.length > 0 || quoteClosed) pushRow();
  return rows;
}

function normalizeHeader(value: string): string {
  return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-z0-9]/g, '');
}

export function parseScoresCsv(csvText: string): ScoreRow[] {
  if (Buffer.byteLength(csvText, 'utf8') > 100_000) throw new AppError('CSV_TOO_LARGE', 'CSV vượt giới hạn 100 KB.', 413);
  const delimiter = detectDelimiter(csvText);
  const table = parseCsvRows(csvText, delimiter);
  if (table.length < 2) throw new AppError('CSV_EMPTY', 'CSV cần có hàng tiêu đề và ít nhất một dòng điểm.', 400);

  const headers = table[0]!.map(normalizeHeader);
  const find = (names: string[]) => headers.findIndex((header) => names.includes(header));
  const subjectIndex = find(['mon', 'monhoc', 'tenmon', 'tenmonhoc', 'subject']);
  const scoreIndex = find(['diem', 'diemso', 'score', 'point', 'ketqua']);
  const categoryIndex = find(['loai', 'loaikiemtra', 'hinhthuc', 'category', 'type']);
  const dateIndex = find(['ngay', 'ngaykiemtra', 'date']);
  const termIndex = find(['hocky', 'kyhoc', 'term', 'semester']);
  if (subjectIndex < 0 || scoreIndex < 0) throw new AppError('CSV_COLUMNS_MISSING', 'CSV phải có cột môn học và điểm (ví dụ: mon,diem).', 400);

  const rows: ScoreRow[] = [];
  for (const cells of table.slice(1)) {
    const subject = cells[subjectIndex] ?? '';
    const rawScore = (cells[scoreIndex] ?? '').trim();
    const normalizedScore = delimiter === ';' ? rawScore.replace(',', '.') : rawScore;
    const score = Number(normalizedScore);
    if (!subject || !Number.isFinite(score) || score < 0 || score > 10) continue;
    const row: ScoreRow = {
      subject,
      category: categoryIndex >= 0 ? (cells[categoryIndex] || 'Chưa phân loại') : 'Chưa phân loại',
      score
    };
    if (dateIndex >= 0 && cells[dateIndex]) row.date = cells[dateIndex];
    if (termIndex >= 0 && cells[termIndex]) row.term = cells[termIndex];
    rows.push(row);
    if (rows.length > 2000) throw new AppError('CSV_TOO_MANY_ROWS', 'CSV có hơn 2000 dòng điểm hợp lệ.', 413);
  }
  if (!rows.length) throw new AppError('CSV_NO_VALID_ROWS', 'Không tìm thấy dòng điểm hợp lệ trong CSV.', 400);
  return rows;
}
