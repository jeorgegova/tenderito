import {
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import {Colors, Radius} from '../../theme';
import {MonochromeIcon, type IconName} from './MonochromeIcon';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  disabled?: boolean;
  style?: ViewStyle;
  icon?: IconName;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
  icon,
}: Props) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      android_ripple={{color: 'rgba(0,0,0,0.1)'}}
      style={({pressed}) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'destructive' && styles.destructive,
        variant === 'ghost' && styles.ghost,
        pressed && {opacity: 0.92},
        disabled && {opacity: 0.5},
        style,
      ]}>
      {icon ? (
        <MonochromeIcon
          name={icon}
          color={variant === 'primary' || variant === 'destructive' ? '#fff' : Colors.primary}
          size={18}
        />
      ) : null}
      <Text style={[styles.text, variant === 'secondary' && styles.darkText, variant === 'ghost' && styles.ghostText]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
  },
  primary: {backgroundColor: Colors.primary},
  secondary: {
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  destructive: {backgroundColor: Colors.destructive},
  ghost: {backgroundColor: 'transparent'},
  text: {color: '#fff', fontSize: 15, fontWeight: '700'},
  darkText: {color: Colors.text},
  ghostText: {color: Colors.primary},
});
