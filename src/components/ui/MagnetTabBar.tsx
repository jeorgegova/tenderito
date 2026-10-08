import {useEffect, useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors} from '../../theme';
import {MonochromeIcon, type IconName} from './MonochromeIcon';

const PILL_W = 56;
const PILL_H = 32;

function iconFor(routeName: string): IconName {
  if (routeName === 'Inicio') return 'home';
  if (routeName === 'Clientes') return 'clients';
  if (routeName === 'Alertas') return 'alerts';
  if (routeName === 'Perfil') return 'profile';
  return 'receipt';
}

function labelFor(routeName: string): string {
  return routeName;
}

// TabBar nativa con píldora imán deslizante.
export function MagnetTabBar({state, navigation}: any) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const count = state.routes.length;
  const itemW = (width - 20) / Math.max(1, count);

  useEffect(() => {
    if (!itemW || itemW <= 0) return;
    Animated.spring(x, {
      toValue: 10 + state.index * itemW + (itemW - PILL_W) / 2,
      useNativeDriver: true,
      speed: 18,
      bounciness: 9,
    }).start();
  }, [state.index, itemW, x]);

  return (
    <View
      style={[styles.bar, {paddingBottom: insets.bottom + 6}]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Animated.View
          style={[
            styles.pill,
            {transform: [{translateX: x}]},
          ]}
        />
      ) : null}
      {state.routes.map((route: any, index: number) => {
        const focused = state.index === index;
        const color = focused ? Colors.primary : Colors.textSecondary;
        return (
          <Pressable
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            style={styles.item}
            hitSlop={8}>
            <View style={styles.iconBox}>
              <MonochromeIcon
                name={iconFor(route.name)}
                color={color}
                size={21}
                strokeWidth={focused ? 2.4 : 1.9}
              />
            </View>
            <Text style={[styles.label, {color}]}>
              {labelFor(route.name)}
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
    backgroundColor: Colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(17, 24, 39, 0.06)',
    paddingTop: 7,
    paddingHorizontal: 10,
    height: 72,
    shadowColor: '#111827',
    shadowOffset: {width: 0, height: -3},
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 12,
  },
  pill: {
    position: 'absolute',
    top: 7,
    left: 0,
    width: PILL_W,
    height: PILL_H,
    borderRadius: 16,
    backgroundColor: '#FFE0C0',
  },
  item: {flex: 1, alignItems: 'center', gap: 1, paddingVertical: 3, zIndex: 1},
  iconBox: {height: 28, alignItems: 'center', justifyContent: 'center'},
  label: {fontSize: 10, fontWeight: '600'},
});
