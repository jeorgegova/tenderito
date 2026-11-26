import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Colors } from '../../theme';

interface StoreStatusRingProps {
  size?: number;
  strokeWidth?: number;
  count?: number;
  unviewedCount?: number;
  gapColor?: string;
  showAddBadge?: boolean;
  onAddPress?: () => void;
  onPress?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function StoreStatusRing({
  size = 60,
  strokeWidth = 2.5,
  count = 0,
  unviewedCount = 0,
  gapColor = '#FFFFFF',
  showAddBadge = false,
  onAddPress,
  onPress,
  children,
  style,
}: StoreStatusRingProps) {
  const hasStatuses = count > 0;
  const isAllViewed = hasStatuses && unviewedCount === 0;
  const ringColor = isAllViewed ? '#94A3B8' : Colors.primary;

  // Segmentación del borde estilo WhatsApp según la cantidad de estados
  const gapAngles = useMemo(() => {
    if (count <= 1) return [];
    if (count === 2) return [0, 180];
    if (count === 3) return [0, 120, 240];
    const angles: number[] = [];
    const step = 360 / count;
    for (let i = 0; i < count; i++) {
      angles.push(i * step);
    }
    return angles;
  }, [count]);

  const gapThickness = count === 2 ? 6 : 5;
  const gapHeight = strokeWidth + 6;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const innerSize = hasStatuses ? size - strokeWidth * 2 - 4 : size - 4;

  const content = (
    <View style={[styles.container, { width: size, height: size }, style]}>
      {/* 1. Anillo circular exterior */}
      {hasStatuses && (
        <View
          pointerEvents="none"
          style={[
            styles.ringBorder,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: ringColor,
            },
          ]}
        />
      )}

      {/* 2. Cortes / Gaps de separación estilo WhatsApp */}
      {hasStatuses &&
        gapAngles.map(deg => {
          const rad = (deg * Math.PI) / 180;
          const gx = center + radius * Math.sin(rad);
          const gy = center - radius * Math.cos(rad);

          return (
            <View
              key={deg}
              pointerEvents="none"
              style={[
                styles.gap,
                {
                  left: gx - gapThickness / 2,
                  top: gy - gapHeight / 2,
                  width: gapThickness,
                  height: gapHeight,
                  backgroundColor: gapColor,
                  borderRadius: 1,
                  transform: [{ rotate: `${deg}deg` }],
                },
              ]}
            />
          );
        })}

      {/* 3. Contenido interior (Círculo con icono de tienda) */}
      <View
        style={[
          styles.innerCircle,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
          },
        ]}>
        {children}
      </View>

      {/* 4. Botón '+' de agregar estado para el tendero */}
      {showAddBadge && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onAddPress}
          style={styles.addBadge}>
          <Ionicons name="add" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  gap: {
    position: 'absolute',
    zIndex: 2,
  },
  innerCircle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  addBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    zIndex: 10,
  },
});
