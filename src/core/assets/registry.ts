/**
 * Catálogo de procedencia de assets (RF-14): registra el origen de cada recurso
 * (obra original del autor o síntesis) con metadatos de autoría, derechos y estilo.
 * Se persiste como `assets/audio/registry.json` / `assets/registry.json` en el proyecto.
 */
import { z } from 'zod';

export const AssetRecordSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['audio', 'image', 'font', 'other']).catch('other'),
  origin: z.enum(['author', 'synthetic']).catch('author'),
  status: z.enum(['ready', 'pending', 'missing']).catch('ready'),
  title: z.string().optional().catch(undefined),
  author: z.string().optional().catch(undefined),
  license: z.string().optional().catch(undefined),
  provider: z.string().optional().catch(undefined),
  prompt: z.string().optional().catch(undefined),
  style_preset: z.string().optional().catch(undefined),
  created_at: z.string().catch(() => new Date(0).toISOString()),
  bytes: z.number().int().nonnegative().optional().catch(undefined),
});

export type AssetRecord = z.output<typeof AssetRecordSchema>;

export function kindFromPath(path: string): AssetRecord['kind'] {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (['ogg', 'mp3', 'wav', 'flac', 'm4a', 'opus', 'webm'].includes(ext)) return 'audio';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(ext)) return 'image';
  if (['woff', 'woff2', 'ttf', 'otf'].includes(ext)) return 'font';
  return 'other';
}

export class AssetRegistry {
  private readonly records = new Map<string, AssetRecord>();

  constructor(initial: unknown[] = []) {
    for (const raw of initial) {
      const parsed = AssetRecordSchema.safeParse(raw);
      if (parsed.success) this.records.set(parsed.data.path, parsed.data);
    }
  }

  static fromJson(text: string): AssetRegistry {
    try {
      const data: unknown = JSON.parse(text);
      const list = Array.isArray(data) ? data : Array.isArray((data as { assets?: unknown[] })?.assets) ? (data as { assets: unknown[] }).assets : [];
      return new AssetRegistry(list);
    } catch {
      return new AssetRegistry();
    }
  }

  register(record: Omit<AssetRecord, 'kind' | 'created_at' | 'status'> & Partial<Pick<AssetRecord, 'kind' | 'created_at' | 'status'>>): AssetRecord {
    const full = AssetRecordSchema.parse({ kind: kindFromPath(record.path), status: 'ready', created_at: new Date().toISOString(), ...record });
    this.records.set(full.path, full);
    return full;
  }

  get(path: string) {
    return this.records.get(path);
  }

  remove(path: string) {
    return this.records.delete(path);
  }

  list(filter: Partial<Pick<AssetRecord, 'kind' | 'origin' | 'status'>> = {}): AssetRecord[] {
    return [...this.records.values()]
      .filter((r) => (!filter.kind || r.kind === filter.kind) && (!filter.origin || r.origin === filter.origin) && (!filter.status || r.status === filter.status))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  toJSON() {
    return { version: 1, assets: this.list() };
  }
}

export interface SynthesisRequest {
  type: 'portrait' | 'background' | 'sfx' | 'voice';
  prompt: string;
  style_preset: string;
}

export interface SynthesisResult {
  path: string;
  status: 'ready' | 'pending';
  provider: string;
}

/** Generador sintético intercambiable (Gemini, Flux, Stable Diffusion, ElevenLabs…). */
export interface AssetSynthesizer {
  readonly provider: string;
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'recurso';

/** Sin servicio configurado: reserva la ruta y la marca como pendiente para que el autor la aporte. */
export class OfflineSynthesizer implements AssetSynthesizer {
  readonly provider = 'pendiente';
  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const folder = request.type === 'sfx' || request.type === 'voice' ? 'audio' : 'images';
    const ext = folder === 'audio' ? 'ogg' : 'webp';
    return { path: `assets/${folder}/${request.type}_${slug(request.prompt)}.${ext}`, status: 'pending', provider: this.provider };
  }
}
