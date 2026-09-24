import type { StoryManifestInput } from '@/core/manifest';

/** Manifiesto de prueba que recorre todo el espectro polimórfico. */
export function sampleManifest(): StoryManifestInput {
  return {
    metadata: { title: 'La Sombra del Molino', author: 'Pruebas' },
    character_registry: {
      sancho: { name: 'Sancho Panza', sprites: { neutral: 'assets/images/sancho.webp', alarmed: 'assets/images/sancho_alarmed.webp' } },
      narrador: { name: 'Voz Omnisciente' },
    },
    item_registry: {
      sobre_lacrado: { name: 'Sobre con Lacre Negro', is_inspectable: true, inspect_content: "Cifra '7391'." },
    },
    initial_state: { stats: { percepcion: 4, voluntad: 1 }, inventory: ['sobre_lacrado'], rng_seed: 7 },
    nodes: [
      {
        node_id: 'inicio',
        title: 'El Pasillo',
        text_payload: 'El pasadizo se volvió tan angosto que apenas podía respirar.',
        grant_flags_on_enter: ['entro_bunker'],
        typographic_engine: { layout_mode: 'narrow_corridor', column_width_rem: 24, heartbeat_sync: { enabled: true, bpm: 95, text_scale_amplitude: 0.02 } },
        acoustic_events: [
          { event_id: 'gotera', asset: 'assets/audio/drip.ogg', trigger: 'on_node_enter', loop: true, coordinates: { x: 3.5, y: 1.2, z: -4 } },
          { event_id: 'pasos', asset: 'assets/audio/steps.ogg', trigger: 'on_text_reveal_percentage', trigger_value: 60, coordinates: { x: 0, y: 0, z: -12 } },
        ],
        rpg_checks: [
          { type: 'passive', stat: 'percepcion', difficulty: 6, on_pass_reveal_extra_text: 'Percibes una brisa tibia.', on_pass_grant_flags: ['vio_rejilla'] },
          { type: 'active', stat: 'voluntad', difficulty: 9, label: 'Contener el pánico', on_pass_grant_flags: ['sereno'] },
        ],
        navigation: {
          default_next_node: 'consola',
          choices: [
            { choice_text: 'Seguir la brisa', target_node: 'rejilla', condition: { required_flag: 'vio_rejilla' } },
            { choice_text: 'Retroceder', target_node: 'final', condition: { forbidden_flag: 'entro_bunker' } },
          ],
        },
      },
      {
        node_id: 'consola',
        text_payload: 'Una consola fosforescente parpadeaba en la penumbra.',
        visual_novel_overlay: { active_speaker: 'sancho', current_mood: 'alarmed', dialogue_text: '¡Esa consola es una trampa!' },
        gameplay_overlay: {
          type: 'cipher_lock',
          is_mandatory_to_advance: true,
          parameters: { target_code: '7391', max_attempts: 3 },
          on_success: { grant_flags: ['alarma_desactivada'], transition_to_node: 'final' },
          on_failure: { grant_flags: ['alarma_disparada'], transition_to_node: 'final' },
        },
        navigation: { default_next_node: 'final' },
      },
      { node_id: 'rejilla', text_payload: 'Te arrastras por la rejilla.', navigation: { default_next_node: 'final' } },
      { node_id: 'final', text_payload: 'Fin.', navigation: { is_ending: true } },
    ],
  };
}
