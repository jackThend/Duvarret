import { z } from 'zod';

export const NARRATIVE_TYPES = ['radio_tuning', 'memory_weave', 'voice_negotiation', 'sound_trail', 'surface_rubbing', 'alchemy_mix', 'paper_fold', 'burden_balance', 'photo_development', 'symbol_ritual'] as const;
export type NarrativeType = typeof NARRATIVE_TYPES[number];
export const isNarrativeType = (v: string): v is NarrativeType => (NARRATIVE_TYPES as readonly string[]).includes(v);
const lines = (fallback: string[]) => z.array(z.string().trim().min(1).max(300)).min(2).max(8).default(fallback);
const numbers = (fallback: number[]) => z.array(z.number().int().min(1).max(100)).min(2).max(8).default(fallback);
const bounded = (min: number, max: number, fallback: number) => z.number().int().min(min).max(max).default(fallback);
const Base = z.object({
  instructions: z.string().max(1600).default('Explora el mecanismo y decide cómo continuar.'),
  success_text: z.string().min(1).max(1600).default('Has encontrado una forma de continuar.'),
  failure_text: z.string().min(1).max(1600).default('El resultado cambia el rumbo de la historia.'),
  max_attempts: bounded(1, 20, 3), artwork: z.string().default(''), artwork_alt: z.string().max(600).default('Ilustración de la escena'),
  audio_prompt: z.string().min(1).max(1600).default('Adaptación narrativa sin pantalla: elige cómo afrontar la escena. No se reproducen los gestos visuales.'),
  audio_success_option: z.string().min(1).max(200).default('Aceptar el resultado previsto'),
  audio_failure_option: z.string().min(1).max(200).default('Tomar el resultado alternativo'),
  target_a: bounded(0, 100, 32), target_b: bounded(0, 100, 71), tolerance: bounded(1, 10, 3),
  message_a: z.string().min(1).max(600).default('No sigas la voz.'), message_b: z.string().min(1).max(600).default('La voz eres tú.'),
  fragments: lines(['La lámpara se apagó.', 'Alguien cruzó la puerta.', 'Mi mano estaba manchada.']),
  alternate_order: z.array(z.number().int().min(1).max(8)).max(8).default([3, 2, 1]),
  turns: lines(['La voz pide que la escuches.', 'La voz pregunta quién eres.', 'La voz reclama una promesa.']),
  best_actions: z.array(z.enum(['wait', 'speak', 'silence'])).min(2).max(8).default(['wait', 'speak', 'silence']),
  trust_required: bounded(1, 8, 2),
  directions: z.array(z.enum(['left', 'right', 'front', 'back'])).min(2).max(8).default(['right', 'front', 'left']),
  accessible_cues: z.boolean().default(true),
  revealed_text: z.string().min(1).max(1200).default('Aquí yace quien todavía te está escribiendo.'),
  reveal_required: bounded(10, 100, 60), wear_limit: bounded(5, 100, 50),
  ingredients: lines(['Sal', 'Tinta', 'Ceniza']), amounts: numbers([1, 2, 1]),
  temperature: bounded(0, 100, 40), rest: bounded(0, 100, 20),
  fold_horizontal: z.boolean().default(true), fold_vertical: z.boolean().default(false), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(90),
  panels: z.array(z.string().min(1).max(150)).length(4).default(['NORTE', 'LA', 'SALIDA', 'SUR']),
  loads: lines(['Cuaderno', 'Medicinas', 'Fotografías']), weights: numbers([2, 3, 2]), values: numbers([4, 5, 4]),
  balance_tolerance: bounded(0, 10, 0), minimum_value: bounded(1, 100, 8),
  exposure_min: bounded(0, 99, 35), exposure_max: bounded(1, 100, 65), development_min: bounded(0, 99, 40), development_max: bounded(1, 100, 70),
  symbols: lines(['Luna', 'Ojo', 'Umbral']),
});
export type NarrativeConfig = z.output<typeof Base>;
export interface SceneField { key: keyof NarrativeConfig; label: string; kind: 'text' | 'number' | 'lines' | 'numbers' | 'actions' | 'directions' | 'boolean'; min?: number; max?: number }
const f = (key: SceneField['key'], label: string, kind: SceneField['kind'], min?: number, max?: number): SceneField => ({ key, label, kind, min, max });
export const NARRATIVE_SCENES: { type: NarrativeType; title: string; when: string; match: RegExp; instructions: string; fields: SceneField[] }[] = [
  { type: 'radio_tuning', title: 'Sintonizar una presencia', when: 'Interceptar voces, emisiones imposibles o mensajes superpuestos.', match: /sintoniz|frecuencias?|radio.{0,30}(voz|senal|interfer)/, instructions: 'Ajusta los dos receptores. Al coincidir con una señal aparecerá su mensaje; combina ambas para recibir la transmisión.', fields: [f('target_a','Frecuencia de la primera señal (0–100)','number',0,100),f('target_b','Frecuencia de la segunda señal','number',0,100),f('tolerance','Margen de sintonía','number',1,10),f('message_a','Mensaje de la primera señal','text'),f('message_b','Mensaje de la segunda señal','text')] },
  { type: 'memory_weave', title: 'Reconstruir un recuerdo', when: 'Investigar recuerdos contradictorios, causalidad o testimonios.', match: /reconstru.{0,30}(recuerdo|memoria)|recuerdos? fragmentad|memoria rota/, instructions: 'Ordena los fragmentos con los botones Subir y Bajar. El montaje cambia lo que recuerdas; otra lectura puede producir un desenlace distinto.', fields: [f('fragments','Fragmentos en el orden previsto (uno por línea)','lines'),f('alternate_order','Otra lectura: números de fragmento separados por comas (vacío para desactivar)','numbers')] },
  { type: 'voice_negotiation', title: 'Negociar con una voz', when: 'Ganar confianza mediante pausas, respuestas y silencios.', match: /negoci|ganar.{0,20}confianza|convers.{0,20}silencio/, instructions: 'En cada intervención decide si escuchar, hablar o guardar silencio. No hay cronómetro ni se necesita micrófono.', fields: [f('turns','Intervenciones de la otra voz (una por línea)','lines'),f('best_actions','Respuesta que favorece la confianza en cada intervención','actions'),f('trust_required','Aciertos de confianza necesarios','number',1,8)] },
  { type: 'sound_trail', title: 'Seguir algo por el oído', when: 'Orientarse mediante pasos o una presencia que no se ve.', match: /seguir.{0,35}(oido|sonido|pasos|invisible)|rastro sonoro/, instructions: 'Escucha la pista y elige hacia dónde avanzar. Izquierda/derecha se distinguen por posición; delante usa un tono agudo y detrás uno grave. Puedes activar las indicaciones escritas.', fields: [f('directions','Recorrido de la presencia','directions'),f('accessible_cues','Mostrar orientación escrita al escuchar','boolean')] },
  { type: 'surface_rubbing', title: 'Hacer un calco', when: 'Revelar un relieve, inscripción o huella oculta en una superficie frágil.', match: /calco|frotar|inscripcion.{0,30}(oculta|relieve)|relieve oculto/, instructions: 'Frota con el puntero o revela zonas con el teclado. La presión fuerte cubre más superficie, pero desgasta el original. Puedes detenerte antes de dañarlo.', fields: [f('revealed_text','Inscripción que aparece','text'),f('reveal_required','Porcentaje que debe revelarse','number',10,100),f('wear_limit','Desgaste máximo admisible','number',5,100)] },
  { type: 'alchemy_mix', title: 'Preparar una mezcla', when: 'Elaborar una tinta, remedio o sustancia con consecuencias narrativas.', match: /prepar.{0,25}mezcl|mezcl.{0,25}(ingrediente|tinta|pocion|remedio)|prepar.{0,25}(tinta|pocion|remedio)|alquimia/, instructions: 'Añade los ingredientes en orden y cantidad, ajusta temperatura y reposo y observa la mezcla. El reposo se representa con un control; no debes esperar tiempo real.', fields: [f('ingredients','Ingredientes en orden de incorporación','lines'),f('amounts','Cantidad de cada ingrediente (mismo orden)','numbers'),f('temperature','Temperatura prevista (0–100)','number',0,100),f('rest','Reposo previsto (0–100)','number',0,100)] },
  { type: 'paper_fold', title: 'Doblar una página imposible', when: 'Superponer mapas, cartas o dibujos para revelar una relación espacial.', match: /doblar|plieg|pagina imposible|superpon.{0,20}(mapa|carta|papel)/, instructions: 'Dobla en horizontal o vertical y gira la página. Los cuatro fragmentos se superponen; busca la orientación que hace coincidir las marcas.', fields: [f('panels','Cuatro fragmentos de la hoja (uno por línea)','lines'),f('fold_horizontal','Requiere pliegue horizontal','boolean'),f('fold_vertical','Requiere pliegue vertical','boolean'),f('rotation','Rotación prevista (0, 90, 180 o 270)','number',0,270),f('revealed_text','Lectura de la hoja alineada','text')] },
  { type: 'burden_balance', title: 'Sostener un equilibrio', when: 'Elegir qué salvar al repartir peso, atención o recursos limitados.', match: /equilibr|repartir.{0,20}peso|barca.{0,25}(salvar|rescatar)|sacrificar.{0,20}carga/, instructions: 'Reparte las cargas entre ambos lados o déjalas atrás. El peso inclina la balanza; el valor representa lo que consigues salvar. No siempre podrás conservarlo todo.', fields: [f('loads','Cargas o responsabilidades','lines'),f('weights','Peso de cada carga','numbers'),f('values','Valor narrativo de cada carga','numbers'),f('balance_tolerance','Diferencia máxima de peso','number',0,10),f('minimum_value','Valor mínimo a conservar','number',1,100)] },
  { type: 'photo_development', title: 'Revelar una fotografía', when: 'Descubrir una presencia, testimonio o cambio en una imagen latente.', match: /revelar.{0,25}(foto|imagen)|fotografia latente/, instructions: 'Ajusta la exposición y el baño de revelado. La imagen emerge gradualmente; detén el proceso cuando puedas leerla sin quemarla. No hay espera real obligatoria.', fields: [f('exposure_min','Exposición mínima válida','number',0,99),f('exposure_max','Exposición máxima válida','number',1,100),f('development_min','Revelado mínimo válido','number',0,99),f('development_max','Revelado máximo válido','number',1,100),f('revealed_text','Hallazgo que revela la fotografía','text')] },
  { type: 'symbol_ritual', title: 'Representar un ritual', when: 'Trazar un símbolo, ejecutar un pacto o romperlo deliberadamente.', match: /ritual|\brito\b|trazar.{0,20}(simbolo|sello)|romper.{0,20}pacto/, instructions: 'Une los símbolos en el orden indicado por las pistas del relato. Puedes seguir el ritual o romperlo deliberadamente para aceptar otro resultado.', fields: [f('symbols','Símbolos en orden de trazado (uno por línea)','lines')] },
];
const common = ['instructions','success_text','failure_text','max_attempts','artwork','artwork_alt','audio_prompt','audio_success_option','audio_failure_option'] as const;
export function narrativeSchema(type: NarrativeType) {
  const keys = [...common, ...NARRATIVE_SCENES.find(s => s.type === type)!.fields.map(f => f.key)];
  return Base.pick(Object.fromEntries(keys.map(k => [k, true])) as Record<keyof NarrativeConfig, true>);
}
export function defaultNarrativeParams(type: NarrativeType): Record<string, unknown> {
  return narrativeSchema(type).parse({ instructions: NARRATIVE_SCENES.find(s => s.type === type)!.instructions });
}
/** Validación estricta compartida por autoría, agente y runtime. */
export function validateNarrativeParams(type: NarrativeType, input: Record<string, unknown>): Record<string, unknown> {
  const parsed = narrativeSchema(type).safeParse(input);
  if (!parsed.success) throw new Error('Revisa los campos: listas de 2 a 8 elementos, textos no vacíos y números dentro del intervalo indicado.');
  const p = Base.parse(parsed.data);
  const uniqueField = type === 'memory_weave' ? p.fragments : type === 'alchemy_mix' ? p.ingredients : type === 'symbol_ritual' ? p.symbols : type === 'burden_balance' ? p.loads : [];
  if (new Set(uniqueField.map(s => s.normalize('NFC').toLowerCase())).size !== uniqueField.length) throw new Error('Usa nombres o fragmentos distintos para que las opciones puedan distinguirse.');
  if (type === 'memory_weave' && p.alternate_order.length && p.alternate_order.every((n,i) => n === i+1)) throw new Error('La otra lectura debe tener un orden distinto al previsto.');
  if (type === 'memory_weave' && p.alternate_order.length && (p.alternate_order.length !== p.fragments.length || new Set(p.alternate_order).size !== p.fragments.length || p.alternate_order.some(n => n > p.fragments.length))) throw new Error('La otra lectura debe incluir cada número de fragmento exactamente una vez, o quedar vacía.');
  if (type === 'voice_negotiation' && (p.best_actions.length !== p.turns.length || p.trust_required > p.turns.length)) throw new Error('Cada intervención necesita una respuesta y la confianza no puede superar su cantidad.');
  if (type === 'alchemy_mix' && (p.ingredients.length !== p.amounts.length || p.amounts.some(n => n > 10))) throw new Error('Indica una cantidad de 1 a 10 por ingrediente.');
  if (type === 'paper_fold' && (p.panels.length !== 4 || ![0,90,180,270].includes(p.rotation))) throw new Error('Usa cuatro fragmentos y una rotación de 0, 90, 180 o 270 grados.');
  if (type === 'burden_balance' && (p.loads.length !== p.weights.length || p.loads.length !== p.values.length || p.minimum_value > p.values.reduce((a,b) => a+b,0))) throw new Error('Cada carga necesita un peso y un valor; el mínimo no puede superar el valor total.');
  if (type === 'burden_balance') {
    let possible = false;
    for (let mask = 0; mask < 3 ** p.loads.length && !possible; mask++) {
      let code = mask, balance = 0, value = 0;
      p.loads.forEach((_, i) => { const position = code % 3; code = Math.floor(code / 3); if (position) { balance += p.weights[i]! * (position === 1 ? -1 : 1); value += p.values[i]!; } });
      possible = Math.abs(balance) <= p.balance_tolerance && value >= p.minimum_value;
    }
    if (!possible) throw new Error('Ningún reparto permite alcanzar ese equilibrio y valor. Ajusta pesos, margen o mínimo.');
  }
  if (type === 'photo_development' && (p.exposure_min > p.exposure_max || p.development_min > p.development_max)) throw new Error('Los mínimos de exposición y revelado no pueden superar sus máximos.');
  if (type === 'radio_tuning' && Math.abs(p.target_a - p.target_b) < p.tolerance * 2) throw new Error('Separa las dos señales para poder distinguirlas.');
  return parsed.data;
}
export const narrativeConfig = (type: NarrativeType, input: Record<string, unknown>): NarrativeConfig => Base.parse(validateNarrativeParams(type, input));
export const DIRECTION_LABELS = { left: 'Izquierda', right: 'Derecha', front: 'Delante', back: 'Detrás' } as const;
export const ACTION_LABELS = { wait: 'Escuchar y esperar', speak: 'Responder', silence: 'Guardar silencio' } as const;
