import React, {useCallback, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Colors} from '../../theme';

export type CurvePosition =
  | 'top-right'
  | 'bottom-right'
  | 'center-left'
  | 'center-right'
  | 'bottom-left';

// Secuencia dinámica de posiciones que alterna sucesivamente al cambiar de vista:
// 1. Inicio: 'top-right' (arriba a la derecha)
// 2. Clientes: 'bottom-right' (sale por debajo)
// 3. Estadísticas: 'center-left' (por la izquierda)
// 4. Clientes de nuevo: 'center-right' (sale a la derecha)
// 5. Perfil u otra vista: 'bottom-left' (abajo a la izquierda)
const POSITION_CYCLE: CurvePosition[] = [
  'top-right',
  'bottom-right',
  'center-left',
  'center-right',
  'bottom-left',
];

let globalCycleIndex = 0;

export function getNextDynamicPosition(): CurvePosition {
  const position = POSITION_CYCLE[globalCycleIndex % POSITION_CYCLE.length];
  globalCycleIndex = (globalCycleIndex + 1) % POSITION_CYCLE.length;
  return position;
}

export function DynamicBrandCurves({
  fixedPosition,
}: {
  fixedPosition?: CurvePosition;
}) {
  const [position, setPosition] = useState<CurvePosition>(
    fixedPosition ?? POSITION_CYCLE[0],
  );

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useFocusEffect(
    useCallback(() => {
      const nextPos = fixedPosition ?? getNextDynamicPosition();
      setPosition(nextPos);

      // Transición suave al entrar o cambiar de pantalla
      opacityAnim.setValue(0);
      scaleAnim.setValue(0.9);

      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          speed: 18,
          bounciness: 4,
          useNativeDriver: true,
        }),
      ]).start();
    }, [fixedPosition, opacityAnim, scaleAnim]),
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        CONTAINER_STYLES[position],
        {
          opacity: opacityAnim,
          transform: [{scale: scaleAnim}],
        },
      ]}>
      <View style={[styles.outerCurve, OUTER_STYLES[position]]} />
      <View style={[styles.innerCurve, INNER_STYLES[position]]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 0,
  },
  outerCurve: {
    position: 'absolute',
    backgroundColor: '#FFE4D0',
  },
  innerCurve: {
    position: 'absolute',
    backgroundColor: Colors.primary,
  },
});

const CONTAINER_STYLES = StyleSheet.create({
  'top-right': {
    top: 0,
    right: 0,
    width: 220,
    height: 150,
  },
  'bottom-right': {
    bottom: 12,
    right: 0,
    width: 210,
    height: 165,
  },
  'center-left': {
    top: '30%',
    left: 0,
    width: 150,
    height: 210,
  },
  'center-right': {
    top: '36%',
    right: 0,
    width: 150,
    height: 210,
  },
  'bottom-left': {
    bottom: 12,
    left: 0,
    width: 210,
    height: 165,
  },
});

const OUTER_STYLES = StyleSheet.create({
  'top-right': {
    top: -45,
    right: -25,
    width: 210,
    height: 155,
    borderBottomLeftRadius: 110,
    borderTopLeftRadius: 40,
    transform: [{rotate: '-8deg'}],
  },
  'bottom-right': {
    bottom: -45,
    right: -25,
    width: 210,
    height: 155,
    borderTopLeftRadius: 120,
    borderBottomLeftRadius: 40,
    transform: [{rotate: '8deg'}],
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
  'bottom-left': {
    bottom: -45,
    left: -25,
    width: 210,
    height: 155,
    borderTopRightRadius: 120,
    borderBottomRightRadius: 40,
    transform: [{rotate: '-8deg'}],
  },
});

const INNER_STYLES = StyleSheet.create({
  'top-right': {
    top: -55,
    right: -30,
    width: 175,
    height: 130,
    borderBottomLeftRadius: 95,
    borderTopLeftRadius: 30,
    transform: [{rotate: '-6deg'}],
  },
  'bottom-right': {
    bottom: -55,
    right: -30,
    width: 175,
    height: 130,
    borderTopLeftRadius: 100,
    borderBottomLeftRadius: 30,
    transform: [{rotate: '6deg'}],
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
  'bottom-left': {
    bottom: -55,
    left: -30,
    width: 175,
    height: 130,
    borderTopRightRadius: 100,
    borderBottomRightRadius: 30,
    transform: [{rotate: '-6deg'}],
  },
});
