import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';

export interface MagnetFilterOption<T extends string = string> {
  key: T;
  label: string;
}

interface MagnetFilterBarProps<T extends string = string> {
  options: readonly MagnetFilterOption<T>[] | MagnetFilterOption<T>[];
  selectedKey: T;
  onSelect: (key: T) => void;
  style?: any;
  contentContainerStyle?: any;
  scrollable?: boolean;
}

const TRACK_PADDING = 3;

export function MagnetFilterBar<T extends string = string>({
  options,
  selectedKey,
  onSelect,
  style,
  contentContainerStyle,
  scrollable = false,
}: MagnetFilterBarProps<T>) {
  const { isSmall, isTablet } = useResponsive();

  // ── MODO SCROLLABLE (para listas con múltiples opciones como rangos de fechas) ──
  const scrollViewRef = useRef<ScrollView>(null);
  const itemLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const pillX = useRef(new Animated.Value(0)).current;
  const pillW = useRef(new Animated.Value(0)).current;
  const hasInitialized = useRef(false);
  const [pillReady, setPillReady] = useState(false);

  // ── MODO ESTÁTICO EQUITATIVO (por defecto) ──
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
    if (scrollable) return;
    if (itemWidth <= 0) return;
    Animated.spring(x, {
      toValue: TRACK_PADDING + selectedIndex * itemWidth,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6,
    }).start();
  }, [selectedIndex, itemWidth, x, scrollable]);

  // Manejo de animación fluida en modo scrollable
  useEffect(() => {
    if (!scrollable) return;
    const target = itemLayouts.current[selectedKey];
    if (!target) return;

    if (!hasInitialized.current) {
      hasInitialized.current = true;
      pillX.setValue(target.x);
      pillW.setValue(target.width);
      setPillReady(true);
      return;
    }

    setPillReady(true);
    Animated.parallel([
      Animated.spring(pillX, {
        toValue: target.x,
        useNativeDriver: false,
        speed: 24,
        bounciness: 6,
      }),
      Animated.spring(pillW, {
        toValue: target.width,
        useNativeDriver: false,
        speed: 24,
        bounciness: 6,
      }),
    ]).start();

    scrollViewRef.current?.scrollTo({
      x: Math.max(0, target.x - 36),
      animated: true,
    });
  }, [selectedKey, scrollable]);

  const handleScrollItemLayout = (key: string, itemX: number, itemWidthVal: number) => {
    itemLayouts.current[key] = { x: itemX, width: itemWidthVal };
    if (key === selectedKey && !hasInitialized.current) {
      hasInitialized.current = true;
      pillX.setValue(itemX);
      pillW.setValue(itemWidthVal);
      setPillReady(true);
    }
  };

  if (scrollable) {
    return (
      <View style={[styles.scrollOuter, isTablet && styles.containerTablet, style]}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}>
          <View style={styles.scrollTrack}>
            {pillReady ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pill,
                  {
                    left: pillX,
                    width: pillW,
                  },
                ]}
              />
            ) : null}

            {options.map((option) => {
              const isSelected = option.key === selectedKey;
              return (
                <Pressable
                  key={option.key}
                  onLayout={e => {
                    const { x: itemX, width: itemW } = e.nativeEvent.layout;
                    handleScrollItemLayout(option.key, itemX, itemW);
                  }}
                  onPress={() => onSelect(option.key)}
                  style={[
                    styles.scrollTabItem,
                    isSmall && styles.scrollTabItemSmall,
                  ]}
                  hitSlop={4}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={option.label}>
                  <Text
                    style={[
                      styles.tabText,
                      isSmall && styles.tabTextSmall,
                      isSelected && styles.tabTextActive,
                    ]}
                    numberOfLines={1}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        isTablet && styles.containerTablet,
        style,
      ]}
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

      {options.map((option) => {
        const isSelected = option.key === selectedKey;
        return (
          <Pressable
            key={option.key}
            onPress={() => onSelect(option.key)}
            style={[styles.tabItem, isSmall && styles.tabItemSmall]}
            hitSlop={4}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.label}>
            <Text
              style={[
                styles.tabText,
                isSmall && styles.tabTextSmall,
                isSelected && styles.tabTextActive,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}>
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
    width: '100%',
  },
  containerTablet: {
    maxWidth: 580,
    alignSelf: 'center',
  },
  scrollOuter: {
    width: '100%',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  scrollTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    padding: TRACK_PADDING,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  scrollTabItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  scrollTabItemSmall: {
    paddingVertical: 7,
    paddingHorizontal: 12,
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
    minWidth: 0,
  },
  tabItemSmall: {
    paddingVertical: 7,
    paddingHorizontal: 3,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  tabTextSmall: {
    fontSize: 11,
  },
  tabTextActive: {
    fontWeight: '800',
    color: Colors.primaryDark,
  },
});
