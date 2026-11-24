import {useQuery} from '@tanstack/react-query';
import {useCallback, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect, useScrollToTop} from '@react-navigation/native';
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
  const {tabletContainerStyle} = useResponsive();
  const profile = useStore(s => s.profile);

  const [preset, setPreset] = useState<number>(2); // Default: "Últ. 30 días"
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const scrollRef = useRef<ScrollView>(null);

  // Al tocar el menú Estadísticas estando ya activo, desplaza suavemente al tope
  useScrollToTop(scrollRef);

  // Al ingresar a Estadísticas desde cualquier otro menú, garantiza inicio en coordenada 0
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

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

  function clearCustomerSelection() {
    setSelectedIds([]);
  }

  const selectedNames = useMemo(() => {
    return allCustomers
      .filter(c => selectedIds.includes(c.id))
      .map(c => c.alias || c.name);
  }, [allCustomers, selectedIds]);

  // Clientes filtrados en el buscador del modal
  const filteredCustomersInPicker = useMemo(() => {
    if (!customerSearchTerm.trim()) return allCustomers;
    const term = customerSearchTerm.toLowerCase().trim();
    return allCustomers.filter(c =>
      (c.name || '').toLowerCase().includes(term) ||
      (c.alias || '').toLowerCase().includes(term) ||
      (c.document_number || '').includes(term),
    );
  }, [allCustomers, customerSearchTerm]);

  // Filtrado de filas de clientes según el chip activo (Sección 3)
  const filteredRows = useMemo(() => {
    const list = stats?.rows ?? [];
    if (quickFilter === 'debt') return list.filter(r => r.current_balance > 0);
    if (quickFilter === 'no_abonos') return list.filter(r => r.current_balance > 0 && r.days_since_last_payment === null);
    if (quickFilter === 'uptodate') return list.filter(r => r.current_balance <= 0);
    return list;
  }, [stats?.rows, quickFilter]);

  // Contadores para chips
  const countAll = stats?.rows.length ?? 0;
  const countDebt = useMemo(() => (stats?.rows ?? []).filter(r => r.current_balance > 0).length, [stats?.rows]);
  const countNoAbonos = useMemo(
    () => (stats?.rows ?? []).filter(r => r.current_balance > 0 && r.days_since_last_payment === null).length,
    [stats?.rows],
  );
  const countUpToDate = useMemo(() => (stats?.rows ?? []).filter(r => r.current_balance <= 0).length, [stats?.rows]);

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
      <Header title="Estadísticas" subtitle="Así va tu negocio y tus clientes" showCurve />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          s.content,
          {paddingBottom: insets.bottom + 90},
          tabletContainerStyle(680),
        ]}
        showsVerticalScrollIndicator={false}>

        {isLoading ? (
          <Card style={s.loadingCard}>
            <Text style={s.loadingText}>Calculando cartera y estadísticas…</Text>
          </Card>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════
                1. PRIMERA SECCIÓN: ASÍ ESTÁ TU NEGOCIO
               ══════════════════════════════════════════════════════════ */}
            <View style={s.sectionBlock}>
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionTitle}>1. ASÍ ESTÁ TU NEGOCIO</Text>
                <Text style={s.sectionSub}>Visión general</Text>
              </View>

              {/* Indicador Principal: Dinero total por cobrar (Estado de Cartera Viva) */}
              <View style={s.mainReceivableCard}>
                <View style={s.mainReceivableIcon}>
                  <Ionicons name="wallet-outline" size={28} color={Colors.primary} />
                </View>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={s.mainReceivableLabel}>DINERO TOTAL POR COBRAR</Text>
                  <Text style={s.mainReceivableValue}>
                    {formatCOP(stats?.currentTotalReceivable ?? 0)}
                  </Text>
                  <Text style={s.mainReceivableSub}>
                    {stats?.customersWithDebtCount ?? 0} cliente{(stats?.customersWithDebtCount ?? 0) === 1 ? '' : 's'} con saldo pendiente
                  </Text>
                </View>
              </View>

              {/* Contenedor de Movimientos del Período con su filtro asociado */}
              <Card style={s.periodContainerCard}>
                {/* Selector de periodo directamente asociado a los movimientos */}
                <View style={{gap: 8}}>
                  <View style={s.periodHeaderRow}>
                    <Text style={s.periodTitle}>MOVIMIENTOS EN EL PERÍODO</Text>
                    <Text style={s.periodActiveLabel}>{activePreset.label}</Text>
                  </View>

                  <MagnetFilterBar
                    scrollable
                    options={STATS_PRESET_OPTIONS}
                    selectedKey={String(preset)}
                    onSelect={key => setPreset(Number(key))}
                  />
                </View>

                {/* 3 Indicadores de período: 2 columnas superiores + 1 fila completa destacada */}
                <View style={{gap: 8}}>
                  <View style={s.summaryTwoColsRow}>
                    {/* Dinero fiado */}
                    <View style={[s.summaryCard, s.summaryDebt]}>
                      <View style={s.summaryTopRow}>
                        <Ionicons name="arrow-up" size={14} color={Colors.destructive} />
                        <Text style={[s.summaryLabel, {color: Colors.destructive}]}>DINERO FIADO</Text>
                      </View>
                      <Text style={[s.summaryValue, {color: Colors.destructive}]}>
                        {formatCOP(stats?.periodCreditsTotal ?? 0)}
                      </Text>
                      <Text style={s.summarySub}>
                        {stats?.periodCreditsCount ?? 0} fiado{(stats?.periodCreditsCount ?? 0) === 1 ? '' : 's'}
                      </Text>
                    </View>

                    {/* Dinero recuperado */}
                    <View style={[s.summaryCard, s.summaryPaid]}>
                      <View style={s.summaryTopRow}>
                        <Ionicons name="arrow-down" size={14} color={Colors.success} />
                        <Text style={[s.summaryLabel, {color: Colors.success}]}>RECUPERADO</Text>
                      </View>
                      <Text style={[s.summaryValue, {color: Colors.success}]}>
                        {formatCOP(stats?.periodPaymentsTotal ?? 0)}
                      </Text>
                      <Text style={s.summarySub}>
                        {stats?.periodPaymentsCount ?? 0} abono{(stats?.periodPaymentsCount ?? 0) === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </View>

                  {/* Dinero que sigue pendiente (fila completa destacada) */}
                  <View style={s.summaryPendingRow}>
                    <View style={{flex: 1, minWidth: 0}}>
                      <View style={s.summaryTopRow}>
                        <Ionicons name="hourglass-outline" size={14} color="#D97706" />
                        <Text style={[s.summaryLabel, {color: '#B45309'}]}>SIGUE PENDIENTE</Text>
                      </View>
                      <Text style={[s.summarySub, {marginTop: 2}]}>De lo fiado en este período</Text>
                    </View>
                    <Text style={s.pendingValue}>
                      {formatCOP(stats?.periodCreditsPendingTotal ?? 0)}
                    </Text>
                  </View>
                </View>

                {/* Barra comparativa sencilla: Dinero fiado vs Dinero recuperado */}
                <View style={s.comparisonBox}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Text style={s.comparisonTitle}>Relación: Fiado vs Recuperado</Text>
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
                            Recuperado: {paymentBarPct}% ({formatCOP(stats?.periodPaymentsTotal ?? 0)})
                          </Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>

                {/* Mensaje dinámico y práctico para tomar decisiones */}
                {stats?.insights.messages && stats.insights.messages.length > 0 && (
                  <View style={s.insightBox}>
                    <Ionicons name="bulb-outline" size={18} color={Colors.primary} style={{marginTop: 1, flexShrink: 0}} />
                    <View style={{flex: 1, gap: 2}}>
                      <Text style={s.insightText}>{stats.insights.messages[0]}</Text>
                      {stats.insights.messages[1] && (
                        <Text style={s.insightSubText}>{stats.insights.messages[1]}</Text>
                      )}
                    </View>
                  </View>
                )}
              </Card>
            </View>

            {/* ══════════════════════════════════════════════════════════
                2. SEGUNDA SECCIÓN: ATENCIÓN A TUS CLIENTES
               ══════════════════════════════════════════════════════════ */}
            <View style={s.sectionBlock}>
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionTitle}>2. ATENCIÓN A TUS CLIENTES</Text>
                <Text style={s.sectionSub}>Cobros prioritarios</Text>
              </View>

              {(!stats?.attentionList || stats.attentionList.length === 0) ? (
                <Card style={s.allUpToDateCard}>
                  <Ionicons name="checkmark-circle" size={26} color={Colors.success} style={{flexShrink: 0}} />
                  <Text style={s.allUpToDateText}>
                    ¡Al día! No tienes clientes con alertas o cobros pendientes prioritarios en este momento.
                  </Text>
                </Card>
              ) : (
                <View style={{gap: 10}}>
                  {stats.attentionList.map(item => (
                    <TouchableOpacity
                      key={item.customer_id}
                      activeOpacity={0.85}
                      onPress={() =>
                        navigation.navigate('CustomerDetail', {
                          id: item.customer_id,
                        })
                      }
                      style={s.alertCard}>
                      {/* Cabecera con motivo de atención */}
                      <View style={s.alertTopRow}>
                        <View style={s.alertBadgeBox}>
                          <Text style={s.alertBadgeText}>{item.attention_badge}</Text>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                          <Text style={s.alertVerCuenta}>Ver cuenta</Text>
                          <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
                        </View>
                      </View>

                      {/* Nombre y Deuda actual */}
                      <View style={s.alertMainRow}>
                        <View style={{flex: 1, minWidth: 0}}>
                          <Text style={s.alertCustomerName} numberOfLines={1}>
                            {item.alias || item.name}
                          </Text>
                          {item.alias ? (
                            <Text style={s.alertCustomerSub} numberOfLines={1}>
                              {item.name}
                            </Text>
                          ) : null}
                          <Text style={s.alertPaymentSub}>
                            {item.days_since_last_payment !== null
                              ? `Último abono: hace ${item.days_since_last_payment} días`
                              : 'Sin abonos registrados en la tienda'}
                          </Text>
                        </View>

                        <View style={{alignItems: 'flex-end', flexShrink: 0}}>
                          <Text style={s.alertBalanceLabel}>DEBE ACTUALMENTE</Text>
                          <Text style={s.alertBalanceValue}>
                            {formatCOP(item.current_balance)}
                          </Text>
                          <Text style={s.alertDaysText}>{item.debt_days} días con deuda</Text>
                        </View>
                      </View>

                      {/* Botón WhatsApp directo */}
                      {item.phone ? (
                        <TouchableOpacity
                          onPress={() =>
                            openWhatsAppCustomerReminder(
                              item.phone,
                              item.alias || item.name,
                              item.current_balance,
                              profile?.store_name,
                            )
                          }
                          style={s.alertWaBtn}
                          activeOpacity={0.8}>
                          <Ionicons name="logo-whatsapp" size={16} color="#15803D" />
                          <Text style={s.alertWaText}>Enviar recordatorio por WhatsApp</Text>
                        </TouchableOpacity>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* ══════════════════════════════════════════════════════════
                3. TERCERA SECCIÓN: ESTADÍSTICAS POR CLIENTES
               ══════════════════════════════════════════════════════════ */}
            <View style={s.sectionBlock14}>
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionTitle}>3. ESTADÍSTICAS POR CLIENTES</Text>
                <Text style={s.sectionSub}>Individual o grupal</Text>
              </View>

              {/* Selector de clientes: Ubicado AQUÍ debajo de generales */}
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Pressable
                  onPress={() => setShowCustomerPicker(true)}
                  style={[
                    s.customerBtn,
                    selectedIds.length > 0 && {borderColor: Colors.primary, borderWidth: 1.5},
                  ]}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0}}>
                    <Ionicons
                      name="people-outline"
                      color={selectedIds.length > 0 ? Colors.primary : Colors.textSecondary}
                      size={18}
                    />
                    <Text
                      style={[
                        s.customerBtnText,
                        selectedIds.length > 0 && {color: Colors.primaryDark, fontWeight: '800'},
                      ]}
                      numberOfLines={1}>
                      {selectedIds.length === 0
                        ? `Todos los clientes (${allCustomers.length})`
                        : `${selectedIds.length} cliente${selectedIds.length === 1 ? '' : 's'}: ${selectedNames.slice(0, 2).join(', ')}${selectedNames.length > 2 ? '…' : ''}`}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={selectedIds.length > 0 ? Colors.primary : Colors.textSecondary}
                  />
                </Pressable>

                {selectedIds.length > 0 && (
                  <TouchableOpacity
                    onPress={clearCustomerSelection}
                    style={s.clearBtn}
                    activeOpacity={0.8}>
                    <Ionicons name="refresh-outline" size={16} color={Colors.textSecondary} />
                    <Text style={s.clearBtnText}>Ver todos</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Indicadores Consolidados de los clientes seleccionados */}
              <Card style={s.consolidationCard}>
                <View style={s.consolidationHeader}>
                  <Text style={s.consolidationTitle}>
                    {selectedIds.length === 0
                      ? 'RESUMEN GENERAL DE CLIENTES'
                      : `RESUMEN DE ${selectedIds.length} CLIENTE${selectedIds.length === 1 ? '' : 'S'} SELECCIONADO${selectedIds.length === 1 ? '' : 'S'}`}
                  </Text>
                  <Text style={s.consolidationPresetLabel}>En {activePreset.label}</Text>
                </View>

                <View style={{gap: 10}}>
                  <View style={{flexDirection: 'row', gap: 10}}>
                    {/* Saldo pendiente actual */}
                    <View style={s.consolidationItem}>
                      <Text style={s.consolidationItemLabel}>SALDO PENDIENTE ACTUAL</Text>
                      <Text
                        style={[
                          s.consolidationItemValue,
                          {
                            color:
                              (stats?.consolidation.selectedCurrentBalance ?? 0) > 0
                                ? Colors.destructive
                                : Colors.success,
                          },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit>
                        {formatCOP(stats?.consolidation.selectedCurrentBalance ?? 0)}
                      </Text>
                    </View>

                    {/* Fiados realizados */}
                    <View style={s.consolidationItem}>
                      <Text style={s.consolidationItemLabel}>FIADOS REALIZADOS</Text>
                      <Text
                        style={[s.consolidationItemValue, {color: Colors.text}]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}>
                        {stats?.consolidation.selectedCreditsCount ?? 0} movimiento{(stats?.consolidation.selectedCreditsCount ?? 0) === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </View>

                  <View style={{flexDirection: 'row', gap: 10}}>
                    {/* Total fiado en período */}
                    <View style={[s.consolidationItem, {backgroundColor: '#FFF1F0', borderColor: '#FCE0DE'}]}>
                      <Text style={[s.consolidationItemLabel, {color: Colors.destructive}]}>
                        TOTAL FIADO ({activePreset.label})
                      </Text>
                      <Text
                        style={[s.consolidationItemValue, {color: Colors.destructive}]}
                        numberOfLines={1}
                        adjustsFontSizeToFit>
                        {formatCOP(stats?.consolidation.selectedCreditsTotal ?? 0)}
                      </Text>
                    </View>

                    {/* Total abonado en período */}
                    <View style={[s.consolidationItem, {backgroundColor: Colors.successAlt, borderColor: '#BBF7D0'}]}>
                      <Text style={[s.consolidationItemLabel, {color: Colors.success}]}>
                        TOTAL ABONADO ({activePreset.label})
                      </Text>
                      <Text
                        style={[s.consolidationItemValue, {color: Colors.success}]}
                        numberOfLines={1}
                        adjustsFontSizeToFit>
                        {formatCOP(stats?.consolidation.selectedPaymentsTotal ?? 0)}
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>

              {/* Filtro rápido por estado (Chips magnéticos) */}
              <View style={{gap: 10}}>
                <View style={s.customerListHead}>
                  <Text style={s.customerListTitle}>Listado de clientes</Text>
                  <Text style={s.customerListCount}>
                    {filteredRows.length} cliente{filteredRows.length === 1 ? '' : 's'}
                  </Text>
                </View>

                <MagnetFilterBar
                  scrollable
                  options={customerFilterOptions}
                  selectedKey={quickFilter}
                  onSelect={setQuickFilter}
                />
              </View>

              {/* Tarjetas individuales de clientes con jerarquía mejorada */}
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
                        {/* 1. Información Principal: Nombre + Badge */}
                        <View style={s.itemHead}>
                          <View style={{flex: 1, minWidth: 0}}>
                            <Text style={s.itemName} numberOfLines={1}>
                              {row.alias || row.name}
                            </Text>
                            {row.alias ? (
                              <Text style={s.itemRealName} numberOfLines={1}>
                                {row.name}
                              </Text>
                            ) : null}
                          </View>

                          <View style={[s.badgeBox, {backgroundColor: badgeBg}]}>
                            <Text style={[s.badgeText, {color: badgeFg}]}>
                              {badgeLabel}
                            </Text>
                          </View>
                        </View>

                        {/* Bloque Destacado de Saldo Actual y Antigüedad */}
                        <View style={s.itemBalanceBox}>
                          <View>
                            <Text style={s.itemBalanceLabel}>SALDO PENDIENTE ACTUAL</Text>
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
                              {isAlDia ? 'Sin deuda' : `Deuda: ${row.debt_days} días`}
                            </Text>
                            <Text style={s.itemAgeSub}>
                              {row.days_since_last_payment !== null
                                ? `Últ. abono: hace ${row.days_since_last_payment}d`
                                : 'Sin abonos'}
                            </Text>
                          </View>
                        </View>

                        {/* 2. Información Complementaria: Movimientos del período */}
                        <View style={s.itemPeriodRow}>
                          <Text style={s.itemPeriodTitle}>En este período ({activePreset.label}):</Text>
                          <Text style={s.itemPeriodNumbers}>
                            Fiado: <Text style={{color: Colors.destructive, fontWeight: '700'}}>{formatCOP(row.period_credits)}</Text>
                            {' · '}
                            Abonado: <Text style={{color: Colors.success, fontWeight: '700'}}>{formatCOP(row.period_payments)}</Text>
                          </Text>
                        </View>

                        {/* 3. Acciones claras */}
                        <View style={s.itemActionsRow}>
                          <TouchableOpacity
                            onPress={() => navigation.navigate('CustomerDetail', {id: row.customer_id})}
                            style={s.actionBtnSecondary}
                            activeOpacity={0.8}>
                            <Ionicons name="receipt-outline" size={15} color={Colors.text} />
                            <Text style={s.actionBtnSecondaryText}>Ver cuenta</Text>
                          </TouchableOpacity>

                          {row.current_balance > 0 && (
                            <TouchableOpacity
                              onPress={() => navigation.navigate('NewPayment', {customerId: row.customer_id})}
                              style={s.actionBtnPrimary}
                              activeOpacity={0.8}>
                              <Ionicons name="cash-outline" size={15} color={Colors.primaryDark} />
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
                              <Ionicons name="logo-whatsapp" size={19} color="#16A34A" />
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

      {/* ══════════════════════════════════════════════════════════
          MODAL SELECTOR DE CLIENTES (Búsqueda + Selección Múltiple)
         ══════════════════════════════════════════════════════════ */}
      <Modal
        visible={showCustomerPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCustomerPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            {/* Cabecera del modal */}
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Filtrar por clientes</Text>
              <Pressable
                onPress={() => setShowCustomerPicker(false)}
                hitSlop={8}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            {/* Buscador de clientes */}
            <View style={s.modalSearchContainer}>
              <View style={s.modalSearchBox}>
                <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
                <TextInput
                  placeholder="Buscar por nombre o cédula…"
                  placeholderTextColor={Colors.textSecondary}
                  value={customerSearchTerm}
                  onChangeText={setCustomerSearchTerm}
                  style={s.modalSearchInput}
                  autoCorrect={false}
                />
                {customerSearchTerm ? (
                  <Pressable onPress={() => setCustomerSearchTerm('')} hitSlop={8}>
                    <Ionicons name="close" size={16} color={Colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Lista scrolleable de clientes */}
            <FlatList
              data={filteredCustomersInPicker}
              keyExtractor={item => item.id}
              contentContainerStyle={{padding: 16}}
              showsVerticalScrollIndicator={true}
              ListHeaderComponent={
                <Pressable
                  onPress={() => {
                    setSelectedIds([]);
                    setShowCustomerPicker(false);
                  }}
                  style={[
                    s.modalItem,
                    selectedIds.length === 0 && s.modalItemSelected,
                  ]}>
                  <Text
                    style={[
                      s.modalItemText,
                      selectedIds.length === 0 && {color: Colors.primaryDark, fontWeight: '800'},
                    ]}>
                    ✓ Todos los clientes ({allCustomers.length})
                  </Text>
                  {selectedIds.length === 0 ? (
                    <Ionicons name="checkmark" size={18} color={Colors.primary} />
                  ) : null}
                </Pressable>
              }
              renderItem={({item}) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <Pressable
                    onPress={() => toggleCustomer(item.id)}
                    style={[
                      s.modalItem,
                      selected && s.modalItemSelected,
                    ]}>
                    <View style={{flex: 1, minWidth: 0}}>
                      <Text
                        style={[
                          s.modalItemText,
                          selected && {color: Colors.primaryDark, fontWeight: '700'},
                        ]}
                        numberOfLines={1}>
                        {item.alias || item.name}
                      </Text>
                      {item.alias ? (
                        <Text style={s.modalItemSubText} numberOfLines={1}>
                          {item.name}
                        </Text>
                      ) : null}
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
                    ) : (
                      <View style={s.checkboxSquare} />
                    )}
                  </Pressable>
                );
              }}
            />

            {/* Footer del modal con acciones */}
            <View style={s.modalFooter}>
              {selectedIds.length > 0 && (
                <TouchableOpacity
                  onPress={clearCustomerSelection}
                  style={s.modalClearBtn}
                  activeOpacity={0.85}>
                  <Text style={s.modalClearBtnText}>Limpiar selección</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setShowCustomerPicker(false)}
                style={[s.modalCloseBtn, selectedIds.length > 0 && {flex: 1.5}]}
                activeOpacity={0.85}>
                <Text style={s.modalCloseBtnText}>
                  {selectedIds.length > 0 ? `Ver (${selectedIds.length}) seleccionados` : 'Listo'}
                </Text>
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
    gap: 20,
  },
  sectionBlock: {
    gap: 12,
  },
  sectionBlock14: {
    gap: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.primaryDark,
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  sectionSub: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    flexShrink: 0,
  },
  mainReceivableCard: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1.5,
    borderColor: Colors.primaryMid,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    ...Platform.select({
      ios: {shadowColor: '#EA580C', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.08, shadowRadius: 16},
      android: {elevation: 3},
    }),
  },
  mainReceivableIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.06, shadowRadius: 8},
      android: {elevation: 2},
    }),
  },
  mainReceivableLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primaryDark,
    letterSpacing: 0.8,
  },
  mainReceivableValue: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.primaryDark,
    marginTop: 2,
    letterSpacing: -0.5,
  },
  mainReceivableSub: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 3,
  },
  periodContainerCard: {
    padding: 16,
    borderRadius: 20,
    gap: 14,
  },
  periodHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  periodTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  periodActiveLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    flexShrink: 0,
  },
  summaryTwoColsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 3,
  },
  summaryDebt: {
    backgroundColor: '#FFF1F0',
    borderColor: '#FCE0DE',
  },
  summaryPaid: {
    backgroundColor: Colors.successAlt,
    borderColor: '#BBF7D0',
  },
  summaryPendingRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  summarySub: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  pendingValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#B45309',
    textAlign: 'right',
  },
  comparisonBox: {
    paddingTop: 4,
    gap: 8,
  },
  comparisonTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  emptyFlowText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 6,
  },
  barTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    flexDirection: 'row',
    overflow: 'hidden',
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
  insightBox: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 2,
  },
  insightText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 17,
  },
  insightSubText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
    lineHeight: 15,
  },
  allUpToDateCard: {
    padding: 16,
    backgroundColor: Colors.successAlt,
    borderColor: '#BBF7D0',
    borderWidth: 1.5,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  allUpToDateText: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '700',
    lineHeight: 18,
    flex: 1,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    ...Platform.select({
      ios: {shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.04, shadowRadius: 8},
      android: {elevation: 1.5},
    }),
  },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  alertBadgeBox: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: Colors.primaryMid,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  alertBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  alertVerCuenta: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  alertMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  alertCustomerName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  alertCustomerSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  alertPaymentSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 4,
  },
  alertBalanceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  alertBalanceValue: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.destructive,
    marginTop: 1,
  },
  alertDaysText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  alertWaBtn: {
    marginTop: 2,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  alertWaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  customerBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    ...Platform.select({
      ios: {shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.03, shadowRadius: 6},
      android: {elevation: 1},
    }),
  },
  customerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  clearBtn: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  consolidationCard: {
    padding: 16,
    borderRadius: 20,
    gap: 12,
  },
  consolidationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  consolidationTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  consolidationPresetLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    flexShrink: 0,
  },
  consolidationItem: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  consolidationItemLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  consolidationItemValue: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  customerListHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  customerListTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    flexShrink: 1,
  },
  customerListCount: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    flexShrink: 0,
  },
  customersStack: {
    gap: 10,
  },
  emptyCustomersCard: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  emptyCustomersText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  itemCard: {
    padding: 16,
    gap: 12,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Platform.select({
      ios: {shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.03, shadowRadius: 8},
      android: {elevation: 1.5},
    }),
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  itemRealName: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
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
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemBalanceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  itemBalanceValue: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 1,
  },
  itemAgeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  itemAgeSub: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  itemPeriodRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
  },
  itemPeriodTitle: {
    fontSize: 11,
    fontWeight: '700',
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
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  actionBtnPrimary: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  actionBtnWa: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
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
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHead: {
    paddingHorizontal: 20,
    paddingVertical: 16,
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
  modalSearchContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    padding: 0,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalItemSelected: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  modalItemSubText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  checkboxSquare: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    gap: 10,
  },
  modalClearBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalClearBtnText: {
    color: Colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  modalCloseBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  loadingCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
