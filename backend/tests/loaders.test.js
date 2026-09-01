import { describe, expect, it } from 'vitest';
import { extractDocument, extractPdfSections } from '../src/loaders/documentLoaders.js';

function tinyPdf(text) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(`BT /F1 12 Tf 72 200 Td (${text}) Tj ET`, 'binary')} >>\nstream\nBT /F1 12 Tf 72 200 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

describe('document loaders', () => {
  it.each(['guide.md', 'guide.markdown', 'guide.txt'])('accepts %s', async (name) => {
    const result = await extractDocument(Buffer.from('# Guide\n\nText.'), name, 'text/plain');
    expect(result.text).toContain('Guide');
  });

  it('rejects arbitrary text extensions such as HTML', async () => {
    await expect(extractDocument(Buffer.from('<h1>not a support doc</h1>'), 'guide.html', 'text/html'))
      .rejects.toMatchObject({ code: 'unsupported_file_type' });
  });

  it('does not trust a spoofed PDF MIME type on a disallowed extension', async () => {
    await expect(extractDocument(Buffer.from('not a PDF'), 'payload.exe', 'application/pdf'))
      .rejects.toMatchObject({ code: 'unsupported_file_type' });
  });

  it('extracts text and page-aware sections through the real PDF parser', async () => {
    const result = await extractDocument(tinyPdf('Page one support text'), 'guide.pdf', 'application/pdf');
    expect(result.text).toContain('Page one support text');
    expect(result.sections).toEqual([{ page: 1, text: 'Page one support text' }]);
  });

  it('preserves PDF page numbers as ingestion sections', () => {
    const result = extractPdfSections({ pages: [{ pageNumber: 4, text: 'Page four' }, { text: 'Page five' }] });
    expect(result.sections).toEqual([{ page: 4, text: 'Page four' }, { page: 2, text: 'Page five' }]);
  });
});
