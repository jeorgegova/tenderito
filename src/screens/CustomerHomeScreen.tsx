import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  DeviceEventEmitter,
  Easing,
  FlatList,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  UIManager,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import NetInfo from '@react-native-community/netinfo';
import { Card } from '../components/ui/Card';
import { NotebookPaper } from '../components/ui/NotebookPaper';
import { Button } from '../components/ui/Button';
import { AnimatedMoney } from '../components/ui/AnimatedMoney';
import { DynamicBrandCurves } from '../components/ui/DynamicBrandCurves';
import { MagnetFilterBar } from '../components/ui/MagnetFilterBar';
import { showAlert } from '../utils/alert';
import { confirmLogout, CUSTOMER_LOGOUT_MESSAGE } from '../lib/session';
import { fetchCustomerPortal } from '../services/customerPortal';
import { computeCreditPaymentStatuses } from '../utils/creditStatus';
import { Colors, Radius, formatCOP } from '../theme';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../hooks/useResponsive';
import { EditCustomerSelfModal } from '../components/ui/EditCustomerSelfModal';
import { StoreStatusRing } from '../components/ui/StoreStatusRing';
import { StoreStatusViewerModal } from '../components/StoreStatusViewerModal';
import { fetchCustomerStoreStatuses, StoreStatus } from '../services/storeStatuses';
import {
  formatDateCompact,
  formatDateDisplay,
  getBogotaCurrentMonthKey,
  getBogotaMonthKey,
  isOverdueBogota,
} from '../utils/format';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

const getCurrentMonthKey = getBogotaCurrentMonthKey;
const getMonthKeyFromDate = getBogotaMonthKey;

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
    return 'Todos';
  }
  const [, monthStr] = monthKey.split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  return MONTH_NAMES[monthIdx] || monthKey;
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
    } catch (_e) { }
  }

  for (let i = 0; i < pastLimitMonths; i++) {
    const d = new Date(currentYear, currentMonth - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
  }
  return months;
};

export function CustomerHomeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { isSmall, isTablet, width, tabletContainerStyle } = useResponsive();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'payment'>(
    'all',
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey);
  const [isMonthModalVisible, setIsMonthModalVisible] = useState(false);
  const [searchConcept, setSearchConcept] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedDetailMovement, setSelectedDetailMovement] = useState<any | null>(null);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  // Control del buscador con animación fluida en píxeles exactos
  const [headerWidth, setHeaderWidth] = useState(340);
  const searchInputRef = useRef<TextInput>(null);
  const searchAnim = useRef(new Animated.Value(0)).current;

  const handleOpenSearch = () => {
    setIsSearchOpen(true);
    Animated.timing(searchAnim, {
      toValue: 1,
      duration: 650,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start(() => {
      searchInputRef.current?.focus();
    });
  };

  const handleCloseSearch = () => {
    Keyboard.dismiss();
    Animated.timing(searchAnim, {
      toValue: 0,
      duration: 480,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setIsSearchOpen(false);
        setSearchConcept('');
      }
    });
  };

  const availableSearchWidth = headerWidth > 84 ? headerWidth - 84 : 240;

  const searchBoxWidth = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [34, availableSearchWidth],
  });

  const searchRowHeight = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 48],
  });

  const searchRowOpacity = searchAnim.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [0, 0.5, 1],
  });

  const searchRowPaddingY = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });

  const searchRowBorderWidth = searchAnim.interpolate({
    inputRange: [0, 0.05, 1],
    outputRange: [0, 1.5, 1.5],
  });

  const searchInputOpacity = searchAnim.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0, 1],
  });

  const searchCloseOpacity = searchAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  const searchCloseTranslateX = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  // Al cambiar o salir de la tienda seleccionada, restablecer filtros a mes actual
  useEffect(() => {
    setSelectedMonth(getCurrentMonthKey());
    setSearchConcept('');
    setIsSearchOpen(false);
    searchAnim.setValue(0);
    setFilterType('all');
  }, [selectedStoreId]);

  const queryClient = useQueryClient();
  const detailScrollRef = useRef<ScrollView>(null);
  const homeFlatListRef = useRef<FlatList>(null);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['customer-portal', selectedStoreId, selectedMonth],
    queryFn: () =>
      fetchCustomerPortal({
        storeId: selectedStoreId,
        month: selectedMonth,
      }),
  });

  const [selectedStoreForStatus, setSelectedStoreForStatus] = useState<{
    storeId: string;
    storeName: string;
    statuses: StoreStatus[];
    initialIndex?: number;
  } | null>(null);

  const customerId = data?.customer?.id;
  const storeIdsKey = (data?.stores || []).map((s: any) => s.store_id).sort().join(',');

  const { data: storeStatusesMap = {}, refetch: refetchStatuses } = useQuery({
    queryKey: ['customer-stores-statuses', customerId, storeIdsKey],
    queryFn: async () => {
      if (!customerId || !data?.stores || data.stores.length === 0) return {};
      const map: Record<string, StoreStatus[]> = {};
      await Promise.all(
        data.stores.map(async (item: any) => {
          const list = await fetchCustomerStoreStatuses(item.store_id, customerId);
          map[item.store_id] = list;
        }),
      );
      return map;
    },
    enabled: Boolean(customerId && data?.stores && data.stores.length > 0),
  });

  // Escuchar evento de notificación push para abrir directamente el visor de estados
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'tenderito-open-status',
      async ({ storeId, statusId }: { storeId?: string; statusId?: string }) => {
        if (!storeId) return;

        let statuses = storeStatusesMap[storeId];
        if (!statuses || statuses.length === 0) {
          if (customerId) {
            try {
              statuses = await fetchCustomerStoreStatuses(storeId, customerId);
            } catch (_e) {
              statuses = [];
            }
          }
        }

        if (statuses && statuses.length > 0) {
          const storeItem: any = (data?.stores || []).find((s: any) => s.store_id === storeId);
          const rawStore: any = storeItem?.stores;
          const store: any = Array.isArray(rawStore) ? rawStore[0] : rawStore;
          const storeName = store?.store_name || storeItem?.store_name || 'Tienda';
          let initialIndex = 0;
          if (statusId) {
            const foundIdx = statuses.findIndex((s: any) => s.id === statusId);
            if (foundIdx >= 0) initialIndex = foundIdx;
          }
          setSelectedStoreForStatus({
            storeId,
            storeName,
            statuses,
            initialIndex,
          });
        }
      },
    );

    return () => {
      sub.remove();
    };
  }, [storeStatusesMap, customerId, data?.stores]);

  // Pull-to-refresh completo: invalida tanto el resumen como todos los detalles de tienda
  const handleRefreshAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['customer-portal'] });
  }, [queryClient]);

  // Validación de conexión a internet antes de intentar cambiar de fecha / mes
  const checkInternetConnection = async (): Promise<boolean> => {
    try {
      const netState = await NetInfo.fetch();
      const isOnline = Boolean(
        netState.isConnected && netState.isInternetReachable !== false,
      );
      if (!isOnline) {
        showAlert({
          title: 'Sin conexión a internet',
          message:
            'Para consultar los movimientos de otro mes o traer más datos debes tener conexión a internet.',
          type: 'warning',
        });
        return false;
      }
      return true;
    } catch (_e) {
      return true;
    }
  };

  const handleOpenMonthPicker = async () => {
    const hasNet = await checkInternetConnection();
    if (!hasNet) {
      return;
    }
    setIsMonthModalVisible(true);
  };

  const handleSelectMonth = async (monthKey: string) => {
    if (monthKey === selectedMonth) {
      setIsMonthModalVisible(false);
      return;
    }
    const hasNet = await checkInternetConnection();
    if (!hasNet) {
      return;
    }
    setSelectedMonth(monthKey);
    setIsMonthModalVisible(false);
  };

  const handleSelectStore = useCallback((storeId: string | null) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedStoreId(storeId);
    if (storeId) {
      // Invalida inmediatamente para garantizar datos frescos al entrar al detalle
      queryClient.invalidateQueries({ queryKey: ['customer-portal', storeId] });
      // Reset scroll del detalle al inicio
      setTimeout(() => {
        detailScrollRef.current?.scrollTo({ y: 0, animated: false });
      }, 50);
    } else {
      // Reset scroll del listado principal
      setTimeout(() => {
        homeFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }, 50);
    }
  }, [queryClient]);

  const selectedStoreIdRef = useRef<string | null>(selectedStoreId);
  selectedStoreIdRef.current = selectedStoreId;

  const isSearchOpenRef = useRef(isSearchOpen);
  isSearchOpenRef.current = isSearchOpen;

  const selectedDetailMovementRef = useRef(selectedDetailMovement);
  selectedDetailMovementRef.current = selectedDetailMovement;

  const isMonthModalVisibleRef = useRef(isMonthModalVisible);
  isMonthModalVisibleRef.current = isMonthModalVisible;

  const menuVisibleRef = useRef(menuVisible);
  menuVisibleRef.current = menuVisible;

  const isEditProfileOpenRef = useRef(isEditProfileOpen);
  isEditProfileOpenRef.current = isEditProfileOpen;

  const selectedStoreForStatusRef = useRef(selectedStoreForStatus);
  selectedStoreForStatusRef.current = selectedStoreForStatus;

  // Interceptar la salida / remoción de la pantalla por gestos de navegación nativos de React Navigation (Android/iOS)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (selectedStoreForStatusRef.current) {
        e.preventDefault();
        setSelectedStoreForStatus(null);
        return;
      }
      if (menuVisibleRef.current) {
        e.preventDefault();
        setMenuVisible(false);
        return;
      }
      if (isEditProfileOpenRef.current) {
        e.preventDefault();
        setIsEditProfileOpen(false);
        return;
      }
      if (selectedDetailMovementRef.current) {
        e.preventDefault();
        setSelectedDetailMovement(null);
        return;
      }
      if (isMonthModalVisibleRef.current) {
        e.preventDefault();
        setIsMonthModalVisible(false);
        return;
      }
      if (isSearchOpenRef.current) {
        e.preventDefault();
        handleCloseSearch();
        return;
      }
      if (selectedStoreIdRef.current) {
        e.preventDefault();
        handleSelectStore(null);
        return;
      }
      // Si está en el listado de tiendas sin nada abierto, permite la salida normal
    });

    return unsubscribe;
  }, [navigation, handleSelectStore]);

  // Manejo robusto del botón físico / barra de navegación "Atrás" en Android:
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (selectedStoreForStatusRef.current) {
          setSelectedStoreForStatus(null);
          return true;
        }
        if (menuVisibleRef.current) {
          setMenuVisible(false);
          return true;
        }
        if (isEditProfileOpenRef.current) {
          setIsEditProfileOpen(false);
          return true;
        }
        if (selectedDetailMovementRef.current) {
          setSelectedDetailMovement(null);
          return true;
        }
        if (isMonthModalVisibleRef.current) {
          setIsMonthModalVisible(false);
          return true;
        }
        if (isSearchOpenRef.current) {
          handleCloseSearch();
          return true;
        }
        if (selectedStoreIdRef.current) {
          handleSelectStore(null);
          return true;
        }
        // Retornar false permite que Android salga/minimice la app a segundo plano con la sesión intacta
        return false;
      };

      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [handleSelectStore])
  );

  const stores = useMemo(() => data?.stores ?? [], [data?.stores]);
  const customerName = data?.customer?.name ?? 'Cliente';

  // Total acumulado que debe en todas las tiendas
  const totalBalance = useMemo(() => {
    return stores.reduce(
      (sum: number, item: any) => sum + Number(item.current_balance || 0),
      0,
    );
  }, [stores]);

  // Tienda actualmente seleccionada
  const selectedStore = useMemo(() => {
    if (!selectedStoreId) {
      return null;
    }
    return stores.find((s: any) => s.store_id === selectedStoreId) ?? null;
  }, [selectedStoreId, stores]);

  // Movimientos correspondientes a la tienda seleccionada
  const storeMovements = useMemo(() => {
    if (!selectedStoreId) {
      return [];
    }

    const credits = (data?.credits ?? [])
      .filter((c: any) => c.store_id === selectedStoreId)
      .map((c: any) => ({
        id: c.id,
        kind: 'credit' as const,
        title: c.concept || 'Compra fiada',
        amount: Number(c.amount || 0),
        date: c.created_at,
        dueDate: c.due_date,
        status: c.status,
        notes: null,
      }));

    const payments = (data?.payments ?? [])
      .filter((p: any) => p.store_id === selectedStoreId)
      .map((p: any) => ({
        id: p.id,
        kind: 'payment' as const,
        title: p.notes ? `Abono: ${p.notes}` : 'Abono entregado a la tienda',
        amount: Number(p.amount || 0),
        date: p.payment_date,
        dueDate: null,
        status: p.status || 'completed',
        notes: p.notes,
      }));

    return [...credits, ...payments].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [data, selectedStoreId]);

  // Totales de la tienda seleccionada (excluye cancelados)
  const storeTotals = useMemo(() => {
    let creditsSum = 0;
    let paymentsSum = 0;
    storeMovements.forEach(m => {
      if (m.status === 'cancelled') return;
      if (m.kind === 'credit') {
        creditsSum += m.amount;
      }
      if (m.kind === 'payment') {
        paymentsSum += m.amount;
      }
    });
    return { creditsSum, paymentsSum };
  }, [storeMovements]);

  // Mapa de estados reales de pago ('paid' | 'partially_paid' | null) para las compras fiadas de la tienda
  const creditStatusMap = useMemo(() => {
    if (!selectedStoreId) return {};
    const storeCredits = (data?.credits ?? []).filter(
      (c: any) => c.store_id === selectedStoreId,
    );
    const storePayments = (data?.payments ?? []).filter(
      (p: any) => p.store_id === selectedStoreId,
    );
    return computeCreditPaymentStatuses(
      storeCredits,
      storePayments,
      selectedStore?.current_balance,
    );
  }, [data?.credits, data?.payments, selectedStoreId, selectedStore?.current_balance]);

  // Lista de meses disponibles para selección (últimos meses hacia atrás desde hoy o creación)
  const availableMonths = useMemo(() => {
    return generateAvailableMonths(data?.customer?.created_at);
  }, [data?.customer?.created_at]);

  // Movimientos filtrados por tipo (todo / compras / abonos) en memoria sobre los datos traídos de Supabase
  const typeFilteredMovements = useMemo(() => {
    if (filterType === 'all') {
      return storeMovements;
    }
    return storeMovements.filter(m => m.kind === filterType);
  }, [storeMovements, filterType]);

  // Movimientos finales filtrados por el buscador "Qué fue" en memoria sobre los datos traídos
  const filteredStoreMovements = useMemo(() => {
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

  // Función para cerrar sesión con confirmación
  const handleLogout = useCallback(() => {
    confirmLogout({ message: CUSTOMER_LOGOUT_MESSAGE });
  }, []);

  const handleCallStore = (phone?: string | null) => {
    if (!phone) {
      return;
    }
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      showAlert('No se pudo abrir el teléfono', `Número: ${phone}`);
    });
  };

  if (isLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>
          Cargando tus cuentas y tiendas...
        </Text>
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={styles.centerWrap}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.destructive} />
        <Text style={[styles.loadingText, { marginTop: 8, fontWeight: '800', color: Colors.text }]}>
          No se pudieron cargar tus cuentas
        </Text>
        <Text style={[styles.emptyCardText, { textAlign: 'center', marginHorizontal: 24, marginTop: 2 }]}>
          Revisa tu conexión a internet e intenta nuevamente.
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{
            marginTop: 16,
            backgroundColor: Colors.primary,
            paddingVertical: 10,
            paddingHorizontal: 24,
            borderRadius: Radius.md,
          }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleLogout}
          style={{ marginTop: 10, paddingVertical: 8 }}>
          <Text style={{ color: Colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // =========================================================================
  // VISTA 1 & 2: INICIO Y DETALLE ("Mis Tiendas" y "Libreta")
  // =========================================================================
  const rawStores: any = selectedStore?.stores;
  const storeInfo: any = Array.isArray(rawStores) ? rawStores[0] : rawStores;
  const storeName = storeInfo?.store_name ?? 'Tienda de barrio';
  const currentBalance = Number(selectedStore?.current_balance || 0);
  const creditLimit = Number(selectedStore?.credit_limit || 0);
  const isPaid = currentBalance === 0;

  const creditCount = storeMovements.filter(m => m.kind === 'credit').length;
  const paymentCount = storeMovements.filter(
    m => m.kind === 'payment',
  ).length;
  const allClear = totalBalance === 0 && stores.length > 0;

  return (
    <View style={styles.wrap}>
      <DynamicBrandCurves position={selectedStore ? 'bottom-left' : 'top-right'} />

      {/* Cabecera persistente animada con transición al crecer o reducirse */}
      <View
        style={[
          styles.header,
          selectedStore && styles.headerCompact,
          {
            paddingTop:
              Math.max(insets.top, 14) + (selectedStore ? 4 : 8),
          },
          isTablet && { maxWidth: 720, width: '100%', alignSelf: 'center' },
        ]}>
        {selectedStore ? (
          // Cabecera compacta en Detalle
          <>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => handleSelectStore(null)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={18} color={Colors.primary} />
              <Text style={[styles.backBtnText, isTablet && { fontSize: 18 }]}>Volver</Text>
            </TouchableOpacity>

            {customerName ? (
              <TouchableOpacity
                style={[styles.sessionBadge, menuVisible && styles.sessionBadgeActive]}
                onPress={() => setMenuVisible(prev => !prev)}
                activeOpacity={0.7}>
                <View style={styles.sessionAvatar}>
                  <Ionicons name="person" size={12} color="#059669" />
                </View>
                <View style={styles.sessionCol}>
                  <Text style={styles.sessionRole}>CLIENTE</Text>
                  <Text style={styles.sessionName} numberOfLines={1}>
                    {customerName}
                  </Text>
                </View>
                <Ionicons
                  name={menuVisible ? 'chevron-up' : 'chevron-down'}
                  size={12}
                  color={Colors.textSecondary}
                  style={{ marginLeft: 2 }}
                />
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          // Cabecera principal en Inicio
          <>
            {/* Un único ondulado sutil de fondo */}
            <View pointerEvents="none" style={styles.headerWavesContainer}>
              <View style={styles.headerSingleWave} />
            </View>

            <View style={styles.flexOne}>
              <View style={styles.headerTitleRow}>
                <Text
                  style={[styles.headerGreeting, isSmall && styles.headerGreetingSmall]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}>
                  ¡Hola, {customerName}!
                </Text>
                <View style={styles.customerRoleTag}>
                  <Text style={styles.customerRoleTagText}>Cliente</Text>
                </View>
              </View>
              <Text style={styles.headerSubtitle}>
                Tus cuentas en tiendas de barrio
              </Text>
              <TouchableOpacity
                style={styles.editProfileBtn}
                onPress={() => setIsEditProfileOpen(true)}
                activeOpacity={0.7}>
                <Ionicons name="pencil" size={12} color={Colors.primary} />
                <Text style={styles.editProfileBtnText}>Editar mis datos</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              activeOpacity={0.75}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons
                name="log-out-outline"
                size={18}
                color={Colors.destructive}
              />
              <Text style={styles.logoutBtnText}>Salir</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Vista 2: Detalle de Movimientos de la Tienda ("Libreta") */}
      {selectedStore && (
        <ScrollView
          ref={detailScrollRef}
          contentContainerStyle={[styles.detailScroll, tabletContainerStyle(720)]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={handleRefreshAll}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }>
          {/* Tarjeta de la tienda */}
          <Card style={styles.storeDetailCard}>
            <View style={styles.storeDetailHeader}>
              <View style={styles.storeDetailAvatar}>
                <Ionicons name="storefront" size={28} color={Colors.primary} />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.storeDetailTitle}>{storeName}</Text>
                {storeInfo?.address ? (
                  <View style={styles.metaRow}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={Colors.destructive}
                    />
                    <Text style={styles.metaText}>{storeInfo.address}</Text>
                  </View>
                ) : null}
                {storeInfo?.phone ? (
                  <View style={styles.metaRow}>
                    <Ionicons
                      name="call-outline"
                      size={14}
                      color="#16A34A"
                    />
                    <Text style={styles.metaText}>{storeInfo.phone}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {storeInfo?.phone ? (
              <TouchableOpacity
                style={styles.callStoreBtn}
                onPress={() => handleCallStore(storeInfo.phone)}
                activeOpacity={0.85}>
                <Ionicons name="call" size={16} color="#FFFFFF" />
                <Text style={styles.callStoreBtnText}>Llamar a la tienda</Text>
              </TouchableOpacity>
            ) : null}

            {/* Saldo en superficie diferenciada y amigable */}
            <View
              style={[
                styles.storeBalanceBox,
                isPaid ? styles.storeBalanceBoxPaid : styles.storeBalanceBoxDebt,
              ]}>
              <Text
                style={[
                  styles.storeBalanceLabel,
                  isPaid ? styles.storeBalanceLabelPaid : styles.storeBalanceLabelDebt,
                ]}>
                {isPaid
                  ? '¡ESTÁS AL DÍA EN ESTA TIENDA!'
                  : 'EN ESTA TIENDA DEBES:'}
              </Text>
              <AnimatedMoney
                value={currentBalance}
                formatter={formatCOP}
                style={[
                  styles.storeBalanceAmount,
                  isPaid ? styles.storeBalanceAmountPaid : styles.storeBalanceAmountDebt,
                  isSmall && styles.storeBalanceAmountSmall,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              />
              <Text
                style={[
                  styles.storeBalanceHelp,
                  isPaid ? styles.storeBalanceHelpPaid : styles.storeBalanceHelpDebt,
                ]}>
                {isPaid
                  ? 'No tienes ninguna deuda pendiente con este tendero.'
                  : 'Este es el dinero que te falta por pagar.'}
              </Text>
            </View>
          </Card>

          {/* Sección de la libreta de cuentas */}
          <View style={styles.sectionHeader}>
            <View style={styles.notebookTitleRow}>
              <View style={styles.notebookIconPill}>
                <Ionicons name="book-outline" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.sectionMainTitle}>
                Libreta de tus cuentas
              </Text>
            </View>
            <Text style={styles.sectionSubtitle}>
              Aquí ves exactamente cada compra y cada abono registrado:
            </Text>
          </View>

          {/* Filtros animados con estilo imán */}
          <View style={styles.filterBar}>
            <MagnetFilterBar
              options={[
                { key: 'all', label: `Todos (${storeMovements.length})` },
                { key: 'credit', label: `Solo compras (${creditCount})` },
                { key: 'payment', label: `Solo abonos (${paymentCount})` },
              ]}
              selectedKey={filterType}
              onSelect={key => setFilterType(key as 'all' | 'credit' | 'payment')}
            />
          </View>

          {/* ── Libreta de Apuntes en Hoja Argollada ── */}
          <NotebookPaper>
            <View
              style={styles.tableHeaderContainer}
              onLayout={e => {
                const w = e.nativeEvent.layout.width;
                if (w > 0 && Math.abs(w - headerWidth) > 1) {
                  setHeaderWidth(w);
                }
              }}>
              {/* Encabezado de la tabla con filtro Mes y Buscador "Qué fue" */}
              <View style={styles.tableHeaderRow}>
                {/* Filtro Mes (Columna Fecha: 74px) */}
                <View style={styles.colDate}>
                  <TouchableOpacity
                    style={styles.headerMonthBtn}
                    onPress={handleOpenMonthPicker}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                    <Text style={styles.headerMonthBtnText} numberOfLines={1}>
                      {formatMonthHeader(selectedMonth)}
                    </Text>
                    <Ionicons name="caret-down" size={10} color="#9A3412" />
                  </TouchableOpacity>
                </View>

                {/* Filtro QUÉ FUE con botón de búsqueda */}
                <View style={styles.colConceptHeader}>
                  <Text
                    style={styles.tableColHeader}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    QUÉ FUE
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.headerSearchIconBtn,
                      (searchConcept.trim().length > 0 || isSearchOpen) &&
                      styles.headerSearchIconBtnActive,
                    ]}
                    onPress={() => {
                      if (isSearchOpen) {
                        handleCloseSearch();
                      } else {
                        handleOpenSearch();
                      }
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons
                      name="search"
                      size={12}
                      color={
                        searchConcept.trim().length > 0 || isSearchOpen
                          ? '#FFFFFF'
                          : '#9A3412'
                      }
                    />
                  </TouchableOpacity>
                </View>

                {/* Columna Valor: 78px */}
                <View style={styles.colAmount}>
                  <Text
                    style={styles.tableColHeader}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    VALOR
                  </Text>
                </View>
              </View>

              {/* Fila 2: Campo de búsqueda dedicado con animación fluida de expansión horizontal */}
              <Animated.View
                style={[
                  styles.searchRowDedicated,
                  {
                    height: searchRowHeight,
                    opacity: searchRowOpacity,
                    paddingVertical: searchRowPaddingY,
                    borderBottomWidth: searchRowBorderWidth,
                    overflow: 'hidden',
                  },
                ]}
                pointerEvents={isSearchOpen || searchConcept.trim().length > 0 ? 'auto' : 'none'}>
                <Animated.View
                  style={[
                    styles.searchBoxDedicated,
                    { width: searchBoxWidth },
                  ]}>
                  <Ionicons name="search" size={13} color={Colors.primary} style={{ flexShrink: 0, marginLeft: 2 }} />
                  <Animated.View style={{ flex: 1, opacity: searchInputOpacity }}>
                    <TextInput
                      ref={searchInputRef}
                      style={styles.searchInputDedicated}
                      placeholder="Buscar qué compraste o abonaste..."
                      placeholderTextColor={Colors.textMuted}
                      value={searchConcept}
                      onChangeText={setSearchConcept}
                      returnKeyType="done"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </Animated.View>
                  {searchConcept.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchConcept('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons
                        name="close-circle"
                        size={16}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                  )}
                </Animated.View>
                <Animated.View
                  style={{
                    opacity: searchCloseOpacity,
                    transform: [{ translateX: searchCloseTranslateX }],
                  }}>
                  <TouchableOpacity
                    onPress={handleCloseSearch}
                    style={styles.searchCloseBtn}>
                    <Text style={styles.searchCloseBtnText}>Cerrar</Text>
                  </TouchableOpacity>
                </Animated.View>
              </Animated.View>
            </View>

            {/* Filas de la tabla */}
            {isError ? (
              <View style={styles.tableEmpty}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={36}
                  color={Colors.destructive}
                />
                <Text style={styles.tableEmptyTitle}>
                  Sin conexión a internet
                </Text>
                <Text style={styles.tableEmptyText}>
                  No se pudieron cargar los datos de {formatMonthLabel(selectedMonth)}. Para traer más datos debes tener conexión a internet.
                </Text>
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => refetch()}>
                  <Text style={styles.emptyActionBtnText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : isFetching && !isLoading ? (
              <View style={styles.tableLoadingWrap}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.tableLoadingText}>
                  Consultando movimientos de {formatMonthLabel(selectedMonth)}...
                </Text>
              </View>
            ) : filteredStoreMovements.length === 0 ? (
              <View style={styles.tableEmpty}>
                <Ionicons
                  name={
                    searchConcept.trim().length > 0
                      ? 'search-outline'
                      : 'receipt-outline'
                  }
                  size={32}
                  color={Colors.textMuted}
                />
                <Text style={styles.tableEmptyTitle}>
                  {searchConcept.trim().length > 0
                    ? 'Sin coincidencias'
                    : 'Sin registros en este mes'}
                </Text>
                <Text style={styles.tableEmptyText}>
                  {searchConcept.trim().length > 0
                    ? `No hay compras ni abonos que contengan "${searchConcept}".`
                    : `No hay compras ni abonos registrados para ${formatMonthLabel(
                      selectedMonth,
                    )}.`}
                </Text>
                {searchConcept.trim().length > 0 ? (
                  <TouchableOpacity
                    style={styles.emptyActionBtn}
                    onPress={() => setSearchConcept('')}>
                    <Text style={styles.emptyActionBtnText}>
                      Limpiar búsqueda
                    </Text>
                  </TouchableOpacity>
                ) : selectedMonth !== 'all' && storeMovements.length > 0 ? (
                  <TouchableOpacity
                    style={styles.emptyActionBtn}
                    onPress={() => handleSelectMonth('all')}>
                    <Text style={styles.emptyActionBtnText}>
                      Ver historial completo ({storeMovements.length})
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <>
                {filteredStoreMovements.map(item => {
                  const isCredit = item.kind === 'credit';
                  const isCancelled = item.status === 'cancelled';
                  const overdue = isCredit && !isCancelled && isOverdueBogota(item.dueDate);
                  const paymentTag = isCredit && !isCancelled ? (creditStatusMap[item.id] ?? null) : null;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.tableRow,
                        isCancelled && styles.tableRowCancelled,
                      ]}>
                      {/* Cinta diagonal de esquina (Pagado / Abonado) */}
                      {paymentTag && (
                        <View style={styles.cornerRibbonContainer} pointerEvents="none">
                          <View
                            style={[
                              styles.cornerRibbon,
                              paymentTag === 'paid' ? styles.cornerRibbonPaid : styles.cornerRibbonAbonado,
                            ]}>
                            <Text style={styles.cornerRibbonText}>
                              {paymentTag === 'paid' ? 'PAGADO' : 'ABONADO'}
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Columna Fecha Compacta: 74px */}
                      <View style={styles.colDate}>
                        <Text
                          style={[
                            styles.rowDateText,
                            isCancelled && styles.textCancelled,
                          ]}>
                          {formatDateCompact(item.date)}
                        </Text>
                      </View>

                      {/* Columna Detalle Multilínea con toque para modal contextual */}
                      <TouchableOpacity
                        style={styles.colConcept}
                        activeOpacity={0.7}
                        onPress={() => setSelectedDetailMovement(item)}>
                        <View style={styles.rowConceptHeader}>
                          <Text
                            style={[
                              styles.rowConceptTitle,
                              isCancelled && styles.textCancelled,
                            ]}
                            numberOfLines={6}>
                            {item.title}
                          </Text>
                          {isCancelled && (
                            <View style={[styles.kindBadge, styles.kindBadgeCancelled]}>
                              <Text style={[styles.kindBadgeText, styles.kindBadgeTextCancelled]}>
                                Cancelado
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.rowBadgeWrap}>
                          {isCancelled ? (
                            <View style={[styles.kindBadge, { backgroundColor: '#F1F5F9' }]}>
                              <Text
                                style={[
                                  styles.kindBadgeText,
                                  { color: '#94A3B8', textDecorationLine: 'line-through' },
                                ]}>
                                {isCredit ? 'Compra fiada (+)' : 'Abono realizado (-)'}
                              </Text>
                            </View>
                          ) : (
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
                                {isCredit
                                  ? 'Compra fiada (+)'
                                  : 'Abono realizado (-)'}
                              </Text>
                            </View>
                          )}
                        </View>

                        {item.dueDate ? (
                          <View style={styles.dueRow}>
                            <Ionicons
                              name="calendar-outline"
                              size={11}
                              color={
                                isCancelled
                                  ? '#94A3B8'
                                  : overdue
                                    ? Colors.destructive
                                    : Colors.textSecondary
                              }
                            />
                            <Text
                              style={[
                                styles.rowDueDate,
                                overdue && styles.rowDueDateOverdue,
                                isCancelled && styles.textCancelled,
                              ]}>
                              {overdue
                                ? `Vencido: ${formatDateCompact(item.dueDate)}`
                                : `Pagar antes de: ${formatDateCompact(item.dueDate)}`}
                            </Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>

                      {/* Columna Monto: 78px */}
                      <View style={styles.colAmount}>
                        <Text
                          style={[
                            styles.rowAmountText,
                            isCredit
                              ? styles.rowAmountCredit
                              : styles.rowAmountPayment,
                            isCancelled && styles.textCancelled,
                          ]}>
                          {isCredit ? '+' : '−'}
                          {formatCOP(item.amount)}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {/* Renglones vacíos decorativos para completar la estética */}
                {Array.from({
                  length: Math.max(0, 3 - filteredStoreMovements.length),
                }).map((_, i) => (
                  <View key={`blank-m-${i}`} style={styles.blankLine} />
                ))}
              </>
            )}

            {/* Resumen inferior de la libreta */}
            {storeMovements.length > 0 && (
              <View style={styles.tableSummary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {selectedMonth === 'all'
                      ? 'Total fiado acumulado:'
                      : `Total fiado en ${formatMonthLabel(selectedMonth)}:`}
                  </Text>
                  <Text style={styles.summaryCreditValue}>
                    +{formatCOP(storeTotals.creditsSum)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {selectedMonth === 'all'
                      ? 'Total que has abonado:'
                      : `Total abonado en ${formatMonthLabel(selectedMonth)}:`}
                  </Text>
                  <Text style={styles.summaryPaymentValue}>
                    −{formatCOP(storeTotals.paymentsSum)}
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
            )}
          </NotebookPaper>

          {/* Botón inferior para volver */}
          <Button
            title="Volver a ver todas mis tiendas"
            variant="secondary"
            onPress={() => handleSelectStore(null)}
            style={styles.returnBtn}
          />
        </ScrollView>
      )}

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
                  <Ionicons
                    name="calendar"
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.modalTitle}>Seleccionar el mes...</Text>
                  <Text style={styles.modalSubtitle}>
                    Filtra tus cuentas y abonos por mes
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsMonthModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.modalCloseBtn}>
                <Ionicons
                  name="close"
                  size={22}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Lista de meses disponibles */}
            <ScrollView
              style={styles.modalMonthList}
              showsVerticalScrollIndicator={true}>
              {availableMonths.map(monthKey => {
                const isSelected = selectedMonth === monthKey;
                const isCurrent = monthKey === getCurrentMonthKey();
                const count = storeMovements.filter(
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
                    onPress={() => handleSelectMonth(monthKey)}>
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
                          {isSelected
                            ? `${storeMovements.length} movimiento${storeMovements.length === 1 ? '' : 's'
                            } en este mes`
                            : 'Consultar este mes'}
                        </Text>
                      </View>
                    </View>

                    <Ionicons
                      name={
                        isSelected ? 'checkmark-circle' : 'ellipse-outline'
                      }
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
                onPress={() => handleSelectMonth('all')}>
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
                      {selectedMonth === 'all'
                        ? `${storeMovements.length} movimientos en total`
                        : 'Consultar historial completo sin filtro de fecha'}
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

      {/* Vista 1: Listado de tiendas vinculadas ("Mis Tiendas") */}
      {!selectedStore && (
        <FlatList
          ref={homeFlatListRef}
          contentContainerStyle={[styles.content, tabletContainerStyle(720)]}
          data={stores}
          keyExtractor={(item: any) => item.store_id}
          refreshing={isFetching}
          onRefresh={handleRefreshAll}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Tarjeta del total protagonista con curvas de marca */}
              <View
                style={[
                  styles.heroCard,
                  allClear ? styles.heroCardClear : styles.heroCardDebt,
                ]}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.heroBgCurve1,
                    allClear && styles.heroBgCurveClear,
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.heroBgCurve2,
                    allClear && styles.heroBgCurveClear,
                  ]}
                />

                <View style={styles.heroTop}>
                  <View
                    style={[
                      styles.heroIconBox,
                      allClear ? styles.heroIconBoxClear : styles.heroIconBoxDebt,
                    ]}>
                    <Ionicons
                      name={allClear ? 'checkmark-circle' : 'wallet'}
                      size={20}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text
                    style={[
                      styles.heroLabel,
                      allClear ? styles.heroLabelClear : styles.heroLabelDebt,
                    ]}>
                    {allClear
                      ? '¡ESTÁS AL DÍA EN TUS PAGOS!'
                      : 'TOTAL QUE DEBES EN TODAS TUS TIENDAS'}
                  </Text>
                </View>

                <AnimatedMoney
                  value={totalBalance}
                  formatter={formatCOP}
                  style={[
                    styles.heroAmount,
                    allClear ? styles.heroAmountClear : styles.heroAmountDebt,
                    isSmall && styles.heroAmountSmall,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                />

                <View
                  style={[
                    styles.heroFooterCapsule,
                    allClear ? styles.heroFooterCapsuleClear : styles.heroFooterCapsuleDebt,
                  ]}>
                  <Ionicons
                    name={allClear ? 'sparkles' : 'storefront-outline'}
                    size={15}
                    color="#FFFFFF"
                  />
                  <Text
                    style={[
                      styles.heroHelpText,
                      allClear ? styles.heroHelpTextClear : styles.heroHelpTextDebt,
                    ]}>
                    {allClear
                      ? 'No tienes ninguna deuda pendiente. ¡Felicitaciones!'
                      : `Tienes cuenta en ${stores.length} tienda${stores.length !== 1 ? 's' : ''
                      }. Toca abajo para ver tu libreta.`}
                  </Text>
                </View>
              </View>

              {/* Título de la sección de tiendas */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionMainTitle}>
                  Tus tiendas ({stores.length})
                </Text>
                <Text style={styles.sectionSubtitle}>
                  Toca la tienda que deseas revisar para ver sus compras y pagos:
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <Ionicons
                name="storefront-outline"
                size={42}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyCardTitle}>
                No tienes tiendas vinculadas
              </Text>
              <Text style={styles.emptyCardText}>
                Pídele al tendero de tu barrio que te registre con tu número de
                documento para que puedas ver tus cuentas aquí.
              </Text>
            </Card>
          }
          renderItem={({ item }: any) => {
            const rawStore: any = item.stores;
            const store: any = Array.isArray(rawStore) ? rawStore[0] : rawStore;
            const storeName = store?.store_name ?? 'Tienda de barrio';
            const balance = Number(item.current_balance || 0);
            const creditLimit = Number(item.credit_limit || 0);
            const paid = balance === 0;

            return (
              <View style={styles.storeCardWrapper}>
                <Card style={styles.storeCard}>
                  <View style={styles.storeCardRow}>
                    {/* Icono de la tienda con anillo de estados estilo WhatsApp (Independiente) */}
                    {(() => {
                      const statusesForStore = storeStatusesMap[item.store_id] || [];
                      const unviewedCount = statusesForStore.filter((s: any) => !s.has_viewed).length;

                      return (
                        <StoreStatusRing
                          size={54}
                          strokeWidth={2.5}
                          count={statusesForStore.length}
                          unviewedCount={unviewedCount}
                          onPress={
                            statusesForStore.length > 0
                              ? () => {
                                  setSelectedStoreForStatus({
                                    storeId: item.store_id,
                                    storeName,
                                    statuses: statusesForStore,
                                  });
                                }
                              : () => handleSelectStore(item.store_id)
                          }>
                          <View
                            style={[
                              styles.storeIconWrap,
                              paid ? styles.storeIconWrapPaid : styles.storeIconWrapDebt,
                            ]}>
                            <Ionicons
                              name="storefront"
                              size={24}
                              color={paid ? Colors.success : Colors.destructive}
                            />
                          </View>
                        </StoreStatusRing>
                      );
                    })()}

                    {/* Información y saldo de la tienda (Al tocar abre el detalle de la tienda) */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleSelectStore(item.store_id)}
                      style={[styles.flexOne, { flexDirection: 'row', alignItems: 'center' }]}>
                      {/* Información de la tienda */}
                      <View style={styles.flexOne}>
                        <Text style={styles.storeCardName} numberOfLines={2}>
                          {storeName}
                        </Text>
                        {store?.phone ? (
                          <View style={styles.storeCardPhoneRow}>
                            <Ionicons
                              name="call-outline"
                              size={12}
                              color="#16A34A"
                            />
                            <Text style={styles.storeCardPhoneText}>
                              {store.phone}
                            </Text>
                          </View>
                        ) : null}
                        {store?.address ? (
                          <View style={styles.storeCardAddressRow}>
                            <Ionicons
                              name="location-outline"
                              size={12}
                              color={Colors.destructive}
                            />
                            <Text style={styles.storeCardMeta} numberOfLines={2}>
                              {store.address}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Saldo de la tienda */}
                      <View style={styles.storeCardBalanceWrap}>
                        <Text
                          style={[
                            styles.storeCardBalanceLabel,
                            paid ? styles.balanceLabelPaid : styles.balanceLabelDebt,
                          ]}>
                          {paid ? 'Al día' : 'Debes'}
                        </Text>
                        <Text
                          style={[
                            styles.storeCardBalance,
                            paid ? styles.storeCardBalancePaid : styles.storeCardBalanceDebt,
                          ]}>
                          {formatCOP(balance)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Botón visual para tocar y ver libreta */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleSelectStore(item.store_id)}
                    style={styles.storeCardFooterPill}>
                    <Text style={styles.storeCardFooterText}>
                      Consultar libreta de movimientos
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color={Colors.primary}
                    />
                  </TouchableOpacity>
                </Card>
              </View>
            );
          }}
          ListFooterComponent={
            <View style={styles.listFooter}>
              <Button
                title="Cerrar sesión"
                variant="ghost"
                onPress={handleLogout}
                style={styles.footerLogoutBtn}
              />
            </View>
          }
        />
      )}

      {/* Menú flotante al dar clic en el nombre de usuario (Cliente) */}
      <Modal
        transparent
        visible={menuVisible}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.menuModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuVisible(false)}
          />
          <View
            style={[
              styles.menuPopover,
              {
                top: Math.max(insets.top, 14) + (isSmall ? 48 : 56),
                right: isSmall ? 16 : isTablet ? 28 : 20,
                width: Math.min(245, width - 32),
              },
            ]}>
            {/* Encabezado del menú */}
            <View style={styles.menuHeader}>
              <View style={[styles.menuAvatarLarge, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="person" size={15} color="#059669" />
              </View>
              <View style={styles.menuHeaderCol}>
                <Text
                  style={styles.menuNameText}
                  numberOfLines={2}
                  ellipsizeMode="tail">
                  {customerName}
                </Text>
                <Text
                  style={[styles.menuRoleText, { color: '#059669' }]}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  Cliente
                </Text>
              </View>
            </View>

            <View style={styles.menuDivider} />

            {/* Opción única: Cerrar sesión */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                handleLogout();
              }}
              activeOpacity={0.7}>
              <View style={[styles.menuItemIcon, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="log-out-outline" size={18} color={Colors.destructive} />
              </View>
              <Text style={[styles.menuItemText, { color: Colors.destructive }]}>
                Cerrar sesión
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal para editar datos personales del cliente */}
      {data?.customer && (
        <EditCustomerSelfModal
          visible={isEditProfileOpen}
          onClose={() => setIsEditProfileOpen(false)}
          initialName={data.customer.name || ''}
          initialPhone={data.customer.phone || ''}
          documentType={data.customer.document_type}
          documentNumber={data.customer.document_number}
          onSaved={() => {
            refetch();
          }}
        />
      )}

      {/* Modal Detalle Completo de Movimiento */}
      <Modal
        visible={Boolean(selectedDetailMovement)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDetailMovement(null)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedDetailMovement(null)}>
          <Pressable
            style={styles.detailModalCard}
            onPress={e => e.stopPropagation()}>
            <View style={styles.detailModalHeader}>
              <Text style={styles.detailModalTitle}>Detalle del movimiento</Text>
              <TouchableOpacity
                onPress={() => setSelectedDetailMovement(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.detailModalCloseBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedDetailMovement && (
              <View style={styles.detailModalContent}>
                <View style={styles.detailModalBadgeRow}>
                  <View
                    style={[
                      styles.kindBadge,
                      selectedDetailMovement.kind === 'credit'
                        ? styles.kindBadgeCredit
                        : styles.kindBadgePayment,
                    ]}>
                    <Text
                      style={[
                        styles.kindBadgeText,
                        selectedDetailMovement.kind === 'credit'
                          ? styles.kindBadgeTextCredit
                          : styles.kindBadgeTextPayment,
                      ]}>
                      {selectedDetailMovement.kind === 'credit'
                        ? 'Compra fiada (+)'
                        : 'Abono realizado (-)'}
                    </Text>
                  </View>
                  <Text style={styles.detailModalDateText}>
                    {formatDateCompact(selectedDetailMovement.date)}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.detailModalAmount,
                    selectedDetailMovement.kind === 'credit'
                      ? styles.rowAmountCredit
                      : styles.rowAmountPayment,
                  ]}>
                  {selectedDetailMovement.kind === 'credit' ? '+' : '−'}
                  {formatCOP(selectedDetailMovement.amount)}
                </Text>

                <View style={styles.detailConceptBox}>
                  <Text style={styles.detailConceptLabel}>Concepto registrado:</Text>
                  <Text style={styles.detailConceptValue} selectable>
                    {selectedDetailMovement.title}
                  </Text>
                </View>

                {selectedDetailMovement.dueDate && (
                  <View
                    style={[
                      styles.detailDueBox,
                      isOverdueBogota(selectedDetailMovement.dueDate) &&
                      styles.detailDueBoxOverdue,
                    ]}>
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={
                        isOverdueBogota(selectedDetailMovement.dueDate)
                          ? Colors.destructive
                          : Colors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.detailDueText,
                        isOverdueBogota(selectedDetailMovement.dueDate) &&
                        styles.detailDueTextOverdue,
                      ]}>
                      {isOverdueBogota(selectedDetailMovement.dueDate)
                        ? `Vencido el ${formatDateCompact(selectedDetailMovement.dueDate)}`
                        : `Fecha límite de pago: ${formatDateCompact(selectedDetailMovement.dueDate)}`}
                    </Text>
                  </View>
                )}

                <Button
                  title="Entendido"
                  variant="secondary"
                  onPress={() => setSelectedDetailMovement(null)}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      {/* Visor de estados para el cliente */}
      {selectedStoreForStatus ? (
        <StoreStatusViewerModal
          visible={Boolean(selectedStoreForStatus)}
          onClose={() => {
            setSelectedStoreForStatus(null);
            refetchStatuses();
          }}
          statuses={selectedStoreForStatus.statuses}
          initialIndex={selectedStoreForStatus.initialIndex || 0}
          storeName={selectedStoreForStatus.storeName}
          isMerchant={false}
          customerId={customerId}
        />
      ) : null}
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
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: Colors.background,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Cabecera superior con ondulado sutil
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  headerCompact: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerWavesContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  headerSingleWave: {
    position: 'absolute',
    top: -35,
    left: -25,
    width: 220,
    height: 145,
    borderBottomRightRadius: 110,
    backgroundColor: '#FFF5EB',
    opacity: 0.85,
    transform: [{ rotate: '6deg' }],
  },
  headerGreeting: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerGreetingSmall: {
    fontSize: 18,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  customerRoleTag: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  customerRoleTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  editProfileBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.text,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.destructive,
  },

  // Contenido de la lista principal
  content: {
    padding: 18,
    gap: 16,
    paddingBottom: 36,
  },

  // ── Tarjeta Hero — total que debes ──
  heroCard: {
    borderRadius: 22,
    padding: 22,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  heroCardDebt: {
    backgroundColor: Colors.primary,
  },
  heroCardClear: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.22,
  },
  heroBgCurve1: {
    position: 'absolute',
    top: -35,
    right: -25,
    width: 190,
    height: 150,
    borderBottomLeftRadius: 105,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    transform: [{ rotate: '-8deg' }],
  },
  heroBgCurve2: {
    position: 'absolute',
    bottom: -30,
    left: -20,
    width: 135,
    height: 115,
    borderTopRightRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroBgCurveClear: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 1,
  },
  heroIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconBoxDebt: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  heroIconBoxClear: {
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroLabelDebt: {
    color: 'rgba(255, 255, 255, 0.95)',
  },
  heroLabelClear: {
    color: 'rgba(255, 255, 255, 0.95)',
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginVertical: 4,
    zIndex: 1,
  },
  heroAmountSmall: {
    fontSize: 28,
  },
  heroAmountDebt: {
    color: '#FFFFFF',
  },
  heroAmountClear: {
    color: '#FFFFFF',
  },
  heroFooterCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 4,
    zIndex: 1,
  },
  heroFooterCapsuleDebt: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  heroFooterCapsuleClear: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  heroHelpText: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
    flex: 1,
  },
  heroHelpTextDebt: {
    color: '#FFFFFF',
  },
  heroHelpTextClear: {
    color: '#FFFFFF',
  },

  // Título de sección
  sectionHeader: {
    marginTop: 6,
    gap: 3,
  },
  sectionMainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },

  // Tarjeta de cada tienda en la lista
  storeCardWrapper: {
    borderRadius: 20,
  },
  storeCard: {
    padding: 16,
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  storeCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  storeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeIconWrapDebt: {
    backgroundColor: '#FEE2E2',
  },
  storeIconWrapPaid: {
    backgroundColor: '#DCFCE7',
  },
  storeCardName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  storeCardPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  storeCardPhoneText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  storeCardAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  storeCardMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    flexShrink: 1,
  },
  storeCardBalanceWrap: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  storeCardBalanceLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceLabelDebt: {
    color: Colors.destructive,
  },
  balanceLabelPaid: {
    color: '#15803D',
  },
  storeCardBalance: {
    fontSize: 16.5,
    fontWeight: '900',
    marginTop: 1,
  },
  storeCardBalanceDebt: {
    color: Colors.destructive,
  },
  storeCardBalancePaid: {
    color: '#15803D',
  },
  storeCardFooterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  storeCardFooterText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Estado vacío
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  emptyCardText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  listFooter: {
    marginTop: 10,
    alignItems: 'center',
  },
  footerLogoutBtn: {
    paddingHorizontal: 20,
  },

  // =========================================================================
  // Estilos de la Vista 2 (Detalle de la Tienda / Libreta)
  // =========================================================================
  topNav: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  sessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    maxWidth: 160,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sessionAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  sessionCol: {
    flexShrink: 1,
    minWidth: 0,
  },
  sessionRole: {
    fontSize: 8,
    fontWeight: '800',
    color: '#059669',
    lineHeight: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sessionName: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 14,
    marginTop: 1,
  },
  sessionBadgeActive: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  menuModalBackdrop: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  menuPopover: {
    position: 'absolute',
    width: 245,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 12,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  menuAvatarLarge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuHeaderCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  menuNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 16,
    flexShrink: 1,
  },
  menuRoleText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
    lineHeight: 13,
    marginTop: 2,
    flexShrink: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  menuItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF7ED',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  backBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.primary,
  },
  detailScroll: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  storeDetailCard: {
    padding: 18,
    gap: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  storeDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  storeDetailAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeDetailTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  callStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    paddingVertical: 11,
    borderRadius: 14,
  },
  callStoreBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  storeBalanceBox: {
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  storeBalanceBoxDebt: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FECACA',
  },
  storeBalanceBoxPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  storeBalanceLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  storeBalanceLabelDebt: {
    color: Colors.destructive,
  },
  storeBalanceLabelPaid: {
    color: '#15803D',
  },
  storeBalanceAmount: {
    fontSize: 32,
    fontWeight: '900',
    marginVertical: 4,
  },
  storeBalanceAmountSmall: {
    fontSize: 26,
  },
  storeBalanceAmountDebt: {
    color: Colors.destructive,
  },
  storeBalanceAmountPaid: {
    color: '#15803D',
  },
  storeBalanceHelp: {
    fontSize: 12.5,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 18,
  },
  storeBalanceHelpDebt: {
    color: '#991B1B',
  },
  storeBalanceHelpPaid: {
    color: '#166534',
  },
  notebookTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notebookIconPill: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBackBtnWrap: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  bottomBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: Radius.full,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  bottomBackBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Filtros de la libreta
  filterBar: {
    marginBottom: 10,
    width: '100%',
    minHeight: 40,
  },

  // Tabla estilo Libreta
  ledgerTable: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  tableHeaderContainer: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 18,
  },
  tableHeaderRow: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8EE',
    borderBottomWidth: 1.5,
    borderBottomColor: '#CFE0F1',
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 18,
  },
  tableColHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.6,
  },
  colDate: {
    minWidth: 72,
    maxWidth: 88,
  },
  colDateSmall: {
    minWidth: 70,
    maxWidth: 84,
  },
  colConcept: {
    flex: 1,
    paddingHorizontal: 4,
    minWidth: 0,
  },
  colConceptHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    minWidth: 0,
  },
  colAmount: {
    minWidth: 80,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  colAmountSmall: {
    minWidth: 76,
  },

  // Filtro de mes en cabecera
  headerMonthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FED7AA',
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    gap: 2,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  headerMonthBtnText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#9A3412',
    letterSpacing: 0.2,
  },

  // Filtro "Qué fue" y buscador animado
  headerConceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerSearchIconBtn: {
    padding: 3,
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

  // Fila dedicada de buscador
  searchRowDedicated: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFF8EE',
    borderBottomColor: '#CFE0F1',
  },
  searchBoxDedicated: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    height: 32,
    gap: 6,
    overflow: 'hidden',
  },
  searchInputDedicated: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  searchCloseBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  searchCloseBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Filas
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#CFE0F1',
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  cornerRibbonContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 48,
    height: 48,
    overflow: 'hidden',
    zIndex: 10,
  },
  cornerRibbon: {
    position: 'absolute',
    top: 9,
    right: -19,
    width: 70,
    height: 14,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 3,
  },
  cornerRibbonPaid: {
    backgroundColor: '#16A34A',
  },
  cornerRibbonAbonado: {
    backgroundColor: '#D97706',
  },
  cornerRibbonText: {
    color: '#FFFFFF',
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  badgeStatusPaid: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  badgeStatusTextPaid: {
    color: '#16A34A',
    fontWeight: '800',
  },
  badgeStatusAbonado: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  badgeStatusTextAbonado: {
    color: '#D97706',
    fontWeight: '800',
  },
  blankLine: {
    height: 38,
    borderBottomWidth: 1,
    borderBottomColor: '#CFE0F1',
  },
  tableRowAlt: {
    backgroundColor: 'transparent',
  },
  tableRowLast: {
    borderBottomWidth: 1,
    borderBottomColor: '#CFE0F1',
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
  rowConceptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  rowBadgeWrap: {
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
    fontSize: 10,
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
  tableRowCancelled: {
    backgroundColor: '#F7F4EB',
    opacity: 0.72,
  },
  textCancelled: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  kindBadgeCancelled: {
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  kindBadgeTextCancelled: {
    color: '#64748B',
  },

  // Estado vacío de la tabla
  tableEmpty: {
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
    backgroundColor: Colors.cardAlt,
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
  tableLoadingWrap: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tableLoadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Resumen inferior de la tabla
  tableSummary: {
    backgroundColor: '#FFF8EE',
    borderTopWidth: 1,
    borderTopColor: '#CFE0F1',
    padding: 14,
    gap: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    flexShrink: 1,
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
    backgroundColor: '#CFE0F1',
    marginVertical: 4,
  },
  summaryNetLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    flexShrink: 1,
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
  returnBtn: {
    marginTop: 8,
  },

  // Modal Detalle Movimiento
  detailModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: 18,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  detailModalCloseBtn: {
    padding: 4,
  },
  detailModalContent: {
    gap: 12,
  },
  detailModalBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailModalDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  detailModalAmount: {
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginVertical: 4,
  },
  detailConceptBox: {
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: '#CFE0F1',
    borderRadius: Radius.md,
    padding: 12,
    gap: 4,
  },
  detailConceptLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailConceptValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 20,
  },
  detailDueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  detailDueBoxOverdue: {
    backgroundColor: '#FEE2E2',
  },
  detailDueText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  detailDueTextOverdue: {
    color: Colors.destructive,
    fontWeight: '700',
  },
});
