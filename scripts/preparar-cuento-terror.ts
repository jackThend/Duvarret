/** Ejecutar: npx tsx scripts/preparar-cuento-terror.ts [carpeta-nueva.duvarret]
 * No borra ni sobrescribe archivos; conserva los assets aportados previamente.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ManifestEditor } from '../src/core/agent/manifestEditor';
import { StoryManifestSchema, validateManifest, findUnreachableNodes, type StoryNodeInput } from '../src/core/manifest';
import { AssetRegistry } from '../src/core/assets/registry';
import { assetUsageList } from '../src/core/assets/usages';
import { createMeta } from '../src/core/project/project';

const title = 'La casa que aprendió mi nombre';
const root = resolve(process.argv[2] ?? join(import.meta.dirname, '../terminados/la-casa-que-aprendio-mi-nombre/obra.duvarret'));
const editor = new ManifestEditor(StoryManifestSchema.parse({ metadata: { title }, nodes: [] }));
assert.deepEqual(editor.patchManifest({
  metadata: { title, author: 'Duvarret · relato original', language: 'es', genre: 'Horror cósmico', description: 'Una casa costera aprende a pronunciar a quienes la visitan.' },
  global_settings: { default_mode: 'contemplative_book', audio_engine: 'resonance_3d' },
  initial_state: { start_node: 'costa' },
  character_registry: { ines: { name: 'Inés', sprites: { neutral: 'assets/images/ines.svg' }, description: 'Guardiana del archivo y última habitante reconocible.' } },
  item_registry: { ganzua: { name: 'La ganzúa de hueso', description: 'Una falange tallada que conserva calor.', icon: 'assets/images/ganzua.svg', is_inspectable: true, inspect_content: 'Tres incisiones: baja, alta, intermedia. Alturas de los pernos: 1, 3, 2.' } },
}), []);

const scenes: StoryNodeInput[] = [
  {
    node_id: 'costa', title: '1 · La costa bajo la lluvia',
    text_payload: `La lluvia había borrado el camino de la costa cuando distinguí la casa. No se alzaba sobre el acantilado: parecía colgar de una profundidad situada encima del cielo. Las ventanas recogían el resplandor de un faro demolido antes de mi nacimiento. Yo llevaba una carta de mi madre, muerta hacía diecisiete años, y una llave que no proyectaba sombra.

La carta solo pedía devolver un nombre. Había supuesto que se trataba de una lápida. Entonces el mar dejó de golpear las rocas. Durante aquel silencio imposible oí, detrás de la puerta, el ruido húmedo de una lengua ensayando mis iniciales. Subí los escalones para no escuchar cómo terminaba.`,
    illustration: { asset: 'assets/images/casa.png', alt: 'Casa imposible sobre una costa lluviosa.' },
    acoustic_events: [
      { event_id: 'lluvia', asset: 'assets/audio/banco/lluvia-charcos-1290.wav', label: 'Lluvia real', loop: true, gain: 0.22 },
      { event_id: 'mar', asset: 'assets/audio/banco/mar-costero-0698.wav', label: 'Mar costero real', loop: true, gain: 0.16, coordinates: { x: 0, y: 0, z: -6 } },
      { event_id: 'viento', asset: 'assets/audio/banco/viento-real-0146.wav', label: 'Viento real', loop: true, gain: 0.1 },
    ],
    navigation: { default_next_node: 'ines' },
  },
  {
    node_id: 'ines', title: '2 · La mujer que esperaba',
    text_payload: `Inés abrió antes de que llamara. Su rostro tenía la serenidad cansada de quienes han aprendido a dormir junto a una máquina. Me quitó el abrigo sin tocar la carta. Detrás de ella, los retratos mostraban habitaciones vacías en lugar de personas.

Le pregunté si conocía a mi madre. Miró mi boca, no mis ojos, y acercó un dedo a sus labios. En la pared crecía una mancha del tamaño de una oreja. Comprendí que la cortesía de aquella mujer era una forma de vigilancia. Cuando habló, el vaho salió de su boca hacia dentro. El recibidor olía a algas secas y a ropa recién planchada.`,
    visual_novel_overlay: { trigger: 'on_node_enter', active_speaker: 'ines', current_mood: 'neutral', dialogue_text: 'No digas tu nombre. Aquí las paredes aprenden por repetición.', lines: [{ speaker: 'ines', text: 'Tu madre cerró una boca. Alguien ha vuelto a enseñarle a leer.', mood: 'neutral' }] },
    acoustic_events: [{ event_id: 'voz_ines', asset: 'assets/audio/voz-ines.wav', label: 'VOZ Inés', coordinates: { x: -0.8, y: 0, z: 0.2 }, motion: { to: { x: -0.12, y: 0, z: 0.05 }, duration_ms: 3500 } }],
    navigation: { default_next_node: 'pasillo' },
  },
  {
    node_id: 'pasillo', title: '3 · La distancia interior',
    text_payload: `El pasillo se estrechaba sin que sus paredes se aproximaran. Era mi cuerpo el que ocupaba cada vez más espacio, o quizá mi recuerdo del cuerpo. Las tablas crujían detrás de mí con un retraso exacto de dos pasos. Me detuve. Los pasos continuaron hasta situarse junto a mi nuca.

⟦golpe⟧ Algo llamó desde el interior de la madera. No tres veces, como una visita, sino una sola, como un corazón que comprobara su existencia. Bajo el papel floreado descubrí filas de dientes diminutos. Todos apuntaban hacia el cuarto del fondo. La carta se calentó en mi bolsillo; por primera vez temí que quisiera abrirse sola.`,
    typographic_engine: { layout_mode: 'narrow_corridor', column_width_rem: 16 },
    acoustic_events: [
      { event_id: 'golpe', asset: 'assets/audio/knock.wav', trigger: 'on_text_marker', trigger_marker: 'golpe', delay_ms: 1200 },
      { event_id: 'pasos', asset: 'assets/audio/footsteps.wav', coordinates: { x: 0, y: 0, z: -8 }, motion: { to: { x: 0, y: 0, z: -0.3 }, duration_ms: 6500 } },
    ], navigation: { default_next_node: 'cuarto' },
  },
  {
    node_id: 'cuarto', title: '4 · El cuarto de las cosas perdidas',
    text_payload: `La linterna reveló un cuarto sin ventanas. Había una cama infantil, un armario demasiado pequeño para su puerta y un escritorio con cajones numerados por edades. El cajón de mis nueve años estaba abierto. Dentro encontré el olor del hospital donde murió mi madre.

Inés había dejado una nota: busca donde la luz se avergüence. Barrí el suelo con el haz hasta descubrir una falange tallada, a la derecha, bajo la mesa. Tres incisiones indicaban alturas: uno, tres, dos. No quise averiguar de qué mano procedía. Al rozarla sentí que algo, desde muy lejos, cerraba sus dedos sobre los míos. La llamé ganzúa porque necesitaba que fuese una herramienta.`,
    gameplay_overlay: { type: 'room_search', is_mandatory_to_advance: true, title: 'Buscar con la linterna', parameters: { image: 'assets/images/cuarto.svg', item_label: 'La ganzúa de hueso', item_x: 72, item_y: 64, radius_px: 120 }, on_success: { grant_items: ['ganzua'], transition_to_node: 'antes_puerta' }, on_failure: { transition_to_node: 'nombrar' } },
  },
  {
    node_id: 'antes_puerta', title: '5 · La puerta sin reverso',
    text_payload: `La puerta de hierro no tenía bisagras. Su cerradura estaba incrustada en una encía gris que se retiró cuando acerqué la mano. La llave heredada se volvió blanda: nunca había sido una llave, sino el molde de una ausencia.

Saqué la ganzúa. Sus tres incisiones parecieron ordenarse bajo la luz, ofreciéndome una paciencia que no era humana. Del otro lado alguien arrastró una silla. Después oí mi propia tos, exactamente la que habría tenido dentro de veinte años. Pensé en volver con Inés. Pero el corredor terminaba ahora en una pared de yeso fresco, donde mi abrigo colgaba de un clavo que atravesaba su sombra.`,
    navigation: { choices: [{ choice_text: 'Introducir la ganzúa de hueso', target_node: 'puerta', condition: { required_item: 'ganzua' } }] },
  },
  {
    node_id: 'puerta', title: '6 · Los tres pernos',
    text_payload: `La cerradura respondió con un quejido animal. Levanté el primer perno apenas un grado, el segundo hasta la tercera marca y el último hasta la segunda. Cada resistencia transmitía un recuerdo: una playa sin agua, una multitud de espaldas, mi madre borrando un formulario.

La casa no quería impedirme el paso. Quería comprobar que mis manos obedecían todavía a una voluntad separada. Supe que disponía de cinco oportunidades antes de que confundiera mis dedos con piezas del mecanismo. Respiré sin pronunciar palabra. En el hierro apareció una gota de sangre que subió hacia el techo, y la tos del otro lado se convirtió en una risa avergonzada.`,
    gameplay_overlay: { type: 'lockpick', is_mandatory_to_advance: true, parameters: { pin_heights: [1, 3, 2], max_attempts: 5 }, on_success: { transition_to_node: 'archivo' }, on_failure: { transition_to_node: 'nombrar' } },
    acoustic_events: [{ event_id: 'crujido', asset: 'assets/audio/banco/puerta-crujido-1159.wav', label: 'Puerta real', gain: 0.45 }],
  },
  {
    node_id: 'archivo', title: '7 · El archivo de huéspedes',
    text_payload: `Tras la puerta funcionaba un ordenador de fósforo verde, alimentado por un cable que desaparecía dentro de una concha. El escritorio mostraba un único expediente. Su fecha era la de mañana. Reconocí la letra de mi madre en las anotaciones digitalizadas.

No había construido una prisión. Había construido un traductor. Algo exterior al espacio necesitaba nombres humanos para distinguir lugares donde entrar. La casa era su lengua provisional; nosotros, sus ensayos de pronunciación. Mi madre había sustituido mi nombre por el suyo. Ahora aquella sílaba gastada estaba cediendo. Al fondo del monitor, un cursor latía con la insistencia de un ojo que nunca hubiera aprendido a cerrarse.`,
    gameplay_overlay: { type: 'fictional_desktop', is_mandatory_to_advance: true, parameters: { os_name: 'ARCHIVO DE MAREAS', files: [{ name: 'expediente.txt', kind: 'text', content: 'La casa es un traductor de coordenadas humanas. Mi nombre sostuvo el cierre. Para acceder al sello: tres ventanas, una boca, cuatro pilares. Código 314. Sellar exige renunciar al nombre propio; nombrar invita al huésped a ocuparlo.' }], goal_file: 'expediente.txt' }, on_success: { grant_flags: ['expediente_leido'] } },
    navigation: { default_next_node: 'tinta' },
  },
  {
    node_id: 'tinta', title: '8 · La tinta pierde su forma',
    text_payload: `Abrí por fin la carta. Las palabras resbalaron por el papel como insectos atrapados en aceite. Antes de caer, cada una adoptaba la forma de un pequeño cuarto. Leí madre y vi una cama vacía. Leí perdóname y apareció una escalera descendiendo por mi garganta.

La última línea permaneció firme: no le des un nombre que pueda usar como puerta. Debajo había tres ventanas dibujadas, una boca y cuatro pilares. Repetí las cantidades en silencio: tres, uno, cuatro. La tinta goteó sobre mis zapatos y produjo un ruido de lluvia invertida. Desde el recibidor, Inés empezó a cantar sin melodía, para impedir que la casa escuchase mis pensamientos.`,
    typographic_engine: { layout_mode: 'melt_text', melt: { enabled: true, intensity: 0.75, direction: 'down', duration_ms: 9000 } },
    acoustic_events: [{ event_id: 'musica', asset: 'assets/audio/music.wav', label: 'La tinta se deshace', gain: 0.2 }],
    navigation: { default_next_node: 'caida' },
  },
  {
    node_id: 'caida', title: '9 · Gravedad de las letras',
    text_payload: `Las letras de los libros se desprendieron de sus lomos. Cayeron a mis pies con peso de guijarros, formando nombres que reconocí de los avisos de personas desaparecidas. Intenté apartarlas. Una vocal me cortó la palma.

Entonces comprendí la escala del hambre. La casa no estaba en la costa: la costa era una arruga de su superficie. El océano entero cabía en la pausa entre dos sonidos suyos. Un estampido cruzó el techo, como un disparo hecho dentro de un siglo cerrado. Inés gritó que no mirara arriba. Obedecí, pero las letras del suelo se levantaron para mirar por mí, y sus sombras tenían mi cara.`,
    typographic_engine: { layout_mode: 'physics_fall', physics: { enabled: true, gravity: 13, bounce_factor: 0.3 } },
    acoustic_events: [
      { event_id: 'estampido', asset: 'assets/audio/gunshot.wav', trigger: 'on_text_reveal_percentage', trigger_value: 65, gain: 0.55 },
      { event_id: 'voz_casa', asset: 'assets/audio/voz-casa.wav', label: 'VOZ Casa · Ya sé dónde empiezas', trigger: 'on_text_complete', coordinates: { x: 0.2, y: 0, z: -0.1 }, motion: { to: { x: -0.15, y: 0, z: 0.05 }, duration_ms: 3000 } },
    ],
    navigation: { default_next_node: 'sello' },
  },
  {
    node_id: 'sello', title: '10 · La boca del cimiento',
    text_payload: `El suelo se abrió sobre una placa de piedra. Tres ventanas, una boca, cuatro pilares: el dibujo de la carta era también el rostro del sello. Introducir la cifra levantaría su cubierta y me permitiría elegir qué alimentarlo.

Inés apareció al otro lado de la grieta. Ya no tenía sombra. Supe que llevaba años prestando su voz a las habitaciones para que ninguna aprendiera a hablar sola. Me ofreció la mano sin pedirme confianza. Debajo de la placa esperaba algo que no podía llamarse oscuridad, pues la oscuridad necesita luz para existir. Conservé las tres cifras como quien conserva una cerilla bajo la lluvia, y las acerqué al umbral.`,
    illustration: { asset: 'assets/images/sello.svg', alt: 'Sello de tres ventanas, una boca y cuatro pilares.' },
    gameplay_overlay: { type: 'cipher_lock', is_mandatory_to_advance: true, parameters: { target_code: '314', max_attempts: 5, screen_type: 'crt_green_phosphor', prompt_text: 'VENTANAS · BOCA · PILARES', hint: 'Tres ventanas, una boca, cuatro pilares.' }, on_success: { grant_flags: ['sello_abierto'] }, on_failure: { transition_to_node: 'nombrar' } },
    navigation: { choices: [
      { choice_text: 'Sellar: entregar mi nombre y salir sin él', target_node: 'sellar', condition: { required_flag: 'sello_abierto' } },
      { choice_text: 'Nombrar: ofrecer mi nombre a lo que espera', target_node: 'nombrar', condition: { required_flag: 'sello_abierto' } },
    ] },
  },
  {
    node_id: 'sellar', title: '11 · Final: una vida sin llamada',
    text_payload: `No pronuncié nada. Coloqué la carta sobre la boca y permití que el sello borrara aquello por lo que yo acudía cuando alguien me llamaba. Fue una amputación sin dolor. Desaparecieron las etiquetas de mis cuadernos, la firma del banco, la voz de mi madre cuando me buscaba para cenar.

Inés me condujo hasta la costa. La lluvia volvía a caer hacia abajo. Me preguntó si recordaba quién era; pude contarle mis veranos y mis miedos, pero ninguna palabra servía para reunirlos. Ahora vivo lejos del mar. Nadie me llama desde otra habitación. A veces eso parece una salvación. A veces escucho el teléfono y lloro antes de que suene.`,
    navigation: { is_ending: true },
  },
  {
    node_id: 'nombrar', title: '12 · Final: la primera sílaba del mundo',
    text_payload: `Dije mi nombre con la claridad de quien responde presente. La casa lo repitió sin sonido. Vi a Inés alejarse hacia una distancia que no atravesaba habitaciones, sino generaciones de personas aún no nacidas. Su rostro fue la última medida humana que comprendí.

Después tuve ventanas. Después tuve costa. Sentí al océano lamer un borde de mi pensamiento y reconocí las estrellas como agujeros de ventilación. No había sido devorado: me habían enseñado una función. Cuando llegue otra carta sabré abrirme. Ya ensayo la voz de su destinatario, con cuidado de no asustarlo demasiado. La lluvia facilita el aprendizaje. Cada gota trae un nombre y todos, por fin, significan aquí.`,
    navigation: { is_ending: true },
  },
];

for (const scene of scenes) {
  const { node_id, ...patch } = scene;
  const result = editor.patchNode(node_id, { ...patch, screenless_mode: { narration_text: scene.text_payload, voice_prompts: [] } });
  assert.deepEqual(result.issues, [], `Reparación inesperada en ${node_id}`);
}
const validation = validateManifest(editor.current);
assert.equal(validation.pristine, true);
assert.deepEqual(validation.issues, []);
assert.deepEqual(editor.integrity(), []);
assert.deepEqual(findUnreachableNodes(validation.manifest), []);
assert.equal(validation.manifest.global_settings.narration_voice, undefined);
const manifest = StoryManifestSchema.parse(validation.manifest);
const words = scenes.map(s => s.text_payload ?? '').join(' ').match(/\p{L}+(?:[’'-]\p{L}+)*/gu)?.length ?? 0;
assert.ok(words >= 1000 && words <= 1400, `Extensión fuera de rango: ${words}`);

// Dibujos vectoriales originales, sin imágenes externas ni fuentes incrustadas.
const svg = (body: string, width = 960, height = 540) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>\n`;
const drawings: Record<string, string> = {
  'cuarto.svg': svg('<rect width="960" height="540" fill="#101e25"/><path d="M0 0L180 110H780L960 0M180 110V360L0 540M780 110V360L960 540M180 360H780" fill="none" stroke="#607576" stroke-width="4"/><path d="M230 320V180H360V320M235 240H355M480 310H820V340H480ZM510 340V470M790 340V470" fill="#233738" stroke="#7a8c7d" stroke-width="6"/><path d="M678 350q12-25 28-4l-12 23 20 10" fill="none" stroke="#d9d0ad" stroke-width="8"/><path d="M50 440L410 390M90 485L470 420M820 445L930 505" stroke="#31494b" stroke-width="3"/>'),
  'ines.svg': svg('<rect width="420" height="540" rx="40" fill="#11242b"/><path d="M48 540Q55 350 210 347Q370 350 380 540" fill="#354a4c"/><path d="M99 320Q50 58 210 42Q372 60 322 330L270 360H145Z" fill="#152025"/><path d="M133 144Q210 88 288 149L280 264Q214 361 143 267Z" fill="#b4b4a0"/><path d="M136 194L182 189M239 189L279 196" stroke="#23383b" stroke-width="9"/><path d="M208 204L199 244L216 247M178 277Q210 269 242 277" fill="none" stroke="#657a73" stroke-width="4"/><path d="M123 155Q176 61 285 146M117 167L105 327M300 158L313 326" fill="none" stroke="#293a3c" stroke-width="24"/>', 420, 540),
  'sello.svg': svg('<rect width="960" height="540" fill="#102329"/><circle cx="480" cy="270" r="210" fill="none" stroke="#9da88c" stroke-width="8"/><g fill="none" stroke="#b9c2a1" stroke-width="8"><path d="M350 190V125H395V190ZM458 190V125H503V190ZM566 190V125H611V190Z"/><ellipse cx="480" cy="265" rx="100" ry="22"/><path d="M365 320V410M440 320V410M515 320V410M590 320V410M345 320H610M345 410H610"/></g>'),
  'ganzua.svg': svg('<rect width="128" height="128" rx="22" fill="#182d32"/><path d="M38 106L77 35Q92 14 102 32Q108 42 89 49L56 110M55 73L66 79M63 59L75 65M72 45L82 50" fill="none" stroke="#e0d4b0" stroke-width="9" stroke-linecap="round"/>', 128, 128),
};
const registry = new AssetRegistry();
for (const name of Object.keys(drawings)) registry.register({ path: `assets/images/${name}`, origin: 'author', author: 'Duvarret · dibujo SVG original', status: 'ready' });
for (const name of ['lluvia-charcos-1290.wav', 'mar-costero-0698.wav', 'viento-real-0146.wav', 'puerta-crujido-1159.wav']) {
  const path = `assets/audio/banco/${name}`;
  registry.register({ path, origin: 'author', author: 'Joseph SARDIN', license: 'CC0 1.0', provider: 'BigSoundBank', status: existsSync(join(root, path)) ? 'ready' : 'missing' });
}
// No se inventan licencias, proveedores o procedencias para los aportes futuros.
for (const path of [...new Set([...assetUsageList(manifest).map(u => u.path), 'assets/audio/creak.wav'])].filter(path => !registry.get(path))) {
  registry.register({ path, origin: 'author', status: existsSync(join(root, path)) ? 'ready' : 'pending', title: 'Aporte del autor; procedencia y derechos por documentar' });
}
const pending = registry.list().filter(r => r.status !== 'ready').map(r => r.path);
assert.ok(assetUsageList(manifest).every(u => registry.get(u.path)), 'Recurso sin registrar');

const literary = scenes.map(s => `## ${s.title} [${s.node_id}]\n\n${s.text_payload}`).join('\n\n');
const readme = `# ${title}

Relato original de horror cósmico, sin pasajes ni personajes tomados de otras obras. ${words} palabras en los textos narrativos; 12 escenas y dos finales. El diálogo VN y el expediente son contenido adicional.

## Ejecución y conservación

Desde el repositorio: npx tsx scripts/preparar-cuento-terror.ts [carpeta-nueva.duvarret]
El destino predeterminado es terminados/la-casa-que-aprendio-mi-nombre/obra.duvarret. El script conserva los assets ya copiados, verifica colisiones antes de escribir y crea archivos exclusivamente (wx). No borra ni sobrescribe nada. No ejecutar hasta disponer de los module_types lockpick y room_search.

Abre esta carpeta .duvarret en el EXE. Selecciona y genera allí la voz global: este proyecto no establece narration_voice ni genera audio.

## Mapa y soluciones

costa → ines → pasillo → cuarto (room_search) → antes_puerta → puerta (lockpick) → archivo (fictional_desktop) → tinta → caida → sello (cipher_lock) → sellar / nombrar.

Cuarto: objeto en 72%, 64%, radio 120 px; otorga ganzua. La elección de antes_puerta exige ese objeto. Puerta: alturas 1,3,2; cinco intentos; fallar conduce al final nombrar. Archivo: abrir expediente.txt. Sello: 314, cinco intentos; fallar conduce al final nombrar. El éxito habilita las dos elecciones mediante sello_abierto. Sellar salva la costa a cambio del nombre; nombrar convierte al protagonista en la casa.

## Recursos y decisiones de producción

SVG originales incluidos: cuarto.svg, ines.svg, sello.svg y ganzua.svg. La ilustración casa.png fue generada para esta prueba con la herramienta de imágenes de Codex. El informe de producción conserva el prompt y la procedencia.

Pendientes (no se crean archivos de audio falsos):
${pending.map(p => `- ${p}`).join('\n')}

Audios reales: assets/audio/banco/lluvia-charcos-1290.wav, mar-costero-0698.wav, viento-real-0146.wav y puerta-crujido-1159.wav (todos bajo assets/audio/banco/). Autor Joseph SARDIN, licencia CC0 1.0, proveedor BigSoundBank; créditos aportados por el usuario. Mar, lluvia y viento solo en costa, con ganancias bajas; crujido real en puerta. casa.png ya aportada se conserva. La validación estructural no acredita presencia física: el catálogo marca missing si falta un audio real. No se atribuyen licencias a otros recursos pendientes. Después del builder, preparar-audio-terror.ts aportará creak/knock/footsteps/gunshot/music; creak queda reservado en el catálogo, sin sustituir la puerta real.

voz-ines.wav corresponde a «No digas tu nombre. Aquí las paredes aprenden por repetición. Tu madre cerró una boca. Alguien ha vuelto a enseñarle a leer.» Se usa como acoustic_event con label VOZ Inés, cerca del oído y en movimiento; no como voz global. Generar en EXE mediante narracion_generate: ef_dora para Inés, em_alex para Casa. voz-casa.wav dice «Ya sé dónde empiezas.» en caida, cerca del oído y con motion. Pasos con motion; golpe sincronizado a ⟦golpe⟧ más 1200 ms. El estampido usa gunshot.wav como ruptura del techo. Música solo en tinta, sin música ni voces globales.

## Registro de preparación

Manifiesto construido exclusivamente con ManifestEditor, StoryManifestSchema y validateManifest; sin reparaciones, diagnósticos de integridad ni escenas inaccesibles. Recursos referenciados registrados. No se modifican módulos ni se generan voces. Memoria MCP no disponible al preparar este script: se conserva aquí el registro explícito de decisiones y pendientes.

## Contenido literario

${literary}

## Diálogo VN y expediente

${manifest.nodes.find(n => n.node_id === 'ines')!.visual_novel_overlay!.dialogue_text}

${manifest.nodes.find(n => n.node_id === 'ines')!.visual_novel_overlay!.lines.map(l => l.text).join('\n\n')}

${String((manifest.nodes.find(n => n.node_id === 'archivo')!.gameplay_overlay!.parameters.files as { content: string }[])[0]!.content)}
`;

// Verificar todos los archivos propios antes de escribir; los aportes se conservan.
const outputs = ['manifest/story_manifest.json', 'project.duvarret.json', 'assets/registry.json', 'README.md', 'manuscript/raw/la-casa-que-aprendio-mi-nombre.md', ...Object.keys(drawings).map(name => `assets/images/${name}`)];
for (const path of outputs) assert.ok(!existsSync(join(root, path)), `Ya existe ${join(root, path)}; no se modificó nada.`);
mkdirSync(dirname(root), { recursive: true });
mkdirSync(root, { recursive: true });
for (const folder of ['manifest', 'assets/images', 'assets/audio/banco', 'manuscript/raw', 'manuscript/beats', 'knowledge']) mkdirSync(join(root, folder), { recursive: true });
const write = (path: string, content: string) => writeFileSync(join(root, path), content, { encoding: 'utf8', flag: 'wx' });
write('manifest/story_manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
write('project.duvarret.json', `${JSON.stringify(createMeta({ title, author: manifest.metadata.author, mode: 'taller' }), null, 2)}\n`);
write('assets/registry.json', `${JSON.stringify(registry.toJSON(), null, 2)}\n`);
for (const [name, content] of Object.entries(drawings)) write(`assets/images/${name}`, content);
write('README.md', readme);
write('manuscript/raw/la-casa-que-aprendio-mi-nombre.md', `# ${title}\n\n${literary}\n`);
console.log(`Obra preparada: ${root}\n${scenes.length} escenas · ${words} palabras · 2 finales · ${registry.list().length} recursos registrados (${pending.length} pendientes).\nValidación estricta e integridad: sin incidencias. Voces: generar en el EXE.`);
