/**
 * Lectura de manuscritos .docx (Word) y .epub, 100% local.
 *
 * Ambos formatos son archivos ZIP con XML dentro. Se descomprimen con fflate y se extrae el
 * texto con un analizador ligero que funciona igual en el navegador y en Node (la CLI no
 * dispone de DOMParser). Los títulos se convierten en encabezados Markdown (`#`, `##`) para
 * que el Scene Parser respete capítulos.
 */
import { strFromU8, unzipSync, type Unzipped } from 'fflate';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', iexcl: '¡', iquest: '¿',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  ccedil: 'ç', Ccedil: 'Ç', middot: '·', shy: '',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code] ?? match;
  });
}

function unzip(data: Uint8Array, what: string): Unzipped {
  try {
    return unzipSync(data);
  } catch {
    throw new Error(`El archivo ${what} está dañado o no es válido.`);
  }
}

function entryText(files: Unzipped, path: string): string | null {
  const entry = files[path] ?? files[Object.keys(files).find((k) => k.toLowerCase() === path.toLowerCase()) ?? ''];
  return entry ? strFromU8(entry) : null;
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`))?.slice(1).find((v) => v !== undefined);

const tidy = (text: string) =>
  text
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// ── Word (.docx) ───────────────────────────────────────────────────────────

/** Nivel de encabezado de cada estilo (los nombres internos de Word están en inglés en cualquier idioma). */
function docxHeadingStyles(stylesXml: string | null): Map<string, number> {
  const levels = new Map<string, number>();
  if (!stylesXml) return levels;
  for (const style of stylesXml.match(/<w:style\b[\s\S]*?<\/w:style>/g) ?? []) {
    const id = attr(style.match(/<w:style\b[^>]*>/)![0], 'w:styleId');
    const name = attr(style.match(/<w:name\b[^>]*\/?>/)?.[0] ?? '', 'w:val')?.toLowerCase();
    if (!id || !name) continue;
    if (name === 'title') levels.set(id, 1);
    const heading = name.match(/^heading (\d)$/);
    if (heading) levels.set(id, Number(heading[1]) + 1);
  }
  return levels;
}

export function docxToText(data: Uint8Array): string {
  const files = unzip(data, '.docx');
  const document = entryText(files, 'word/document.xml');
  if (!document) throw new Error('El archivo .docx no contiene un documento de Word.');
  const headings = docxHeadingStyles(entryText(files, 'word/styles.xml'));
  const body = document.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/)?.[1] ?? document;
  const out: string[] = [];

  for (const paragraph of body.match(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? []) {
    let text = '';
    // Se recorren texto, tabuladores y saltos en orden; se ignoran notas eliminadas y campos ocultos.
    const cleaned = paragraph.replace(/<w:del\b[\s\S]*?<\/w:del>/g, '').replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/g, '');
    for (const token of cleaned.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/g) ?? []) {
      if (token.startsWith('<w:tab')) text += ' ';
      else if (token.startsWith('<w:br') || token.startsWith('<w:cr')) text += '\n';
      else text += decodeEntities(token.replace(/<[^>]+>/g, ''));
    }
    text = text.trim();
    if (!text) {
      out.push('');
      continue;
    }
    const style = attr(paragraph.match(/<w:pStyle\b[^>]*\/>/)?.[0] ?? '', 'w:val');
    const outline = attr(paragraph.match(/<w:outlineLvl\b[^>]*\/>/)?.[0] ?? '', 'w:val');
    const level = (style ? headings.get(style) : undefined) ?? (outline !== undefined ? Number(outline) + 2 : undefined);
    if (level === 1) out.push(`# ${text.replace(/\n/g, ' ')}`);
    else if (level !== undefined && level <= 3) out.push(`## ${text.replace(/\n/g, ' ')}`);
    else out.push(text);
    out.push('');
  }
  return tidy(out.join('\n'));
}

// ── EPUB ───────────────────────────────────────────────────────────────────

function resolvePath(base: string, href: string): string {
  const parts = (base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '').concat(decodeURIComponent(href.split('#')[0]!)).split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '..') stack.pop();
    else if (part && part !== '.') stack.push(part);
  }
  return stack.join('/');
}

export interface EpubStyles {
  /** Clases con letra claramente mayor que el cuerpo (títulos). */
  large: Set<string>;
  /** Clases en negrita. */
  bold: Set<string>;
}

/** Analiza las hojas de estilo del libro para reconocer títulos maquetados con clases CSS. */
export function parseEpubStyles(css: string): EpubStyles {
  const styles: EpubStyles = { large: new Set(), bold: new Set() };
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const classes = [...rule[1]!.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
    if (!classes.length) continue;
    const decl = rule[2]!.toLowerCase();
    const size = decl.match(/font-size\s*:\s*([\d.]+)\s*(pt|px|em|rem|%)|font-size\s*:\s*(x{0,2}-?large)/);
    let large = false;
    if (size?.[3]) large = true;
    else if (size) {
      const value = Number(size[1]);
      const unit = size[2];
      large = unit === 'pt' ? value >= 14 : unit === 'px' ? value >= 19 : unit === '%' ? value >= 125 : value >= 1.25;
    }
    const bold = /font-weight\s*:\s*(bold|[6-9]00)/.test(decl);
    for (const c of classes) {
      if (large) styles.large.add(c);
      if (bold) styles.bold.add(c);
    }
  }
  return styles;
}

const EMPTY_STYLES: EpubStyles = { large: new Set(), bold: new Set() };

/** Párrafos cortos con letra grande (o enteros en negrita) se tratan como títulos de capítulo. */
function promoteStyledHeadings(html: string, styles: EpubStyles): string {
  if (!styles.large.size && !styles.bold.size) return html;
  const classesOf = (fragment: string) => [...fragment.matchAll(/class\s*=\s*"([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/));
  return html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs: string, inner: string) => {
    const text = decodeEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!text || text.split(' ').length > 12 || /[.,;:…]$/.test(text)) return match;
    const own = classesOf(`<p${attrs}>`);
    const nested = classesOf(inner);
    const isLarge = [...own, ...nested].some((c) => styles.large.has(c));
    const wholeBold = own.some((c) => styles.bold.has(c)) || (/^\s*<(b|strong)\b[\s\S]*<\/\1>\s*$/i.test(inner) || (nested.length > 0 && nested.every((c) => styles.bold.has(c))));
    return isLarge || wholeBold ? `<h2>${inner}</h2>` : match;
  });
}

/** Convierte un capítulo XHTML en texto con encabezados Markdown. */
export function xhtmlToText(xhtml: string, styles: EpubStyles = EMPTY_STYLES): string {
  const body = xhtml.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? xhtml;
  const heading = (_m: string, t: string) => `\n\n## ${t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n\n`;
  const cleaned = body
    .replace(/<(script|style|head|nav|aside)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Como en un navegador: los saltos del código fuente son espacios.
    .replace(/\s+/g, ' ');
  return tidy(
    decodeEntities(
      promoteStyledHeadings(cleaned, styles)
        .replace(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi, heading)
        .replace(/<hr\b[^>]*\/?>/gi, '\n\n* * *\n\n')
        .replace(/<br\b[^>]*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|blockquote|h[4-6]|tr|section)>/gi, '\n\n')
        .replace(/<[^>]+>/g, ''),
    ),
  );
}

export function epubToText(data: Uint8Array): string {
  const files = unzip(data, '.epub');
  const container = entryText(files, 'META-INF/container.xml');
  const opfPath = container ? attr(container.match(/<rootfile\b[^>]*>/)?.[0] ?? '', 'full-path') : Object.keys(files).find((k) => k.endsWith('.opf'));
  const opf = opfPath ? entryText(files, opfPath) : null;
  if (!opfPath || !opf) throw new Error('El archivo .epub no tiene un índice de contenido válido.');

  const manifest = new Map<string, { href: string; type: string }>();
  for (const item of opf.match(/<item\b[^>]*>/g) ?? []) {
    const id = attr(item, 'id');
    const href = attr(item, 'href');
    if (id && href) manifest.set(id, { href, type: attr(item, 'media-type') ?? '' });
  }
  const spine = (opf.match(/<itemref\b[^>]*>/g) ?? [])
    .filter((ref) => attr(ref, 'linear') !== 'no')
    .map((ref) => manifest.get(attr(ref, 'idref') ?? ''))
    .filter((item): item is { href: string; type: string } => !!item && /html/.test(item.type || 'html'));
  if (!spine.length) throw new Error('El archivo .epub no contiene capítulos legibles.');

  const css = [...manifest.values()]
    .filter((item) => item.type === 'text/css' || item.href.endsWith('.css'))
    .map((item) => entryText(files, resolvePath(opfPath, item.href)) ?? '')
    .join('\n');
  const styles = parseEpubStyles(css);

  const title = decodeEntities(opf.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '');
  const chapters = spine.map((item) => entryText(files, resolvePath(opfPath, item.href))).filter((x): x is string => x !== null).map((x) => xhtmlToText(x, styles)).filter(Boolean);
  return tidy([title ? `# ${title}` : '', ...chapters].join('\n\n'));
}
