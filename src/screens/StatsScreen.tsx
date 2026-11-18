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
  TextInput,
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
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
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
      <Header title="Estadísticas" subtitle="Así va tu negocio y tus clientes" />

      <ScrollView
        contentContainerStyle={[
          s.content,
          {paddingBottom: insets.bottom + 90},
          tabletContainerStyle(720),
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
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>1. ASÍ ESTÁ TU NEGOCIO</Text>
              <Text style={s.sectionSub}>Visión general</Text>
            </View>

            {/* Indicador Principal: Dinero total por cobrar (Estado de Cartera Viva) */}
            <View style={s.mainReceivableCard}>
              <View style={s.mainReceivableIcon}>
                <Ionicons name="wallet-outline" size={26} color={Colors.primary} />
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

            {/* Contenedor de Movimientos del Período */}
            <Card style={s.periodContainerCard}>
              {/* Selector de periodo directamente asociado a los movimientos */}
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

              {/* 3 Indicadores: Dinero fiado, Dinero recuperado, Dinero que sigue pendiente */}
              <View style={[s.summaryGrid, isSmall && {flexDirection: 'column'}]}>
                {/* Dinero fiado */}
                <View style={[s.summaryCard, s.summaryDebt]}>
                  <View style={s.summaryTopRow}>
                    <View style={[s.summaryIconCircle, {backgroundColor: Colors.destructiveAlt}]}>
                      <Ionicons name="arrow-up" size={13} color={Colors.destructive} />
                    </View>
                    <Text style={[s.summaryLabel, {color: Colors.destructive}]}>DINERO FIADO</Text>
                  </View>
                  <Text style={[s.summaryValue, {color: Colors.destructive}]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCOP(stats?.periodCreditsTotal ?? 0)}
                  </Text>
                  <Text style={s.summarySub}>
                    {stats?.periodCreditsCount ?? 0} fiado{(stats?.periodCreditsCount ?? 0) === 1 ? '' : 's'}
                  </Text>
                </View>

                {/* Dinero recuperado */}
                <View style={[s.summaryCard, s.summaryPaid]}>
                  <View style={s.summaryTopRow}>
                    <View style={[s.summaryIconCircle, {backgroundColor: '#DCFCE7'}]}>
                      <Ionicons name="arrow-down" size={13} color={Colors.success} />
                    </View>
                    <Text style={[s.summaryLabel, {color: Colors.success}]}>RECUPERADO</Text>
                  </View>
                  <Text style={[s.summaryValue, {color: Colors.success}]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCOP(stats?.periodPaymentsTotal ?? 0)}
                  </Text>
                  <Text style={s.summarySub}>
                    {stats?.periodPaymentsCount ?? 0} abono{(stats?.periodPaymentsCount ?? 0) === 1 ? '' : 's'}
                  </Text>
                </View>

                {/* Dinero que sigue pendiente */}
                <View style={[s.summaryCard, s.summaryPending]}>
                  <View style={s.summaryTopRow}>
                    <View style={[s.summaryIconCircle, {backgroundColor: '#FEF3C7'}]}>
                      <Ionicons name="hourglass-outline" size={13} color="#D97706" />
                    </View>
                    <Text style={[s.summaryLabel, {color: '#B45309'}]}>SIGUE PENDIENTE</Text>
                  </View>
                  <Text style={[s.summaryValue, {color: '#B45309'}]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCOP(stats?.periodCreditsPendingTotal ?? 0)}
                  </Text>
                  <Text style={s.summarySub}>De lo fiado en período</Text>
                </View>
              </View>

              {/* Barra comparativa sencilla: Fiado vs Recuperado */}
              <View style={s.comparisonBox}>
                <Text style={s.comparisonTitle}>Relación: Fiado vs Recuperado</Text>

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

              {/* Mensaje dinámico de ayuda para el tendero */}
              {stats?.insights.messages && stats.insights.messages.length > 0 && (
                <View style={s.insightBox}>
                  <Ionicons name="bulb-outline" size={18} color={Colors.primary} style={{marginTop: 1}} />
                  <View style={{flex: 1, gap: 2}}>
                    <Text style={s.insightText}>{stats.insights.messages[0]}</Text>
                    {stats.insights.messages[1] && (
                      <Text style={s.insightSubText}>{stats.insights.messages[1]}</Text>
                    )}
                  </View>
                </View>
              )}
            </Card>

            {/* ══════════════════════════════════════════════════════════
                2. SEGUNDA SECCIÓN: ATENCIÓN A TUS CLIENTES
               ══════════════════════════════════════════════════════════ */}
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>2. ATENCIÓN A TUS CLIENTES</Text>
              <Text style={s.sectionSub}>Cobros prioritarios</Text>
            </View>

            {(!stats?.attentionList || stats.attentionList.length === 0) ? (
              <Card style={s.allUpToDateCard}>
                <Ionicons name="checkmark-circle" size={26} color={Colors.success} />
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
                    {/* Tag de razón de atención */}
                    <View style={s.alertTopRow}>
                      <View style={s.alertBadgeBox}>
                        <Text style={s.alertBadgeText}>{item.attention_badge}</Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                        <Text style={s.alertVerCuenta}>Ver cuenta</Text>
                        <Ionicons name="chevron-forward" size={13} color={Colors.textSecondary} />
                      </View>
                    </View>

                    {/* Nombre y Saldo actual */}
                    <View style={s.alertMainRow}>
                      <View style={{flex: 1, minWidth: 0}}>
                        <Text style={s.alertCustomerName} numberOfLines={1}>
                          {item.alias || item.name}
                        </Text>
                        {item.alias && (
                          <Text style={s.alertCustomerSub} numberOfLines={1}>
                            {item.name}
                          </Text>
                        )}
                        <Text style={s.alertPaymentSub}>
                          {item.days_since_last_payment !== null
                            ? `Último abono: hace ${item.days_since_last_payment} días`
                            : 'Sin abonos registrados en la tienda'}
                        </Text>
                      </View>

                      <View style={{alignItems: 'flex-end'}}>
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
                        <Ionicons name="logo-whatsapp" size={16} color="#16A34A" />
                        <Text style={s.alertWaText}>Enviar recordatorio por WhatsApp</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ══════════════════════════════════════════════════════════
                3. TERCERA SECCIÓN: ESTADÍSTICAS POR CLIENTES
               ══════════════════════════════════════════════════════════ */}
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
                  <Ionicons name="refresh-outline" size={15} color={Colors.textSecondary} />
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

              <View style={s.consolidationGrid}>
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
                  <Text style={[s.consolidationItemValue, {color: Colors.text}]} numberOfLines={1}>
                    {stats?.consolidation.selectedCreditsCount ?? 0} movimiento{(stats?.consolidation.selectedCreditsCount ?? 0) === 1 ? '' : 's'}
                  </Text>
                </View>

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
            </Card>

            {/* Listado y Filtros rápidos (Efecto Imán) */}
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

            {/* Tarjetas individuales de clientes */}
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
          </>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════════════════════
          MODAL SELECTOR DE CLIENTES (Búsqueda + Selección)
         ══════════════════════════════════════════════════════════ */}
      <Modal
        visible={showCustomerPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCustomerPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Filtrar por clientes</Text>
              <Pressable onPress={() => setShowCustomerPicker(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            {/* Buscador de clientes */}
            <View style={s.modalSearchContainer}>
              <View style={s.modalSearchBox}>
                <Ionicons name="search-outline" size={16} color={Colors.textSecondary} />
                <TextInput
                  placeholder="Buscar por nombre o cédula…"
                  placeholderTextColor={Colors.textSecondary}
                  value={customerSearchTerm}
                  onChangeText={setCustomerSearchTerm}
                  style={s.modalSearchInput}
                />
                {customerSearchTerm ? (
                  <Pressable onPress={() => setCustomerSearchTerm('')}>
                    <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <FlatList
              data={filteredCustomersInPicker}
              keyExtractor={item => item.id}
              contentContainerStyle={{padding: 16}}
              ListHeaderComponent={
                <Pressable
                  onPress={() => {
                    setSelectedIds([]);
                    setShowCustomerPicker(false);
                  }}
                  style={[
                    s.modalItem,
                    selectedIds.length === 0 && {backgroundColor: Colors.primaryLight, borderColor: Colors.primary, borderWidth: 1.5},
                  ]}>
                  <Text
                    style={[
                      s.modalItemText,
                      selectedIds.length === 0 && {color: Colors.primaryDark, fontWeight: '800'},
                    ]}>
                    ✓ Todos los clientes ({allCustomers.length})
                  </Text>
                  {selectedIds.length === 0 && (
                    <Ionicons name="checkmark" size={18} color={Colors.primary} />
                  )}
                </Pressable>
              }
              renderItem={({item}) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <Pressable
                    onPress={() => toggleCustomer(item.id)}
                    style={[
                      s.modalItem,
                      selected && {backgroundColor: Colors.primaryLight, borderColor: Colors.primary, borderWidth: 1.5},
                    ]}>
                    <View style={{flex: 1}}>
                      <Text
                        style={[
                          s.modalItemText,
                          selected && {color: Colors.primaryDark, fontWeight: '700'},
                        ]}>
                        {item.alias || item.name}
                      </Text>
                      {item.alias && (
                        <Text style={s.modalItemSubText}>{item.name}</Text>
                      )}
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color={Colors.primary} />
                    ) : (
                      <View style={s.checkboxSquare} />
                    )}
                  </Pressable>
                );
              }}
            />

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
    gap: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.primaryDark,
    letterSpacing: 0.8,
  },
  sectionSub: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
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
    ...Platform.select({
      ios: {shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.06, shadowRadius: 4},
      android: {elevation: 1},
    }),
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
    letterSpacing: -0.5,
  },
  mainReceivableSub: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 2,
  },
  periodContainerCard: {
    padding: 16,
    borderRadius: 18,
    gap: 12,
  },
  periodHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  periodTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.5,
  },
  periodActiveLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 2,
  },
  summaryDebt: {
    backgroundColor: '#FFF1F0',
    borderColor: '#FCE0DE',
  },
  summaryPaid: {
    backgroundColor: Colors.successAlt,
    borderColor: '#BBF7D0',
  },
  summaryPending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  summaryIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '900',
  },
  summarySub: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 1,
  },
  comparisonBox: {
    paddingTop: 4,
    gap: 6,
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
    height: 10,
    borderRadius: 5,
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
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  insightBox: {
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  insightText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 16,
  },
  insightSubText: {
    fontSize: 10.5,
    color: Colors.textSecondary,
    fontWeight: '500',
    lineHeight: 14,
  },
  allUpToDateCard: {
    padding: 16,
    backgroundColor: Colors.successAlt,
    borderColor: '#BBF7D0',
    borderWidth: 1.5,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  allUpToDateText: {
    fontSize: 12.5,
    color: '#166534',
    fontWeight: '700',
    flex: 1,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    ...Platform.select({
      ios: {shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.04, shadowRadius: 6},
      android: {elevation: 1},
    }),
  },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertBadgeBox: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: Colors.primaryMid,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  alertBadgeText: {
    fontSize: 10.5,
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
    gap: 8,
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
  },
  alertPaymentSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 3,
  },
  alertBalanceLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  alertBalanceValue: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.destructive,
    marginTop: 1,
  },
  alertDaysText: {
    fontSize: 10.5,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  alertWaBtn: {
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginTop: 2,
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
  clearBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
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
    padding: 14,
    borderRadius: 18,
    gap: 10,
  },
  consolidationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  consolidationTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.5,
  },
  consolidationPresetLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  consolidationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  consolidationItem: {
    width: '48.5%',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  consolidationItemLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  consolidationItemValue: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  customerListHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerListTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  customerListCount: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  customersStack: {
    gap: 10,
  },
  emptyCustomersCard: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 16,
  },
  emptyCustomersText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  itemCard: {
    padding: 16,
    gap: 10,
    borderRadius: 18,
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
    fontSize: 10.5,
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
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  itemBalanceValue: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 1,
  },
  itemAgeLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  itemAgeSub: {
    fontSize: 10.5,
    fontWeight: '600',
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
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  itemPeriodNumbers: {
    fontSize: 11.5,
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
    paddingVertical: 9,
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
    width: 38,
    height: 38,
    borderRadius: 10,
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
  modalSearchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  modalItemSubText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  checkboxSquare: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  modalFooter: {
    padding: 16,
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
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalClearBtnText: {
    color: Colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  modalCloseBtn: {
    flex: 1,
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
});
