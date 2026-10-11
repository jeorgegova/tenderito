import Ionicons from '@react-native-vector-icons/ionicons';
import { StyleSheet, Text, View } from "react-native";
import { Colors, Radius } from "../../theme";
import type { CreditStatus } from "../../types";

const map: Record<CreditStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: "Pendiente", bg: "#FFF3E8", fg: Colors.primary },
  partially_paid: { label: "Parcial", bg: "#FEF3C7", fg: "#B45309" },
  paid: { label: "Pagado", bg: "#DCFCE7", fg: "#15803D" },
};

export function Badge({ status }: { status: CreditStatus }) {
  const s = map[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

export function OverdueBadge({ text }: { text: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: "#FEE2E2" }]}>
      <Text style={[styles.text, { color: Colors.destructive }]}>{text}</Text>
    </View>
  );
}

export function SyncBadge({ estadoServidor }: { estadoServidor?: string }) {
  if (estadoServidor !== 'pendiente') return null;
  return (
    <View style={[styles.badge, styles.syncBadge]}>
      <Ionicons name="time-outline" size={11} color="#B45309" />
      <Text style={styles.syncText}>Pendiente</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: Radius.full, paddingVertical: 4, paddingHorizontal: 10 },
  text: { fontSize: 12, fontWeight: "700" },
  syncBadge: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 2,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  syncText: { fontSize: 11, fontWeight: '700', color: '#B45309' },
});
