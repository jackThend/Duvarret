import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_BEAT_WORDS, MIN_BEAT_WORDS, parseManuscript } from './sceneParser';
import { analyzeBeat } from './toneAnalyzer';
import { detectFormat, markdownToText, readManuscript } from './readers';

const sentence = (n: number, word = 'palabra') => `${Array.from({ length: n }, () => word).join(' ')}.`;

describe('parseManuscript', () => {
  it('respeta capítulos y el rango de 300 a 800 palabras', () => {
    const chapter = (title: string, paragraphs: number) =>
      `${title}\n\n${Array.from({ length: paragraphs }, () => sentence(120)).join('\n\n')}`;
    const parsed = parseManuscript([chapter('Capítulo I', 12), chapter('Capítulo II', 5)].join('\n\n'));
    expect(parsed.chapters.map((c) => c.title)).toEqual(['Capítulo I', 'Capítulo II']);
    for (const beat of parsed.beats) {
      expect(beat.words).toBeGreaterThanOrEqual(MIN_BEAT_WORDS);
      expect(beat.words).toBeLessThanOrEqual(MAX_BEAT_WORDS);
    }
    expect(parsed.totalWords).toBe(17 * 120);
    expect(parsed.beats[0]!.id).toBe('cap_01_capitulo_i_beat_01');
    expect(new Set(parsed.beats.map((b) => b.chapterId)).size).toBe(2);
  });

  it('corta en separadores de escena cuando ya alcanzó el mínimo', () => {
    const text = `${sentence(350)}\n\n* * *\n\n${sentence(350)}`;
    expect(parseManuscript(text).beats.map((b) => b.words)).toEqual([350, 350]);
  });

  it('divide párrafos desmesurados por frases', () => {
    const long = Array.from({ length: 30 }, () => sentence(60)).join(' ');
    const parsed = parseManuscript(long);
    expect(parsed.beats.length).toBeGreaterThan(1);
    for (const b of parsed.beats) expect(b.words).toBeLessThanOrEqual(MAX_BEAT_WORDS);
  });

  it('toma el título de un encabezado Markdown inicial', () => {
    expect(parseManuscript('# El Molino\n\n## Capítulo 1\n\nTexto.').title).toBe('El Molino');
  });

  it('una obra breve produce un único beat', () => {
    const parsed = parseManuscript('Érase una vez un molino.');
    expect(parsed.beats).toHaveLength(1);
    expect(parsed.chapters[0]!.title).toBe('Comienzo');
  });
});

describe('analyzeBeat', () => {
  it('detecta claustrofobia y peligro', () => {
    const a = analyzeBeat('El pasillo se volvió angosto; las paredes lo aplastaban y apenas podía respirar. Oyó pasos, un grito, sangre. Su corazón, su latido, el corazón.');
    expect(a.tones.claustrofobia).toBeGreaterThan(0.15);
    expect(a.cues).toContain('narrow_corridor');
    expect(a.cues).toContain('heartbeat_tremor');
  });

  it('reconoce pasajes dialogados', () => {
    const a = analyzeBeat('—¿Oye esos pasos?\n—Son gigantes, Sancho.\n—Son molinos, señor.\nEl viento soplaba.');
    expect(a.interaction).toBe('dialogo');
    expect(a.cues).toContain('visual_novel');
  });

  it('reconoce enigmas y aparatos', () => {
    expect(analyzeBeat('La cerradura pedía una clave; la cifra estaba en el sobre, una pista.').interaction).toBe('enigma');
    expect(analyzeBeat('La consola brillaba; en la pantalla del terminal parpadeaba el cursor.').interaction).toBe('aparatos');
  });

  it('un pasaje neutro no tiene tono dominante', () => {
    expect(analyzeBeat('El tren salió a las ocho.').dominantTone).toBeNull();
  });
});

describe('readers', () => {
  it('detecta formatos', () => {
    expect(detectFormat('obra.MD')).toBe('md');
    expect(detectFormat('obra.pdf')).toBe('pdf');
    expect(detectFormat('obra.docx')).toBeNull();
  });

  it('limpia Markdown conservando encabezados', () => {
    expect(markdownToText('## Capítulo 1\n\nUn **molino** y [un enlace](http://x) con *énfasis*.')).toBe('## Capítulo 1\n\nUn molino y un enlace con énfasis.');
  });

  it('lee texto plano y rechaza formatos desconocidos', async () => {
    expect(await readManuscript('a.txt', new TextEncoder().encode('Hola'))).toBe('Hola');
    await expect(readManuscript('a.docx', 'x')).rejects.toThrow('Formato no admitido');
  });

  it('extrae el texto de un PDF real', async () => {
    const pdf = readFileSync(resolve(__dirname, '../../../Duvarret.pdf'));
    const text = await readManuscript('Duvarret.pdf', new Uint8Array(pdf));
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toMatch(/Duvarret/i);
    const parsed = parseManuscript(text);
    expect(parsed.beats.length).toBeGreaterThan(0);
  });
});
