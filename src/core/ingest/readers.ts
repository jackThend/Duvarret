/** Lectura de manuscritos .txt, .md y .pdf (extracción de texto local, sin servicios externos). */

export type ManuscriptFormat = 'txt' | 'md' | 'pdf';

export function detectFormat(fileName: string): ManuscriptFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'txt') return 'txt';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'pdf') return 'pdf';
  return null;
}

/** Limpia el marcado Markdown conservando encabezados (sirven para detectar capítulos). */
export function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^*])\*(?!\s)([^*\n]+)\*/g, '$1$2')
    .replace(/(^|\s)_([^_\n]+)_/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*+]\s+(?!\S*$)/gm, '');
}

interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
}

/** Extrae el texto de un PDF con pdf.js, reconstruyendo párrafos. */
export async function pdfToText(data: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, disableFontFace: true });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items as PdfTextItem[]) {
      if (typeof item.str !== 'string') continue;
      text += item.str;
      text += item.hasEOL ? '\n' : '';
    }
    pages.push(text);
  }
  await task.destroy();
  // Une líneas partidas por el maquetado y respeta los saltos de párrafo.
  return pages
    .join('\n\n')
    .replace(/-\n(\p{Ll})/gu, '$1')
    .replace(/([^\n.!?:»”])\n(?=\p{Ll})/gu, '$1 ');
}

export async function readManuscript(fileName: string, data: Uint8Array | string): Promise<string> {
  const format = detectFormat(fileName);
  const asText = () => (typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data));
  switch (format) {
    case 'txt':
      return asText();
    case 'md':
      return markdownToText(asText());
    case 'pdf':
      if (typeof data === 'string') throw new Error('El PDF debe leerse como datos binarios.');
      return pdfToText(data);
    default:
      throw new Error(`Formato no admitido: ${fileName}. Usa .txt, .md o .pdf.`);
  }
}
