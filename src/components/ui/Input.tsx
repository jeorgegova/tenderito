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
        {leadingIcon ? <MonochromeIcon name={leadingIcon} color={Colors.textSecondary} size={18} /> : null}
        <TextInput
          placeholderTextColor={Colors.textSecondary}
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
  label: {fontSize: 13, fontWeight: '600', color: Colors.textSecondary},
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    minHeight: 48,
    paddingVertical: 2,
    paddingHorizontal: 14,
  },
  invalid: {borderColor: Colors.destructive},
  input: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 0,
    fontSize: 16,
    color: Colors.text,
  },
  error: {fontSize: 12, color: Colors.destructive},
});
