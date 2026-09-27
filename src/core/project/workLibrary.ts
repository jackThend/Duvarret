/**
 * Biblioteca de obras recientes del Studio. Solo guarda referencias (dónde está cada obra),
 * nunca su contenido: el contenido vive en su carpeta `.duvarret` o en el almacenamiento local.
 */
import { z } from 'zod';

export const WorkEntrySchema = z.object({
  /** `browser`: obra guardada en este dispositivo; `tauri`: carpeta `.duvarret` en disco. */
  kind: z.enum(['browser', 'tauri']),
  /** Identificador de almacenamiento local o ruta absoluta de la carpeta. */
  location: z.string().min(1),
  title: z.string().catch('Obra sin título'),
  author: z.string().catch(''),
  openedAt: z.string(),
});

export type WorkEntry = z.output<typeof WorkEntrySchema>;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'duvarret:obras-recientes';
export const MAX_RECENT_WORKS = 20;

function safeStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export class WorkLibrary {
  constructor(private readonly store: KeyValueStore | null = safeStore()) {}

  list(): WorkEntry[] {
    try {
      const raw = this.store?.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return (Array.isArray(parsed) ? parsed : [])
        .map((e) => WorkEntrySchema.safeParse(e))
        .flatMap((r) => (r.success ? [r.data] : []))
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    } catch {
      return [];
    }
  }

  private write(entries: WorkEntry[]) {
    try {
      this.store?.setItem(KEY, JSON.stringify(entries.slice(0, MAX_RECENT_WORKS)));
    } catch {
      /* sin almacenamiento local: la lista no se recuerda */
    }
  }

  /** Registra (o actualiza) una obra y la coloca la primera. */
  touch(entry: Omit<WorkEntry, 'openedAt'> & { openedAt?: string }): WorkEntry {
    const full: WorkEntry = { ...entry, openedAt: entry.openedAt ?? new Date().toISOString() };
    this.write([full, ...this.list().filter((e) => !(e.kind === full.kind && e.location === full.location))]);
    return full;
  }

  remove(kind: WorkEntry['kind'], location: string) {
    this.write(this.list().filter((e) => !(e.kind === kind && e.location === location)));
  }

  mostRecent(): WorkEntry | null {
    return this.list()[0] ?? null;
  }
}

/** Identificador único para una nueva obra guardada en el dispositivo. */
export function newBrowserLocation(now = Date.now()): string {
  return `obra-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Nombre de carpeta seguro para una obra nueva: «Mi novela» → «Mi_novela.duvarret». */
export function workFolderName(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return `${base || 'Obra'}.duvarret`;
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return `${dir.replace(/[\\/]+$/, '')}${sep}${name}`;
}
