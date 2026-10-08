import {StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors} from '../../theme';

export function Header({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, {paddingTop: insets.top + 12}]}>
      <Text style={styles.eyebrow}>TENDERITO</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {paddingHorizontal: 20, paddingBottom: 14, backgroundColor: Colors.background},
  eyebrow: {fontSize: 10, fontWeight: '800', letterSpacing: 1.4, color: Colors.primary, marginBottom: 3},
  title: {fontSize: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.5},
  subtitle: {fontSize: 14, color: Colors.textSecondary, marginTop: 3},
});
