import { readFile } from 'fs/promises';
import { extname } from 'path';

/** Extract plain text from .pdf, .md, or .txt. */
export async function extractText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.txt') {
    return await readFile(filePath, 'utf-8');
  }
  if (ext === '.pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(await readFile(filePath));
    const doc = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it: any) => ('str' in it ? it.str : '')).join(' '));
    }
    return pages.join('\n\n');
  }
  throw new Error(`Unsupported file type: ${ext} (${filePath})`);
}
