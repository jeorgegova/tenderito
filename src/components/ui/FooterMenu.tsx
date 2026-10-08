import {useEffect, useRef, useState} from 'react';
import {useNavigation, useRoute} from '@react-navigation/native';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors} from '../../theme';
import {MonochromeIcon} from './MonochromeIcon';

const PILL_W = 56;
const PILL_H = 32;
const PAD_H = 10;

const ITEMS = [
  {name: 'Inicio', icon: 'home'},
  {name: 'Clientes', icon: 'clients'},
  {name: 'Alertas', icon: 'alerts'},
  {name: 'Perfil', icon: 'profile'},
] as const;

export function FooterMenu({
  active,
  onPressItem,
}: {
  active?: string;
  onPressItem?: () => void;
}) {
  const navigation: any = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const current = active ?? (route.name as string);
  const index = Math.max(
    0,
    ITEMS.findIndex(i => i.name === current),
  );
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const itemW = (width - PAD_H * 2) / ITEMS.length;

  useEffect(() => {
    if (!itemW || itemW <= 0) return;
    Animated.spring(x, {
      toValue: PAD_H + index * itemW + (itemW - PILL_W) / 2,
      useNativeDriver: true,
      speed: 18,
      bounciness: 9,
    }).start();
  }, [index, itemW, x]);

  function go(name: string) {
    onPressItem?.();
    navigation.navigate('Main' as never, {screen: name} as never);
  }

  return (
    <View
      style={[styles.bar, {paddingBottom: insets.bottom + 8}]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Animated.View style={[styles.pill, {transform: [{translateX: x}]}]} />
      ) : null}
      {ITEMS.map(({name, icon}) => {
        const selected = current === name;
        const color = selected ? Colors.primary : Colors.textSecondary;
        return (
          <Pressable
            key={name}
            onPress={() => go(name)}
            style={styles.item}
            hitSlop={8}>
            <View style={styles.iconBox}>
              <MonochromeIcon
                name={icon as any}
                color={color}
                size={21}
                strokeWidth={selected ? 2.4 : 1.9}
              />
            </View>
            <Text style={[styles.label, {color}]}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(17, 24, 39, 0.06)',
    backgroundColor: Colors.card,
    paddingTop: 7,
    paddingHorizontal: PAD_H,
    shadowColor: '#111827',
    shadowOffset: {width: 0, height: -3},
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 10,
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
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    zIndex: 1,
  },
  iconBox: {height: 28, alignItems: 'center', justifyContent: 'center'},
  label: {fontSize: 10, fontWeight: '600'},
});
