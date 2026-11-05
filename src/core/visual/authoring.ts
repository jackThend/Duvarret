import { z } from 'zod';
import type { ManifestEditor } from '../agent/manifestEditor';
import { VisualStyleSchema } from './style';

const path = z.string().regex(/^assets\/images\/[\w./-]+\.(png|jpe?g|webp|gif|svg|avif)$/i).refine(s => !s.split('/').includes('..'), 'La imagen debe pertenecer a la obra.');

/** Un objeto conserva su identidad visual al reutilizarlo en otras búsquedas. */
export function setInventoryIllustration(editor: ManifestEditor, itemId: string, image: string) {
  editor.patchManifest({ item_registry: { [itemId]: { icon: image } } });
  for (const node of editor.current.nodes) {
    const overlay = node.gameplay_overlay;
    if (overlay?.type === 'room_search' && (overlay.parameters.item_id === itemId || (!overlay.parameters.item_id && overlay.on_success.grant_items[0] === itemId))) {
      editor.patchNode(node.node_id, { gameplay_overlay: { parameters: { item_id: itemId, item_image: image } } });
    }
  }
}
export const VisualSceneSchema = z.object({
  node_id: z.string().min(1), image: path, image_alt: z.string().min(1).max(600),
  item_id: z.string().min(1), item_label: z.string().min(1).max(120), item_description: z.string().max(2000).default(''),
  item_image: path, item_x: z.number().min(5).max(95).default(72), item_y: z.number().min(5).max(95).default(64),
  item_size: z.number().min(3).max(25).default(10), radius_px: z.number().min(50).max(250).default(120),
  mandatory: z.boolean().default(true), visual_style: VisualStyleSchema.optional(),
});

export function configureVisualScene(editor: ManifestEditor, input: z.input<typeof VisualSceneSchema>) {
  const args = VisualSceneSchema.parse(input);
  const node = editor.node(args.node_id);
  if (!node) throw new Error('La escena ya no existe.');
  if (node.gameplay_overlay && node.gameplay_overlay.type !== 'room_search') throw new Error('Esta escena ya tiene otro puzle. Usa una escena nueva para la búsqueda con linterna.');
  const previous = node.gameplay_overlay;
  const oldItem = typeof previous?.parameters.item_id === 'string' && previous.parameters.item_id ? previous.parameters.item_id : previous?.on_success.grant_items[0];
  const issues = editor.patchManifest({
    ...(args.visual_style ? { global_settings: { visual_style: args.visual_style } } : {}),
    item_registry: { [args.item_id]: { name: args.item_label, description: args.item_description, icon: args.item_image } },
  });
  const patch = editor.patchNode(args.node_id, { gameplay_overlay: {
    type: 'room_search', title: node.title || 'Explorar con linterna', is_mandatory_to_advance: args.mandatory,
    parameters: { image: args.image, image_alt: args.image_alt, item_id: args.item_id, item_image: args.item_image, item_label: args.item_label, item_x: args.item_x, item_y: args.item_y, item_size: args.item_size, radius_px: args.radius_px },
    on_success: { ...(previous?.on_success ?? {}), grant_items: [...new Set([...(previous?.on_success.grant_items ?? []).filter(id => id !== oldItem), args.item_id])] },
  } });
  setInventoryIllustration(editor, args.item_id, args.item_image);
  return [...issues, ...patch.issues];
}
