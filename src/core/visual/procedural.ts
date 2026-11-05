import type { VisualRole, VisualStyle } from './style';

const escapeXml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Plantillas propias y deterministas, sin servicios externos ni código aportado por modelos. */
export function proceduralImage(description: string, role: VisualRole, profile: VisualStyle): Uint8Array {
  const dark = profile.atmosphere === 'horror' || profile.atmosphere === 'analog';
  const ink = dark ? '#c4b49a' : '#384d58', wall = dark ? '#24303a' : '#a6bbc0', floor = dark ? '#151b24' : '#d2c1a1';
  const label = escapeXml(description.trim().slice(0, 85) || 'Ilustración de la obra');
  const scene = role === 'background' || role === 'illustration' || role === 'puzzle';
  const forest = /bosque|forest|arbol|árbol/i.test(description);
  const kitchen = /cocina|kitchen/i.test(description);
  const key = /llave|key|ganz[uú]a|alfiler/i.test(description);
  const mouth = /asustad|temer|miedo|sorpresa/i.test(description) ? '<ellipse cx="320" cy="265" rx="13" ry="20"/>' : /trist|enfad|furios/i.test(description) ? '<path d="M300 280q20-24 40 0"/>' : '<path d="M300 265q20 12 40 0"/>';
  const art = scene ? forest
    ? `<rect width="960" height="540" fill="${wall}"/><path d="M0 540L480 270 960 540" fill="${floor}"/>${[70, 220, 740, 890].map((x, i) => `<path d="M${x} 0l${i % 2 ? 25 : -25} 540" stroke="${ink}" stroke-width="38"/><path d="M${x} 170l-70-85m70 150 80-140" fill="none" stroke="${ink}" stroke-width="15"/>`).join('')}<circle cx="550" cy="100" r="38" fill="${ink}" opacity=".5"/>`
    : `<rect width="960" height="540" fill="${wall}"/><path d="M0 540L150 375H810L960 540" fill="${floor}"/><path d="M0 0L150 80V375M960 0L810 80V375M150 80H810" stroke="${ink}" fill="none" opacity=".5"/><rect x="230" y="135" width="160" height="180" fill="${floor}" stroke="${ink}" stroke-width="12"/><path d="M310 135V315M230 225H390" stroke="${ink}" stroke-width="8"/><rect x="565" y="130" width="150" height="120" fill="${floor}" stroke="${ink}" stroke-width="12"/><path d="M520 370H780M550 370V465M750 370V465" stroke="${ink}" stroke-width="14"/>${kitchen ? `<rect x="90" y="350" width="320" height="150" fill="${wall}" stroke="${ink}" stroke-width="5"/><path d="M110 375H390M230 375V485" stroke="${ink}" stroke-width="5"/><circle cx="170" cy="340" r="25" fill="${floor}" stroke="${ink}" stroke-width="4"/>` : ''}`
    : role === 'portrait' ? `<path d="M160 500Q165 310 320 310T480 500" fill="${wall}" stroke="${ink}" stroke-width="8"/><ellipse cx="320" cy="200" rx="95" ry="125" fill="${floor}" stroke="${ink}" stroke-width="8"/><path d="M220 200Q210 60 320 65T420 200L380 135 260 150Z" fill="${wall}"/><path d="M270 200h25m50 0h25" fill="none" stroke="${ink}" stroke-width="7"/><g fill="none" stroke="${ink}" stroke-width="7">${mouth}</g>`
    : key ? `<g stroke="${ink}" stroke-width="16" fill="none"><circle cx="240" cy="215" r="65"/><path d="M285 260L440 415m-40-40 35-35m-5 65 35-35"/></g>`
    : `<path d="M220 145L400 145 440 385Q320 460 200 385Z" fill="${wall}" stroke="${ink}" stroke-width="12"/><path d="M245 210H390M240 275H400M235 340H410" stroke="${ink}" stroke-width="7"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene ? '960 540' : '640 540'}" role="img"><title>${label}</title>${art}</svg>`;
  return new TextEncoder().encode(svg);
}
