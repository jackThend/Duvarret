import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeEntities, docxToText, epubToText, parseEpubStyles, xhtmlToText } from './office';
import { detectFormat, readManuscript } from './readers';
import { parseManuscript } from './sceneParser';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** .docx mínimo con estilos creados por un Word en español (ids localizados, nombres internos en inglés). */
function makeDocx(body: string) {
  const styles = `<?xml version="1.0"?><w:styles ${W}>
    <w:style w:type="paragraph" w:styleId="Ttulo"><w:name w:val="Title"/></w:style>
    <w:style w:type="paragraph" w:styleId="Ttulo1"><w:name w:val="heading 1"/></w:style>
    <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  </w:styles>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
    'word/styles.xml': strToU8(styles),
  });
}

function makeEpub(options: { chapters: Record<string, string>; spine: string[]; title?: string }) {
  const items = Object.keys(options.chapters)
    .map((href, i) => `<item id="c${i}" href="${href.replace('OEBPS/', '')}" media-type="application/xhtml+xml"/>`)
    .join('');
  const ids = Object.keys(options.chapters);
  const spine = options.spine.map((href) => `<itemref idref="c${ids.indexOf(href)}"${href.includes('nav') ? ' linear="no"' : ''}/>`).join('');
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/content.opf': strToU8(
      `<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${options.title ? `<dc:title>${options.title}</dc:title>` : ''}</metadata><manifest>${items}<item id="css" href="s.css" media-type="text/css"/></manifest><spine>${spine}</spine></package>`,
    ),
  };
  for (const [path, html] of Object.entries(options.chapters)) files[path] = strToU8(`<?xml version="1.0"?><html><head><title>x</title><style>p{}</style></head><body>${html}</body></html>`);
  return zipSync(files);
}

describe('decodeEntities', () => {
  it('decodifica entidades con nombre y numéricas', () => {
    expect(decodeEntities('&laquo;Cervantes&raquo; &amp; &#8212; &#x2026; &ntilde;&aacute; &desconocida;')).toBe('«Cervantes» & — … ñá &desconocida;');
  });
});

describe('docxToText', () => {
  it('extrae párrafos y convierte título y capítulos en encabezados', () => {
    const docx = makeDocx(
      para('El Molino', 'Ttulo') +
        para('Capítulo primero', 'Ttulo1') +
        para('Érase una vez un molino &amp; su molinero.') +
        '<w:p/>' +
        `<w:p><w:r><w:t>—¿Oye?</w:t></w:r><w:r><w:tab/><w:t>dijo Sancho.</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Verso uno</w:t><w:br/><w:t>verso dos</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Queda</w:t></w:r><w:del><w:r><w:delText>borrado</w:delText></w:r></w:del><w:r><w:t xml:space="preserve"> esto.</w:t></w:r></w:p>` +
        `<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:r><w:t>Capítulo segundo</w:t></w:r></w:p>` +
        para('Fin.'),
    );
    expect(docxToText(docx)).toBe(
      '# El Molino\n\n## Capítulo primero\n\nÉrase una vez un molino & su molinero.\n\n—¿Oye? dijo Sancho.\n\nVerso uno\nverso dos\n\nQueda esto.\n\n## Capítulo segundo\n\nFin.',
    );
  });

  it('el resultado se segmenta respetando título y capítulos', () => {
    const long = 'La noche caía sobre la llanura y nadie decía palabra. '.repeat(40);
    const docx = makeDocx(para('La Llanura', 'Ttulo') + para('Capítulo 1', 'Ttulo1') + para(long) + para('Capítulo 2', 'Ttulo1') + para(long));
    const parsed = parseManuscript(docxToText(docx), { title: 'archivo' });
    expect(parsed.title).toBe('La Llanura');
    expect(parsed.chapters.map((c) => c.title)).toEqual(['Capítulo 1', 'Capítulo 2']);
  });

  it('usa el nivel de esquema aunque el estilo esté vacío', () => {
    const docx = makeDocx('<w:p><w:pPr><w:pStyle w:val=""/><w:outlineLvl w:val="1"/></w:pPr><w:r><w:t>Capítulo X</w:t></w:r></w:p>' + para('Texto.'));
    expect(docxToText(docx)).toBe('## Capítulo X\n\nTexto.');
  });

  it('rechaza archivos dañados o que no son Word', () => {
    expect(() => docxToText(strToU8('no es un zip'))).toThrow('dañado');
    expect(() => docxToText(zipSync({ 'otro.xml': strToU8('<x/>') }))).toThrow('no contiene un documento de Word');
  });
});

describe('epubToText', () => {
  it('lee los capítulos en el orden del índice, con título y encabezados', () => {
    const epub = makeEpub({
      title: 'Don Quijote',
      chapters: {
        'OEBPS/nav.xhtml': '<nav><ol><li>Índice</li></ol></nav>',
        'OEBPS/text/cap2.xhtml': '<h2>Capítulo II</h2><p>Salió de su aldea.</p>',
        'OEBPS/text/cap1.xhtml':
          '<h1 class="c">Capítulo <em>I</em></h1><p>En un lugar\n   de la Mancha, &laquo;de cuyo nombre&raquo;\n no quiero acordarme.</p><hr/><p>—Sancho —dijo.<br/>Y calló.</p><script>alert(1)</script>',
      },
      spine: ['OEBPS/nav.xhtml', 'OEBPS/text/cap1.xhtml', 'OEBPS/text/cap2.xhtml'],
    });
    expect(epubToText(epub)).toBe(
      '# Don Quijote\n\n## Capítulo I\n\nEn un lugar de la Mancha, «de cuyo nombre» no quiero acordarme.\n\n* * *\n\n—Sancho —dijo.\nY calló.\n\n## Capítulo II\n\nSalió de su aldea.',
    );
  });

  it('funciona sin container.xml y resuelve rutas relativas', () => {
    const epub = zipSync({
      'book.opf': strToU8('<package><manifest><item id="a" href="../x/../ch.html" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>'),
      'ch.html': strToU8('<html><body><p>Hola.</p></body></html>'),
    });
    expect(epubToText(epub)).toBe('Hola.');
  });

  it('explica los errores en lenguaje llano', () => {
    expect(() => epubToText(strToU8('basura'))).toThrow('dañado');
    expect(() => epubToText(zipSync({ 'x.txt': strToU8('') }))).toThrow('índice de contenido');
    expect(() => epubToText(zipSync({ 'a.opf': strToU8('<package><manifest/><spine/></package>') }))).toThrow('capítulos legibles');
  });

  it('xhtmlToText ignora estilos, scripts y comentarios', () => {
    expect(xhtmlToText('<head><style>p{}</style></head><body><!-- nota --><p>Texto</p><style>x</style></body>')).toBe('Texto');
  });
});

describe('readManuscript (.docx / .epub)', () => {
  it('detecta los nuevos formatos y los lee', async () => {
    expect(detectFormat('Novela.DOCX')).toBe('docx');
    expect(detectFormat('libro.epub')).toBe('epub');
    expect(await readManuscript('n.docx', makeDocx(para('Hola mundo.')))).toBe('Hola mundo.');
    const epub = makeEpub({ chapters: { 'OEBPS/c.xhtml': '<p>Adiós.</p>' }, spine: ['OEBPS/c.xhtml'] });
    expect(await readManuscript('l.epub', epub)).toBe('Adiós.');
  });

  it('exige datos binarios', async () => {
    await expect(readManuscript('n.docx', 'texto')).rejects.toThrow('binarios');
    await expect(readManuscript('l.epub', 'texto')).rejects.toThrow('binarios');
  });
});

describe('encabezados maquetados con estilos', () => {
  it('reconoce clases CSS de letra grande o negrita', () => {
    const styles = parseEpubStyles(
      '/* x */ .span0 { font-size: 24pt; font-weight: bold } p.cap, .t2 { font-size: 150% } .n { font-size: 11pt } .b { font-weight: 700 } h1 { font-size: 2em }',
    );
    expect([...styles.large].sort()).toEqual(['cap', 'span0', 't2']);
    expect([...styles.bold].sort()).toEqual(['b', 'span0']);
  });

  it('solo promueve párrafos cortos, sin punto final', () => {
    const styles = parseEpubStyles('.g { font-size: 20pt } .b { font-weight: bold }');
    const html =
      '<p class="g">Capítulo tres</p><p><span class="g">Una frase grande pero con punto.</span></p>' +
      '<p><b>Interludio</b></p><p>Texto con <b>una palabra</b> en negrita</p><p class="b">' + 'larga '.repeat(20) + '</p>';
    expect(xhtmlToText(html, styles).split('\n\n')).toEqual([
      '## Capítulo tres',
      'Una frase grande pero con punto.',
      '## Interludio',
      'Texto con una palabra en negrita',
      'larga '.repeat(20).trim(),
    ]);
  });
});

describe('título de la obra en el Scene Parser', () => {
  it('un primer encabezado vacío seguido de otro encabezado es el título', () => {
    const parsed = parseManuscript('## La Llanura\n\n## Capítulo 1\n\nTexto.', { title: 'archivo' });
    expect(parsed.title).toBe('La Llanura');
    expect(parsed.chapters.map((c) => c.title)).toEqual(['Capítulo 1']);
  });

  it('no confunde un capítulo o una parte con el título', () => {
    expect(parseManuscript('## Parte I\n\n## Capítulo 1\n\nTexto.', { title: 'archivo' }).title).toBe('archivo');
    expect(parseManuscript('## I\n\n## II\n\nTexto.', { title: 'archivo' }).title).toBe('archivo');
    expect(parseManuscript('## Partida de ajedrez\n\n## Capítulo 1\n\nTexto.', { title: 'archivo' }).title).toBe('Partida de ajedrez');
  });
});

describe('archivos reales generados con LibreOffice', () => {
  const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, '__fixtures__', name)));

  it.each(['la-llanura.docx', 'la-llanura.epub'])('%s: título, capítulos y diálogo', async (name) => {
    const parsed = parseManuscript(await readManuscript(name, fixture(name)), { title: 'archivo' });
    expect(parsed.title).toBe('La Llanura');
    expect(parsed.chapters.map((c) => c.title)).toEqual(['Capítulo primero', 'Capítulo segundo']);
    expect(parsed.totalWords).toBe(485);
    expect(parsed.beats[0]!.text).toContain('—¿Oye esos pasos? —preguntó Sancho.');
  });
});
