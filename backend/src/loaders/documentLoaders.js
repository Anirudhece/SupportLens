import path from 'node:path';

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractDocument(buffer, originalName, mimeType = '') {
  const extension = path.extname(originalName).toLowerCase();
  if (extension === '.md' || extension === '.markdown' || extension === '.txt') {
    return { text: normalizeText(buffer.toString('utf8')), pages: [] };
  }
  if (extension === '.pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = normalizeText(result.text);
    await parser.destroy?.();
    return { text, ...extractPdfSections(result) };
  }
  const error = new Error('Only Markdown, plain text, and PDF documents are supported.');
  error.code = 'unsupported_file_type';
  throw error;
}

export { normalizeText };

export function extractPdfSections(result) {
  const pages = result?.pages || [];
  return {
    pages,
    sections: pages
      .map((page, index) => ({ text: normalizeText(page.text), page: page.pageNumber || index + 1 }))
      .filter((section) => section.text)
  };
}
