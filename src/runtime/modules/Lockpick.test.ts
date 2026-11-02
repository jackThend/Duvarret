import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { TolerantSchemas } from '@/core/manifest';
import Lockpick from './Lockpick.vue';
import ModuleSandbox from './ModuleSandbox.vue';
import { LockpickParams } from './params';

describe('Lockpick', () => {
  it('abre los tres pernos con teclado y botones y emite éxito una sola vez', async () => {
    const wrapper = mount(Lockpick, { props: { parameters: { pin_heights: [1, 3, 2] } } });
    for (const [index, height] of [1, 3, 2].entries()) {
      const input = wrapper.get(`[data-testid="pin-height-${index}"]`);
      expect(input.attributes('aria-label')).toBe(`Altura del perno ${index + 1}`);
      for (let n = 0; n < height; n++) await input.trigger('keydown', { key: 'ArrowUp' });
      await wrapper.get(`[data-testid="pin-fix-${index}"]`).trigger('click');
    }
    expect(wrapper.emitted('success')).toEqual([[]]);
    expect(wrapper.emitted('failure')).toBeUndefined();
    expect(wrapper.get('[role="status"]').text()).toContain('Cerradura abierta');
    await wrapper.get('[data-testid="pin-fix-2"]').trigger('click');
    expect(wrapper.emitted('success')).toHaveLength(1);
    expect(wrapper.findAll('fieldset').every(f => (f.element as HTMLFieldSetElement).disabled)).toBe(true);
  });

  it('permite corregir un error sin perder pernos fijados', async () => {
    const wrapper = mount(Lockpick, { props: { parameters: { pin_heights: [1, 3, 2], max_attempts: 2 } } });
    await wrapper.get('[data-testid="pin-height-0"]').setValue('1');
    await wrapper.get('[data-testid="pin-fix-0"]').trigger('click');
    await wrapper.get('[data-testid="pin-fix-1"]').trigger('click');
    expect(wrapper.emitted('failure')).toBeUndefined();
    expect(wrapper.get('[role="status"]').text()).toContain('Intentos restantes: 1');
    expect((wrapper.findAll('fieldset')[0]!.element as HTMLFieldSetElement).disabled).toBe(true);
    for (const [index, height] of [[1, 3], [2, 2]]) {
      await wrapper.get(`[data-testid="pin-height-${index}"]`).setValue(String(height));
      await wrapper.get(`[data-testid="pin-fix-${index}"]`).trigger('click');
    }
    expect(wrapper.emitted('success')).toHaveLength(1);
  });

  it('limita las alturas por teclado y falla solo al agotar los intentos', async () => {
    const wrapper = mount(Lockpick, { props: { parameters: { max_attempts: 2 } } });
    const input = wrapper.get('[data-testid="pin-height-0"]');
    await input.trigger('keydown', { key: 'End' });
    await input.trigger('keydown', { key: 'ArrowUp' });
    expect((input.element as HTMLInputElement).value).toBe('4');
    await input.trigger('keydown', { key: 'Home' });
    await input.trigger('keydown', { key: 'ArrowDown' });
    expect((input.element as HTMLInputElement).value).toBe('0');
    const button = wrapper.get('[data-testid="pin-fix-0"]');
    await button.trigger('click');
    expect(wrapper.emitted('failure')).toBeUndefined();
    await button.trigger('click');
    await button.trigger('click');
    expect(wrapper.emitted('failure')).toEqual([[]]);
    expect(wrapper.emitted('success')).toBeUndefined();
    expect(wrapper.get('[role="status"]').text()).toContain('No quedan intentos');
  });

  it('repara configuraciones inválidas sin alterar los parámetros de origen', () => {
    for (const pin_heights of [[1, 2], [1, 2, 3, 4], [-1, 3, 2], [1, 4.5, 2], 'tres']) {
      expect(LockpickParams.parse({ pin_heights, max_attempts: 0 })).toEqual({ pin_heights: [1, 3, 2], max_attempts: 3 });
    }
    expect(LockpickParams.parse({ pin_heights: [0, 4, 2], max_attempts: 1 }).pin_heights).toEqual([0, 4, 2]);
    const parameters = Object.freeze({ pin_heights: Object.freeze([1, 3, 2]) });
    expect(() => mount(Lockpick, { props: { parameters } })).not.toThrow();
  });
});

describe('Lockpick en ModuleSandbox', () => {
  it.each([true, false])('propaga resolve(%s) una sola vez', async success => {
    const wrapper = mount(ModuleSandbox, {
      props: { overlay: TolerantSchemas.gameplayOverlay.parse({
        type: 'lockpick', parameters: { pin_heights: [0, 0, 0], max_attempts: 1 },
      }) },
    });
    if (success) {
      for (let index = 0; index < 3; index++) await wrapper.get(`[data-testid="pin-fix-${index}"]`).trigger('click');
    } else {
      await wrapper.get('[data-testid="pin-height-0"]').setValue('1');
      await wrapper.get('[data-testid="pin-fix-0"]').trigger('click');
    }
    wrapper.findComponent(Lockpick).vm.$emit('success');
    wrapper.findComponent(Lockpick).vm.$emit('failure');
    expect(wrapper.emitted('resolve')).toEqual([[success]]);
  });
});
