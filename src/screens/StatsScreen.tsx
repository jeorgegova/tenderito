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
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {DynamicBrandCurves} from '../components/ui/DynamicBrandCurves';
import {MagnetFilterBar, type MagnetFilterOption} from '../components/ui/MagnetFilterBar';
import {fetchCustomers} from '../services/customers';
import {
  fetchStats,
  openWhatsAppCustomerReminder,
  type StatsFilters,
  type CustomerStatRow,
} from '../services/stats';
import {useStore} from '../store/useStore';
import {Colors, formatCOP} from '../theme';
import {getBogotaDaysAgoYMD, getBogotaTodayYMD} from '../utils/format';
import {useResponsive} from '../hooks/useResponsive';

const DATE_PRESETS = [
  {label: 'Hoy', getDates: () => ({from: getBogotaTodayYMD(), to: getBogotaTodayYMD()})},
  {label: 'Últ. 7 días', getDates: () => ({from: getBogotaDaysAgoYMD(7), to: getBogotaTodayYMD()})},
  {label: 'Últ. 30 días', getDates: () => ({from: getBogotaDaysAgoYMD(30), to: getBogotaTodayYMD()})},
  {label: 'Este mes', getDates: () => ({from: getBogotaTodayYMD().slice(0, 7) + '-01', to: getBogotaTodayYMD()})},
  {label: 'Todo', getDates: () => ({from: undefined, to: undefined})},
];

const STATS_PRESET_OPTIONS: MagnetFilterOption[] = [
  {key: '0', label: 'Hoy'},
  {key: '1', label: 'Últ. 7 días'},
  {key: '2', label: 'Últ. 30 días'},
  {key: '3', label: 'Este mes'},
  {key: '4', label: 'Todo'},
];

type QuickFilter = 'all' | 'debt' | 'no_abonos' | 'uptodate';

export function StatsScreen({navigation}: any) {
  const insets = useSafeAreaInsets();
  const {isSmall, isTablet, tabletContainerStyle} = useResponsive();
  const profile = useStore(s => s.profile);

  const [preset, setPreset] = useState<number>(2); // Default: "Últ. 30 días"
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  // Botón físico "Atrás" en Android
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
  const {from, to} = useMemo(() => activePreset.getDates(), [activePreset]);
  const filters: StatsFilters = {
    from,
    to,
    customerIds: selectedIds.length > 0 ? selectedIds : undefined,
    presetIndex: preset,
  };

  const {data: allCustomers = []} = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => fetchCustomers(),
  });

  const {data: stats, isLoading} = useQuery({
    queryKey: ['stats', filters.from, filters.to, selectedIds, preset],
    queryFn: () => fetchStats(filters),
  });

  function toggleCustomer(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id],
    );
  }

  const selectedNames = allCustomers
    .filter(c => selectedIds.includes(c.id))
    .map(c => c.alias || c.name);

  // Filtrado de filas de clientes según el chip activo
  const filteredRows = useMemo(() => {
    const list = stats?.rows ?? [];
    if (quickFilter === 'debt') return list.filter(r => r.current_balance > 0);
    if (quickFilter === 'no_abonos') return list.filter(r => r.current_balance > 0 && r.period_payments === 0);
    if (quickFilter === 'uptodate') return list.filter(r => r.current_balance <= 0);
    return list;
  }, [stats?.rows, quickFilter]);

  // Contadores para chips
  const countAll = stats?.rows.length ?? 0;
  const countDebt = stats?.customersWithDebtCount ?? 0;
  const countNoAbonos = useMemo(
    () => (stats?.rows ?? []).filter(r => r.current_balance > 0 && r.period_payments === 0).length,
    [stats?.rows],
  );
  const countUpToDate = stats?.customersUpToDateCount ?? 0;

  // Opciones magnéticas para el filtro de clientes (Efecto Imán)
  const customerFilterOptions = useMemo<MagnetFilterOption<QuickFilter>[]>(
    () => [
      { key: 'all', label: `Todos (${countAll})` },
      { key: 'debt', label: `Con deuda (${countDebt})` },
      { key: 'no_abonos', label: `Sin abonos (${countNoAbonos})` },
      { key: 'uptodate', label: `Al día (${countUpToDate})` },
    ],
    [countAll, countDebt, countNoAbonos, countUpToDate],
  );

  // Proporción de flujo de período
  const totalPeriodFlow = (stats?.periodCreditsTotal ?? 0) + (stats?.periodPaymentsTotal ?? 0);
  const creditBarPct = totalPeriodFlow > 0 ? Math.round(((stats?.periodCreditsTotal ?? 0) / totalPeriodFlow) * 100) : 50;
  const paymentBarPct = totalPeriodFlow > 0 ? 100 - creditBarPct : 50;

  return (
    <View style={s.wrap}>
      <DynamicBrandCurves position="bottom-right" />
      <Header title="Estadísticas" subtitle="Conoce cómo va tu cartera" />

      <ScrollView
        contentContainerStyle={[
          s.content,
          {paddingBottom: insets.bottom + 90},
          tabletContainerStyle(720),
        ]}
        showsVerticalScrollIndicator={false}>

        {/* ── Selector de periodo (barra magnética) ── */}
        <MagnetFilterBar
          scrollable
          options={STATS_PRESET_OPTIONS}
          selectedKey={String(preset)}
          onSelect={key => setPreset(Number(key))}
        />

        {/* ── Selector de clientes ── */}
        <Pressable
          onPress={() => setShowCustomerPicker(true)}
          style={s.customerBtn}>
          <Ionicons name="people-outline" color={Colors.primary} size={18} />
          <Text style={s.customerBtnText} numberOfLines={1}>
            {selectedIds.length === 0
              ? 'Todos los clientes'
              : `${selectedIds.length} seleccionado(s): ${selectedNames.slice(0, 2).join(', ')}${selectedNames.length > 2 ? '…' : ''}`}
          </Text>
          <Ionicons name="chevron-down" size={16} color={Colors.primary} />
        </Pressable>

        {isLoading ? (
          <Card style={s.loadingCard}>
            <Text style={s.loadingText}>Calculando cartera y estadísticas…</Text>
          </Card>
        ) : (
          <>
            {/* ─── BLOQUE 1: ASÍ ESTÁ TU NEGOCIO ─── */}
            <View style={s.blockContainer}>
              <Text style={s.blockTitle}>ASÍ ESTÁ TU NEGOCIO</Text>

              {/* Indicador Principal: Dinero que te deben hoy (Estado Actual Vivo) */}
              <View style={s.mainReceivableCard}>
                <View style={s.mainReceivableIcon}>
                  <Ionicons name="wallet-outline" size={24} color={Colors.primary} />
                </View>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={s.mainReceivableLabel}>DINERO TOTAL POR COBRAR</Text>
                  <Text style={s.mainReceivableValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCOP(stats?.currentTotalReceivable ?? 0)}
                  </Text>
                  <Text style={s.mainReceivableSub}>
                    {stats?.customersWithDebtCount ?? 0} cliente{(stats?.customersWithDebtCount ?? 0) === 1 ? '' : 's'} con saldo pendiente
                  </Text>
                </View>
              </View>

              {/* Indicadores Secundarios: Flujo del período */}
              <View style={[s.summaryGrid, isSmall && {flexDirection: 'column'}]}>
                <View style={[s.summaryCard, s.summaryDebt]}>
                  <View style={s.summaryTopRow}>
                    <View style={[s.summaryIconCircle, {backgroundColor: Colors.destructiveAlt}]}>
                      <Ionicons name="arrow-up" size={13} color={Colors.destructive} />
                    </View>
                    <Text style={s.summaryLabel}>FIADO EN PERÍODO</Text>
                  </View>
                  <Text style={[s.summaryValue, {color: Colors.destructive}]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCOP(stats?.periodCreditsTotal ?? 0)}
                  </Text>
                  <Text style={s.summarySub}>
                    {stats?.periodCreditsCount ?? 0} movimiento{(stats?.periodCreditsCount ?? 0) === 1 ? '' : 's'}
                  </Text>
                </View>

                <View style={[s.summaryCard, s.summaryPaid]}>
                  <View style={s.summaryTopRow}>
                    <View style={[s.summaryIconCircle, {backgroundColor: '#DCFCE7'}]}>
                      <Ionicons name="arrow-down" size={13} color={Colors.success} />
                    </View>
                    <Text style={[s.summaryLabel, {color: Colors.success}]}>RECIBIDO EN ABONOS</Text>
                  </View>
                  <Text style={[s.summaryValue, {color: Colors.success}]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCOP(stats?.periodPaymentsTotal ?? 0)}
                  </Text>
                  <Text style={s.summarySub}>
                    {stats?.periodPaymentsCount ?? 0} movimiento{(stats?.periodPaymentsCount ?? 0) === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            </View>

            {/* ─── BLOQUE 2: COMPARACIÓN DEL COMPORTAMIENTO ─── */}
            <Card style={s.comparisonCard}>
              <View style={s.comparisonHead}>
                <Text style={s.comparisonTitle}>Flujo del período: Fiado vs Abono</Text>
                {stats?.periodComparison.paymentsChangePct !== null && (
                  <View style={s.comparisonPill}>
                    <Ionicons
                      name={(stats?.periodComparison.paymentsChangePct ?? 0) >= 0 ? 'trending-up' : 'trending-down'}
                      size={14}
                      color={(stats?.periodComparison.paymentsChangePct ?? 0) >= 0 ? Colors.success : Colors.destructive}
                    />
                    <Text
                      style={[
                        s.comparisonPillText,
                        {color: (stats?.periodComparison.paymentsChangePct ?? 0) >= 0 ? Colors.success : Colors.destructive},
                      ]}>
                      {(stats?.periodComparison.paymentsChangePct ?? 0) >= 0 ? '+' : ''}
                      {stats?.periodComparison.paymentsChangePct}% abonos vs ant.
                    </Text>
                  </View>
                )}
              </View>

              {totalPeriodFlow === 0 ? (
                <Text style={s.emptyFlowText}>Sin fiados ni abonos en este período.</Text>
              ) : (
                <>
                  <View style={s.barTrack}>
                    <View style={[s.barSegment, {width: `${creditBarPct}%`, backgroundColor: Colors.destructive}]} />
                    <View style={[s.barSegment, {width: `${paymentBarPct}%`, backgroundColor: Colors.success}]} />
                  </View>

                  <View style={s.legendRow}>
                    <View style={s.legendItem}>
                      <View style={[s.legendDot, {backgroundColor: Colors.destructive}]} />
                      <Text style={[s.legendLabel, {color: Colors.destructive}]}>
                        Fiado: {creditBarPct}% ({formatCOP(stats?.periodCreditsTotal ?? 0)})
                      </Text>
                    </View>
                    <View style={s.legendItem}>
                      <View style={[s.legendDot, {backgroundColor: Colors.success}]} />
                      <Text style={[s.legendLabel, {color: Colors.success}]}>
                        Abonado: {paymentBarPct}% ({formatCOP(stats?.periodPaymentsTotal ?? 0)})
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </Card>



            {/* ─── BLOQUE 4: ATENCIÓN A TUS CLIENTES ─── */}
            {stats?.alerts.oldestDebtCustomer && (
              <View style={s.blockContainer}>
                <Text style={s.blockTitle}>ATENCIÓN A TUS CLIENTES</Text>

                {/* Alerta 1: Mayor tiempo con deuda viva */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() =>
                    navigation.navigate('CustomerDetail', {
                      id: stats.alerts.oldestDebtCustomer?.customer_id,
                    })
                  }
                  style={[s.alertCard, {borderLeftColor: Colors.primary}]}>
                  <View style={s.alertTopRow}>
                    <View style={s.alertTagRow}>
                      <Ionicons name="time-outline" size={16} color={Colors.primary} />
                      <Text style={s.alertTagText}>Mayor tiempo con deuda viva</Text>
                    </View>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                      <View style={s.daysBadge}>
                        <Text style={s.daysBadgeText}>{stats.alerts.oldestDebtCustomer.debt_days} días</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
                    </View>
                  </View>

                  <View style={s.alertMainRow}>
                    <View style={{flex: 1}}>
                      <Text style={s.alertCustomerName}>
                        {stats.alerts.oldestDebtCustomer.alias || stats.alerts.oldestDebtCustomer.name}
                      </Text>
                      <Text style={s.alertCustomerSub}>
                        {stats.alerts.oldestDebtCustomer.days_since_last_payment !== null
                          ? `Último abono: hace ${stats.alerts.oldestDebtCustomer.days_since_last_payment} días`
                          : 'Sin abonos registrados en el ciclo'}
                      </Text>
                    </View>
                    <View style={{alignItems: 'flex-end'}}>
                      <Text style={s.alertBalanceLabel}>Saldo pendiente</Text>
                      <Text style={s.alertBalanceValue}>
                        {formatCOP(stats.alerts.oldestDebtCustomer.current_balance)}
                      </Text>
                    </View>
                  </View>

                  {stats.alerts.oldestDebtCustomer.phone ? (
                    <TouchableOpacity
                      onPress={() =>
                        openWhatsAppCustomerReminder(
                          stats.alerts.oldestDebtCustomer?.phone,
                          stats.alerts.oldestDebtCustomer?.alias || stats.alerts.oldestDebtCustomer?.name || 'Cliente',
                          stats.alerts.oldestDebtCustomer?.current_balance || 0,
                          profile?.store_name,
                        )
                      }
                      style={s.alertWaBtn}
                      activeOpacity={0.8}>
                      <Ionicons name="logo-whatsapp" size={16} color="#16A34A" />
                      <Text style={s.alertWaText}>Enviar recordatorio por WhatsApp</Text>
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              </View>
            )}

            {/* ─── BLOQUE 5: LISTADO DE CLIENTES Y FILTROS RÁPIDOS ─── */}
            <View style={s.blockContainer}>
              <View style={s.customerListHead}>
                <Text style={s.customerListTitle}>Estado de tus clientes</Text>
                <Text style={s.customerListCount}>
                  {filteredRows.length} cliente{filteredRows.length === 1 ? '' : 's'}
                </Text>
              </View>

              {/* Selector magnético de filtro de clientes (Efecto Imán) */}
              <MagnetFilterBar
                scrollable
                options={customerFilterOptions}
                selectedKey={quickFilter}
                onSelect={setQuickFilter}
              />

              {/* Tarjetas de clientes */}
              <View style={s.customersStack}>
                {filteredRows.length === 0 ? (
                  <Card style={s.emptyCustomersCard}>
                    <Text style={s.emptyCustomersText}>No hay clientes en esta categoría.</Text>
                  </Card>
                ) : (
                  filteredRows.map(row => {
                    const isAlDia = row.current_balance <= 0;
                    const hasAbonoInPeriod = row.period_payments > 0;

                    const badgeBg = isAlDia ? '#DCFCE7' : hasAbonoInPeriod ? '#E0F2FE' : '#FEF3C7';
                    const badgeFg = isAlDia ? '#16A34A' : hasAbonoInPeriod ? '#0284C7' : '#D97706';
                    const badgeLabel = isAlDia ? 'Al día' : hasAbonoInPeriod ? 'Abonó en período' : 'Con deuda';

                    return (
                      <Card key={row.customer_id} style={s.itemCard}>
                        {/* Cabecera: Nombre + Badge */}
                        <View style={s.itemHead}>
                          <View style={{flex: 1, minWidth: 0}}>
                            <Text style={s.itemName} numberOfLines={1}>
                              {row.alias || row.name}
                            </Text>
                            {row.alias && (
                              <Text style={s.itemRealName} numberOfLines={1}>
                                {row.name}
                              </Text>
                            )}
                          </View>

                          <View style={[s.badgeBox, {backgroundColor: badgeBg}]}>
                            <Text style={[s.badgeText, {color: badgeFg}]}>
                              {badgeLabel}
                            </Text>
                          </View>
                        </View>

                        {/* Saldo pendiente actual */}
                        <View style={s.itemBalanceBox}>
                          <View>
                            <Text style={s.itemBalanceLabel}>Saldo pendiente actual</Text>
                            <Text
                              style={[
                                s.itemBalanceValue,
                                {color: row.current_balance > 0 ? Colors.destructive : Colors.success},
                              ]}>
                              {formatCOP(row.current_balance)}
                            </Text>
                          </View>

                          <View style={{alignItems: 'flex-end'}}>
                            <Text style={s.itemAgeLabel}>
                              {isAlDia ? 'Sin deuda' : `Deuda viva: ${row.debt_days} días`}
                            </Text>
                            <Text style={s.itemAgeSub}>
                              {row.days_since_last_payment !== null
                                ? `Últ. abono: hace ${row.days_since_last_payment}d`
                                : 'Sin abonos'}
                            </Text>
                          </View>
                        </View>

                        {/* Resumen del período */}
                        <View style={s.itemPeriodRow}>
                          <Text style={s.itemPeriodTitle}>En este período:</Text>
                          <Text style={s.itemPeriodNumbers}>
                            Fiado: <Text style={{color: Colors.text, fontWeight: '700'}}>{formatCOP(row.period_credits)}</Text>
                            {' · '}
                            Abonado: <Text style={{color: Colors.success, fontWeight: '700'}}>{formatCOP(row.period_payments)}</Text>
                          </Text>
                        </View>

                        {/* Acciones directas */}
                        <View style={s.itemActionsRow}>
                          <TouchableOpacity
                            onPress={() => navigation.navigate('CustomerDetail', {id: row.customer_id})}
                            style={s.actionBtnSecondary}
                            activeOpacity={0.8}>
                            <Ionicons name="receipt-outline" size={14} color={Colors.text} />
                            <Text style={s.actionBtnSecondaryText}>Ver cuenta</Text>
                          </TouchableOpacity>

                          {row.current_balance > 0 && (
                            <TouchableOpacity
                              onPress={() => navigation.navigate('NewPayment', {customerId: row.customer_id})}
                              style={s.actionBtnPrimary}
                              activeOpacity={0.8}>
                              <Ionicons name="cash-outline" size={14} color={Colors.primaryDark} />
                              <Text style={s.actionBtnPrimaryText}>Abonar</Text>
                            </TouchableOpacity>
                          )}

                          {row.current_balance > 0 && row.phone ? (
                            <TouchableOpacity
                              onPress={() =>
                                openWhatsAppCustomerReminder(
                                  row.phone,
                                  row.alias || row.name,
                                  row.current_balance,
                                  profile?.store_name,
                                )
                              }
                              style={s.actionBtnWa}
                              activeOpacity={0.8}>
                              <Ionicons name="logo-whatsapp" size={18} color="#16A34A" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </Card>
                    );
                  })
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Modal selector de clientes ── */}
      <Modal
        visible={showCustomerPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCustomerPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Filtrar clientes</Text>
              <Pressable onPress={() => setShowCustomerPicker(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <FlatList
              data={allCustomers}
              keyExtractor={item => item.id}
              contentContainerStyle={{padding: 16}}
              ListHeaderComponent={
                <Pressable
                  onPress={() => setSelectedIds([])}
                  style={[
                    s.modalItem,
                    selectedIds.length === 0 && {backgroundColor: Colors.primaryLight},
                  ]}>
                  <Text
                    style={[
                      s.modalItemText,
                      selectedIds.length === 0 && {color: Colors.primary, fontWeight: '800'},
                    ]}>
                    ✓ Todos los clientes
                  </Text>
                </Pressable>
              }
              renderItem={({item}) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <Pressable
                    onPress={() => toggleCustomer(item.id)}
                    style={[s.modalItem, selected && {backgroundColor: Colors.primaryLight}]}>
                    <Text
                      style={[
                        s.modalItemText,
                        selected && {color: Colors.primary, fontWeight: '700'},
                      ]}>
                      {item.alias || item.name}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
                  </Pressable>
                );
              }}
            />

            <View style={s.modalFooter}>
              <TouchableOpacity
                onPress={() => setShowCustomerPicker(false)}
                style={s.modalCloseBtn}
                activeOpacity={0.85}>
                <Text style={s.modalCloseBtnText}>Listo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  customerBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  customerBtnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  loadingCard: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  blockContainer: {
    gap: 10,
  },
  blockTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.6,
  },
  mainReceivableCard: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1.5,
    borderColor: Colors.primaryMid,
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...Platform.select({
      ios: {shadowColor: '#EA580C', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.1, shadowRadius: 8},
      android: {elevation: 2},
    }),
  },
  mainReceivableIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainReceivableLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primaryDark,
    letterSpacing: 0.8,
  },
  mainReceivableValue: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.primaryDark,
    marginTop: 2,
  },
  mainReceivableSub: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 2,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  summaryDebt: {
    backgroundColor: '#FFF1F0',
    borderColor: '#FCE0DE',
  },
  summaryPaid: {
    backgroundColor: Colors.successAlt,
    borderColor: '#BBF7D0',
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  summaryIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: Colors.destructive,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  summarySub: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  comparisonCard: {
    padding: 16,
  },
  comparisonHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  comparisonTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  comparisonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  comparisonPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyFlowText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 10,
  },
  barTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 8,
  },
  barSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '700',
  },

  alertCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertTagText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  daysBadge: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  daysBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  alertMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertCustomerName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  alertCustomerSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  alertBalanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  alertBalanceValue: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.destructive,
  },
  alertWaBtn: {
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  alertWaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  customerListHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerListTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  customerListCount: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActiveAll: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipActiveDebt: {
    backgroundColor: Colors.destructive,
    borderColor: Colors.destructive,
  },
  chipActivePending: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  chipActiveUptodate: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  customersStack: {
    gap: 10,
  },
  emptyCustomersCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyCustomersText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  itemCard: {
    padding: 16,
    gap: 10,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  itemRealName: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  badgeBox: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  itemBalanceBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemBalanceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  itemBalanceValue: {
    fontSize: 17,
    fontWeight: '900',
    marginTop: 1,
  },
  itemAgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  itemAgeSub: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 1,
  },
  itemPeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  itemPeriodTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  itemPeriodNumbers: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  itemActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  actionBtnSecondary: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  actionBtnPrimary: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  actionBtnWa: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHead: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalCloseBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
