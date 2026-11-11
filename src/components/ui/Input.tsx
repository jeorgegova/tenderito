import {useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Colors, Radius} from '../../theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  leadingIcon?: string;
  trailingIcon?: string;
  onTrailingPress?: () => void;
  pill?: boolean;
}

export function Input({
  label,
  error,
  leadingIcon,
  trailingIcon,
  onTrailingPress,
  pill,
  secureTextEntry,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isPill = pill || leadingIcon === 'search' || leadingIcon === 'search-outline';
  const isPassword = Boolean(secureTextEntry);

  const iconName = leadingIcon === 'search' ? 'search-outline' : leadingIcon;

  return (
    <View style={styles.wrap}>
      {label && (
        <Text style={[styles.label, isFocused && styles.labelFocused]}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.field,
          isPill && styles.pillField,
          isFocused && styles.fieldFocused,
          error ? styles.invalid : null,
        ]}>
        {iconName ? (
          <Ionicons
            name={iconName as any}
            size={19}
            color={isFocused ? Colors.primary : Colors.textMuted}
            style={styles.leadingIcon}
          />
        ) : null}
        <TextInput
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, Boolean(iconName) ? {paddingLeft: 0} : null]}
          secureTextEntry={isPassword ? !showPassword : false}
          onFocus={e => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {trailingIcon ? (
          <Pressable
            onPress={onTrailingPress}
            hitSlop={10}
            style={styles.trailingBtn}
            accessibilityRole="button">
            <Ionicons
              name={trailingIcon as any}
              size={18}
              color={Colors.textSecondary}
            />
          </Pressable>
        ) : null}
        {isPassword ? (
          <Pressable
            onPress={() => setShowPassword(prev => !prev)}
            hitSlop={12}
            style={styles.eyeBtn}
            accessibilityRole="button"
            accessibilityLabel={
              showPassword ? 'Ocultar contraseña' : 'Ver contraseña'
            }>
            <Ionicons
              name={showPassword ? 'eye' : 'eye-off'}
              size={22}
              color="grey"
            />
          </Pressable>
        ) : null}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 6},
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.1,
  },
  labelFocused: {
    color: Colors.primaryDark,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    minHeight: 50,
    paddingVertical: 2,
    paddingHorizontal: 16,
    shadowColor: '#142033',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  fieldFocused: {
    borderColor: Colors.primaryMid,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  pillField: {
    borderRadius: 24,
    minHeight: 50,
    paddingHorizontal: 16,
    borderColor: '#E8EDF3',
  },
  leadingIcon: {
    marginRight: 2,
  },
  trailingBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  invalid: {borderColor: Colors.destructive, borderWidth: 1.5},
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {fontSize: 12, color: Colors.destructive, fontWeight: '600'},
});
