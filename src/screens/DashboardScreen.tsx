import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {fetchOverdueCredits, fetchTotalReceivable} from '../services/credits';
import {fetchCustomers} from '../services/customers';
import {Colors, formatCOP} from '../theme';
import {AnimatedMoney} from '../components/ui/AnimatedMoney';
import {useStore} from '../store/useStore';
import {calculateSubscriptionStatus} from '../services/plans';
import {showAlert} from '../components/ui/AlertModal';

export function DashboardScreen({navigation}: any) {
  const [showBalance, setShowBalance] = useState(true);
  const profile = useStore(s => s.profile);
  const subStatus = calculateSubscriptionStatus(profile);

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

  const totalAmount = Number(total.data ?? 0);
  const hasAutoRefetchedRef = React.useRef(false);
  const hasShownExpirationAlertRef = React.useRef(false);

  useEffect(() => {
    // Si la tienda tiene plata pendiente pero la lista de clientes aún no la refleja,
    // forzar recarga una sola vez para garantizar que aparezcan de inmediato
    if (
      totalAmount > 0 &&
      !customers.isLoading &&
      debtors.length === 0 &&
      !hasAutoRefetchedRef.current
    ) {
      hasAutoRefetchedRef.current = true;
      customers.refetch();
      overdue.refetch();
    }
  }, [totalAmount, customers.isLoading, debtors.length]);

  useEffect(() => {
    if (subStatus.expiresToday && !hasShownExpirationAlertRef.current) {
      hasShownExpirationAlertRef.current = true;
      showAlert({
        title: '¡Hoy vence tu suscripción!',
        message:
          'Tu suscripción vence el día de hoy. Renueva ahora mismo por WhatsApp para continuar con todas las funciones de tu tienda sin interrupciones.',
        type: 'warning',
        buttons: [
          {text: 'Más tarde', style: 'cancel'},
          {
            text: 'Renovar ahora',
            style: 'default',
            onPress: () => navigation.navigate('Perfil'),
          },
        ],
      });
    }
  }, [subStatus.expiresToday, navigation]);

  return (
    <View style={styles.wrap}>
      <Header title="Inicio" subtitle="Tu plata, fácil y claro" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* Banner de vencimiento el día de hoy */}
        {subStatus.expiresToday && (
          <Pressable
            onPress={() => navigation.navigate('Perfil')}
            style={styles.toastBannerAlert}>
            <View style={styles.toastBannerIconAlert}>
              <Ionicons name="alert-circle" size={22} color="#DC2626" />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.toastBannerTitleAlert}>
                Hoy vence tu suscripción
              </Text>
              <Text style={styles.toastBannerSubtitle}>
                Toca aquí para renovar tu plan por WhatsApp
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#DC2626" />
          </Pressable>
        )}

        {/* Banner de periodo de gracia */}
        {subStatus.inGracePeriod && !subStatus.expiresToday && (
          <Pressable
            onPress={() => navigation.navigate('Perfil')}
            style={styles.toastBannerWarning}>
            <View style={styles.toastBannerIconWarning}>
              <Ionicons name="time" size={22} color="#D97706" />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.toastBannerTitleWarning}>
                Suscripción vencida ({Math.max(0, 10 - subStatus.daysSinceExpiration)} días de gracia restantes)
              </Text>
              <Text style={styles.toastBannerSubtitle}>
                Toca para renovar antes de pasar al plan Free
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#D97706" />
          </Pressable>
        )}

        {/* ── Tarjeta hero — monto total ── */}
        <View style={styles.heroCard}>
          {/* Fondo decorativo */}
          <View style={styles.heroBgCircle1} />
          <View style={styles.heroBgCircle2} />

          <View style={styles.heroTop}>
            <View style={styles.heroHeaderTitle}>
              <Ionicons
                name="wallet-outline"
                size={16}
                color="rgba(255,255,255,0.9)"
              />
              <Text style={styles.heroCaption}>PLATA QUE TE DEBEN</Text>
            </View>
            <Pressable
              onPress={() => setShowBalance(v => !v)}
              accessibilityLabel={showBalance ? 'Ocultar saldo' : 'Ver saldo'}
              hitSlop={10}>
              <Ionicons
                name={showBalance ? 'eye' : 'eye-off'}
                color="rgba(255,255,255,0.85)"
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
                {debtors.length === 1 ? 'cliente te debe' : 'clientes te deben'}
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
            <View style={styles.sectionHeaderTitle}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={Colors.destructive}
              />
              <Text style={styles.sectionTitle}>Atrasados</Text>
            </View>
            <Text style={styles.sectionHint}>
              Pasaron su fecha de pago acordada
            </Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Alertas')} hitSlop={8}>
            <Text style={styles.sectionLink}>Ver todo</Text>
          </Pressable>
        </View>

        {overdue.isLoading ? (
          <Card style={styles.loadingCard}>
            <ActivityIndicator size="small" color={Colors.destructive} />
            <Text style={styles.loadingText}>Cargando cuentas atrasadas…</Text>
          </Card>
        ) : (overdue.data ?? []).length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="checkmark-circle-outline"
                size={26}
                color="#15803D"
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.emptyTitle}>¡Todo al día!</Text>
              <Text style={styles.muted}>
                Nadie está atrasado en sus pagos.
              </Text>
            </View>
          </Card>
        ) : (
          (overdue.data ?? []).slice(0, 3).map(item => {
            const cust = item.customers;
            const displayName = cust?.alias || cust?.name || 'Cliente';
            const realName = cust?.alias ? cust?.name : null;

            return (
              <Pressable
                key={item.id}
                onPress={() =>
                  navigation.navigate('CustomerDetail', {id: item.customer_id})
                }>
                <Card style={styles.alertRow}>
                  <View style={styles.alertIcon}>
                    <Ionicons
                      name="warning-outline"
                      size={20}
                      color={Colors.destructive}
                    />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    {realName ? (
                      <Text style={styles.customerRealName} numberOfLines={1}>
                        {realName}
                      </Text>
                    ) : null}
                    <Text style={styles.muted} numberOfLines={1}>
                      {item.concept} · venció el {item.due_date}
                    </Text>
                    {cust?.phone ? (
                      <Text style={styles.muted}>📞 {cust.phone}</Text>
                    ) : null}
                    <Text style={styles.touchHint}>
                      Toca para ver su libreta →
                    </Text>
                  </View>
                  <View style={styles.alertAmountWrap}>
                    <Text style={styles.alertAmountLabel}>Debe</Text>
                    <Text style={styles.alertAmount}>
                      {formatCOP(Number(item.amount))}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}

        {/* ── Sección: Mayores deudas ── */}
        <View style={styles.sectionRow}>
          <View>
            <View style={styles.sectionHeaderTitle}>
              <Ionicons
                name="trending-up-outline"
                size={18}
                color={Colors.primary}
              />
              <Text style={styles.sectionTitle}>Deben más</Text>
            </View>
            <Text style={styles.sectionHint}>
              Clientes con los montos pendientes más altos
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Clientes')}
            hitSlop={8}>
            <Text style={styles.sectionLink}>Ver todos</Text>
          </Pressable>
        </View>

        {customers.isLoading ? (
          <Card style={styles.loadingCard}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>
              Cargando clientes que deben más…
            </Text>
          </Card>
        ) : debtors.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyDebtorsIcon}>
              <Ionicons
                name="checkmark-done-outline"
                size={24}
                color={Colors.primary}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.emptyTitle}>Sin deudas activas</Text>
              <Text style={styles.muted}>
                Aquí verás quién te debe más cuando registres un fiado.
              </Text>
            </View>
          </Card>
        ) : (
          [...debtors]
            .sort(
              (a, b) => Number(b.current_balance) - Number(a.current_balance),
            )
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
                      {(customer.alias || customer.name)
                        .charAt(0)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {customer.alias || customer.name}
                    </Text>
                    {customer.alias ? (
                      <Text style={styles.customerRealName} numberOfLines={1}>
                        {customer.name}
                      </Text>
                    ) : null}
                    <Text style={styles.muted}>
                      {customer.phone ? `📞 ${customer.phone}` : 'Sin teléfono'}
                    </Text>
                    <Text style={styles.touchHint}>
                      Toca para ver libreta →
                    </Text>
                  </View>
                  <View style={styles.balanceWrap}>
                    <Text style={styles.balanceLabel}>Te debe</Text>
                    <Text style={styles.balance}>
                      {formatCOP(Number(customer.current_balance))}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={Colors.textMuted}
                  />
                </Card>
              </Pressable>
            ))
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ── Botón flotante amigable: + Nuevo fiado ── */}
      <Pressable
        onPress={() => navigation.navigate('NewCredit')}
        accessibilityLabel="Nuevo fiado"
        style={({pressed}) => [styles.fab, pressed && styles.fabPressed]}>
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text style={styles.fabText}>Nuevo fiado</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  content: {paddingHorizontal: 20, paddingTop: 16, paddingBottom: 96, gap: 12},
  flex1: {flex: 1},

  // ── Hero ──
  heroCard: {
    backgroundColor: '#EB782C',
    borderRadius: 24,
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#C25514',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  heroBgCircle1: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.1)',
    top: -60,
    right: -40,
  },
  heroBgCircle2: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -30,
    left: 15,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  heroCaption: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroValue: {
    color: '#FFFFFF',
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
  heroStat: {flexDirection: 'row', alignItems: 'baseline', gap: 5},
  heroStatNum: {color: '#FFFFFF', fontSize: 22, fontWeight: '900'},
  heroStatLabel: {color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500'},
  heroBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  heroBtnText: {color: '#FFFFFF', fontSize: 13, fontWeight: '700'},

  // ── Sección headers ──
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: -2,
  },
  sectionHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  customerName: {fontSize: 15, color: Colors.text, fontWeight: '700'},
  customerRealName: {fontSize: 12, color: Colors.textSecondary},
  alertAmountWrap: {alignItems: 'flex-end'},
  alertAmountLabel: {
    fontSize: 11,
    color: Colors.destructive,
    fontWeight: '600',
  },
  alertAmount: {fontSize: 14, color: Colors.destructive, fontWeight: '800'},

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
  balanceWrap: {alignItems: 'flex-end', gap: 2},
  balanceLabel: {fontSize: 11, color: Colors.textSecondary, fontWeight: '600'},
  balance: {fontSize: 15, color: Colors.destructive, fontWeight: '800'},
  touchHint: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '700',
    marginTop: 3,
  },

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
  emptyDebtorsIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {fontSize: 14, color: Colors.text, fontWeight: '700'},
  muted: {fontSize: 12, color: Colors.textSecondary},

  // ── Loading ──
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  // ── FAB ──
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 999,
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.88,
    transform: [{scale: 0.96}],
  },
  fabText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  bottomSpacer: {
    height: 24,
  },
  toastBannerAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    marginBottom: 4,
  },
  toastBannerIconAlert: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastBannerTitleAlert: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DC2626',
  },
  toastBannerWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    marginBottom: 4,
  },
  toastBannerIconWarning: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastBannerTitleWarning: {
    fontSize: 14,
    fontWeight: '800',
    color: '#D97706',
  },
  toastBannerSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
