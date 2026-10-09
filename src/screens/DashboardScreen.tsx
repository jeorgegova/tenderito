import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Badge} from '../components/ui/Badge';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {
  fetchOverdueCredits,
  fetchTotalReceivable,
} from '../services/credits';
import {fetchCustomers} from '../services/customers';
import {Colors, formatCOP} from '../theme';
import {AnimatedMoney} from '../components/ui/AnimatedMoney';

export function DashboardScreen({navigation}: any) {
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

        {/* ── Tarjeta hero — monto total ── */}
        <View style={styles.heroCard}>
          {/* Fondo decorativo */}
          <View style={styles.heroBgCircle1} />
          <View style={styles.heroBgCircle2} />

          <View style={styles.heroTop}>
            <View style={styles.heroTitle}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                <Ionicons name="wallet-outline" size={15} color="rgba(255,255,255,0.85)" />
                <Text style={styles.heroCaption}>PLATA QUE TE DEBEN</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setShowBalance(v => !v)}
              accessibilityLabel={showBalance ? 'Ocultar saldo' : 'Ver saldo'}
              hitSlop={10}>
              <Ionicons
                name={showBalance ? 'eye' : 'eye-off'}
                color="rgba(255,255,255,0.8)"
                size={22}
              />
            </Pressable>
          </View>

          {total.isLoading ? (
            <Text style={styles.heroValue}>Cargando…</Text>
          ) : showBalance ? (
            <AnimatedMoney
              value={Number(total.data ?? 0)}
              style={styles.heroValue}
            />
          ) : (
            <Text style={styles.heroValue}>$ ••••••</Text>
          )}

          <View style={styles.heroBottom}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{debtors.length}</Text>
              <Text style={styles.heroStatLabel}>
                {debtors.length === 1 ? 'te debe' : 'te deben'}
              </Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('Clientes')}
              style={styles.heroBtn}
              hitSlop={8}>
              <Text style={styles.heroBtnText}>Ver clientes →</Text>
            </Pressable>
          </View>
        </View>


        {/* ── Sección: Atrasados ── */}
        <View style={styles.sectionRow}>
          <View>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.destructive} />
              <Text style={styles.sectionTitle}>Atrasados</Text>
            </View>
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
              <Ionicons name="checkmark-circle-outline" size={26} color="#15803D" />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.emptyTitle}>¡Todo al día!</Text>
              <Text style={styles.muted}>Nadie está atrasado.</Text>
            </View>
          </Card>
        ) : (
          (overdue.data ?? []).slice(0, 3).map(item => (
            <Pressable
              key={item.id}
              onPress={() =>
                navigation.navigate('CustomerDetail', {id: item.customer_id})
              }>
              <Card style={styles.alertRow}>
                <View style={styles.alertIcon}>
                  <Ionicons name="warning-outline" size={20} color={Colors.destructive} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.customerName}>
                    {item.customers?.name ?? 'Cliente'}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {item.concept} · venció el {item.due_date}
                  </Text>
                </View>
                <Text style={styles.alertAmount}>
                  {formatCOP(Number(item.amount))}
                </Text>
              </Card>
            </Pressable>
          ))
        )}

        {/* ── Sección: Mayores deudas ── */}
        <View style={styles.sectionRow}>
          <View>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              <Ionicons name="trending-up-outline" size={18} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Deben más</Text>
            </View>
            <Text style={styles.sectionHint}>Los montos más altos</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Clientes')} hitSlop={8}>
            <Text style={styles.sectionLink}>Ver todos</Text>
          </Pressable>
        </View>

        {[...debtors]
          .sort((a, b) => Number(b.current_balance) - Number(a.current_balance))
          .slice(0, 5)
          .map(customer => (
            <Pressable
              key={customer.id}
              onPress={() =>
                navigation.navigate('CustomerDetail', {id: customer.id})
              }>
              <Card style={styles.debtorRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(customer.alias || customer.name).charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {customer.alias || customer.name}
                  </Text>
                  <Text style={styles.muted}>{customer.phone || 'Sin teléfono'}</Text>
                </View>
                <View style={styles.balanceWrap}>
                  <Text style={styles.balance}>
                    {formatCOP(Number(customer.current_balance))}
                  </Text>
                  <Badge status="pending" />
                </View>
              </Card>
            </Pressable>
          ))}

        {!customers.isLoading && debtors.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkmark-done-outline" size={24} color={Colors.primary} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.emptyTitle}>Sin deudas activas</Text>
              <Text style={styles.muted}>
                Aquí verás quién te debe más cuando fíes.
              </Text>
            </View>
          </Card>
        ) : null}

        <View style={{height: 24}} />
      </ScrollView>

      {/* ── FAB — nuevo fiado ── */}
      <Pressable
        onPress={() => navigation.navigate('NewCredit')}
        accessibilityLabel="Nuevo fiado"
        style={({pressed}) => [styles.fab, pressed && {opacity: 0.88, transform: [{scale: 0.95}]}]}>
        <Text style={styles.fabPlus}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  content: {paddingHorizontal: 20, paddingTop: 16, paddingBottom: 96, gap: 12},

  // ── Hero ──
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    padding: 22,
    overflow: 'hidden',
    // Sombra naranja profunda
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 10,
  },
  heroBgCircle1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -60,
    right: -40,
  },
  heroBgCircle2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -30,
    left: 20,
  },
  heroTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  heroTitle: {},
  heroCaption: {color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', letterSpacing: 0.5},
  heroValue: {
    color: '#fff',
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '900',
    marginTop: 10,
    letterSpacing: -1,
  },
  heroBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  heroStat: {flexDirection: 'row', alignItems: 'baseline', gap: 4},
  heroStatNum: {color: '#fff', fontSize: 22, fontWeight: '900'},
  heroStatLabel: {color: 'rgba(255,255,255,0.75)', fontSize: 13},
  heroBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  heroBtnText: {color: '#fff', fontSize: 13, fontWeight: '700'},


  // ── Sección headers ──
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: -2,
  },
  sectionTitle: {fontSize: 18, fontWeight: '800', color: Colors.text},
  sectionHint: {fontSize: 12, color: Colors.textSecondary, marginTop: 1},
  sectionLink: {fontSize: 13, fontWeight: '700', color: Colors.primary},

  // ── Cards de alertas ──
  alertRow: {flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13},
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.destructiveAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerName: {fontSize: 14, color: Colors.text, fontWeight: '700'},
  alertAmount: {fontSize: 13, color: Colors.destructive, fontWeight: '800'},

  // ── Cards de deudores ──
  debtorRow: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {color: Colors.primary, fontSize: 18, fontWeight: '800'},
  balanceWrap: {alignItems: 'flex-end', gap: 4},
  balance: {fontSize: 14, color: Colors.destructive, fontWeight: '800'},

  // ── Empty ──
  emptyCard: {flexDirection: 'row', alignItems: 'center', gap: 12},
  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.successAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: {fontSize: 22},
  emptyTitle: {fontSize: 14, color: Colors.text, fontWeight: '700'},
  muted: {fontSize: 12, color: Colors.textSecondary},

  // ── FAB ──
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabPlus: {color: '#fff', fontSize: 34, fontWeight: '300', lineHeight: 36},
});
