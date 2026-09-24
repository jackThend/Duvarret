import type { StoryManifestInput } from '@/core/manifest';

/** Obra de bienvenida mínima (dominio público: Cervantes) para un Studio vacío. */
export function welcomeManifest(): StoryManifestInput {
  return {
    metadata: { title: 'El Laberinto de la Mancha', author: 'Tras Miguel de Cervantes', genre: 'Aventura ergódica', language: 'es-ES' },
    character_registry: {
      quijote: { name: 'Don Quijote', color_accent: '#f59e0b' },
      sancho: { name: 'Sancho Panza', color_accent: '#10b981' },
    },
    item_registry: { lanza: { name: 'Lanza en astillero', description: 'Una lanza vieja y fiel.' } },
    initial_state: { inventory: ['lanza'], stats: { percepcion: 2 } },
    nodes: [
      {
        node_id: 'molinos',
        chapter_id: 'cap_01_la_llanura',
        title: 'Capítulo I: La llanura',
        text_payload:
          'En esto, descubrieron treinta o cuarenta molinos de viento que hay en aquel campo. El viento soplaba y las aspas giraban despacio, como brazos de gigantes que llamaran a la batalla.',
        acoustic_events: [{ event_id: 'viento', asset: 'assets/audio/sfx/wind.ogg', label: 'viento', loop: true, coordinates: { x: -3, y: 1, z: 2 }, room_preset: 'outdoor_field' }],
        navigation: { default_next_node: 'careo' },
      },
      {
        node_id: 'careo',
        chapter_id: 'cap_01_la_llanura',
        title: 'El careo',
        text_payload: '—Mire vuestra merced —respondió Sancho— que aquellos que allí se parecen no son gigantes, sino molinos de viento.',
        visual_novel_overlay: {
          trigger: 'on_node_enter',
          active_speaker: 'sancho',
          dialogue_text: 'Mire vuestra merced que aquellos no son gigantes, sino molinos de viento.',
          lines: [
            { speaker: 'sancho', text: 'Mire vuestra merced que aquellos no son gigantes, sino molinos de viento.' },
            { speaker: 'quijote', text: 'Bien parece que no estás cursado en esto de las aventuras.', position: 'right' },
          ],
        },
        navigation: {
          choices: [
            { choice_text: 'Arremeter contra los gigantes', target_node: 'embestida' },
            { choice_text: 'Escuchar a Sancho', target_node: 'prudencia' },
          ],
        },
      },
      {
        node_id: 'embestida',
        chapter_id: 'cap_01_la_llanura',
        title: 'La embestida',
        text_payload: 'Dio de espuelas a su caballo Rocinante y, cubierto de su rodela, arremetió a todo el galope. El aspa lo volvió con tanta furia que hizo la lanza pedazos.',
        typographic_engine: { layout_mode: 'physics_fall', physics: { gravity: 9.8, bounce_factor: 0.35 }, heartbeat_sync: { enabled: true, bpm: 120 } },
        navigation: { is_ending: true },
      },
      {
        node_id: 'prudencia',
        chapter_id: 'cap_01_la_llanura',
        title: 'La prudencia',
        text_payload: 'Por una vez, el caballero bajó la lanza y escuchó. El viento siguió girando las aspas, indiferente a los sueños de los hombres.',
        navigation: { is_ending: true },
      },
    ],
  };
}
