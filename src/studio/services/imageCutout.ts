/** Recorte local de un fondo uniforme conectado al borde. No adivina siluetas complejas. */
export async function removePlainBackground(data: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([data.slice().buffer], { type: mimeType }));
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error('Para recortar, usa una imagen de hasta 16 megapíxeles.');
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No se pudo preparar el recorte.');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), rgba = pixels.data;
    const corners = [0, canvas.width - 1, (canvas.height - 1) * canvas.width, canvas.width * canvas.height - 1];
    const bg = [0, 1, 2].map(c => corners.reduce((sum, p) => sum + rgba[p * 4 + c]!, 0) / 4);
    if (corners.some(p => [0, 1, 2].some(c => Math.abs(rgba[p * 4 + c]! - bg[c]!) > 35))) throw new Error('El fondo no es uniforme. Usa un PNG transparente o prepara un recorte en tu editor de imágenes.');
    const count = canvas.width * canvas.height, visited = new Uint8Array(count), queue = new Uint32Array(count);
    let head = 0, tail = 0;
    function enqueue(p: number) { if (visited[p]) return; visited[p] = 1; if ([0, 1, 2].every(c => Math.abs(rgba[p * 4 + c]! - bg[c]!) <= 35)) queue[tail++] = p; }
    for (let x = 0; x < canvas.width; x++) { enqueue(x); enqueue(count - canvas.width + x); }
    for (let y = 0; y < canvas.height; y++) { enqueue(y * canvas.width); enqueue(y * canvas.width + canvas.width - 1); }
    while (head < tail) {
      const p = queue[head++]!; rgba[p * 4 + 3] = 0;
      if (p % canvas.width) enqueue(p - 1);
      if (p % canvas.width < canvas.width - 1) enqueue(p + 1);
      if (p >= canvas.width) enqueue(p - canvas.width);
      if (p < count - canvas.width) enqueue(p + canvas.width);
    }
    if (tail > count * .98) throw new Error('El recorte eliminaría casi toda la imagen. Conserva el original o usa un PNG transparente.');
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo guardar el recorte.')), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}
