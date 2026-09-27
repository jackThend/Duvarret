/** Genera `schemas/story-manifest.schema.json` a partir del esquema Zod. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildManifestJsonSchema } from '../src/core/manifest/jsonSchema';

const out = resolve(import.meta.dirname, '../schemas/story-manifest.schema.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(buildManifestJsonSchema(), null, 2)}\n`);
console.log(`JSON Schema escrito en ${out}`);
