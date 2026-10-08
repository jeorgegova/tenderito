import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@rneui/base';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Header } from '../components/ui/Header';
import { MonochromeIcon } from '../components/ui/MonochromeIcon';
import {
  fetchOverdueCredits,
  fetchTotalReceivable,
} from '../services/credits';
import { fetchCustomers } from '../services/customers';
import { Colors, formatCOP } from '../theme';

export function DashboardScreen({ navigation }: any) {
  const [showBalance, setShowBalance] = useState(true);
  const total = useQuery({
    queryKey: ['total-receivable'],
    queryFn: fetchTotalReceivable,
  });
  const overdue = useQuery({
    queryKey: ['overdue'],
    queryFn: fetchOverdueCredits,
  });
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: () => fetchCustomers(),
  });
  const debtors = (customers.data ?? []).filter(
    customer => Number(customer.current_balance) > 0,
  );

  return (
    <View style={styles.wrap}>
      <Header title="Inicio" subtitle="Tu plata, fácil y claro" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitle}>
              <View style={styles.heroIcon}>
                <MonochromeIcon name="wallet" color="#fff" size={20} />
              </View>
              <Text style={styles.heroCaption}>PLATA QUE TE DEBEN</Text>
            </View>
            <Pressable
              onPress={() => setShowBalance(v => !v)}
              accessibilityLabel={showBalance ? 'Ocultar saldo' : 'Ver saldo'}
              hitSlop={8}>
              <Icon
                type="ionicon"
                name={showBalance ? 'eye' : 'eye-off'}
                color="#fff"
                size={22}
              />
            </Pressable>
          </View>
          <Text style={styles.heroValue}>
            {total.isLoading
              ? 'Cargando…'
              : showBalance
                ? formatCOP(Number(total.data ?? 0))
                : '$ ••••••'}
          </Text>
          <View style={styles.heroBottom}>
            <Text style={styles.heroFoot}>
              {debtors.length === 0
                ? 'Nadie te debe'
                : debtors.length === 1
                  ? '1 persona te debe'
                  : `${debtors.length} personas te deben`}
            </Text>
            <Pressable
              onPress={() => navigation.navigate('Clientes')}
              hitSlop={8}>
              <Text style={styles.heroLink}>Ver clientes ›</Text>
            </Pressable>
          </View>
        </Card>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Atrasados</Text>
            <Text style={styles.sectionHint}>Pasaron su fecha de pago</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Alertas')} hitSlop={8}>
            <Text style={styles.sectionLink}>Ver todo</Text>
          </Pressable>
        </View>
        {overdue.isLoading ? (
          <Card><Text style={styles.muted}>Cargando…</Text></Card>
        ) : (overdue.data ?? []).length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <MonochromeIcon name="check" color={Colors.success} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emptyTitle}>Todo al día</Text>
              <Text style={styles.muted}>Nadie está atrasado.</Text>
            </View>
          </Card>
        ) : (
          (overdue.data ?? []).slice(0, 3).map(item => (
            <Pressable
              key={item.id}
              onPress={() => navigation.navigate('CustomerDetail', { id: item.customer_id })}>
              <Card style={styles.alertRow}>
                <View style={styles.alertIcon}>
                  <MonochromeIcon name="clock" color={Colors.destructive} size={19} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>{item.customers?.name ?? 'Cliente'}</Text>
                  <Text style={styles.muted} numberOfLines={1}>{item.concept} · se pasó el {item.due_date}</Text>
                </View>
                <Text style={styles.alertAmount}>{formatCOP(Number(item.amount))}</Text>
              </Card>
            </Pressable>
          ))
        )}

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Deben más</Text>
            <Text style={styles.sectionHint}>Los montos más altos</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Clientes')} hitSlop={8}>
            <Text style={styles.sectionLink}>Ver todos</Text>
          </Pressable>
        </View>
        {[...debtors]
          .sort(
            (a, b) => Number(b.current_balance) - Number(a.current_balance),
          )
          .slice(0, 5)
          .map(customer => (
            <Pressable
              key={customer.id}
              onPress={() => navigation.navigate('CustomerDetail', { id: customer.id })}>
              <Card style={styles.debtorRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(customer.alias || customer.name).charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName} numberOfLines={1}>{customer.alias || customer.name}</Text>
                  <Text style={styles.muted}>{customer.phone || 'Sin teléfono'}</Text>
                </View>
                <View style={styles.balanceWrap}>
                  <Text style={styles.balance}>{formatCOP(Number(customer.current_balance))}</Text>
                  <Badge status="pending" />
                </View>
              </Card>
            </Pressable>
          ))}
        {!customers.isLoading && debtors.length === 0 ? (
          <Card><Text style={styles.muted}>Aquí verás quién te debe más cuando fies.</Text></Card>
        ) : null}
      </ScrollView>
      <Pressable
        onPress={() => navigation.navigate('NewCredit')}
        accessibilityLabel="Nuevo fiado"
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
        <Text style={styles.fabPlus}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 96, gap: 12 },
  hero: { backgroundColor: Colors.primary, borderColor: Colors.primary, padding: 20, borderRadius: 24 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  heroTitle: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  heroIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroCaption: { color: '#FFEAD6', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  heroValue: { color: '#fff', fontSize: 34, lineHeight: 42, fontWeight: '800', marginTop: 12, letterSpacing: -0.6 },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  heroFoot: { color: '#FFEAD6', fontSize: 13 },
  heroLink: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 1 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: Colors.text, letterSpacing: -0.25 },
  sectionHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  sectionLink: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPlus: { color: '#fff', fontSize: 32, fontWeight: '400', lineHeight: 34 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: '#EAF7EE', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 14, color: Colors.text, fontWeight: '700' },
  muted: { fontSize: 12, color: Colors.textSecondary },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
  alertIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#FEF0EE', alignItems: 'center', justifyContent: 'center' },
  customerName: { fontSize: 14, color: Colors.text, fontWeight: '700' },
  alertAmount: { fontSize: 13, color: Colors.destructive, fontWeight: '800' },
  debtorRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  avatar: { width: 40, height: 40, borderRadius: 15, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.primary, fontSize: 16, fontWeight: '800' },
  balanceWrap: { alignItems: 'flex-end', gap: 4 },
  balance: { fontSize: 13, color: Colors.destructive, fontWeight: '800' },
});
