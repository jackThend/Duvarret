import { z } from 'zod';
import { MANIFEST_SCHEMA_URL, RUNTIME_SCHEMA_VERSION } from './catalog';
import { StoryManifestSchema } from './schema';

/** JSON Schema (draft 2020-12) del manifiesto, apto para herramientas externas y tool calling. */
export function buildManifestJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(StoryManifestSchema, { io: 'input', target: 'draft-2020-12' }) as Record<string, unknown>;
  return {
    ...schema,
    $id: MANIFEST_SCHEMA_URL,
    title: 'Duvarret story_manifest.json',
    description: `Contrato declarativo del Duvarret Runtime v${RUNTIME_SCHEMA_VERSION}`,
  };
}
