import {useEffect, useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Colors} from '../../theme';

const PILL_W = 60;
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
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const count = state.routes.length;
  const itemW = (width - 16) / Math.max(1, count);

  useEffect(() => {
    if (!itemW || itemW <= 0) return;
    Animated.spring(x, {
      toValue: 8 + state.index * itemW + (itemW - PILL_W) / 2,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6,
    }).start();
  }, [state.index, itemW, x]);

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: Math.max(insets.bottom, 6) + 4,
        },
      ]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, {transform: [{translateX: x}]}]}
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
            <View style={styles.iconBox}>
              <Ionicons
                name={iconName}
                size={22}
                color={color}
              />
            </View>
            <Text
              style={[
                styles.label,
                {color},
                focused && styles.labelFocused,
              ]}
              numberOfLines={1}>
              {route.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
    paddingHorizontal: 8,
    shadowColor: '#142033',
    shadowOffset: {width: 0, height: -3},
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 12,
  },
  pill: {
    position: 'absolute',
    top: 7,
    left: 0,
    width: PILL_W,
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
  },
  iconBox: {
    width: PILL_W,
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
  labelFocused: {
    fontWeight: '800',
    color: Colors.primary,
  },
});
