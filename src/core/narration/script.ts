import type { StoryManifest } from '../manifest/schema';

export const HELP_TEXT = 'Atajos: números para elegir, Espacio o Intro para continuar, R para repetir, O para oír las opciones, I para el inventario, S para silenciar la voz, H para esta ayuda.';
export const VOICE_UNAVAILABLE = 'El reconocimiento de voz no está disponible en este dispositivo; usa el teclado.';
export const NOT_UNDERSTOOD = 'No entendí. Di «opciones» para escucharlas.';
export const END_TEXT = 'Fin de la obra. Pulsa R para volver a escuchar.';
export const CONTINUE_TEXT = 'Pulsa Espacio para continuar.';
export const speechKey = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim();
export const optionText = (key: string, label: string) => `${key}: ${label}.`;
// Algunos manuscritos ya enumeran las opciones en el aviso: no se leen dos veces.
export const introductionText = (text?: string) => text && !/^\s*\d+\s*:/.test(text) ? text : '';

/** Frases que puede emitir el reproductor. Se comparte con el generador y el validador. */
export function speechTexts(manifest: StoryManifest): string[] {
  const texts = new Map<string, string>();
  const add = (text?: string) => { if (text?.trim()) texts.set(speechKey(text), text); };
  [HELP_TEXT, VOICE_UNAVAILABLE, NOT_UNDERSTOOD, END_TEXT, CONTINUE_TEXT, 'No llevas nada.', 'Llevas:'].forEach(add);
  Object.values(manifest.item_registry).forEach(item => add(item.name));
  for (const node of manifest.nodes) {
    add(node.title);
    add(node.screenless_mode?.narration_text ?? node.text_payload);
    const prompt = node.screenless_mode?.voice_prompts[0];
    add(introductionText(prompt?.spoken_prompt));
    let conditionalBefore = 0;
    node.navigation.choices.forEach((choice, i) => {
      // Las opciones ocultas cambian la numeración del menú audible.
      for (let position = i + 1 - conditionalBefore; position <= i + 1; position++) add(optionText(String(position), choice.choice_text));
      if (choice.condition) conditionalBefore++;
    });
    if (prompt) {
      const options = new Map(prompt.voice_options.map(o => [o.target_node, o.phrase]));
      const shortcuts = Object.keys(prompt.keypad_shortcuts).length ? Object.entries(prompt.keypad_shortcuts) : prompt.voice_options.map((o, i) => [String(i + 1), o.target_node]);
      for (const [key, target] of shortcuts) {
        const label = node.navigation.choices.find(c => c.target_node === target)?.choice_text ?? options.get(target!) ?? target!;
        add(optionText(key!, label));
      }
    }
    const vn = node.visual_novel_overlay;
    if (vn?.enabled) for (const line of vn.lines.length ? vn.lines : [{ speaker: vn.active_speaker, text: vn.dialogue_text }]) {
      if (line.text) add(`${manifest.character_registry[line.speaker]?.name ?? line.speaker}: ${line.text}`);
    }
    for (const check of node.rpg_checks) {
      add(check.on_pass_reveal_extra_text);
      add(check.on_fail_reveal_extra_text);
    }
    const overlay = node.gameplay_overlay;
    if (overlay) {
      add(overlay.title || 'Un enigma bloquea el camino.');
      if (typeof overlay.parameters.prompt_text === 'string') add(overlay.parameters.prompt_text);
      if (typeof overlay.parameters.target_code === 'string') {
        add('Teclea el código con los números y pulsa Intro.');
        add('Código correcto.'); add('Código incorrecto. No quedan intentos.'); add('borrado');
        (/^\d+$/.test(overlay.parameters.target_code) ? '0123456789' : '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ').split('').forEach(add);
        const attempts = typeof overlay.parameters.max_attempts === 'number' ? overlay.parameters.max_attempts : 3;
        for (let remaining = 1; remaining < Math.min(attempts, 100); remaining++) add(`Código incorrecto. Quedan ${remaining} intentos.`);
      } else {
        add(optionText('1', 'intentar resolver el enigma'));
        add(optionText('2', 'abandonar el enigma'));
      }
    }
  }
  return [...texts.values()];
}

export function missingSpeech(manifest: StoryManifest): string[] {
  const profile = manifest.global_settings.narration_voice;
  if (!profile) return [];
  const recorded = new Set(profile.clips.map(clip => speechKey(clip.text)));
  return speechTexts(manifest).filter(text => !recorded.has(speechKey(text)));
}
