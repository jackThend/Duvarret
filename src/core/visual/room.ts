import { z } from 'zod';

/** Coordenadas en el lienzo completo: la imagen nunca se recorta para adaptar la pantalla. */
export const RoomSearchParams = z.object({
  image: z.string().catch(''), image_alt: z.string().catch('Un lugar que puedes explorar con la linterna'),
  item_id: z.string().catch(''), item_image: z.string().catch(''),
  item_label: z.string().catch('Objeto encontrado'),
  item_x: z.number().min(5).max(95).catch(72), item_y: z.number().min(5).max(95).catch(64),
  item_size: z.number().min(3).max(25).catch(10), radius_px: z.number().min(50).max(250).catch(120),
});
