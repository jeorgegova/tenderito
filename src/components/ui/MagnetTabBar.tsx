import {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Colors} from '../../theme';
import {useResponsive} from '../../hooks/useResponsive';

const PILL_H = 32;

const DEFAULT_ROUTES = [
  {key: 'Inicio', name: 'Inicio'},
  {key: 'Clientes', name: 'Clientes'},
  {key: 'Estadísticas', name: 'Estadísticas'},
  {key: 'Perfil', name: 'Perfil'},
];

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

function getInitialBarWidth() {
  const sw = Dimensions.get('window').width;
  return Math.min(sw - 32, 480);
}

function computePillMetrics(index: number, barW: number, count: number) {
  const itemW = barW > 0 ? (barW - 16) / Math.max(1, count) : 0;
  const pillW = itemW > 0 ? Math.min(Math.max(itemW - 12, 48), 62) : 56;
  const targetX = itemW > 0 ? 8 + index * itemW + (itemW - pillW) / 2 : 0;
  return {itemW, pillW, targetX};
}

export function MagnetTabBar({state, navigation, active, onPressItem, onTabPress}: any) {
  const insets = useSafeAreaInsets();
  const defaultNav = useNavigation<any>();
  const nav = navigation || defaultNav;
  const {isSmall, isTablet} = useResponsive();
  const [width, setWidth] = useState(getInitialBarWidth);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Ocultar barra al desplegarse el teclado en pantalla
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const routes = state?.routes || DEFAULT_ROUTES;
  const count = routes.length;

  const targetIndex = state
    ? state.index
    : Math.max(
        0,
        routes.findIndex((r: any) => r.name === (active || 'Clientes')),
      );

  const prevIndexRef = useRef(targetIndex);
  const {pillW, targetX} = computePillMetrics(targetIndex, width, count);
  const x = useRef(new Animated.Value(targetX)).current;

  const animatePillTo = (index: number, barW: number) => {
    const metrics = computePillMetrics(index, barW, count);
    Animated.timing(x, {
      toValue: metrics.targetX,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  // Sincronización continua e instantánea cuando cambia la ruta activa
  useEffect(() => {
    if (prevIndexRef.current !== targetIndex) {
      prevIndexRef.current = targetIndex;
      animatePillTo(targetIndex, width);
    }
  }, [targetIndex, width, count]);

  const handleTabPress = (routeName: string, index: number) => {
    const isFocused = targetIndex === index;
    if (!isFocused) {
      prevIndexRef.current = index;
      animatePillTo(index, width);
    }
    onPressItem?.();

    if (onTabPress) {
      onTabPress(index);
      return;
    }

    // Emite el evento estándar tabPress: si el tab ya estaba activo activa useScrollToTop nativo
    if (navigation?.emit) {
      const event = navigation.emit({
        type: 'tabPress',
        target: routes[index]?.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event?.defaultPrevented) {
        nav.navigate(routeName);
      }
    } else if (state) {
      nav.navigate(routeName);
    } else {
      if (routeName === (active || 'Clientes')) {
        return;
      }
      nav.navigate('Main', {screen: routeName});
    }
  };

  if (keyboardVisible) {
    return null;
  }

  const bottomInset = Math.max(insets.bottom > 0 ? insets.bottom - 4 : 10, 10);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.outerWrap,
        {
          paddingBottom: bottomInset,
        },
      ]}>
      <View
        style={[styles.bar, isTablet && styles.barTablet]}
        onLayout={e => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - width) > 1) {
            setWidth(w);
            const metrics = computePillMetrics(targetIndex, w, count);
            x.setValue(metrics.targetX);
          }
        }}>
        {/* Pastilla magnética animada deslizante (efecto imán rápido y preciso) */}
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

        {routes.map((route: any, index: number) => {
          const focused = targetIndex === index;
          const color = focused ? Colors.primary : Colors.tabInactive;
          const iconName = getTabIcon(route.name, focused);

          return (
            <Pressable
              key={route.key || route.name}
              onPress={() => handleTabPress(route.name, index)}
              style={({pressed}) => [styles.item, pressed && styles.itemPressed]}
              hitSlop={4}
              accessibilityRole="tab"
              accessibilityState={{selected: focused}}
              accessibilityLabel={route.name}>
              <View style={[styles.iconBox, focused && styles.iconBoxFocused]}>
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 1000,
    elevation: 10,
  },
  bar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    shadowColor: '#142033',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  barTablet: {
    maxWidth: 480,
  },
  pill: {
    position: 'absolute',
    top: 10,
    left: 0,
    height: PILL_H,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 2,
    zIndex: 0,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 4,
    minWidth: 0,
    zIndex: 1,
  },
  itemPressed: {
    transform: [{scale: 0.94}],
  },
  iconBox: {
    width: 48,
    height: PILL_H,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  iconBoxFocused: {
    transform: [{scale: 1.08}],
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.tabInactive,
    textAlign: 'center',
    letterSpacing: 0,
  },
  labelSmall: {
    fontSize: 10,
  },
  labelFocused: {
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.1,
  },
});
