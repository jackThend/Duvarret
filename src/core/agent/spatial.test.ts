import { describe, expect, it } from 'vitest';
import { parseSpatialDescription } from './spatialLanguage';

describe('parseSpatialDescription', () => {
  it.each([
    ['el teléfono suena a la derecha a 3 metros', { x: 3, y: 0, z: 0 }],
    ['Pon el grito atrás a 5 metros', { x: 0, y: 0, z: -5 }],
    ['una gotera a 3.5m a la derecha', { x: 3.5, y: 0, z: 0 }],
    ['una gotera a 3,5 m a la derecha', { x: 3.5, y: 0, z: 0 }],
    ['pasos a doce metros a mis espaldas', { x: 0, y: 0, z: -12 }],
    ['un crujido justo encima, a dos metros', { x: 0, y: 2, z: 0 }],
    ['el piano suena delante', { x: 0, y: 0, z: 4 }],
  ])('«%s»', (text, expected) => {
    const reading = parseSpatialDescription(text);
    expect(reading.understood).toBe(true);
    expect(reading.coordinates).toEqual(expected);
  });

  it('combina direcciones (trueno arriba a la izquierda y atrás)', () => {
    const { coordinates } = parseSpatialDescription('un trueno resuena arriba a la izquierda y atrás, a lo lejos');
    expect(coordinates.x).toBeLessThan(0);
    expect(coordinates.y).toBeGreaterThan(0);
    expect(coordinates.z).toBeLessThan(0);
    expect(Math.hypot(coordinates.x, coordinates.y, coordinates.z)).toBeCloseTo(15, 1);
  });

  it('reconoce susurros al oído y movimiento', () => {
    expect(parseSpatialDescription('una respiración en la oreja izquierda').coordinates).toEqual({ x: -0.25, y: 0, z: 0 });
    expect(parseSpatialDescription('unos pasos se acercan por detrás').motion).toBe('approaching');
    expect(parseSpatialDescription('unos pasos se acercan por detrás').coordinates.z).toBe(-4);
  });

  it('admite indicaciones en inglés', () => {
    expect(parseSpatialDescription('a phone rings 2 meters to the right').coordinates).toEqual({ x: 2, y: 0, z: 0 });
  });

  it('declara cuando no entiende', () => {
    const reading = parseSpatialDescription('suena bonito');
    expect(reading.understood).toBe(false);
    expect(reading.coordinates).toEqual({ x: 0, y: 0, z: 0 });
  });
});
