import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Colors, Radius } from '../../theme';
import { FormatMoney } from '../../utils/format';

export interface FastMoneyInputProps {
  label?: string;
  value?: string | number;
  onChangeAmount?: (numericValue: number, formatted: string) => void;
  onChangeText?: (formatted: string) => void;
  error?: string;
  leadingIcon?: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const FastMoneyInput = forwardRef<TextInput, FastMoneyInputProps>(
  function FastMoneyInput(
    {
      label,
      value,
      onChangeAmount,
      onChangeText,
      error,
      leadingIcon = 'cash-outline',
      placeholder = '$ 0',
      onFocus,
      onBlur,
    },
    ref,
  ) {
    const internalInputRef = useRef<TextInput>(null);
    useImperativeHandle(ref, () => internalInputRef.current as TextInput);

    const formatInitial = (val?: string | number): string => {
      if (!val || val === '0' || val === 0) return '';
      return FormatMoney(val);
    };

    const [text, setText] = useState<string>(() => formatInitial(value));
    const [isFocused, setIsFocused] = useState(false);
    const isInternalChangeRef = useRef(false);
    const lastEmittedRef = useRef<string>(text);

    // Sincronizar únicamente cuando el valor cambia DESDE EL EXTERIOR
    // (ej. chips de suma rápida, pagar todo, reset de formulario)
    useEffect(() => {
      if (isInternalChangeRef.current) {
        isInternalChangeRef.current = false;
        return;
      }
      const formatted = formatInitial(value);
      if (formatted !== lastEmittedRef.current) {
        lastEmittedRef.current = formatted;
        setText(formatted);
      }
    }, [value]);

    const handleChangeText = (incoming: string) => {
      isInternalChangeRef.current = true;
      const digitsOnly = incoming.replace(/[^0-9]/g, '');

      if (!digitsOnly || digitsOnly === '0') {
        lastEmittedRef.current = '';
        setText('');
        onChangeText?.('');
        onChangeAmount?.(0, '');
        return;
      }

      const numeric = parseInt(digitsOnly, 10);
      const formatted = FormatMoney(digitsOnly);

      lastEmittedRef.current = formatted;
      setText(formatted);
      onChangeText?.(formatted);
      onChangeAmount?.(numeric, formatted);
    };

    const handleClear = () => {
      isInternalChangeRef.current = false;
      lastEmittedRef.current = '';
      setText('');
      onChangeText?.('');
      onChangeAmount?.(0, '');
    };

    const hasContent = Boolean(text && text.trim().length > 0);

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
            isFocused && styles.fieldFocused,
            error ? styles.invalid : null,
          ]}>
          {leadingIcon ? (
            <Ionicons
              name={leadingIcon as any}
              size={19}
              color={isFocused ? Colors.primary : Colors.textMuted}
              style={styles.leadingIcon}
            />
          ) : null}
          <TextInput
            ref={internalInputRef}
            value={text}
            onChangeText={handleChangeText}
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            placeholder={placeholder}
            placeholderTextColor={Colors.textMuted}
            style={[styles.input, Boolean(leadingIcon) ? { paddingLeft: 0 } : null]}
            onFocus={() => {
              setIsFocused(true);
              onFocus?.();
            }}
            onBlur={() => {
              setIsFocused(false);
              onBlur?.();
            }}
            underlineColorAndroid="transparent"
            autoCorrect={false}
            contextMenuHidden={false}
          />
          {hasContent && (
            <Pressable
              onPress={handleClear}
              hitSlop={12}
              style={styles.trailingBtn}
              accessibilityRole="button"
              accessibilityLabel="Borrar valor">
              <Ionicons
                name="close-circle"
                size={18}
                color={Colors.textSecondary}
              />
            </Pressable>
          )}
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { gap: 6 },
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  fieldFocused: {
    borderColor: Colors.primaryMid,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  leadingIcon: {
    marginRight: 2,
  },
  trailingBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  invalid: { borderColor: Colors.destructive, borderWidth: 1.5 },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  error: { fontSize: 12, color: Colors.destructive, fontWeight: '600' },
});
