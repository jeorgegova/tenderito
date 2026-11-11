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

export function SyncBadge({
  estadoServidor,
  compact = false,
}: {
  estadoServidor?: string;
  compact?: boolean;
}) {
  if (!estadoServidor) return null;
  const s = estadoServidor.toLowerCase();
  if (s === 'synced' || s === 'sincronizado') return null;

  const isSyncing = s === 'syncing';
  const isError = s === 'error';

  const label = isSyncing ? 'Subiendo' : isError ? 'Error' : 'Pendiente';
  const iconName = isSyncing
    ? 'sync-outline'
    : isError
    ? 'alert-circle-outline'
    : 'cloud-offline-outline';

  const color = isSyncing ? '#2563EB' : isError ? '#DC2626' : '#B45309';
  const bg = isSyncing ? '#EFF6FF' : isError ? '#FEE2E2' : '#FEF3C7';

  if (compact) {
    return (
      <View
        style={[styles.syncBadgeCompact, { backgroundColor: bg }]}
        accessibilityLabel={`Estado de sincronización: ${label}`}>
        <Ionicons name={iconName} size={11} color={color} />
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.syncBadge, { backgroundColor: bg }]}>
      <Ionicons name={iconName} size={11} color={color} />
      <Text style={[styles.syncText, { color }]}>{label}</Text>
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
    alignSelf: 'flex-start',
  },
  syncBadgeCompact: {
    borderRadius: Radius.full,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncText: { fontSize: 10, fontWeight: '700', color: '#B45309' },
});
