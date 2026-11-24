import React, {useEffect, useState} from 'react';
import {StyleProp, Text, TextStyle} from 'react-native';
import {FormatMoney} from '../../utils/format';

interface AnimatedMoneyProps {
  value: number | string;
  style?: StyleProp<TextStyle>;
  formatter?: (val: number) => string;
  duration?: number;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}

export const AnimatedMoney = ({
  value,
  style,
  formatter,
  duration = 1200,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: AnimatedMoneyProps) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const to = parseFloat(String(value)) || 0;
    const start = Date.now();
    let raf: number;

    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / duration);
      // easeInOutQuad: arranque y llegada suaves
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const current = to * eased;
      // Sin decimales durante la animación, valor exacto al final
      setDisplay(p >= 1 ? to : Math.round(current));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const formattedText = formatter ? formatter(display) : FormatMoney(display);

  return (
    <Text
      style={style ?? {color: '#6D4AFF', fontWeight: 'bold', fontSize: 16}}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}>
      {formattedText}
    </Text>
  );
};
