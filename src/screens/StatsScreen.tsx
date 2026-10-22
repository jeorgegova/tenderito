import {useQuery} from '@tanstack/react-query';
import {useCallback, useMemo, useState} from 'react';
import {
  BackHandler,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {MonochromeIcon} from '../components/ui/MonochromeIcon';
import {fetchCustomers} from '../services/customers';
import {fetchStats, type StatsFilters} from '../services/stats';
import {Colors, formatCOP} from '../theme';

// ──────────────── Helpers ────────────────

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DATE_PRESETS = [
  {label: 'Hoy', from: today(), to: today()},
  {label: 'Últ. 7 días', from: daysAgo(7), to: today()},
  {label: 'Últ. 30 días', from: daysAgo(30), to: today()},
  {label: 'Este mes', from: today().slice(0, 7) + '-01', to: today()},
  {label: 'Todo', from: undefined, to: undefined},
] as const;

// ──────────────── Main screen ────────────────

export function StatsScreen({navigation}: any) {
  const insets = useSafeAreaInsets();

  // Filtros activos
  const [preset, setPreset] = useState<number>(2); // default "Últ. 30 días"
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  // Botón físico "Atrás" en Estadísticas: cierra el selector de clientes o vuelve a Inicio
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showCustomerPicker) {
          setShowCustomerPicker(false);
          return true;
        }
        navigation.navigate('Inicio');
        return true;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress,
      );
      return () => subscription.remove();
    }, [showCustomerPicker, navigation]),
  );

  const activePreset = DATE_PRESETS[preset];
  const filters: StatsFilters = {
    from: activePreset.from,
    to: activePreset.to,
    customerIds: selectedIds.length > 0 ? selectedIds : undefined,
  };

  const {data: allCustomers = []} = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => fetchCustomers(),
  });

  const {data: stats, isLoading, refetch} = useQuery({
    queryKey: ['stats', filters.from, filters.to, selectedIds],
    queryFn: () => fetchStats(filters),
  });

  const maxVal = useMemo(
    () =>
      Math.max(
        ...(stats?.rows.map(r => Math.max(r.total_credits, r.total_payments)) ?? [1]),
        1,
      ),
    [stats],
  );

  function toggleCustomer(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id],
    );
  }

  const selectedNames = allCustomers
    .filter(c => selectedIds.includes(c.id))
    .map(c => c.alias || c.name);

  return (
    <View style={s.wrap}>
      <Header title="Estadísticas" subtitle="Deudas, abonos y saldo por cliente" />

      <ScrollView
        contentContainerStyle={[s.content, {paddingBottom: insets.bottom + 24}]}
        showsVerticalScrollIndicator={false}>

        {/* ── Selector de periodo ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.presetRow}>
          {DATE_PRESETS.map((p, i) => (
            <Pressable
              key={p.label}
              onPress={() => setPreset(i)}
              style={[s.presetChip, i === preset && s.presetChipActive]}>
              <Text
                style={[
                  s.presetText,
                  i === preset && s.presetTextActive,
                ]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Selector de clientes ── */}
        <Pressable
          onPress={() => setShowCustomerPicker(true)}
          style={s.customerBtn}>
          <MonochromeIcon name="person" color={Colors.primary} size={16} />
          <Text style={s.customerBtnText} numberOfLines={1}>
            {selectedIds.length === 0
              ? 'Todos los clientes'
              : `${selectedIds.length} cliente${selectedIds.length > 1 ? 's' : ''}: ${selectedNames.slice(0, 2).join(', ')}${selectedNames.length > 2 ? '…' : ''}`}
          </Text>
          <Ionicons name="chevron-down" size={14} color={Colors.primary} />
        </Pressable>

        {/* ── Tarjetas de resumen compactas ── */}
        {isLoading ? (
          <Card>
            <Text style={s.muted}>Calculando estadísticas…</Text>
          </Card>
        ) : (
          <>
            <View style={s.summaryGrid}>
              <View style={[s.summaryCard, s.summaryDebt]}>
                <View style={s.summaryTopRow}>
                  <View style={[s.summaryIconCircle, {backgroundColor: '#FEE2E2'}]}>
                    <Ionicons name="arrow-up" size={12} color={Colors.destructive} />
                  </View>
                  <Text style={s.summaryLabel}>TOTAL FIADO</Text>
                </View>
                <Text
                  style={[s.summaryValue, {color: Colors.destructive}]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {formatCOP(stats?.totalCredits ?? 0)}
                </Text>
              </View>

              <View style={[s.summaryCard, s.summaryPaid]}>
                <View style={s.summaryTopRow}>
                  <View style={[s.summaryIconCircle, {backgroundColor: '#DCFCE7'}]}>
                    <Ionicons name="arrow-down" size={12} color="#15803D" />
                  </View>
                  <Text style={s.summaryLabel}>TOTAL ABONADO</Text>
                </View>
                <Text
                  style={[s.summaryValue, {color: '#15803D'}]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {formatCOP(stats?.totalPayments ?? 0)}
                </Text>
              </View>
            </View>

            <View style={s.netCard}>
              <View style={s.netRow}>
                <View style={s.netIcon}>
                  <MonochromeIcon name="wallet" color={Colors.primary} size={18} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={s.netLabel}>SALDO PENDIENTE NETO</Text>
                  <Text style={s.netValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCOP(stats?.netBalance ?? 0)}
                  </Text>
                </View>
                <View style={s.countBadge}>
                  <Text style={s.countText}>{stats?.customerCount ?? 0}</Text>
                  <Text style={s.countSub}>
                    {stats?.customerCount === 1 ? 'cliente' : 'clientes'}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Desglose por cliente ── */}
            {(stats?.rows.length ?? 0) > 0 && (
              <View style={s.customerSection}>
                <View style={s.sectionHead}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    <Text style={s.sectionTitle}>Por cliente</Text>
                    <View style={s.sectionCountBadge}>
                      <Text style={s.sectionCountText}>
                        {stats?.rows.length ?? 0}
                      </Text>
                    </View>
                  </View>
                  <View style={s.legend}>
                    <View style={[s.dot, {backgroundColor: Colors.destructive}]} />
                    <Text style={s.legendText}>Fiado</Text>
                    <View style={[s.dot, {backgroundColor: '#15803D'}]} />
                    <Text style={s.legendText}>Abonado</Text>
                  </View>
                </View>

                <View style={s.customerList}>
                  {(stats?.rows ?? []).map(row => {
                    const creditPct =
                      maxVal > 0
                        ? Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round((row.total_credits / maxVal) * 100),
                            ),
                          )
                        : 0;
                    const paymentPct =
                      maxVal > 0
                        ? Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round((row.total_payments / maxVal) * 100),
                            ),
                          )
                        : 0;
                    const displayName = row.alias || row.name || 'Cliente';
                    const initial = displayName.charAt(0).toUpperCase();

                    return (
                      <Pressable
                        key={row.customer_id}
                        style={({pressed}) => [
                          s.customerCard,
                          pressed && s.customerCardPressed,
                        ]}
                        onPress={() =>
                          navigation.navigate('CustomerDetail', {
                            id: row.customer_id,
                          })
                        }>
                        {/* Fila Superior: Avatar + Nombre + Saldo actual */}
                        <View style={s.custTopRow}>
                          <View style={s.custAvatar}>
                            <Text style={s.custInitial}>{initial}</Text>
                          </View>

                          <View style={s.custNameCol}>
                            <Text style={s.custName} numberOfLines={1}>
                              {displayName}
                            </Text>
                            {row.alias && row.name && row.name !== row.alias ? (
                              <Text style={s.custSubName} numberOfLines={1}>
                                {row.name}
                              </Text>
                            ) : null}
                          </View>

                          <View style={s.custBalanceCol}>
                            <Text style={s.custBalanceLabel}>SALDO ACTUAL</Text>
                            <Text
                              style={[
                                s.custBalanceVal,
                                row.balance > 0
                                  ? s.custBalanceDebt
                                  : s.custBalanceZero,
                              ]}
                              numberOfLines={1}>
                              {formatCOP(row.balance)}
                            </Text>
                          </View>

                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={Colors.textSecondary}
                          />
                        </View>

                        {/* Fila Inferior: Métricas del período (Fiado vs Abonado) */}
                        <View style={s.custMetricsRow}>
                          {/* Box Fiado */}
                          <View style={[s.custMetricBox, s.metricBoxFiado]}>
                            <View style={s.metricTop}>
                              <View
                                style={[
                                  s.metricDot,
                                  {backgroundColor: Colors.destructive},
                                ]}
                              />
                              <Text style={s.metricLabel}>FIADO EN PERÍODO</Text>
                            </View>
                            <Text
                              style={[
                                s.metricValue,
                                {color: Colors.destructive},
                              ]}
                              numberOfLines={1}
                              adjustsFontSizeToFit>
                              {formatCOP(row.total_credits)}
                            </Text>
                            <View style={s.metricTrack}>
                              <View
                                style={[
                                  s.metricFill,
                                  {
                                    backgroundColor: Colors.destructive,
                                    width: `${creditPct}%`,
                                  },
                                ]}
                              />
                            </View>
                          </View>

                          {/* Box Abonado */}
                          <View style={[s.custMetricBox, s.metricBoxAbonado]}>
                            <View style={s.metricTop}>
                              <View
                                style={[
                                  s.metricDot,
                                  {backgroundColor: '#15803D'},
                                ]}
                              />
                              <Text style={s.metricLabel}>ABONADO EN PERÍODO</Text>
                            </View>
                            <Text
                              style={[s.metricValue, {color: '#15803D'}]}
                              numberOfLines={1}
                              adjustsFontSizeToFit>
                              {formatCOP(row.total_payments)}
                            </Text>
                            <View style={s.metricTrack}>
                              <View
                                style={[
                                  s.metricFill,
                                  {
                                    backgroundColor: '#15803D',
                                    width: `${paymentPct}%`,
                                  },
                                ]}
                              />
                            </View>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {(stats?.rows.length ?? 0) === 0 && !isLoading && (
              <Card style={s.emptyCard}>
                <MonochromeIcon
                  name="chart"
                  color={Colors.textSecondary}
                  size={24}
                />
                <Text style={s.emptyTitle}>Sin datos en este período</Text>
                <Text style={s.muted}>
                  Ajusta los filtros de fecha o cliente.
                </Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Modal multi-select clientes ── */}
      <Modal
        visible={showCustomerPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCustomerPicker(false)}>
        <View style={[s.pickerSheet, {paddingTop: insets.top + 8}]}>
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>Seleccionar clientes</Text>
            <Pressable onPress={() => setShowCustomerPicker(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          </View>
          <Pressable
            style={s.pickerAll}
            onPress={() => setSelectedIds([])}>
            <View style={[s.pickerCheck, selectedIds.length === 0 && s.pickerCheckActive]}>
              {selectedIds.length === 0 && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </View>
            <Text style={s.pickerAllText}>Todos los clientes</Text>
          </Pressable>
          <FlatList
            data={allCustomers}
            keyExtractor={c => c.id}
            contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 24}}
            renderItem={({item}) => {
              const sel = selectedIds.includes(item.id);
              return (
                <Pressable style={s.pickerRow} onPress={() => toggleCustomer(item.id)}>
                  <View style={[s.pickerCheck, sel && s.pickerCheckActive]}>
                    {sel && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={s.pickerName}>{item.alias || item.name}</Text>
                    {item.alias ? (
                      <Text style={s.pickerSub}>{item.name}</Text>
                    ) : null}
                  </View>
                  <Text style={s.pickerBalance}>
                    {formatCOP(Number(item.current_balance))}
                  </Text>
                </Pressable>
              );
            }}
          />
          <View style={[s.pickerFooter, {paddingBottom: insets.bottom + 12}]}>
            <Pressable
              style={s.pickerDoneBtn}
              onPress={() => {
                setShowCustomerPicker(false);
                refetch();
              }}>
              <Text style={s.pickerDoneText}>
                {selectedIds.length === 0
                  ? 'Ver todos'
                  : `Ver ${selectedIds.length} seleccionado${selectedIds.length > 1 ? 's' : ''}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  content: {paddingHorizontal: 20, paddingTop: 4, gap: 14},
  // Presets
  presetRow: {gap: 8, paddingRight: 4},
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primaryMid,
  },
  presetText: {fontSize: 13, fontWeight: '600', color: Colors.textSecondary},
  presetTextActive: {color: Colors.primary, fontWeight: '800'},
  // Customer selector
  customerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  customerBtnText: {flex: 1, fontSize: 14, color: Colors.text, fontWeight: '600'},
  // Summary cards (compactos para aprovechar espacio)
  summaryGrid: {flexDirection: 'row', gap: 10},
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 4,
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryDebt: {backgroundColor: '#FFF5F5', borderColor: '#FECACA'},
  summaryPaid: {backgroundColor: '#F0FDF4', borderColor: '#BBF7D0'},
  summaryTopRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  summaryIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  // Net card (compacto)
  netCard: {
    backgroundColor: Colors.card,
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1.5,
  },
  netRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  netIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  netLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  netValue: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
    marginTop: 1,
  },
  countBadge: {
    alignItems: 'center',
    paddingLeft: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.border,
  },
  countText: {fontSize: 18, fontWeight: '800', color: Colors.text},
  countSub: {fontSize: 10, color: Colors.textSecondary, fontWeight: '500'},
  // Section Por cliente
  customerSection: {gap: 10},
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {fontSize: 16, fontWeight: '800', color: Colors.text},
  sectionCountBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
  },
  legend: {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot: {width: 8, height: 8, borderRadius: 4},
  legendText: {fontSize: 11, color: Colors.textSecondary},
  // Customer cards list
  customerList: {gap: 10},
  customerCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  customerCardPressed: {
    opacity: 0.85,
    backgroundColor: '#F8FAFC',
  },
  custTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  custAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  custInitial: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  custNameCol: {
    flex: 1,
    justifyContent: 'center',
  },
  custName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  custSubName: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  custBalanceCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  custBalanceLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  custBalanceVal: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
  custBalanceDebt: {
    color: Colors.destructive,
  },
  custBalanceZero: {
    color: '#15803D',
  },
  custMetricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  custMetricBox: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderWidth: 1,
    gap: 3,
  },
  metricBoxFiado: {
    backgroundColor: '#FFF8F8',
    borderColor: '#FEE2E2',
  },
  metricBoxAbonado: {
    backgroundColor: '#F3FCF6',
    borderColor: '#DCFCE7',
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  metricLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  metricTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
    marginTop: 2,
  },
  metricFill: {
    height: '100%',
    borderRadius: 2,
    minWidth: 0,
  },
  // Empty
  emptyCard: {alignItems: 'center', gap: 8, paddingVertical: 24},
  emptyTitle: {fontWeight: '800', color: Colors.text, fontSize: 15},
  muted: {fontSize: 12, color: Colors.textSecondary, textAlign: 'center'},
  // Customer picker modal
  pickerSheet: {flex: 1, backgroundColor: Colors.card},
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pickerTitle: {fontSize: 20, fontWeight: '800', color: Colors.text},
  pickerAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pickerAllText: {fontSize: 15, fontWeight: '700', color: Colors.text},
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pickerCheck: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCheckActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pickerName: {fontSize: 14, fontWeight: '700', color: Colors.text},
  pickerSub: {fontSize: 11, color: Colors.textSecondary},
  pickerBalance: {fontSize: 13, fontWeight: '800', color: Colors.destructive},
  pickerFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  pickerDoneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerDoneText: {color: '#fff', fontWeight: '800', fontSize: 15},
});
