/**
 * Proyecto `.duvarret` (doc 02 §3): metadatos, manifiesto, lore y catálogo de assets.
 * Offline-first: todo vive en la carpeta del proyecto, legible y versionable con Git.
 */
import { z } from 'zod';
import type { ParsedManuscript } from '../ingest/sceneParser';

export const WORK_MODES = ['exegesis', 'injerto', 'taller'] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  exegesis: 'Exégesis',
  injerto: 'Injerto',
  taller: 'Taller',
};

export const THEMES = ['nordic', 'sepia'] as const;
export type StudioTheme = (typeof THEMES)[number];
export const THEME_LABELS: Record<StudioTheme, string> = {
  nordic: 'Tinta y Pergamino Nórdico',
  sepia: 'Cuaderno de Manuscrito',
};

export const ProjectMetaSchema = z.object({
  format: z.literal('duvarret-project').catch('duvarret-project'),
  version: z.number().int().catch(1),
  title: z.string().min(1).catch('Obra sin título'),
  author: z.string().catch(''),
  mode: z.enum(WORK_MODES).catch('taller'),
  theme: z.enum(THEMES).catch('nordic'),
  /** Configuración del co-director (sin claves: las claves nunca se guardan en el proyecto). */
  agent: z
    .object({
      provider: z.enum(['local', 'ollama', 'anthropic', 'gemini', 'openai']).catch('local'),
      model: z.string().optional().catch(undefined),
      baseUrl: z.string().optional().catch(undefined),
    })
    .catch({ provider: 'local' }),
  created_at: z.string().catch(() => new Date().toISOString()),
  updated_at: z.string().catch(() => new Date().toISOString()),
});

export type ProjectMeta = z.output<typeof ProjectMetaSchema>;

export function createMeta(partial: Partial<ProjectMeta> = {}): ProjectMeta {
  return ProjectMetaSchema.parse({ ...partial });
}

export const PROJECT_PATHS = {
  meta: 'project.duvarret.json',
  manifest: 'manifest/story_manifest.json',
  lore: 'knowledge/lore_graph.db',
  assets: 'assets/registry.json',
  beats: 'manuscript/beats',
  raw: 'manuscript/raw',
  export: 'export',
} as const;

/** Convierte un manuscrito segmentado en escenas lineales del manifiesto. */
export function manifestFromManuscript(parsed: ParsedManuscript, meta: Pick<ProjectMeta, 'title' | 'author'>): Record<string, unknown> {
  const nodes = parsed.beats.map((beat, i) => {
    const next = parsed.beats[i + 1];
    const firstInChapter = i === 0 || parsed.beats[i - 1]!.chapterId !== beat.chapterId;
    return {
      node_id: beat.id,
      chapter_id: beat.chapterId,
      title: firstInChapter ? beat.chapterTitle : `${beat.chapterTitle} · ${beat.index + 1}`,
      text_payload: beat.text,
      navigation: next ? { default_next_node: next.id } : { is_ending: true },
    };
  });
  return {
    metadata: { title: meta.title || parsed.title, author: meta.author || 'Autoría desconocida', language: 'es-ES' },
    nodes,
  };
}
