// Configuración global de pruebas (jsdom).

// jsdom no implementa URL.createObjectURL con sus propios Blob: se sustituye por un registro en memoria.
const blobs = new Map<string, Blob>();
let counter = 0;
URL.createObjectURL = (blob: Blob | MediaSource) => {
  const url = `blob:duvarret-test/${++counter}`;
  if (blob instanceof Blob) blobs.set(url, blob);
  return url;
};
URL.revokeObjectURL = (url: string) => void blobs.delete(url);

export const testBlobs = blobs;
