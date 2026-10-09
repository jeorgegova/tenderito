import {StyleSheet, Text, TextInput, View, type TextInputProps} from 'react-native';
import {Colors, Radius} from '../../theme';
import {MonochromeIcon} from './MonochromeIcon';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  leadingIcon?: 'search';
}

export function Input({label, error, leadingIcon, ...rest}: Props) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.field, error ? styles.invalid : null]}>
        {leadingIcon ? (
          <MonochromeIcon name={leadingIcon} color={Colors.textMuted} size={18} />
        ) : null}
        <TextInput
          placeholderTextColor={Colors.textMuted}
          style={styles.input}
          {...rest}
        />
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    minHeight: 52,
    paddingVertical: 2,
    paddingHorizontal: 14,
    // Sombra sutil para elevar los campos
    shadowColor: '#7C5230',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  invalid: {borderColor: Colors.destructive, borderWidth: 1.5},
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  error: {fontSize: 12, color: Colors.destructive, fontWeight: '600'},
});
