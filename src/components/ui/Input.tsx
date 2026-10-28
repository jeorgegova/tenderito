import {StyleSheet, Text, TextInput, View, type TextInputProps} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Colors, Radius} from '../../theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  leadingIcon?: 'search';
  pill?: boolean;
}

export function Input({label, error, leadingIcon, pill, ...rest}: Props) {
  const isPill = pill || leadingIcon === 'search';
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.field,
          isPill && styles.pillField,
          error ? styles.invalid : null,
        ]}>
        {leadingIcon === 'search' ? (
          <Ionicons
            name="search-outline"
            size={19}
            color={Colors.textMuted}
            style={styles.leadingIcon}
          />
        ) : null}
        <TextInput
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, leadingIcon && {paddingLeft: 0}]}
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
  pillField: {
    borderRadius: 24,
    minHeight: 50,
    paddingHorizontal: 16,
    borderColor: '#E8EDF3',
  },
  leadingIcon: {
    marginRight: 2,
  },
  invalid: {borderColor: Colors.destructive, borderWidth: 1.5},
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  error: {fontSize: 12, color: Colors.destructive, fontWeight: '600'},
});
