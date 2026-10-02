import {Pressable, StyleSheet, Text, type ViewStyle} from 'react-native';
import {Colors, Radius} from '../../theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
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
        pressed && {opacity: 0.85},
        disabled && {opacity: 0.5},
        style,
      ]}>
      <Text
        style={[
          styles.text,
          variant === 'secondary' && {color: Colors.text},
          variant === 'ghost' && {color: Colors.primary},
        ]}>
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
  },
  primary: {backgroundColor: Colors.primary},
  secondary: {
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  destructive: {backgroundColor: Colors.destructive},
  ghost: {backgroundColor: 'transparent'},
  text: {color: '#fff', fontSize: 16, fontWeight: '600'},
});
