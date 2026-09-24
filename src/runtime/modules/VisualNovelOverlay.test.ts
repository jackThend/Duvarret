import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { CharacterSchema, TolerantSchemas } from '@/core/manifest';
import VisualNovelOverlay from './VisualNovelOverlay.vue';

const characters = {
  sancho: CharacterSchema.parse({ name: 'Sancho Panza', color_accent: '#10b981', sprites: { neutral: 'n.webp', alarmed: 'a.webp' } }),
  quijote: CharacterSchema.parse({ name: 'Don Quijote' }),
};

const overlay = (input: Record<string, unknown>) => TolerantSchemas.visualNovelOverlay.parse(input);

describe('VisualNovelOverlay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('escribe el diálogo como una máquina de escribir y muestra el avatar emotivo', async () => {
    const wrapper = mount(VisualNovelOverlay, {
      props: { overlay: overlay({ active_speaker: 'sancho', current_mood: 'alarmed', dialogue_text: '¡Pasos!' }), characters, cps: 10 },
    });
    expect(wrapper.get('[data-testid="vn-avatar"]').attributes('src')).toBe('a.webp');
    expect(wrapper.text()).toContain('Sancho Panza');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(wrapper.get('[data-testid="vn-text"]').text()).toMatch(/^¡Pa/);
    vi.advanceTimersByTime(2000);
    await nextTick();
    expect(wrapper.get('[data-testid="vn-text"]').text()).toBe('¡Pasos!');
    expect(wrapper.emitted('line')?.[0]).toEqual(['sancho', '¡Pasos!']);
  });

  it('recorre varias líneas: el primer clic completa, el siguiente avanza', async () => {
    const wrapper = mount(VisualNovelOverlay, {
      props: {
        overlay: overlay({
          active_speaker: 'sancho',
          lines: [
            { speaker: 'sancho', text: 'Señor, ¿no oye?' },
            { speaker: 'quijote', mood: 'solemne', text: 'Son gigantes.', position: 'right' },
          ],
        }),
        characters,
        cps: 5,
      },
    });
    const box = wrapper.get('[data-testid="vn-box"]');
    await box.trigger('click');
    expect(wrapper.get('[data-testid="vn-text"]').text()).toBe('Señor, ¿no oye?');
    await box.trigger('click');
    expect(wrapper.text()).toContain('Don Quijote');
    // sin sprites: marcador estilizado con iniciales
    expect(wrapper.get('[data-testid="vn-placeholder"]').text()).toBe('DQ');
    await box.trigger('keydown', { key: 'Enter' });
    await box.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('finished')).toHaveLength(1);
  });

  it('sustituye un retrato que no carga por el marcador estilizado', async () => {
    const wrapper = mount(VisualNovelOverlay, {
      props: { overlay: overlay({ active_speaker: 'sancho', dialogue_text: 'Hola' }), characters },
    });
    await wrapper.get('[data-testid="vn-avatar"]').trigger('error');
    expect(wrapper.find('[data-testid="vn-placeholder"]').exists()).toBe(true);
  });

  it('muestra el historial', async () => {
    const wrapper = mount(VisualNovelOverlay, {
      props: { overlay: overlay({ active_speaker: 'sancho', dialogue_text: 'x' }), characters, backlog: [{ speaker: 'sancho', text: 'Antes' }] },
    });
    await wrapper.get('[data-testid="vn-backlog-toggle"]').trigger('click');
    expect(wrapper.get('[data-testid="vn-backlog"]').text()).toContain('Sancho Panza: Antes');
  });
});
