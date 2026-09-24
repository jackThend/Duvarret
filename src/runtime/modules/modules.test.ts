import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { TolerantSchemas } from '@/core/manifest';
import CipherLock from './CipherLock.vue';
import CrtTerminal from './CrtTerminal.vue';
import CircuitWiring from './CircuitWiring.vue';
import FictionalDesktop from './FictionalDesktop.vue';
import ModuleSandbox from './ModuleSandbox.vue';
import { TerminalMachine, tokenize } from './terminalParser';
import { CircuitParams, TerminalParams } from './params';

describe('terminalParser', () => {
  const machine = () =>
    new TerminalMachine(
      TerminalParams.parse({ files: { 'bitacora.txt': 'Día 3.\nLa clave es 7391.' }, hosts: ['central'], target_code: '7391', max_attempts: 2 }),
    );

  it('tokeniza respetando comillas', () => {
    expect(tokenize('cat "mi archivo.txt" x')).toEqual(['cat', 'mi archivo.txt', 'x']);
  });

  it('lista, lee y conecta', () => {
    const m = machine();
    expect(m.run('ls').output).toEqual(['bitacora.txt']);
    expect(m.run('cat bitacora.txt').output).toEqual(['Día 3.', 'La clave es 7391.']);
    expect(m.run('cat nada').output[0]).toContain('no existe');
    expect(m.run('connect central').output[0]).toBe('Conectado a central.');
    expect(m.run('connect marte').output[0]).toContain('sin respuesta');
    expect(m.run('rm -rf /').output[0]).toContain('orden no reconocida');
    expect(m.run('clear').clear).toBe(true);
  });

  it('anula con el código correcto y bloquea tras agotar intentos', () => {
    expect(machine().run('override 7391').outcome).toBe('success');
    const m = machine();
    expect(m.run('override 1').outcome).toBeUndefined();
    expect(m.run('override 2').outcome).toBe('failure');
  });

  it('admite una orden de éxito declarada', () => {
    const m = new TerminalMachine(TerminalParams.parse({ success_command: 'abrir compuerta' }));
    expect(m.run('ABRIR COMPUERTA').outcome).toBe('success');
  });
});

describe('CipherLock', () => {
  it('acepta el código correcto por teclado y botones', async () => {
    const wrapper = mount(CipherLock, { props: { parameters: { target_code: '7391', prompt_text: 'CÓDIGO:' } } });
    for (const k of '739') await wrapper.trigger('keydown', { key: k });
    await wrapper.findAll('button').find((b) => b.text() === '1')!.trigger('click');
    expect(wrapper.get('[data-testid="lock-display"]').text()).toBe('••••');
    await wrapper.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('success')).toHaveLength(1);
    expect(wrapper.emitted('feedback')!.at(-1)).toEqual(['ok']);
  });

  it('cuenta intentos y falla', async () => {
    const wrapper = mount(CipherLock, { props: { parameters: { target_code: 11, max_attempts: 2 } } });
    await wrapper.trigger('keydown', { key: '2' });
    await wrapper.trigger('keydown', { key: 'Enter' });
    expect(wrapper.get('[data-testid="lock-message"]').text()).toContain('1 INTENTO');
    await wrapper.trigger('keydown', { key: '3' });
    await wrapper.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('failure')).toHaveLength(1);
  });

  it('tolera parámetros absurdos', () => {
    expect(() => mount(CipherLock, { props: { parameters: { max_attempts: 'muchos', screen_type: 'holograma' } } })).not.toThrow();
  });
});

describe('CrtTerminal', () => {
  it('ejecuta órdenes simuladas hasta el éxito', async () => {
    const wrapper = mount(CrtTerminal, { props: { parameters: { target_code: '42', boot_lines: ['BIENVENIDO'] } } });
    expect(wrapper.text()).toContain('BIENVENIDO');
    const input = wrapper.get('[data-testid="crt-input"]');
    await input.setValue('help');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.text()).toContain('Comandos:');
    await input.setValue('override 42');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('success')).toHaveLength(1);
    expect((input.element as HTMLInputElement).disabled).toBe(true);
  });
});

describe('CircuitWiring', () => {
  it('baraja los bornes de forma determinista', () => {
    const a = mount(CircuitWiring, { props: { parameters: { seed: 3 } } });
    const b = mount(CircuitWiring, { props: { parameters: { seed: 3 } } });
    const order = (w: typeof a) => w.findAll('[data-testid^="right-"]').map((x) => x.attributes('data-testid'));
    expect(order(a)).toEqual(order(b));
    expect(CircuitParams.parse({}).colors).toHaveLength(4);
  });

  it('se resuelve al unir todos los colores', async () => {
    const wrapper = mount(CircuitWiring, { props: { parameters: { colors: ['rojo', 'azul'] } } });
    for (const c of ['rojo', 'azul']) {
      await wrapper.get(`[data-testid="left-${c}"]`).trigger('click');
      await wrapper.get(`[data-testid="right-${c}"]`).trigger('click');
    }
    expect(wrapper.emitted('success')).toHaveLength(1);
  });

  it('falla tras demasiados chispazos', async () => {
    const wrapper = mount(CircuitWiring, { props: { parameters: { colors: ['rojo', 'azul'], max_mistakes: 1 } } });
    await wrapper.get('[data-testid="left-rojo"]').trigger('click');
    await wrapper.get('[data-testid="right-azul"]').trigger('click');
    expect(wrapper.emitted('failure')).toHaveLength(1);
  });
});

describe('FictionalDesktop', () => {
  it('desbloquea un archivo protegido y alcanza el objetivo', async () => {
    const wrapper = mount(FictionalDesktop, {
      props: {
        parameters: {
          files: [
            { name: 'notas.txt', kind: 'text', content: 'La clave es ámbar' },
            { name: 'secreto.eml', kind: 'mail', content: 'Nos vemos en el molino', password: 'ambar' },
          ],
          goal_file: 'secreto.eml',
        },
      },
    });
    await wrapper.get('[data-testid="file-notas.txt"]').trigger('click');
    expect(wrapper.get('[data-testid="desktop-window"]').text()).toContain('La clave es ámbar');
    await wrapper.get('[data-testid="file-secreto.eml"]').trigger('click');
    await wrapper.get('[data-testid="desktop-password-input"]').setValue('error');
    await wrapper.get('[data-testid="desktop-password"]').trigger('submit');
    expect(wrapper.text()).toContain('Contraseña incorrecta');
    await wrapper.get('[data-testid="desktop-password-input"]').setValue('ambar');
    await wrapper.get('[data-testid="desktop-password"]').trigger('submit');
    expect(wrapper.get('[data-testid="desktop-window"]').text()).toContain('molino');
    expect(wrapper.emitted('success')).toHaveLength(1);
  });
});

describe('ModuleSandbox', () => {
  const overlay = (input: Record<string, unknown>) => TolerantSchemas.gameplayOverlay.parse(input);

  it('monta el módulo declarado y devuelve solo la señal de éxito', async () => {
    const wrapper = mount(ModuleSandbox, { props: { overlay: overlay({ type: 'cipher_lock', parameters: { target_code: '1' } }) } });
    const lock = wrapper.get('[data-testid="cipher-lock"]');
    await lock.trigger('keydown', { key: '1' });
    await lock.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('resolve')).toEqual([[true]]);
  });

  it('entrega parámetros congelados (el módulo no puede alterar la historia)', () => {
    const params = { target_code: '1', nested: { a: 1 } };
    const wrapper = mount(ModuleSandbox, { props: { overlay: overlay({ type: 'cipher_lock', parameters: params }) } });
    const received = wrapper.findComponent(CipherLock).props('parameters') as { nested: { a: number } };
    expect(Object.isFrozen(received.nested)).toBe(true);
    expect(received).not.toBe(params);
  });

  it('contiene los fallos internos sin propagarlos', async () => {
    const Broken = defineComponent({
      setup() {
        throw new Error('puzle mal configurado');
      },
      render: () => h('div'),
    });
    const Host = defineComponent({
      components: { ModuleSandbox },
      setup: () => ({ o: overlay({ type: 'cipher_lock' }) }),
      template: '<ModuleSandbox :overlay="o" @resolve="(s) => $emit(\'done\', s)" />',
    });
    const wrapper = mount(Host, { global: { stubs: { CipherLock: Broken } } });
    await nextTick();
    expect(wrapper.find('[data-testid="sandbox-crash"]').exists()).toBe(true);
    await wrapper.findAll('[data-testid="sandbox-crash"] button')[1]!.trigger('click');
    expect(wrapper.emitted('done')).toEqual([[false]]);
  });

  it('permite abandonar el enigma', async () => {
    const wrapper = mount(ModuleSandbox, { props: { overlay: overlay({ type: 'circuit_wiring' }) } });
    await wrapper.get('[data-testid="sandbox-giveup"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('resolve')).toEqual([[false]]);
  });
});
