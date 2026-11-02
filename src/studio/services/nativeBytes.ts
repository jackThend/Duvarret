/** Evita convertir archivos grandes en millones de números dentro de un único mensaje IPC. */
export const NATIVE_CHUNK_BYTES = 256 * 1024;
type ByteInvoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;
const nativeInvoke: ByteInvoke = async (command, args) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
};

export async function writeProjectBytes(root: string, relative: string, data: Uint8Array, invoke: ByteInvoke = nativeInvoke): Promise<void> {
  if (data.length <= NATIVE_CHUNK_BYTES) {
    await invoke('project_write_bytes', { root, relative, contents: Array.from(data) });
    return;
  }
  for (let offset = 0; offset < data.length; offset += NATIVE_CHUNK_BYTES) {
    const chunk = data.subarray(offset, offset + NATIVE_CHUNK_BYTES);
    let binary = '';
    for (let index = 0; index < chunk.length; index += 8192) binary += String.fromCharCode(...chunk.subarray(index, index + 8192));
    await invoke('project_write_bytes_chunk', { root, relative, encoded: btoa(binary), offset, total: data.length });
  }
}
