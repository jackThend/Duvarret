/**
 * Scene Parsing (RF-01): segmenta un manuscrito en capítulos y beats dramáticos de 300 a 800
 * palabras, respetando capítulos y separadores de escena, y analiza cada beat.
 */
import { analyzeBeat, type BeatAnalysis } from './toneAnalyzer';

export const MIN_BEAT_WORDS = 300;
export const MAX_BEAT_WORDS = 800;

export interface Beat {
  id: string;
  chapterId: string;
  chapterTitle: string;
  index: number;
  text: string;
  words: number;
  analysis: BeatAnalysis;
}

export interface Chapter {
  id: string;
  title: string;
  beats: Beat[];
}

export interface ParsedManuscript {
  title: string;
  chapters: Chapter[];
  beats: Beat[];
  totalWords: number;
}

const CHAPTER_RE = /^(?:#{1,2}\s+.+|(?:cap[ií]tulo|chapter|parte|libro)\s+[\wivxlcdm]+.*|[IVXLCDM]{1,7}\.?)$/i;
const SCENE_BREAK_RE = /^(?:\*\s*\*\s*\*|#{3,}\s*|~+|—{3,}|-{3,}|⁂|§)\s*$/;

const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

function splitLongParagraph(paragraph: string): string[] {
  const sentences = paragraph.match(/[^.!?…]+[.!?…]+["»”]?\s*|[^.!?…]+$/g) ?? [paragraph];
  const out: string[] = [];
  let current = '';
  for (const s of sentences) {
    if (wordCount(current) + wordCount(s) > MAX_BEAT_WORDS && current) {
      out.push(current.trim());
      current = '';
    }
    current += s;
  }
  if (current.trim()) out.push(current.trim());
  // Frases desmesuradas sin puntuación: corte duro por palabras.
  return out.flatMap((chunk) => {
    const words = chunk.split(/\s+/);
    if (words.length <= MAX_BEAT_WORDS) return [chunk];
    const pieces: string[] = [];
    for (let i = 0; i < words.length; i += MAX_BEAT_WORDS) pieces.push(words.slice(i, i + MAX_BEAT_WORDS).join(' '));
    return pieces;
  });
}

interface Block {
  text: string;
  breakBefore: boolean;
}

function segmentChapter(blocks: Block[]): string[] {
  const beats: string[] = [];
  let current: string[] = [];
  let words = 0;
  const flush = () => {
    if (current.length) beats.push(current.join('\n\n'));
    current = [];
    words = 0;
  };
  for (const block of blocks.flatMap((b) => splitLongParagraph(b.text).map((text, i) => ({ text, breakBefore: i === 0 && b.breakBefore })))) {
    const w = wordCount(block.text);
    // Un separador de escena cierra el beat si ya alcanzó el mínimo.
    if (block.breakBefore && words >= MIN_BEAT_WORDS) flush();
    if (words + w > MAX_BEAT_WORDS && words > 0) flush();
    current.push(block.text);
    words += w;
  }
  flush();
  // Un beat final demasiado breve se une al anterior si cabe.
  if (beats.length >= 2) {
    const last = beats.at(-1)!;
    const prev = beats.at(-2)!;
    if (wordCount(last) < MIN_BEAT_WORDS && wordCount(prev) + wordCount(last) <= MAX_BEAT_WORDS) {
      beats.splice(-2, 2, `${prev}\n\n${last}`);
    }
  }
  return beats;
}

const slug = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32);

export function parseManuscript(text: string, options: { title?: string } = {}): ParsedManuscript {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  const lines = normalized.split('\n');
  const chapters: { title: string; blocks: Block[] }[] = [];
  let title = options.title ?? '';
  let chapter: { title: string; blocks: Block[] } | null = null;
  let paragraph: string[] = [];
  let pendingBreak = false;

  const ensureChapter = () => {
    if (!chapter) {
      chapter = { title: 'Comienzo', blocks: [] };
      chapters.push(chapter);
    }
    return chapter;
  };
  const endParagraph = () => {
    const joined = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    if (joined) {
      ensureChapter().blocks.push({ text: joined, breakBefore: pendingBreak });
      pendingBreak = false;
    }
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      endParagraph();
      continue;
    }
    if (/^#\s+/.test(line) && !title && chapters.length === 0 && !paragraph.length) {
      title = line.replace(/^#\s+/, '');
      continue;
    }
    if (SCENE_BREAK_RE.test(line)) {
      endParagraph();
      pendingBreak = true;
      continue;
    }
    if (CHAPTER_RE.test(line) && line.length < 90) {
      endParagraph();
      chapter = { title: line.replace(/^#+\s*/, ''), blocks: [] };
      chapters.push(chapter);
      continue;
    }
    // Los diálogos con raya se conservan como párrafos propios.
    if (/^[—–-]\s*\S/.test(line)) {
      endParagraph();
      paragraph.push(line);
      endParagraph();
      continue;
    }
    paragraph.push(line);
  }
  endParagraph();

  const result: ParsedManuscript = { title: title || 'Manuscrito sin título', chapters: [], beats: [], totalWords: 0 };
  chapters
    .filter((c) => c.blocks.length)
    .forEach((c, ci) => {
      const chapterId = `cap_${String(ci + 1).padStart(2, '0')}${slug(c.title) ? `_${slug(c.title)}` : ''}`;
      const beats = segmentChapter(c.blocks).map((beatText, bi) => {
        const beat: Beat = {
          id: `${chapterId}_beat_${String(bi + 1).padStart(2, '0')}`,
          chapterId,
          chapterTitle: c.title,
          index: result.beats.length + bi,
          text: beatText,
          words: wordCount(beatText),
          analysis: analyzeBeat(beatText),
        };
        return beat;
      });
      result.chapters.push({ id: chapterId, title: c.title, beats });
      result.beats.push(...beats);
    });
  result.totalWords = result.beats.reduce((s, b) => s + b.words, 0);
  return result;
}
