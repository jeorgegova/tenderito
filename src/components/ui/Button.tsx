import {Pressable, StyleSheet, Text, type ViewStyle} from 'react-native';
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
  const iconColor =
    variant === 'primary' || variant === 'destructive'
      ? '#fff'
      : variant === 'ghost'
      ? Colors.primary
      : Colors.primary;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      android_ripple={{color: 'rgba(0,0,0,0.08)'}}
      style={({pressed}) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'destructive' && styles.destructive,
        variant === 'ghost' && styles.ghost,
        pressed && {opacity: 0.88, transform: [{scale: 0.985}]},
        disabled && {opacity: 0.45},
        style,
      ]}>
      {icon ? (
        <MonochromeIcon name={icon} color={iconColor} size={18} />
      ) : null}
      <Text
        style={[
          styles.text,
          variant === 'secondary' && styles.darkText,
          variant === 'ghost' && styles.ghostText,
          variant === 'destructive' && styles.text,
        ]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 50,
  },
  primary: {
    backgroundColor: Colors.primary,
    // Sombra naranja suave para dar elevación al CTA
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  secondary: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1.5,
    borderColor: Colors.primaryMid,
  },
  destructive: {
    backgroundColor: Colors.destructive,
    shadowColor: Colors.destructive,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  ghost: {backgroundColor: 'transparent'},
  text: {color: '#fff', fontSize: 15, fontWeight: '700'},
  darkText: {color: Colors.primary, fontWeight: '700'},
  ghostText: {color: Colors.primary, fontWeight: '700'},
});
