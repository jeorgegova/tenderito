import {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import {MonochromeIcon, type IconName} from './MonochromeIcon';

// Pastilla naranja con efecto imán: entra con spring overshoot al seleccionar.
export function MagnetIcon({
  name,
  color,
  size = 21,
  selected,
  strokeWidth,
}: {
  name: IconName;
  color: string;
  size?: number;
  selected: boolean;
  strokeWidth?: number;
}) {
  const anim = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
      speed: 22,
      bounciness: 10,
    }).start();
  }, [selected, anim]);

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  });
  const lift = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 0],
  });

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.pill,
          {
            opacity: anim,
            transform: [{scale}],
          },
        ]}
      />
      <Animated.View style={{transform: [{translateY: lift}]}}>
        <MonochromeIcon
          name={name}
          color={color}
          size={size}
          strokeWidth={strokeWidth ?? (selected ? 2.4 : 1.9)}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {width: 38, height: 28, alignItems: 'center', justifyContent: 'center'},
  pill: {
    position: 'absolute',
    width: 38,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFE0C0',
  },
});
