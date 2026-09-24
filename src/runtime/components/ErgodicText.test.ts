import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { TolerantSchemas } from '@/core/manifest';
import ErgodicText from './ErgodicText.vue';
import FlashlightMask from './FlashlightMask.vue';

const engine = (input: Record<string, unknown>) => TolerantSchemas.typographicEngine.parse(input);

afterEach(() => vi.useRealTimers());

describe('ErgodicText', () => {
  it('renderiza párrafos y textos revelados por percepción', () => {
    const wrapper = mount(ErgodicText, { props: { text: 'Uno.\n\nDos.', extraTexts: ['Una brisa.'] } });
    expect(wrapper.findAll('p')).toHaveLength(3);
    expect(wrapper.get('[data-testid="extra-text"]').text()).toBe('Una brisa.');
  });

  it('aplica el ancho de pasillo angosto', () => {
    const wrapper = mount(ErgodicText, { props: { text: 'x', engine: engine({ layout_mode: 'narrow_corridor', column_width_rem: 20 }) } });
    const style = wrapper.get('[data-testid="ergodic-column"]').attributes('style');
    expect(style).toContain('--dv-column-width: 20rem');
  });

  it('usa el fallback CSS de licuado cuando no hay WebGL (jsdom)', async () => {
    const wrapper = mount(ErgodicText, { props: { text: 'calor sofocante', engine: engine({ layout_mode: 'melt_text' }) } });
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-testid="melt-canvas"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ergodic-column"]').classes()).toContain('dv-melt-fallback');
    expect(wrapper.findAll('.dv-word')).toHaveLength(2);
  });

  it('monta la linterna con sus parámetros', () => {
    const wrapper = mount(ErgodicText, {
      props: { text: 'oscuridad', engine: engine({ flashlight_reveal: { radius_px: 120, darkness_opacity: 0.8 } }) },
    });
    const mask = wrapper.findComponent(FlashlightMask);
    expect(mask.props('radiusPx')).toBe(120);
    expect(mask.props('darknessOpacity')).toBe(0.8);
  });

  it('hace caer las palabras con física', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ErgodicText, { props: { text: 'las palabras caen', engine: engine({ layout_mode: 'physics_fall' }) } });
    vi.advanceTimersByTime(500);
    await nextTick();
    const transform = (wrapper.findAll('.dv-word')[0]!.element as HTMLElement).style.transform;
    expect(transform).toMatch(/translate\(.*px, [1-9]\d*(\.\d)?px\)/);
    wrapper.unmount();
  });
});

describe('FlashlightMask', () => {
  it('sigue el puntero y el teclado', async () => {
    const wrapper = mount(FlashlightMask, { props: { radiusPx: 100, darknessOpacity: 0.9 } });
    const shade = () => (wrapper.get('.dv-flashlight-shade').element as HTMLElement).style.background;
    expect(shade()).toContain('50% 20%');
    await wrapper.trigger('mousemove', { clientX: 40, clientY: 70 });
    expect(shade()).toContain('40px 70px');
    await wrapper.trigger('keydown', { key: 'ArrowRight' });
    expect(shade()).toContain('80px 70px');
    expect(shade()).toContain('rgba(0, 0, 0, 0.9) 100px');
    expect(wrapper.attributes('aria-label')).toContain('flechas');
  });
});
