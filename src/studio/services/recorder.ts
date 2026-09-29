/**
 * Grabación de la narración con el micrófono. El resultado se convierte a WAV mono de 24 kHz
 * para que suene igual en todos los motores web (Chromium graba WebM y Safari, MP4, y no todos
 * decodifican el formato del otro). Al exportar, ffmpeg (si está) lo comprime.
 */
import { encodeWav, trimSilence } from '@/core/assets/wav';

export const NARRATION_SAMPLE_RATE = 24_000;

export interface Recording {
  data: Uint8Array;
  seconds: number;
}

export interface ActiveRecording {
  stop(): Promise<Recording>;
  cancel(): void;
}

export function canRecord(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

/** Mezcla a mono y remuestrea con un OfflineAudioContext. */
async function toMono(buffer: AudioBuffer, rate: number): Promise<Float32Array> {
  const frames = Math.max(1, Math.ceil(buffer.duration * rate));
  const offline = new OfflineAudioContext(1, frames, rate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

export async function startRecording(): Promise<ActiveRecording> {
  if (!canRecord()) throw new Error('Este navegador no permite grabar con el micrófono.');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  } catch {
    throw new Error('No hay permiso para usar el micrófono (o no hay ninguno conectado).');
  }
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const release = () => stream.getTracks().forEach((t) => t.stop());
  recorder.start();

  return {
    stop: () =>
      new Promise<Recording>((resolve, reject) => {
        recorder.onstop = async () => {
          release();
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType });
            const ctx = new AudioContext();
            const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
            void ctx.close();
            const samples = trimSilence(await toMono(decoded, NARRATION_SAMPLE_RATE), NARRATION_SAMPLE_RATE);
            if (!samples.length) throw new Error('No se oyó nada: comprueba el micrófono y vuelve a grabar.');
            resolve({ data: encodeWav(samples, NARRATION_SAMPLE_RATE), seconds: samples.length / NARRATION_SAMPLE_RATE });
          } catch (error) {
            reject(error instanceof Error && error.message.startsWith('No se oyó') ? error : new Error('No se pudo procesar la grabación.'));
          }
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = release;
      if (recorder.state !== 'inactive') recorder.stop();
      else release();
    },
  };
}
