import { describe, expect, it, vi } from 'vitest';
import { NATIVE_CHUNK_BYTES, writeProjectBytes } from './nativeBytes';

describe('archivos grandes hacia el shell nativo', () => {
  it('envía partes acotadas, consecutivas y sin perder bytes ni publicar a medias', async () => {
    const bytes = Uint8Array.from({ length: NATIVE_CHUNK_BYTES * 2 + 17 }, (_, i) => i % 251);
    const received: number[] = [];
    const invoke = vi.fn(async (command: string, args: Record<string, unknown>) => {
      expect(command).toBe('project_write_bytes_chunk');
      expect(args.offset).toBe(received.length);
      expect(args.total).toBe(bytes.length);
      const decoded = atob(args.encoded as string);
      expect(decoded.length).toBeLessThanOrEqual(NATIVE_CHUNK_BYTES);
      for (const character of decoded) received.push(character.charCodeAt(0));
    });
    await writeProjectBytes('obra', 'export/cuento.zip', bytes, invoke);
    expect(Uint8Array.from(received)).toEqual(bytes);
    expect(invoke).toHaveBeenCalledTimes(3);
  });
  it('detiene el envío si falla una parte, sin enviar el final', async () => {
    const invoke = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Disco lleno'));
    await expect(writeProjectBytes('obra', 'export/cuento.zip', new Uint8Array(NATIVE_CHUNK_BYTES * 3), invoke)).rejects.toThrow('Disco lleno');
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
