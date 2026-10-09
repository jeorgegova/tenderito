import {useEffect, useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors} from '../../theme';
import {MonochromeIcon, type IconName} from './MonochromeIcon';

const PILL_W = 58;
const PILL_H = 34;

function iconFor(routeName: string): IconName {
  if (routeName === 'Inicio') return 'home';
  if (routeName === 'Clientes') return 'clients';
  if (routeName === 'Estadísticas') return 'chart';
  if (routeName === 'Alertas') return 'alerts';
  if (routeName === 'Perfil') return 'profile';
  return 'receipt';
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
      speed: 20,
      bounciness: 8,
    }).start();
  }, [state.index, itemW, x]);

  return (
    <View
      style={[styles.bar, {paddingBottom: insets.bottom + 4}]}
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
        const color = focused ? Colors.primary : Colors.tabInactive;
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
                size={22}
                strokeWidth={focused ? 2.5 : 1.9}
              />
            </View>
            <Text style={[styles.label, {color}]}>
              {route.name === 'Estadísticas' ? 'Stats' : route.name}
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
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
    paddingHorizontal: 8,
    // Sombra cálida hacia arriba
    shadowColor: '#7C5230',
    shadowOffset: {width: 0, height: -3},
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 14,
  },
  pill: {
    position: 'absolute',
    top: 7,
    left: 0,
    width: PILL_W,
    height: PILL_H,
    borderRadius: 17,
    backgroundColor: Colors.primaryLight,
  },
  item: {flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2, zIndex: 1},
  iconBox: {height: 28, alignItems: 'center', justifyContent: 'center'},
  label: {fontSize: 10, fontWeight: '700'},
});
