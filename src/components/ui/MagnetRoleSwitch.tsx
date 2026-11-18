import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Colors } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';

export interface MagnetRoleSwitchProps {
  role: 'store' | 'customer';
  onChange: (role: 'store' | 'customer') => void;
  style?: any;
}

const ROLES = [
  { id: 'store' as const, label: 'Soy tendero', icon: 'storefront-outline' },
  { id: 'customer' as const, label: 'Soy cliente', icon: 'person-outline' },
];

const TRACK_PADDING = 4;

export function MagnetRoleSwitch({ role, onChange, style }: MagnetRoleSwitchProps) {
  const { isSmall } = useResponsive();
  const [containerWidth, setContainerWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  const selectedIndex = role === 'store' ? 0 : 1;
  const usableWidth = containerWidth - TRACK_PADDING * 2;
  const itemWidth = usableWidth > 0 ? usableWidth / 2 : 0;

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

      {ROLES.map(r => {
        const isSelected = r.id === role;
        return (
          <Pressable
            key={r.id}
            onPress={() => onChange(r.id)}
            style={[styles.tabItem, isSmall && styles.tabItemSmall]}
            hitSlop={4}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={r.label}>
            <View style={styles.tabContent}>
              <Ionicons
                name={r.icon as any}
                size={isSmall ? 16 : 18}
                color={isSelected ? Colors.primary : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabText,
                  isSmall && styles.tabTextSmall,
                  isSelected && styles.tabTextActive,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}>
                {r.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: TRACK_PADDING,
    borderWidth: 1.5,
    borderColor: '#F0F2F5',
    position: 'relative',
    width: '100%',
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  pill: {
    position: 'absolute',
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: 0,
    backgroundColor: Colors.primaryLight,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabItemSmall: {
    paddingVertical: 8,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  tabTextSmall: {
    fontSize: 13,
  },
  tabTextActive: {
    fontWeight: '800',
    color: Colors.primary,
  },
});
