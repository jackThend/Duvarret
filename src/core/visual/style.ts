import { z } from 'zod';

export const VISUAL_STYLES = { illustration: 'Ilustración', realistic: 'Realista', comic: 'Cómic', prerendered: 'Videojuego prerenderizado', independent: 'Ilustración independiente' } as const;
export const VISUAL_ATMOSPHERES = { neutral: 'Natural', horror: 'Terror', analog: 'Terror analógico', melancholy: 'Melancolía', fantasy: 'Fantasía' } as const;
export const VisualStyleSchema = z.object({
  style: z.enum(['illustration', 'realistic', 'comic', 'prerendered', 'independent']).default('illustration'),
  atmosphere: z.enum(['neutral', 'horror', 'analog', 'melancholy', 'fantasy']).default('neutral'),
  notes: z.string().max(1200).default(''),
});
export type VisualStyle = z.output<typeof VisualStyleSchema>;
export type VisualRole = 'background' | 'object' | 'portrait' | 'illustration' | 'puzzle';

export function visualPrompt(description: string, role: VisualRole, profile: VisualStyle): string {
  const purpose = role === 'background'
    ? 'Escenario explorable, sin el objeto que se recogerá, sin interfaz ni símbolos de interacción. Composición legible.'
    : role === 'object' ? 'Un solo objeto completo, aislado, sin texto, sin sombras proyectadas, fondo liso blanco para poder recortarlo. No dibujar el escenario.'
    : role === 'portrait' ? 'Retrato de personaje para novela visual, sin texto ni interfaz.'
    : role === 'puzzle' ? 'Ilustración del entorno de un puzle. Sin números, controles ni pistas añadidas: la aplicación dibuja el mecanismo interactivo.'
    : 'Ilustración narrativa, sin texto ni interfaz.';
  return `${description.trim()}\nEstilo: ${VISUAL_STYLES[profile.style]}. Atmósfera: ${VISUAL_ATMOSPHERES[profile.atmosphere]}. ${profile.notes}\n${purpose}`;
}
