import { describe, expect, it, vi } from 'vitest';
import { Announcer, type Speaker } from './announcer';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function recorder() {
  const plays: { asset: string; onEnded?: () => void }[] = [];
  const audio = {
    play: vi.fn(async (asset: string, options: { onEnded?: () => void }) => {
      plays.push({ asset, ...options });
      return { placeholder: false };
    }),
    stop: vi.fn(),
  };
  return { plays, audio };
}

describe('cola única de voz', () => {
  it('silencia síntesis y grabaciones sin bloquear la región accesible ni sus callbacks', async () => {
    const { plays, audio } = recorder();
    const speaker: Speaker = { speak: vi.fn(), cancel: vi.fn() };
    const announcer = new Announcer(speaker);
    announcer.configure(audio as never, undefined);
    announcer.setMuted(true);
    const end = vi.fn();
    announcer.say('Texto accesible', { asset: 'voz.wav', onEnd: end });
    await flush();
    expect(plays).toHaveLength(0);
    expect(speaker.speak).not.toHaveBeenCalled();
    expect(announcer.polite.value).toBe('Texto accesible');
    expect(end).toHaveBeenCalledOnce();
    announcer.setMuted(false);
    announcer.say('Ahora sí', { asset: 'voz.wav' });
    await flush();
    expect(plays).toHaveLength(1);
    announcer.setMuted(true);
    expect(audio.stop).toHaveBeenCalledWith('duvarret::speech', 0);
  });
  it('una escena sin prosa permite anunciar las opciones después de su título', async () => {
    const { plays, audio } = recorder();
    const announcer = new Announcer();
    announcer.configure(audio as never, { voice_id: 'kokoro:ef_dora', label: 'Dora', clips: [
      { text: 'Título', asset: 'titulo.wav' }, { text: 'Opciones', asset: 'opciones.wav' },
    ] });
    announcer.say('Título');
    announcer.say('', { onEnd: () => announcer.say('Opciones') });
    await flush();
    expect(plays.map(p => p.asset)).toEqual(['titulo.wav']);
    plays[0]!.onEnded!(); await flush();
    expect(plays.map(p => p.asset)).toEqual(['titulo.wav', 'opciones.wav']);
  });
  it('espera al final real del título del sistema antes de empezar una grabación', async () => {
    let titleEnded!: () => void;
    const speaker: Speaker = { speak: vi.fn(() => new Promise<void>(resolve => { titleEnded = resolve; })), cancel: vi.fn() };
    const { plays, audio } = recorder();
    const announcer = new Announcer(speaker);
    announcer.configure(audio as never, undefined);
    announcer.say('Título');
    announcer.say('Relato', { asset: 'relato.wav', onEnd: () => announcer.say('Opciones') });
    expect(plays).toHaveLength(0);
    titleEnded(); await flush();
    expect(plays.map(p => p.asset)).toEqual(['relato.wav']);
    expect(speaker.speak).toHaveBeenCalledTimes(1);
    plays[0]!.onEnded!();
    expect(speaker.speak).toHaveBeenCalledTimes(2);
  });

  it('títulos, relato y opciones usan la misma voz grabada y nunca se solapan', async () => {
    const { plays, audio } = recorder();
    const speaker: Speaker = { speak: vi.fn(), cancel: vi.fn() };
    const announcer = new Announcer(speaker);
    announcer.configure(audio as never, { voice_id: 'kokoro:ef_dora', label: 'Dora', clips: [
      { text: 'Título', asset: 'titulo.wav' }, { text: 'Relato', asset: 'relato.wav' }, { text: '1: Seguir.', asset: 'opcion.wav' },
    ] });
    announcer.say('Título'); announcer.say('Relato'); announcer.say('1: Seguir.');
    await flush();
    expect(plays.map(p => p.asset)).toEqual(['titulo.wav']);
    plays[0]!.onEnded!(); await flush();
    expect(plays.map(p => p.asset)).toEqual(['titulo.wav', 'relato.wav']);
    plays[1]!.onEnded!(); await flush();
    expect(plays.map(p => p.asset)).toEqual(['titulo.wav', 'relato.wav', 'opcion.wav']);
    expect(speaker.speak).not.toHaveBeenCalled();
  });

  it('cancelar descarta la cola y los callbacks de una escena anterior', async () => {
    const { plays, audio } = recorder();
    const announcer = new Announcer();
    announcer.configure(audio as never, undefined);
    const oldMenu = vi.fn();
    announcer.say('Anterior', { asset: 'anterior.wav', onEnd: oldMenu });
    announcer.say('Opción anterior', { asset: 'opcion.wav' });
    await flush();
    announcer.silence();
    announcer.say('Nueva', { asset: 'nueva.wav' });
    plays[0]!.onEnded!(); await flush();
    expect(oldMenu).not.toHaveBeenCalled();
    expect(plays.map(p => p.asset)).toEqual(['anterior.wav', 'nueva.wav']);
    expect(audio.stop).toHaveBeenCalledWith('duvarret::speech', 0);
  });

  it('una frase editada o un WAV ausente nunca cambian a la voz del navegador', async () => {
    const speaker: Speaker = { speak: vi.fn(), cancel: vi.fn() };
    const { audio } = recorder();
    audio.play.mockResolvedValue({ placeholder: true });
    const announcer = new Announcer(speaker);
    announcer.configure(audio as never, { voice_id: 'kokoro:ef_dora', label: 'Dora', clips: [{ text: 'Original', asset: 'original.wav' }] });
    announcer.say('Editado');
    expect(announcer.warning.value).toContain('Editado');
    announcer.say('Original'); await flush();
    expect(announcer.warning.value).toContain('Original');
    expect(speaker.speak).not.toHaveBeenCalled();
  });
});
