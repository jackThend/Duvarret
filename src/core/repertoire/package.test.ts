import { describe, expect, it } from 'vitest';
import { parseScenePackage } from './package';

const raw = (overlay: Record<string, unknown>, assets: Record<string, string> = {}) => JSON.stringify({
  format: 'duvarret-scene', version: 1, name: 'Eco', overlay: { type: 'radio_tuning', ...overlay }, assets,
});
describe('paquetes de Repertorio', () => {
  it('abre una escena declarativa mínima y completa sus valores', () => {
    expect(parseScenePackage(raw({})).overlay.parameters.target_a).toBe(32);
  });
  it('rechaza enlaces a otras obras y destinos en la máquina', () => {
    expect(() => parseScenePackage(raw({ on_success: { transition_to_node: 'fuera' } }))).toThrow(/portable/);
    expect(() => parseScenePackage(raw({ parameters: { artwork: '../foto.svg' } }))).toThrow();
  });
  it('rechaza SVG activo y recursos ausentes', () => {
    const path = 'assets/images/x.svg';
    expect(() => parseScenePackage(raw({ parameters: { artwork: path } }))).toThrow();
    expect(() => parseScenePackage(raw({ parameters: { artwork: path } }, { [path]: btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>go()</script></svg>') }))).toThrow();
  });
});
