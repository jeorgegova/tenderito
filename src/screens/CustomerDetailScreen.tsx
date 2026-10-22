import {useQuery} from '@tanstack/react-query';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {SyncBadge} from '../components/ui/Badge';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {FooterMenu} from '../components/ui/FooterMenu';
import {showAlert} from '../utils/alert';
import {fetchCreditsByCustomer} from '../services/credits';
import {fetchCustomerById} from '../services/customers';
import {fetchPaymentsByCustomer} from '../services/payments';
import {useStore} from '../store/useStore';
import {Colors, Radius, formatCOP} from '../theme';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const MONTH_SHORT_NAMES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const getCurrentMonthKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getMonthKeyFromDate = (dateStr?: string | null) => {
  if (!dateStr) {
    return '';
  }
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    }
  } catch (_e) {}
  return String(dateStr).slice(0, 7);
};

const formatMonthLabel = (monthKey: string) => {
  if (monthKey === 'all') {
    return 'Todos los meses';
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  const monthName = MONTH_NAMES[monthIdx] || monthKey;
  return `${monthName} ${yearStr}`;
};

const formatMonthHeader = (monthKey: string) => {
  if (monthKey === 'all') {
    return 'TODOS';
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  const monthName = MONTH_NAMES[monthIdx] || monthKey;
  const currentYear = new Date().getFullYear().toString();
  if (yearStr === currentYear) {
    return monthName.toUpperCase();
  }
  const shortMonth = MONTH_SHORT_NAMES[monthIdx] || monthKey;
  return `${shortMonth.toUpperCase()} ${yearStr}`;
};

const normalizeSearchText = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const generateAvailableMonths = (createdAt?: string | null) => {
  const months: string[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let pastLimitMonths = 12;
  if (createdAt) {
    try {
      const createdDate = new Date(createdAt);
      if (!isNaN(createdDate.getTime())) {
        const diffYears = currentYear - createdDate.getFullYear();
        const diffMonths =
          diffYears * 12 + (currentMonth - createdDate.getMonth());
        if (diffMonths > 12) {
          pastLimitMonths = Math.min(diffMonths + 1, 36);
        }
      }
    } catch (_e) {}
  }

  for (let i = 0; i < pastLimitMonths; i++) {
    const d = new Date(currentYear, currentMonth - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
  }
  return months;
};

export function CustomerDetailScreen({route, navigation}: any) {
  const {id} = route.params as {id: string};
  const profile = useStore(s => s.profile);
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'payment'>(
    'all',
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey);
  const [isMonthModalVisible, setIsMonthModalVisible] = useState(false);
  const [searchConcept, setSearchConcept] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Animaciones suaves para la apertura y cierre del buscador
  const searchInputRef = useRef<TextInput>(null);
  const searchAnim = useRef(new Animated.Value(0)).current;

  const handleOpenSearch = () => {
    setIsSearchOpen(true);
    Animated.timing(searchAnim, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      searchInputRef.current?.focus();
    });
  };

  const handleCloseSearch = () => {
    Animated.timing(searchAnim, {
      toValue: 0,
      duration: 320,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsSearchOpen(false);
        setSearchConcept('');
      }
    });
  };

  const conceptRowOpacity = searchAnim.interpolate({
    inputRange: [0, 0.4],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const conceptRowTranslateX = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const searchBoxOpacity = searchAnim.interpolate({
    inputRange: [0.1, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const searchBoxScaleX = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.65, 1],
  });

  const searchBoxTranslateX = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  const customer = useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchCustomerById(id),
    enabled: !!id,
  });

  const credits = useQuery({
    queryKey: ['credits', id],
    queryFn: () => fetchCreditsByCustomer(id),
    enabled: !!id,
  });

  const payments = useQuery({
    queryKey: ['payments', id],
    queryFn: () => fetchPaymentsByCustomer(id),
    enabled: !!id,
  });

  // Movimientos combinados y ordenados por fecha más reciente
  const allMovements = useMemo(() => {
    const cr = (credits.data ?? []).map(c => ({
      id: c.id,
      kind: 'credit' as const,
      title: c.concept || 'Compra fiada',
      amount: Number(c.amount || 0),
      date: c.created_at,
      dueDate: c.due_date,
      estadoServidor: c.estadoServidor,
      notes: null,
    }));

    const py = (payments.data ?? []).map(p => ({
      id: p.id,
      kind: 'payment' as const,
      title: p.notes ? `Abono: ${p.notes}` : 'Abono recibido',
      amount: Number(p.amount || 0),
      date: p.payment_date,
      dueDate: null,
      estadoServidor: p.estadoServidor,
      notes: p.notes,
    }));

    return [...cr, ...py].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [credits.data, payments.data]);

  // Lista de meses disponibles para selección
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    monthsSet.add(getCurrentMonthKey());

    allMovements.forEach(m => {
      const key = getMonthKeyFromDate(m.date);
      if (/^\d{4}-\d{2}$/.test(key)) {
        monthsSet.add(key);
      }
    });

    const genMonths = generateAvailableMonths(customer.data?.created_at);
    genMonths.forEach(m => monthsSet.add(m));

    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [allMovements, customer.data?.created_at]);

  // Movimientos filtrados por mes (por defecto mes actual)
  const monthMovements = useMemo(() => {
    if (selectedMonth === 'all') {
      return allMovements;
    }
    return allMovements.filter(
      m => getMonthKeyFromDate(m.date) === selectedMonth,
    );
  }, [allMovements, selectedMonth]);

  // Totales de movimientos del mes seleccionado
  const monthTotals = useMemo(() => {
    let creditsSum = 0;
    let paymentsSum = 0;
    monthMovements.forEach(m => {
      if (m.kind === 'credit') {
        creditsSum += m.amount;
      }
      if (m.kind === 'payment') {
        paymentsSum += m.amount;
      }
    });
    return {creditsSum, paymentsSum};
  }, [monthMovements]);

  // Movimientos según filtro de tipo (todo / compra / abono)
  const typeFilteredMovements = useMemo(() => {
    if (filterType === 'all') {
      return monthMovements;
    }
    return monthMovements.filter(m => m.kind === filterType);
  }, [monthMovements, filterType]);

  // Movimientos según filtro de búsqueda "Qué se llevó / Abono"
  const filteredMovements = useMemo(() => {
    const term = normalizeSearchText(searchConcept.trim());
    if (!term) {
      return typeFilteredMovements;
    }
    return typeFilteredMovements.filter(m => {
      const titleMatch = normalizeSearchText(m.title).includes(term);
      const notesMatch = m.notes
        ? normalizeSearchText(m.notes).includes(term)
        : false;
      return titleMatch || notesMatch;
    });
  }, [typeFilteredMovements, searchConcept]);

  const creditCount = monthMovements.filter(m => m.kind === 'credit').length;
  const paymentCount = monthMovements.filter(m => m.kind === 'payment').length;

  const currentBalance = Number(customer.data?.current_balance ?? 0);
  const creditLimit = Number(customer.data?.credit_limit ?? 0);
  const isPaid = currentBalance === 0;

  const handleCallCustomer = (phone?: string | null) => {
    if (!phone) {
      return;
    }
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      showAlert('No se pudo abrir el teléfono', `Número: ${phone}`);
    });
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch (_e) {
      return dateStr;
    }
  };

  const isOverdue = (dueDateStr?: string | null) => {
    if (!dueDateStr) {
      return false;
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      return dueDateStr < today;
    } catch (_e) {
      return false;
    }
  };

  return (
    <View style={styles.wrap}>
      <FlatList
        contentContainerStyle={styles.content}
        data={filteredMovements}
        keyExtractor={item => `${item.kind}-${item.id}`}
        refreshing={
          customer.isLoading || credits.isLoading || payments.isLoading
        }
        onRefresh={() => {
          customer.refetch();
          credits.refetch();
          payments.refetch();
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* ── Ficha del Cliente ── */}
            <Card style={styles.customerCard}>
              <View style={styles.customerRow}>
                <View
                  style={[styles.avatar, isPaid ? styles.avatarPaid : null]}>
                  <Text
                    style={[
                      styles.avatarText,
                      isPaid ? styles.avatarTextPaid : null,
                    ]}>
                    {(customer.data?.alias || customer.data?.name || '?')
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.customerName}>
                    {customer.data?.alias ||
                      customer.data?.name ||
                      'Cargando...'}
                  </Text>
                  {customer.data?.alias ? (
                    <Text style={styles.customerRealName}>
                      Nombre real: {customer.data.name}
                    </Text>
                  ) : null}
                  <Text style={styles.customerMeta}>
                    {customer.data?.document_type || 'CC'}{' '}
                    {customer.data?.document_number || 'Sin cédula'}
                  </Text>
                </View>
              </View>

              {/* Botón rápido para llamar al cliente */}
              {customer.data?.phone ? (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => handleCallCustomer(customer.data?.phone)}>
                  <Ionicons name="call" size={15} color="#15803D" />
                  <Text style={styles.callBtnText}>
                    Llamar al cliente ({customer.data.phone})
                  </Text>
                </TouchableOpacity>
              ) : null}

              {/* Historial en otras tiendas (si aplica plan de pago) */}
              {(profile?.subscription_plan ?? 'free') !== 'free' ? (
                <TouchableOpacity
                  style={styles.historyBtn}
                  onPress={() => navigation.navigate('CustomerHistory', {id})}>
                  <Ionicons
                    name="storefront-outline"
                    size={15}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.historyBtnText}>
                    Historial en otras tiendas
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>
              ) : null}

              {/* Caja de Deuda / Saldo en Grande y Claro */}
              <View
                style={[
                  styles.balanceBox,
                  isPaid ? styles.balanceBoxPaid : null,
                ]}>
                <Text
                  style={[
                    styles.balanceBoxLabel,
                    isPaid ? styles.balanceBoxLabelPaid : null,
                  ]}>
                  {isPaid
                    ? '¡ESTE CLIENTE ESTÁ AL DÍA!'
                    : 'ESTE CLIENTE TE DEBE:'}
                </Text>
                <Text
                  style={[
                    styles.balanceBoxAmount,
                    isPaid ? styles.balanceBoxAmountPaid : null,
                  ]}>
                  {formatCOP(currentBalance)}
                </Text>
                <Text style={styles.balanceBoxHelp}>
                  {isPaid
                    ? 'No tiene ninguna deuda pendiente contigo en este momento.'
                    : 'Es el valor total que tiene pendiente por pagar en tu tienda.'}
                  {creditLimit > 0
                    ? ` (Tope máximo de crédito permitido: ${formatCOP(
                        creditLimit,
                      )})`
                    : ''}
                </Text>
              </View>
            </Card>

            {/* ── Botones de Acción Principales (Grandes y Cómodos) ── */}
            <View style={styles.actionsRow}>
              <View style={styles.flexOne}>
                <Button
                  title="+ Nuevo fiado"
                  icon="credit"
                  onPress={() =>
                    navigation.navigate('NewCredit', {customerId: id})
                  }
                />
              </View>
              <View style={styles.flexOne}>
                <Button
                  title="− Abonar plata"
                  variant="secondary"
                  icon="incoming"
                  onPress={() =>
                    navigation.navigate('NewPayment', {customerId: id})
                  }
                />
              </View>
            </View>

            {/* ── Encabezado de la Libreta de Cuentas ── */}
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>
                Libreta de fiados y abonos
              </Text>
              <Text style={styles.sectionSubtitle}>
                Aquí ves cada compra fiada y cada abono recibido:
              </Text>
            </View>

            {/* ── Filtros Rápidos y Comprensibles ── */}
            <View style={styles.filterBar}>
              <Pressable
                onPress={() => setFilterType('all')}
                style={[
                  styles.filterChip,
                  filterType === 'all' && styles.filterChipActive,
                ]}>
                <Text
                  style={[
                    styles.filterChipText,
                    filterType === 'all' && styles.filterChipTextActive,
                  ]}>
                  Todo ({monthMovements.length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setFilterType('credit')}
                style={[
                  styles.filterChip,
                  filterType === 'credit' && styles.filterChipActive,
                ]}>
                <Text
                  style={[
                    styles.filterChipText,
                    filterType === 'credit' && styles.filterChipTextActive,
                  ]}>
                  Solo compras ({creditCount})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setFilterType('payment')}
                style={[
                  styles.filterChip,
                  filterType === 'payment' && styles.filterChipActive,
                ]}>
                <Text
                  style={[
                    styles.filterChipText,
                    filterType === 'payment' && styles.filterChipTextActive,
                  ]}>
                  Solo abonos ({paymentCount})
                </Text>
              </Pressable>
            </View>

            {/* ── Cabecera de la Tabla Libreta con Filtro Mes y Buscador Animado ── */}
            <View style={styles.tableHeaderRow}>
              {/* Filtro Mes (reemplaza FECHA por el mes seleccionado) */}
              <View style={styles.colDate}>
                <TouchableOpacity
                  style={styles.headerMonthBtn}
                  onPress={() => setIsMonthModalVisible(true)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <Text style={styles.headerMonthBtnText} numberOfLines={1}>
                    {formatMonthHeader(selectedMonth)}
                  </Text>
                  <Ionicons name="caret-down" size={10} color="#9A3412" />
                </TouchableOpacity>
              </View>

              {/* Filtro QUÉ SE LLEVÓ / ABONO con Lupa interactiva y animación */}
              <View style={[styles.colConcept, styles.colConceptHeader]}>
                {/* Vista 1: Título y Lupa (se desvanece suavemente al abrir) */}
                <Animated.View
                  pointerEvents={isSearchOpen ? 'none' : 'auto'}
                  style={[
                    styles.headerConceptRow,
                    {
                      opacity: conceptRowOpacity,
                      transform: [{ translateX: conceptRowTranslateX }],
                    },
                  ]}>
                  <Text style={styles.tableColHeader} numberOfLines={1}>
                    QUÉ SE LLEVÓ / ABONO
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.headerSearchIconBtn,
                      searchConcept.trim().length > 0 &&
                        styles.headerSearchIconBtnActive,
                    ]}
                    onPress={handleOpenSearch}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons
                      name="search"
                      size={12}
                      color={
                        searchConcept.trim().length > 0
                          ? '#FFFFFF'
                          : '#9A3412'
                      }
                    />
                  </TouchableOpacity>
                </Animated.View>

                {/* Vista 2: Input de Búsqueda (se expande y cierra animado despacio) */}
                <Animated.View
                  pointerEvents={isSearchOpen ? 'auto' : 'none'}
                  style={[
                    styles.headerSearchBox,
                    {
                      opacity: searchBoxOpacity,
                      transform: [
                        { scaleX: searchBoxScaleX },
                        { translateX: searchBoxTranslateX },
                      ],
                    },
                  ]}>
                  <Ionicons name="search" size={12} color={Colors.primary} />
                  <TextInput
                    ref={searchInputRef}
                    style={styles.headerSearchInput}
                    placeholder="Buscar qué se llevó..."
                    placeholderTextColor={Colors.textMuted}
                    value={searchConcept}
                    onChangeText={setSearchConcept}
                    returnKeyType="done"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={handleCloseSearch}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons
                      name="close-circle"
                      size={15}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </Animated.View>
              </View>

              {/* Columna Valor */}
              <View style={styles.colAmount}>
                <Text style={styles.tableColHeader}>VALOR</Text>
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          !credits.isLoading && !payments.isLoading ? (
            <View style={styles.tableEmpty}>
              <Ionicons
                name={
                  searchConcept.trim().length > 0
                    ? 'search-outline'
                    : 'receipt-outline'
                }
                size={36}
                color={Colors.textMuted}
              />
              <Text style={styles.tableEmptyTitle}>
                {searchConcept.trim().length > 0
                  ? 'Sin coincidencias'
                  : 'Sin movimientos en este mes'}
              </Text>
              <Text style={styles.tableEmptyText}>
                {searchConcept.trim().length > 0
                  ? `No hay compras ni abonos que contengan "${searchConcept}".`
                  : allMovements.length === 0
                  ? 'Este cliente aún no tiene compras fiadas ni abonos registrados.'
                  : `No hay compras ni abonos registrados para ${formatMonthLabel(
                      selectedMonth,
                    )}.`}
              </Text>
              {searchConcept.trim().length > 0 ? (
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => {
                    setSearchConcept('');
                    handleCloseSearch();
                  }}>
                  <Text style={styles.emptyActionBtnText}>Limpiar búsqueda</Text>
                </TouchableOpacity>
              ) : selectedMonth !== 'all' && allMovements.length > 0 ? (
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => setSelectedMonth('all')}>
                  <Text style={styles.emptyActionBtnText}>
                    Ver historial completo ({allMovements.length})
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={styles.tableEmpty}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.tableEmptyText}>Cargando libreta...</Text>
            </View>
          )
        }
        renderItem={({item, index}) => {
          const isCredit = item.kind === 'credit';
          const overdue = isCredit && isOverdue(item.dueDate);

          return (
            <View
              style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
              {/* Columna Fecha */}
              <View style={styles.colDate}>
                <Text style={styles.rowDateText}>
                  {formatDateDisplay(item.date)}
                </Text>
              </View>

              {/* Columna Detalle */}
              <View style={styles.colConcept}>
                <Text style={styles.rowConceptTitle} numberOfLines={2}>
                  {item.title}
                </Text>

                <View style={styles.rowBadgeWrap}>
                  <View
                    style={[
                      styles.kindBadge,
                      isCredit
                        ? styles.kindBadgeCredit
                        : styles.kindBadgePayment,
                    ]}>
                    <Text
                      style={[
                        styles.kindBadgeText,
                        isCredit
                          ? styles.kindBadgeTextCredit
                          : styles.kindBadgeTextPayment,
                      ]}>
                      {isCredit ? 'Compra fiada (+)' : 'Abono recibido (-)'}
                    </Text>
                  </View>
                  <SyncBadge estadoServidor={item.estadoServidor} />
                </View>

                {item.dueDate ? (
                  <View style={styles.dueRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={12}
                      color={
                        overdue ? Colors.destructive : Colors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.rowDueDate,
                        overdue && styles.rowDueDateOverdue,
                      ]}>
                      {overdue
                        ? `Vencido el: ${formatDateDisplay(item.dueDate)}`
                        : `Vence el: ${formatDateDisplay(item.dueDate)}`}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Columna Monto */}
              <View style={styles.colAmount}>
                <Text
                  style={[
                    styles.rowAmountText,
                    isCredit ? styles.rowAmountCredit : styles.rowAmountPayment,
                  ]}>
                  {isCredit ? '+' : '−'}
                  {formatCOP(item.amount)}
                </Text>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          monthMovements.length > 0 ? (
            <View style={styles.tableSummary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {selectedMonth === 'all'
                    ? 'Total fiado acumulado:'
                    : `Total fiado en ${formatMonthLabel(selectedMonth)}:`}
                </Text>
                <Text style={styles.summaryCreditValue}>
                  +{formatCOP(monthTotals.creditsSum)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {selectedMonth === 'all'
                    ? 'Total que te ha abonado:'
                    : `Total abonado en ${formatMonthLabel(selectedMonth)}:`}
                </Text>
                <Text style={styles.summaryPaymentValue}>
                  −{formatCOP(monthTotals.paymentsSum)}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryNetLabel}>
                  Saldo pendiente actual:
                </Text>
                <Text
                  style={[
                    styles.summaryNetValue,
                    isPaid
                      ? styles.summaryNetValuePaid
                      : styles.summaryNetValueOwing,
                  ]}>
                  {formatCOP(currentBalance)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.footerSpacer} />
          )
        }
      />

      {/* Modal para seleccionar el mes */}
      <Modal
        visible={isMonthModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMonthModalVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setIsMonthModalVisible(false)}>
          <Pressable
            style={styles.modalCard}
            onPress={e => e.stopPropagation()}>
            {/* Cabecera del modal */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleWrap}>
                <View style={styles.modalIconWrap}>
                  <Ionicons name="calendar" size={20} color={Colors.primary} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.modalTitle}>Seleccionar el mes...</Text>
                  <Text style={styles.modalSubtitle}>
                    Filtra las cuentas y abonos de este cliente por mes
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsMonthModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Lista de meses disponibles */}
            <ScrollView
              style={styles.modalMonthList}
              showsVerticalScrollIndicator={true}>
              {availableMonths.map(monthKey => {
                const isSelected = selectedMonth === monthKey;
                const isCurrent = monthKey === getCurrentMonthKey();
                const count = allMovements.filter(
                  m => getMonthKeyFromDate(m.date) === monthKey,
                ).length;

                return (
                  <TouchableOpacity
                    key={monthKey}
                    style={[
                      styles.modalMonthItem,
                      isSelected && styles.modalMonthItemSelected,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedMonth(monthKey);
                      setIsMonthModalVisible(false);
                    }}>
                    <View style={styles.modalMonthItemLeft}>
                      <View
                        style={[
                          styles.modalMonthItemIcon,
                          isSelected && styles.modalMonthItemIconSelected,
                        ]}>
                        <Ionicons
                          name="calendar-outline"
                          size={18}
                          color={
                            isSelected ? Colors.primary : Colors.textSecondary
                          }
                        />
                      </View>
                      <View style={styles.flexOne}>
                        <View style={styles.modalMonthNameRow}>
                          <Text
                            style={[
                              styles.modalMonthName,
                              isSelected && styles.modalMonthNameSelected,
                            ]}>
                            {formatMonthLabel(monthKey)}
                          </Text>
                          {isCurrent && (
                            <View style={styles.currentBadge}>
                              <Text style={styles.currentBadgeText}>
                                Mes actual
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.modalMonthCount}>
                          {count === 0
                            ? 'Sin movimientos'
                            : `${count} movimiento${count === 1 ? '' : 's'}`}
                        </Text>
                      </View>
                    </View>

                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={isSelected ? Colors.primary : Colors.border}
                    />
                  </TouchableOpacity>
                );
              })}

              {/* Opción para ver todos los meses */}
              <TouchableOpacity
                style={[
                  styles.modalMonthItem,
                  selectedMonth === 'all' && styles.modalMonthItemSelected,
                  styles.modalMonthItemAll,
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedMonth('all');
                  setIsMonthModalVisible(false);
                }}>
                <View style={styles.modalMonthItemLeft}>
                  <View
                    style={[
                      styles.modalMonthItemIcon,
                      selectedMonth === 'all' &&
                        styles.modalMonthItemIconSelected,
                    ]}>
                    <Ionicons
                      name="layers-outline"
                      size={18}
                      color={
                        selectedMonth === 'all'
                          ? Colors.primary
                          : Colors.textSecondary
                      }
                    />
                  </View>
                  <View style={styles.flexOne}>
                    <Text
                      style={[
                        styles.modalMonthName,
                        selectedMonth === 'all' &&
                          styles.modalMonthNameSelected,
                      ]}>
                      Todos los meses
                    </Text>
                    <Text style={styles.modalMonthCount}>
                      Historial completo ({allMovements.length} movimientos)
                    </Text>
                  </View>
                </View>

                <Ionicons
                  name={
                    selectedMonth === 'all'
                      ? 'checkmark-circle'
                      : 'ellipse-outline'
                  }
                  size={22}
                  color={
                    selectedMonth === 'all' ? Colors.primary : Colors.border
                  }
                />
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <FooterMenu active="Clientes" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flexOne: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 10,
    paddingBottom: 48,
  },

  // Ficha del Cliente
  customerCard: {
    padding: 18,
    gap: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPaid: {
    backgroundColor: '#DCFCE7',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
  },
  avatarTextPaid: {
    color: Colors.success,
  },
  customerName: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.text,
  },
  customerRealName: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  customerMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
  },
  callBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
  },
  historyBtnText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Caja de saldo
  balanceBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  balanceBoxPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  balanceBoxLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.destructive,
    letterSpacing: 0.8,
  },
  balanceBoxLabelPaid: {
    color: '#15803D',
  },
  balanceBoxAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.destructive,
    marginVertical: 4,
  },
  balanceBoxAmountPaid: {
    color: '#15803D',
  },
  balanceBoxHelp: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Botones de acción principales (con margen claro y amplio)
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    marginBottom: 16,
  },

  // Título de la sección
  sectionHeading: {
    marginTop: 4,
    marginBottom: 8,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },

  // Barra de filtros
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primaryMid,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },

  // Tabla Libreta de Cuentas
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  tableColHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.6,
  },
  colDate: {
    width: 90,
  },
  colConcept: {
    flex: 1,
    paddingHorizontal: 6,
  },
  colConceptHeader: {
    justifyContent: 'center',
    position: 'relative',
    height: 32,
    paddingHorizontal: 4,
  },
  colAmount: {
    width: 90,
    alignItems: 'flex-end',
  },

  // Filtro de mes en cabecera
  headerMonthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FED7AA',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    gap: 3,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  headerMonthBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9A3412',
    letterSpacing: 0.5,
  },

  // Filtro "Qué fue" y buscador animado
  headerConceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerSearchIconBtn: {
    padding: 4,
    borderRadius: Radius.sm,
    backgroundColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSearchIconBtnActive: {
    backgroundColor: Colors.primary,
  },
  headerSearchBox: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    height: 32,
    gap: 4,
  },
  headerSearchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },

  // Filas de la tabla
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  rowDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  rowConceptTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  rowBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  kindBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  kindBadgeCredit: {
    backgroundColor: '#FEE2E2',
  },
  kindBadgePayment: {
    backgroundColor: '#DCFCE7',
  },
  kindBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  kindBadgeTextCredit: {
    color: Colors.destructive,
  },
  kindBadgeTextPayment: {
    color: '#15803D',
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  rowDueDate: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  rowDueDateOverdue: {
    color: Colors.destructive,
    fontWeight: '700',
  },
  rowAmountText: {
    fontSize: 14,
    fontWeight: '800',
  },
  rowAmountCredit: {
    color: Colors.destructive,
  },
  rowAmountPayment: {
    color: '#15803D',
  },

  // Estado vacío de la tabla
  tableEmpty: {
    backgroundColor: Colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
  tableEmptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  tableEmptyText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptyActionBtn: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  emptyActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },

  // Modal Seleccionar Mes
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    width: '100%',
    maxHeight: '80%',
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 18,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalMonthList: {
    maxHeight: 320,
  },
  modalMonthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
  },
  modalMonthItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#FFF7ED',
  },
  modalMonthItemAll: {
    marginTop: 4,
    borderStyle: 'dashed',
  },
  modalMonthItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalMonthItemIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalMonthItemIconSelected: {
    backgroundColor: '#FFEDD5',
  },
  modalMonthNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalMonthName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  modalMonthNameSelected: {
    color: '#9A3412',
    fontWeight: '800',
  },
  currentBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
  },
  modalMonthCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },

  // Resumen inferior de la libreta
  tableSummary: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    padding: 14,
    gap: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  summaryCreditValue: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.destructive,
  },
  summaryPaymentValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  summaryNetLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  summaryNetValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  summaryNetValueOwing: {
    color: Colors.destructive,
  },
  summaryNetValuePaid: {
    color: '#15803D',
  },
  footerSpacer: {
    height: 16,
  },
});
