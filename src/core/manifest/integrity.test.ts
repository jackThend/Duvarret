import { describe, expect, it } from 'vitest';
import example from './__fixtures__/doc03-example.json';
import { checkIntegrity, findUnreachableNodes } from './integrity';
import { hasBlockingIssues } from './diagnostics';
import { validateManifest } from './validator';

const build = (nodes: unknown[], extra: Record<string, unknown> = {}) =>
  validateManifest({ metadata: { title: 't' }, ...extra, nodes }).manifest;

describe('checkIntegrity', () => {
  it('detecta transiciones hacia escenas inexistentes en el ejemplo del doc 03', () => {
    const issues = checkIntegrity(validateManifest(example).manifest);
    const missing = issues.filter((i) => i.code === 'missing_node').map((i) => i.path);
    expect(missing).toContain('nodes.0.gameplay_overlay.on_success.transition_to_node');
    expect(missing).toContain('nodes.0.navigation.default_next_node');
    expect(missing).toContain('nodes.0.screenless_mode.voice_prompts.0.keypad_shortcuts.1');
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it('acepta una obra coherente', () => {
    const manifest = build(
      [
        { node_id: 'a', navigation: { default_next_node: 'b', choices: [{ choice_text: 'Ir', target_node: 'b' }] } },
        { node_id: 'b', navigation: { is_ending: true } },
      ],
      {},
    );
    expect(hasBlockingIssues(checkIntegrity(manifest))).toBe(false);
  });

  it('detecta nombres de escena duplicados', () => {
    const issues = checkIntegrity(build([{ node_id: 'a' }, { node_id: 'a' }]));
    expect(issues.some((i) => i.code === 'duplicate_node')).toBe(true);
  });

  it('avisa de personajes y objetos no registrados', () => {
    const issues = checkIntegrity(
      build([
        {
          node_id: 'a',
          visual_novel_overlay: { active_speaker: 'fantasma', dialogue_text: 'Buu' },
          navigation: { is_ending: true, choices: [{ choice_text: 'x', target_node: 'a', condition: { required_item: 'llave' } }] },
        },
      ]),
    );
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('unknown_character');
    expect(codes).toContain('unknown_item');
  });

  it('señala obras vacías y comienzos inexistentes', () => {
    expect(checkIntegrity(build([])).some((i) => i.code === 'no_nodes')).toBe(true);
    const issues = checkIntegrity(build([{ node_id: 'a' }], { initial_state: { start_node: 'z' } }));
    expect(issues.some((i) => i.path === 'initial_state.start_node')).toBe(true);
  });

  it('trata escenas sin salida como finales implícitos', () => {
    const issues = checkIntegrity(build([{ node_id: 'a' }]));
    expect(issues.find((i) => i.code === 'implicit_ending')?.severity).toBe('info');
  });
});

describe('findUnreachableNodes', () => {
  it('encuentra escenas huérfanas', () => {
    const manifest = build([
      { node_id: 'a', navigation: { default_next_node: 'b' } },
      { node_id: 'b', navigation: { is_ending: true } },
      { node_id: 'huerfana', navigation: { is_ending: true } },
    ]);
    expect(findUnreachableNodes(manifest)).toEqual(['huerfana']);
  });
});
