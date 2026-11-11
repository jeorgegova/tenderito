import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors } from '../../theme';

export interface MagnetFilterOption<T extends string = string> {
  key: T;
  label: string;
}

interface MagnetFilterBarProps<T extends string = string> {
  options: readonly MagnetFilterOption<T>[] | MagnetFilterOption<T>[];
  selectedKey: T;
  onSelect: (key: T) => void;
  style?: any;
}

const TRACK_PADDING = 3;

export function MagnetFilterBar<T extends string = string>({
  options,
  selectedKey,
  onSelect,
  style,
}: MagnetFilterBarProps<T>) {
  const [containerWidth, setContainerWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  const count = options.length;
  const selectedIndex = Math.max(
    0,
    options.findIndex(o => o.key === selectedKey),
  );

  const usableWidth = containerWidth - TRACK_PADDING * 2;
  const itemWidth = usableWidth > 0 ? usableWidth / Math.max(1, count) : 0;

  useEffect(() => {
    if (itemWidth <= 0) return;
    Animated.spring(x, {
      toValue: TRACK_PADDING + selectedIndex * itemWidth,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6,
    }).start();
  }, [selectedIndex, itemWidth, x]);

  return (
    <View
      style={[styles.container, style]}
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>
      {itemWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            {
              width: itemWidth,
              transform: [{ translateX: x }],
            },
          ]}
        />
      ) : null}

      {options.map((option, index) => {
        const isSelected = option.key === selectedKey;
        return (
          <Pressable
            key={option.key}
            onPress={() => onSelect(option.key)}
            style={styles.tabItem}
            hitSlop={4}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.label}>
            <Text
              style={[
                styles.tabText,
                isSelected && styles.tabTextActive,
              ]}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    padding: TRACK_PADDING,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.primaryMid,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  tabTextActive: {
    fontWeight: '800',
    color: Colors.primaryDark,
  },
});
