import {useEffect, useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Colors} from '../../theme';
import {useResponsive} from '../../hooks/useResponsive';

const PILL_H = 32;

function getTabIcon(routeName: string, focused: boolean) {
  switch (routeName) {
    case 'Inicio':
      return focused ? 'home' : 'home-outline';
    case 'Clientes':
      return focused ? 'people' : 'people-outline';
    case 'Estadísticas':
      return focused ? 'stats-chart' : 'stats-chart-outline';
    case 'Alertas':
      return focused ? 'notifications' : 'notifications-outline';
    case 'Perfil':
      return focused ? 'person' : 'person-outline';
    default:
      return focused ? 'document-text' : 'document-text-outline';
  }
}

export function MagnetTabBar({state, navigation}: any) {
  const insets = useSafeAreaInsets();
  const {isSmall, isTablet} = useResponsive();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const count = state.routes.length;
  const itemW = width > 0 ? (width - 16) / Math.max(1, count) : 0;
  const pillW = itemW > 0 ? Math.min(Math.max(itemW - 8, 46), 64) : 58;

  useEffect(() => {
    if (!itemW || itemW <= 0) return;
    Animated.spring(x, {
      toValue: 8 + state.index * itemW + (itemW - pillW) / 2,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6,
    }).start();
  }, [state.index, itemW, pillW, x]);

  return (
    <View style={styles.outerWrap}>
      <View
        style={[
          styles.bar,
          isTablet && styles.barTablet,
          {
            paddingBottom: Math.max(insets.bottom, 6) + 4,
          },
        ]}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pill,
              {
                width: pillW,
                transform: [{translateX: x}],
              },
            ]}
          />
        ) : null}
        {state.routes.map((route: any, index: number) => {
          const focused = state.index === index;
          const color = focused ? Colors.primary : Colors.tabInactive;
          const iconName = getTabIcon(route.name, focused);

          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={styles.item}
              hitSlop={6}
              accessibilityRole="tab"
              accessibilityState={{selected: focused}}
              accessibilityLabel={route.name}>
              <View style={[styles.iconBox, {width: pillW}]}>
                <Ionicons
                  name={iconName}
                  size={isSmall ? 20 : 22}
                  color={color}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  isSmall && styles.labelSmall,
                  {color},
                  focused && styles.labelFocused,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}>
                {route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
    width: '100%',
  },
  bar: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingHorizontal: 8,
    shadowColor: '#142033',
    shadowOffset: {width: 0, height: -3},
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 12,
  },
  barTablet: {
    maxWidth: 580,
  },
  pill: {
    position: 'absolute',
    top: 7,
    left: 0,
    height: PILL_H,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    zIndex: 1,
    minWidth: 0,
  },
  iconBox: {
    height: PILL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.tabInactive,
    textAlign: 'center',
  },
  labelSmall: {
    fontSize: 10,
  },
  labelFocused: {
    fontWeight: '800',
    color: Colors.primary,
  },
});
