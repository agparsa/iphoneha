import { inflateRawSync } from 'node:zlib';
import { buildXlsx, columnName, crc32, safeSheetName, xmlEscape, zip } from '../xlsx';
import { tehranDayOf } from '../reports.service';

/** Every file of a zip, read back through its central directory. */
function unzip(data: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  let at = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = data.readUInt16LE(at + 10);
  at = data.readUInt32LE(at + 16);
  for (let i = 0; i < count; i++) {
    expect(data.readUInt32LE(at)).toBe(0x02014b50);
    const size = data.readUInt32LE(at + 20);
    const length = data.readUInt16LE(at + 28);
    const offset = data.readUInt32LE(at + 42);
    const name = data.subarray(at + 46, at + 46 + length).toString('utf8');
    const start = offset + 30 + data.readUInt16LE(offset + 26) + data.readUInt16LE(offset + 28);
    const content = inflateRawSync(data.subarray(start, start + size));
    expect(crc32(content)).toBe(data.readUInt32LE(at + 16));
    files.set(name, content.toString('utf8'));
    at += 46 + length + data.readUInt16LE(at + 30) + data.readUInt16LE(at + 32);
  }
  return files;
}

describe('xlsx writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it('names columns the way Excel does', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('keeps sheet names short, legal and unique', () => {
    const taken = new Set<string>();
    expect(safeSheetName('a/b:c*?[d]', taken)).toBe('a b c   d');
    expect(safeSheetName('سفارش‌ها', taken)).toBe('سفارش‌ها');
    expect(safeSheetName('سفارش‌ها', taken)).toBe('سفارش‌ها (2)');
    expect(safeSheetName('x'.repeat(40), taken)).toHaveLength(31);
  });

  it('escapes XML and drops characters XML cannot carry', () => {
    expect(xmlEscape('a<b>&"c"\u0001\u0008')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });

  it('round-trips files through the zip', () => {
    const files = unzip(
      zip([
        { name: 'a.txt', data: Buffer.from('سلام') },
        { name: 'b/c.xml', data: Buffer.from('<x/>') },
      ]),
    );
    expect(files.get('a.txt')).toBe('سلام');
    expect(files.get('b/c.xml')).toBe('<x/>');
  });

  it('writes a right-to-left workbook with text as text and amounts as numbers', () => {
    const files = unzip(
      buildXlsx([
        {
          name: 'سفارش‌ها',
          columns: [{ header: 'شماره' }, { header: 'مشتری' }, { header: 'مبلغ (تومان)', type: 'number' }],
          rows: [
            ['IH100001', '=HYPERLINK("http://x")', 85_000_000],
            ['IH100002', null, 1.5],
          ],
        },
        { name: 'خالی', columns: [{ header: 'x' }], rows: [] },
      ]),
    );
    expect([...files.keys()]).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        'xl/workbook.xml',
        'xl/styles.xml',
        'xl/worksheets/sheet1.xml',
        'xl/worksheets/sheet2.xml',
      ]),
    );
    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain('<autoFilter ref="A1:C3"/>');
    // a value that looks like a formula stays text
    expect(sheet).toContain(
      '<c r="B2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://x&quot;)</t></is></c>',
    );
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('<c r="C2" s="2"><v>85000000</v></c>');
    expect(sheet).not.toContain('r="B3"');
    expect(files.get('xl/workbook.xml')).toContain('name="سفارش‌ها"');
  });
});

describe('tehranDayOf', () => {
  it('reads an instant as a Tehran calendar day (UTC+03:30)', () => {
    expect(tehranDayOf(new Date('2026-09-26T20:29:00Z'))).toBe('2026-09-26');
    expect(tehranDayOf(new Date('2026-09-26T20:30:00Z'))).toBe('2026-09-27');
  });
});
