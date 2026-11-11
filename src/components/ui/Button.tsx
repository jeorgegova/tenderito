import {Pressable, StyleSheet, Text, type StyleProp, type ViewStyle} from 'react-native';
import {Colors, Radius} from '../../theme';
import {MonochromeIcon, type IconName} from './MonochromeIcon';
import {useResponsive} from '../../hooks/useResponsive';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: IconName;
  leftElement?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
  icon,
  leftElement,
}: Props) {
  const {isSmall} = useResponsive();
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
        isSmall && styles.baseSmall,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'destructive' && styles.destructive,
        variant === 'ghost' && styles.ghost,
        pressed && {opacity: 0.88, transform: [{scale: 0.985}]},
        disabled && {opacity: 0.45},
        style,
      ]}>
      {leftElement ? (
        leftElement
      ) : icon ? (
        <MonochromeIcon name={icon} color={iconColor} size={isSmall ? 16 : 18} />
      ) : null}
      <Text
        style={[
          styles.text,
          isSmall && styles.textSmall,
          variant === 'secondary' && styles.darkText,
          variant === 'ghost' && styles.ghostText,
          variant === 'destructive' && styles.text,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
  },
  baseSmall: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    minHeight: 44,
    gap: 6,
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
  text: {color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'center'},
  textSmall: {fontSize: 13.5},
  darkText: {color: Colors.primary, fontWeight: '700'},
  ghostText: {color: Colors.primary, fontWeight: '700'},
});
