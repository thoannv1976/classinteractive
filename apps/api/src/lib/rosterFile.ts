import ExcelJS from 'exceljs';
import { searchKey } from './accounts';
import { badRequest } from './errors';

export interface ParsedRow {
  studentId: string;
  fullName: string;
  email: string;
}

const HEADERS = {
  studentId: ['ma sv', 'masv', 'mssv', 'ma sinh vien', 'ma so sinh vien', 'student id', 'studentid', 'id', 'ma hoc vien'],
  fullName: ['ho ten', 'ho va ten', 'hoten', 'full name', 'fullname', 'name', 'ten sinh vien', 'ho va ten sinh vien'],
  lastName: ['ho', 'ho dem', 'ho va ten dem', 'last name'],
  firstName: ['ten', 'first name'],
  email: ['email', 'e-mail', 'mail', 'thu dien tu'],
};

const norm = (v: unknown) => searchKey(String(v ?? '')).replace(/[._:()]/g, ' ').replace(/\s+/g, ' ').trim();

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return String(v.result ?? '');
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const delimiter = (text.split('\n')[0] ?? '').split(';').length > (text.split('\n')[0] ?? '').split(',').length ? ';' : ',';
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Reads a student list from CSV/XLSX. Detects the header row (Vietnamese or English column names). */
export async function parseRosterFile(filename: string, base64: string): Promise<{ rows: ParsedRow[]; columns: Record<string, string> }> {
  const buf = Buffer.from(base64, 'base64');
  let grid: string[][];
  if (/\.csv$/i.test(filename) || /\.txt$/i.test(filename)) {
    grid = parseCsv(buf.toString('utf8').replace(/^\uFEFF/, ''));
  } else if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      throw badRequest('Không đọc được file Excel (.xlsx)');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw badRequest('File Excel không có trang tính');
    grid = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const values: string[] = [];
      r.eachCell({ includeEmpty: true }, (c, col) => {
        values[col - 1] = cellText(c.value).trim();
      });
      grid.push(Array.from(values, (v) => v ?? ''));
    });
  } else {
    throw badRequest('Chỉ hỗ trợ file .csv hoặc .xlsx');
  }

  // Find the header row within the first 15 rows
  let headerIdx = -1;
  let map: Partial<Record<keyof typeof HEADERS, number>> = {};
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const cells = (grid[i] ?? []).map(norm);
    const m: Partial<Record<keyof typeof HEADERS, number>> = {};
    for (const [key, names] of Object.entries(HEADERS) as [keyof typeof HEADERS, string[]][]) {
      const idx = cells.findIndex((c) => names.includes(c));
      if (idx >= 0) m[key] = idx;
    }
    if (m.studentId !== undefined && (m.fullName !== undefined || m.firstName !== undefined)) {
      headerIdx = i;
      map = m;
      break;
    }
  }
  if (headerIdx < 0) {
    throw badRequest('Không tìm thấy dòng tiêu đề. File cần có cột "Mã SV" và "Họ tên" (hoặc "Họ" + "Tên").');
  }
  const rows: ParsedRow[] = [];
  for (const r of grid.slice(headerIdx + 1)) {
    const get = (k: keyof typeof HEADERS) => (map[k] !== undefined ? (r[map[k]!] ?? '').trim() : '');
    const studentId = get('studentId');
    let fullName = get('fullName');
    if (!fullName && (map.lastName !== undefined || map.firstName !== undefined)) {
      fullName = `${get('lastName')} ${get('firstName')}`.trim();
    }
    if (!studentId && !fullName) continue;
    rows.push({ studentId, fullName, email: get('email') });
  }
  const header = grid[headerIdx] ?? [];
  const columns = Object.fromEntries(Object.entries(map).map(([k, i]) => [k, header[i!] ?? '']));
  return { rows, columns };
}
