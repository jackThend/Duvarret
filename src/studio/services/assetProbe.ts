/**
 * Qué archivos de la obra existen de verdad (en disco, en el dispositivo o junto a la obra de
 * ejemplo). La usan el diálogo de recursos y el panel de exportación, para que ambos digan lo mismo.
 */
export async function presentAssets(paths: Iterable<string>, resolve: (path: string) => string, overrides: ReadonlyMap<string, string>): Promise<Set<string>> {
  const found = new Set<string>();
  await Promise.all(
    [...paths].map(async (path) => {
      if (overrides.has(path)) return void found.add(path);
      try {
        const response = await fetch(resolve(path));
        // Muchos servidores responden con la página principal (HTML) a cualquier archivo inexistente.
        if (response.ok && !(response.headers.get('content-type') ?? '').includes('text/html')) found.add(path);
      } catch {
        /* no está */
      }
    }),
  );
  return found;
}
