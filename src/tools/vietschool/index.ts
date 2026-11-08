import { z } from 'zod';
import type { ToolRegistry } from '../../core/tool-registry.js';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../core/errors.js';
import { parseScoresCsv } from './csv.js';

const schema = z.object({ csv_text: z.string().min(10).max(100000).optional(), subject: z.string().max(80).optional(), term: z.string().max(40).optional() });
const inputSchema = { type: 'object', properties: { csv_text: { type: 'string', maxLength: 100000, description: 'Nội dung CSV do người dùng tự xuất hợp lệ từ tài khoản VietSchool.' }, subject: { type: 'string', maxLength: 80 }, term: { type: 'string', maxLength: 40 } }, additionalProperties: false };
export function registerVietSchoolTool(registry: ToolRegistry, config: AppConfig): void {
  registry.register({
    name: 'voicebox.vietschool.get_scores',
    description: 'Đọc và thống kê điểm học tập từ CSV do chính người dùng xuất. Không nhận mật khẩu và không truy cập API riêng tư VietSchool.',
    inputSchema, validator: schema, enabled: true, timeoutMs: 3000,
    async execute(input) {
      const { csv_text, subject, term } = schema.parse(input);
      if (!csv_text) {
        if (config.vietschoolEnabled) throw new AppError('VIETSCHOOL_API_CONTRACT_REQUIRED', 'VIETSCHOOL_ENABLED đã bật nhưng chưa có tài liệu API chính thức để triển khai adapter an toàn. Hãy dùng csv_text.', 503);
        return { speechText: 'Chưa có dữ liệu điểm. Hãy xuất bảng điểm CSV từ tài khoản của bạn rồi gửi nội dung CSV cho công cụ.', display: { type: 'text', content: 'Chế độ CSV: cần truyền csv_text. Tích hợp API trực tiếp đang tắt cho đến khi có tài liệu API chính thức.' }, data: { mode: 'csv_import_required', official_api_enabled: false } };
      }
      const all = parseScoresCsv(csv_text);
      const rows = all.filter((row) => (!subject || row.subject.toLocaleLowerCase('vi').includes(subject.toLocaleLowerCase('vi'))) && (!term || row.term === term));
      if (!rows.length) return { speechText: 'Không tìm thấy điểm phù hợp với bộ lọc.', data: { count: 0, scores: [] } };
      const groups = new Map<string, number[]>();
      for (const row of rows) groups.set(row.subject, [...(groups.get(row.subject) ?? []), row.score]);
      const summary = [...groups].map(([name, scores]) => ({ subject: name, count: scores.length, average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) / 100, min: Math.min(...scores), max: Math.max(...scores) }));
      const speech = summary.map((s) => `${s.subject}: trung bình ${s.average} điểm, ${s.count} đầu điểm`).join('. ');
      return { speechText: `Đã đọc ${rows.length} đầu điểm. ${speech}`, display: { type: 'text', content: summary.map((s) => `${s.subject}: TB ${s.average} | ${s.count} điểm | thấp nhất ${s.min} | cao nhất ${s.max}`).join('\n') }, data: { count: rows.length, summary, scores: rows } };
    }
  });
}
