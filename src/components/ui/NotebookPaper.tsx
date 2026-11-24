import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

export interface NotebookPaperProps {
  children: React.ReactNode;
  style?: any;
  minHeight?: number;
  ringCount?: number;
}

/**
 * Componente visual que simula una hoja física de cuaderno argollado tradicional de tendero.
 * - Papel crema cálido con bordes y sombra de profundidad
 * - Argollas metálicas en espiral en el lateral izquierdo
 * - Perforaciones circulares en el papel alineadas con las argollas
 * - Línea de margen vertical roja/rosada
 * - Espacio reservado para que ningún contenido se superponga con las argollas
 */
export function NotebookPaper({
  children,
  style,
  minHeight = 280,
  ringCount = 14,
}: NotebookPaperProps) {
  const rings = useMemo(() => {
    return Array.from({ length: ringCount }, (_, i) => i);
  }, [ringCount]);

  return (
    <View style={[styles.paper, { minHeight }, style]}>
      {/* ── ESPINA LATERAL FIJA: Argollas metálicas + Perforaciones + Margen rojo ── */}
      <View style={styles.spine} pointerEvents="none">
        {/* Línea vertical roja del margen izquierdo */}
        <View style={styles.redMarginLine} />

        {/* Anillas metálicas y perforaciones distribuidas verticalmente */}
        {rings.map(idx => (
          <View key={idx} style={styles.ringSlot}>
            {/* Perforación circular oscura en el papel */}
            <View style={styles.hole} />

            {/* Argolla metálica en espiral con curvatura reforzada */}
            <View style={styles.metalRingBack} />
            <View style={styles.metalRingHighlight} />
            <View style={styles.metalRingShading} />
          </View>
        ))}
      </View>

      {/* ── ÁREA DE CONTENIDO DE LA LIBRETA (a la derecha del margen) ── */}
      <View style={styles.contentWrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: '#FFFDF5', // Papel crema cálido
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 1.5,
    borderColor: '#EADDCE',
    shadowColor: '#2D190A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 26,
    zIndex: 4,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
  },
  redMarginLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 1.5,
    backgroundColor: 'rgba(239, 68, 68, 0.45)', // Margen rojo/rosado tenue
  },
  ringSlot: {
    width: 22,
    height: 11,
    justifyContent: 'center',
    position: 'relative',
  },
  hole: {
    position: 'absolute',
    left: 11,
    width: 7.5,
    height: 7.5,
    borderRadius: 3.75,
    backgroundColor: '#1F1410', // Hueco perforado oscuro
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  metalRingBack: {
    position: 'absolute',
    left: -2,
    width: 18,
    height: 5.5,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
    transform: [{ rotate: '-4deg' }],
  },
  metalRingHighlight: {
    position: 'absolute',
    left: -1,
    top: 2.5,
    width: 16,
    height: 1.6,
    borderRadius: 0.8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    transform: [{ rotate: '-4deg' }],
  },
  metalRingShading: {
    position: 'absolute',
    left: -1,
    top: 5.8,
    width: 16,
    height: 1.4,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: '#334155',
    transform: [{ rotate: '-4deg' }],
  },
  contentWrap: {
    paddingLeft: 28, // Espacio optimizado para aprovechar al máximo el ancho en móviles
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
});
