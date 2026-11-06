import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Colors} from '../../theme';

export type CurvePosition =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'center-left'
  | 'center-right';

export interface DynamicBrandCurvesProps {
  /**
   * Posición fija del surco y de las gotas de marca en la pantalla.
   * - Inicio: 'bottom-left' (lado izquierdo inferior con gotas estilo Nickelodeon)
   * - Clientes: 'top-right' (lado derecho bajado con gotas)
   * - Estadísticas: 'bottom-right'
   * - Perfil: 'top-left'
   */
  position?: CurvePosition;
  fixedPosition?: CurvePosition;
}

/**
 * Surcos decorativos de marca estilo splash/goteo (inspiración Nickelodeon).
 * Incluye el surco curvo principal y gotas esféricas orgánicas tipo goteo.
 */
export function DynamicBrandCurves({
  position = 'top-right',
  fixedPosition,
}: DynamicBrandCurvesProps = {}) {
  const currentPos = fixedPosition ?? position;
  const droplets = DROPLET_CONFIGS[currentPos] ?? DROPLET_CONFIGS['top-right'];
  const satellites = SATELLITE_CONFIGS[currentPos] ?? SATELLITE_CONFIGS['top-right'];

  return (
    <View pointerEvents="none" style={styles.screenWrapper}>
      {/* ── Surco Curvo Principal con sus gotas inmediatas ── */}
      <View style={[styles.container, CONTAINER_STYLES[currentPos]]}>
        <View style={[styles.outerCurve, OUTER_STYLES[currentPos]]} />
        <View style={[styles.innerCurve, INNER_STYLES[currentPos]]} />

        {/* Bolitas tipo goteo (splat principal) */}
        {droplets.map((d, index) => (
          <View
            key={`drop-${index}`}
            style={[
              styles.droplet,
              {
                width: d.size,
                height: d.size,
                borderRadius: d.size / 2,
                backgroundColor: d.color,
                ...d.position,
              },
            ]}
          />
        ))}
      </View>

      {/* ── Gotas satélites flotantes (goteo esparcido en el fondo opuesto) ── */}
      {satellites.map((s, index) => (
        <View
          key={`sat-${index}`}
          style={[
            styles.droplet,
            {
              width: s.size,
              height: s.size,
              borderRadius: s.size / 2,
              backgroundColor: s.color,
              opacity: s.opacity ?? 0.85,
              ...s.position,
            },
          ]}
        />
      ))}
    </View>
  );
}

export const BrandCurves = DynamicBrandCurves;

const PEACH = '#FFE4D0';
const ORANGE = Colors.primary;

interface DropletDef {
  size: number;
  color: string;
  position: Record<string, number>;
  opacity?: number;
}

const DROPLET_CONFIGS: Record<CurvePosition, DropletDef[]> = {
  'bottom-left': [
    {size: 18, color: ORANGE, position: {bottom: 155, left: 45}},
    {size: 24, color: PEACH, position: {bottom: 135, left: 105}},
    {size: 14, color: ORANGE, position: {bottom: 95, left: 175}},
    {size: 9, color: PEACH, position: {bottom: 45, left: 200}},
    {size: 8, color: ORANGE, position: {bottom: 180, left: 82}},
    {size: 6, color: PEACH, position: {bottom: 115, left: 150}},
  ],
  'top-right': [
    {size: 20, color: ORANGE, position: {top: 155, right: 55}},
    {size: 24, color: PEACH, position: {top: 130, right: 125}},
    {size: 15, color: ORANGE, position: {top: 80, right: 195}},
    {size: 9, color: PEACH, position: {top: 35, right: 215}},
    {size: 8, color: ORANGE, position: {top: 185, right: 95}},
    {size: 6, color: PEACH, position: {top: 115, right: 170}},
  ],
  'bottom-right': [
    {size: 18, color: ORANGE, position: {bottom: 155, right: 45}},
    {size: 24, color: PEACH, position: {bottom: 135, right: 105}},
    {size: 14, color: ORANGE, position: {bottom: 95, right: 175}},
    {size: 9, color: PEACH, position: {bottom: 45, right: 200}},
    {size: 8, color: ORANGE, position: {bottom: 180, right: 82}},
    {size: 6, color: PEACH, position: {bottom: 115, right: 150}},
  ],
  'top-left': [
    {size: 20, color: ORANGE, position: {top: 155, left: 55}},
    {size: 24, color: PEACH, position: {top: 130, left: 125}},
    {size: 15, color: ORANGE, position: {top: 80, left: 195}},
    {size: 9, color: PEACH, position: {top: 35, left: 215}},
    {size: 8, color: ORANGE, position: {top: 185, left: 95}},
    {size: 6, color: PEACH, position: {top: 115, left: 170}},
  ],
  'center-left': [
    {size: 18, color: ORANGE, position: {top: 15, left: 140}},
    {size: 22, color: PEACH, position: {top: 175, left: 135}},
    {size: 12, color: ORANGE, position: {top: 85, left: 160}},
    {size: 7, color: PEACH, position: {top: 45, left: 150}},
  ],
  'center-right': [
    {size: 18, color: ORANGE, position: {top: 15, right: 140}},
    {size: 22, color: PEACH, position: {top: 175, right: 135}},
    {size: 12, color: ORANGE, position: {top: 85, right: 160}},
    {size: 7, color: PEACH, position: {top: 45, right: 150}},
  ],
};

const SATELLITE_CONFIGS: Record<CurvePosition, DropletDef[]> = {
  'bottom-left': [
    {size: 14, color: PEACH, position: {top: 70, right: 28}, opacity: 0.9},
    {size: 7, color: ORANGE, position: {top: 96, right: 46}, opacity: 0.85},
    {size: 11, color: PEACH, position: {top: 180, right: 18}, opacity: 0.75},
  ],
  'top-right': [
    {size: 15, color: PEACH, position: {bottom: 85, left: 24}, opacity: 0.9},
    {size: 8, color: ORANGE, position: {bottom: 115, left: 42}, opacity: 0.85},
    {size: 10, color: PEACH, position: {bottom: 190, left: 20}, opacity: 0.75},
  ],
  'bottom-right': [
    {size: 14, color: PEACH, position: {top: 70, left: 28}, opacity: 0.9},
    {size: 7, color: ORANGE, position: {top: 96, left: 46}, opacity: 0.85},
    {size: 11, color: PEACH, position: {top: 180, left: 18}, opacity: 0.75},
  ],
  'top-left': [
    {size: 15, color: PEACH, position: {bottom: 85, right: 24}, opacity: 0.9},
    {size: 8, color: ORANGE, position: {bottom: 115, right: 42}, opacity: 0.85},
    {size: 10, color: PEACH, position: {bottom: 190, right: 20}, opacity: 0.75},
  ],
  'center-left': [
    {size: 14, color: PEACH, position: {top: 60, right: 30}, opacity: 0.85},
    {size: 7, color: ORANGE, position: {bottom: 80, right: 30}, opacity: 0.8},
  ],
  'center-right': [
    {size: 14, color: PEACH, position: {top: 60, left: 30}, opacity: 0.85},
    {size: 7, color: ORANGE, position: {bottom: 80, left: 30}, opacity: 0.8},
  ],
};

const styles = StyleSheet.create({
  screenWrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
  },
  container: {
    position: 'absolute',
    overflow: 'visible',
    zIndex: 0,
  },
  outerCurve: {
    position: 'absolute',
    backgroundColor: PEACH,
    opacity: 0.92,
  },
  innerCurve: {
    position: 'absolute',
    backgroundColor: ORANGE,
    opacity: 0.92,
  },
  droplet: {
    position: 'absolute',
    zIndex: 1,
  },
});

const CONTAINER_STYLES = StyleSheet.create({
  'top-right': {
    top: 0,
    right: 0,
    width: 260,
    height: 220,
  },
  'top-left': {
    top: 0,
    left: 0,
    width: 260,
    height: 220,
  },
  'bottom-right': {
    bottom: 0,
    right: 0,
    width: 240,
    height: 210,
  },
  'bottom-left': {
    bottom: 0,
    left: 0,
    width: 240,
    height: 210,
  },
  'center-left': {
    top: '28%',
    left: 0,
    width: 180,
    height: 225,
  },
  'center-right': {
    top: '32%',
    right: 0,
    width: 180,
    height: 225,
  },
});

const OUTER_STYLES = StyleSheet.create({
  'top-right': {
    top: -15,
    right: -15,
    width: 240,
    height: 185,
    borderBottomLeftRadius: 135,
    borderTopLeftRadius: 45,
    transform: [{rotate: '-8deg'}],
  },
  'top-left': {
    top: -15,
    left: -15,
    width: 240,
    height: 185,
    borderBottomRightRadius: 135,
    borderTopRightRadius: 45,
    transform: [{rotate: '8deg'}],
  },
  'bottom-right': {
    bottom: -35,
    right: -20,
    width: 220,
    height: 175,
    borderTopLeftRadius: 130,
    borderBottomLeftRadius: 40,
    transform: [{rotate: '8deg'}],
  },
  'bottom-left': {
    bottom: -35,
    left: -20,
    width: 220,
    height: 175,
    borderTopRightRadius: 130,
    borderBottomRightRadius: 40,
    transform: [{rotate: '-8deg'}],
  },
  'center-left': {
    top: 15,
    left: -45,
    width: 175,
    height: 185,
    borderTopRightRadius: 110,
    borderBottomRightRadius: 110,
    transform: [{rotate: '6deg'}],
  },
  'center-right': {
    top: 15,
    right: -45,
    width: 175,
    height: 185,
    borderTopLeftRadius: 110,
    borderBottomLeftRadius: 110,
    transform: [{rotate: '-6deg'}],
  },
});

const INNER_STYLES = StyleSheet.create({
  'top-right': {
    top: -25,
    right: -20,
    width: 195,
    height: 155,
    borderBottomLeftRadius: 115,
    borderTopLeftRadius: 35,
    transform: [{rotate: '-6deg'}],
  },
  'top-left': {
    top: -25,
    left: -20,
    width: 195,
    height: 155,
    borderBottomRightRadius: 115,
    borderTopRightRadius: 35,
    transform: [{rotate: '6deg'}],
  },
  'bottom-right': {
    bottom: -45,
    right: -25,
    width: 185,
    height: 145,
    borderTopLeftRadius: 110,
    borderBottomLeftRadius: 30,
    transform: [{rotate: '6deg'}],
  },
  'bottom-left': {
    bottom: -45,
    left: -25,
    width: 185,
    height: 145,
    borderTopRightRadius: 110,
    borderBottomRightRadius: 30,
    transform: [{rotate: '-6deg'}],
  },
  'center-left': {
    top: 30,
    left: -50,
    width: 145,
    height: 155,
    borderTopRightRadius: 95,
    borderBottomRightRadius: 95,
    transform: [{rotate: '4deg'}],
  },
  'center-right': {
    top: 30,
    right: -50,
    width: 145,
    height: 155,
    borderTopLeftRadius: 95,
    borderBottomLeftRadius: 95,
    transform: [{rotate: '-4deg'}],
  },
});
