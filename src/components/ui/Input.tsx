import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { Colors, Radius } from "../../theme";

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, ...rest }: Props) {
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={Colors.textSecondary}
        style={[styles.input, error ? { borderColor: Colors.destructive } : null]}
        {...rest}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: "600", color: Colors.text },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Colors.text,
  },
  error: { fontSize: 12, color: Colors.destructive },
});
