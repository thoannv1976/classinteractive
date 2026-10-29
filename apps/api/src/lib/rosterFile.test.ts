import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseRosterFile } from './rosterFile';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('parseRosterFile', () => {
  it('reads CSV with Vietnamese headers, BOM and a title row', async () => {
    const csv = '﻿DANH SÁCH LỚP DGB301.01\nSTT,Mã SV,Họ và tên,Email\n1,2251010001,Nguyễn Văn An,an@st.edu.vn\n2,2251010002,"Trần Thị, Bình",\n';
    const r = await parseRosterFile('lop.csv', b64(csv));
    expect(r.rows).toEqual([
      { studentId: '2251010001', fullName: 'Nguyễn Văn An', email: 'an@st.edu.vn' },
      { studentId: '2251010002', fullName: 'Trần Thị, Bình', email: '' },
    ]);
  });

  it('joins separate "Họ đệm" and "Tên" columns and supports semicolons', async () => {
    const csv = 'MSSV;Họ đệm;Tên\nSV01;Lê Văn;Cường\n';
    const r = await parseRosterFile('lop.csv', b64(csv));
    expect(r.rows[0]).toEqual({ studentId: 'SV01', fullName: 'Lê Văn Cường', email: '' });
  });

  it('reads the first sheet of an XLSX file', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('DS');
    ws.addRow(['Trường ĐH ABC']);
    ws.addRow(['STT', 'Mã sinh viên', 'Họ tên']);
    ws.addRow([1, 2251010003, 'Phạm Thu Hà']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await parseRosterFile('lop.xlsx', buf.toString('base64'));
    expect(r.rows).toEqual([{ studentId: '2251010003', fullName: 'Phạm Thu Hà', email: '' }]);
  });

  it('rejects files without the required columns', async () => {
    await expect(parseRosterFile('x.csv', b64('a,b\n1,2'))).rejects.toThrow(/Mã SV/);
    await expect(parseRosterFile('x.pdf', b64('x'))).rejects.toThrow(/csv/);
  });
});
