import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { SyncBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NotebookPaper } from '../components/ui/NotebookPaper';
import { DynamicBrandCurves } from '../components/ui/DynamicBrandCurves';
import { FooterMenu } from '../components/ui/FooterMenu';
import { StoreHistoryLockNotice } from '../components/ui/StoreHistoryLockNotice';
import { MagnetFilterBar } from '../components/ui/MagnetFilterBar';
import { EditCustomerAliasLimitModal } from '../components/ui/EditCustomerAliasLimitModal';
import { showAlert } from '../utils/alert';
import { confirmLogout } from '../lib/session';
import { fetchCreditsByCustomer, voidMovement } from '../services/credits';
import { fetchCustomerById } from '../services/customers';
import { fetchProfile } from '../services/profile';
import { fetchPaymentsByCustomer } from '../services/payments';
import { canCreateCreditForCustomer } from '../services/portfolio';
import { calculateSubscriptionStatus } from '../services/plans';
import { computeCreditPaymentStatuses } from '../utils/creditStatus';
import { queryClient } from '../lib/queryClient';
import { useStore } from '../store/useStore';
import { Colors, Radius, formatCOP } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { useSync } from '../hooks/useSync';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatDateCompact,
  formatDateDisplay,
  getBogotaCurrentMonthKey,
  getBogotaMonthKey,
  isOverdueBogota,
} from '../utils/format';
import type { CreditEligibility } from '../types';

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

export function CustomerDetailScreen({ route, navigation }: any) {
  const { isSmall, isTablet, tabletContainerStyle } = useResponsive();
  const { id } = route.params as { id: string };
  const profileFromStore = useStore(s => s.profile);
  const { data: profileQuery } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    staleTime: 60000,
  });
  const profile = profileQuery || profileFromStore;
  const subStatus = calculateSubscriptionStatus(profile);
  const hasProAccess =
    Boolean(profile?.subscription_plan && profile.subscription_plan.toLowerCase() !== 'free') &&
    (subStatus.effectivePlan !== 'free' ||
      subStatus.inGracePeriod ||
      !subStatus.isDowngradedToFree ||
      (profile?.subscription_status || '').toLowerCase() === 'active');
  const [creditEligibility, setCreditEligibility] =
    useState<CreditEligibility | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'payment'>(
    'all',
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey);
  const [isMonthModalVisible, setIsMonthModalVisible] = useState(false);
  const [searchConcept, setSearchConcept] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedDetailMovement, setSelectedDetailMovement] = useState<any | null>(null);
  const [isEditAliasLimitOpen, setIsEditAliasLimitOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const handleGoToProfile = () => {
    setMenuVisible(false);
    try {
      navigation.navigate('Perfil');
    } catch {
      navigation.navigate('Main', { screen: 'Perfil' });
    }
  };

  const handleLogout = () => {
    setMenuVisible(false);
    confirmLogout();
  };

  const insets = useSafeAreaInsets();
  const headerAnim = useRef(new Animated.Value(0)).current;
  const mainScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [id]);

  useEffect(() => {
    Animated.spring(headerAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 140,
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  const handleBack = useCallback(() => {
    Animated.timing(headerAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Main', { screen: 'Inicio' });
      }
    });
  }, [headerAnim, navigation]);

  // Medición dinámica del ancho de la cabecera para interpolación fluida en píxeles exactos
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

  const handleCloseSearch = useCallback(() => {
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
  }, [searchAnim]);

  // Refs para capturar estado actualizado sin reconectar el listener de Android
  const menuVisibleRef = useRef(menuVisible);
  menuVisibleRef.current = menuVisible;
  const isEditAliasLimitOpenRef = useRef(isEditAliasLimitOpen);
  isEditAliasLimitOpenRef.current = isEditAliasLimitOpen;
  const selectedDetailMovementRef = useRef(selectedDetailMovement);
  selectedDetailMovementRef.current = selectedDetailMovement;
  const isMonthModalVisibleRef = useRef(isMonthModalVisible);
  isMonthModalVisibleRef.current = isMonthModalVisible;
  const isSearchOpenRef = useRef(isSearchOpen);
  isSearchOpenRef.current = isSearchOpen;

  // Manejo robusto del botón físico "Atrás" en Android:
  // Cierra modales/menús/buscador si están activos, o regresa a la vista Inicio/Clientes de forma segura sin salir de la app
  useEffect(() => {
    const onBackPress = () => {
      if (menuVisibleRef.current) {
        setMenuVisible(false);
        return true;
      }
      if (isEditAliasLimitOpenRef.current) {
        setIsEditAliasLimitOpen(false);
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
      handleBack();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [handleBack, handleCloseSearch]);

  // Ancho exacto disponible para el buscador: ancho total - padding lateral (20) - gap (8) - botón cerrar (~56)
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

  const { sync, isSyncing } = useSync();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        sync({ force: true }),
        customer.refetch(),
        credits.refetch(),
        payments.refetch(),
      ]);
    } catch (err) {
      console.warn('[CustomerDetailScreen] Error en refresco manual:', err);
    } finally {
      setRefreshing(false);
    }
  }, [sync, customer, credits, payments]);

  // Mapa de estados reales de pago ('paid' | 'partially_paid' | null) para cada compra fiada
  const creditStatusMap = useMemo(() => {
    return computeCreditPaymentStatuses(
      credits.data ?? [],
      payments.data ?? [],
      customer.data?.current_balance,
    );
  }, [credits.data, payments.data, customer.data?.current_balance]);

  // Movimientos combinados y ordenados por fecha más reciente
  const allMovements = useMemo(() => {
    const cr = (credits.data ?? []).map(c => ({
      id: c.id,
      kind: 'credit' as const,
      title: c.concept || 'Compra fiada',
      amount: Number(c.amount || 0),
      date: c.created_at,
      dueDate: c.due_date,
      status: c.status,
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
      status: (p as any).status || 'completed',
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

  // Totales de movimientos del mes seleccionado (excluye cancelados)
  const monthTotals = useMemo(() => {
    let creditsSum = 0;
    let paymentsSum = 0;
    monthMovements.forEach(m => {
      if (m.status === 'cancelled') return;
      if (m.kind === 'credit') {
        creditsSum += m.amount;
      }
      if (m.kind === 'payment') {
        paymentsSum += m.amount;
      }
    });
    return { creditsSum, paymentsSum };
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
  const creditBlocked = Boolean(
    creditEligibility && !creditEligibility.allowed,
  );

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      setCreditEligibility(null);
      return;
    }

    canCreateCreditForCustomer(id, profile).then(result => {
      if (!cancelled) {
        setCreditEligibility(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id, profile, currentBalance, customer.data?.free_plan_selected]);

  const handleCallCustomer = (phone?: string | null) => {
    if (!phone) {
      return;
    }
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      showAlert('No se pudo abrir el teléfono', `Número: ${phone}`);
    });
  };

  const handleShareWhatsApp = () => {
    const rawPhone = (customer.data?.phone || '').replace(/[^0-9]/g, '');
    const clientName =
      customer.data?.alias || customer.data?.name || 'Cliente';
    const storeName = profile?.store_name || 'La tienda';
    const balanceStr = formatCOP(currentBalance);

    const message = `Hola ${clientName}, te escribimos de ${storeName}. Tu saldo actual pendiente en nuestra libreta es de ${balanceStr}. ¡Gracias por tu compra!`;
    const fullPhone = rawPhone
      ? rawPhone.startsWith('57')
        ? rawPhone
        : `57${rawPhone}`
      : '';
    const webUrl = fullPhone
      ? `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    const appUrl = fullPhone
      ? `whatsapp://send?phone=${fullPhone}&text=${encodeURIComponent(message)}`
      : `whatsapp://send?text=${encodeURIComponent(message)}`;

    Linking.canOpenURL(appUrl)
      .then(supported => {
        if (supported) {
          return Linking.openURL(appUrl);
        }
        return Linking.openURL(webUrl);
      })
      .catch(() => {
        Linking.openURL(webUrl).catch(() => {
          showAlert(
            'No se pudo abrir WhatsApp',
            'Verifica que tengas instalada la aplicación de WhatsApp o un navegador web.',
          );
        });
      });
  };

  const handleVoidMovement = (item: any) => {
    const isCredit = item.kind === 'credit';
    const tipo = isCredit ? 'este fiado' : 'este abono';

    // 1. Validación de ventana temporal: solo en sus primeras 24 horas de generado
    const diffHours = (Date.now() - new Date(item.date).getTime()) / (1000 * 60 * 60);
    if (diffHours > 24) {
      showAlert({
        title: 'Tiempo límite superado',
        message: 'Solo es posible anular movimientos dentro de las primeras 24 horas posteriores a su registro.',
        type: 'destructive',
      });
      return;
    }

    // 2. Validación obligatoria: no dejar cancelar más saldo del que actualmente debe el cliente
    // para evitar saldos a favor (deuda negativa oculta).
    if (isCredit && item.amount > currentBalance) {
      showAlert({
        title: 'No es posible anular este fiado',
        message: `El valor de este fiado (${formatCOP(item.amount)}) supera la deuda actual del cliente (${formatCOP(currentBalance)}). No puedes anular más saldo del que actualmente debe para no generar saldo a favor.\n\nSi deseas anularlo, primero debes anular los abonos correspondientes.`,
        type: 'destructive',
      });
      return;
    }

    showAlert({
      title: isCredit ? '¿Anular fiado?' : '¿Anular abono?',
      message: `¿Estás seguro de anular ${tipo} por ${formatCOP(item.amount)} ("${item.title}")? El saldo del cliente se recalculará automáticamente. Esta acción no se puede deshacer.`,
      type: 'destructive',
      buttons: [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Sí, anular',
          style: 'destructive',
          onPress: async () => {
            try {
              await voidMovement({
                id: item.id,
                kind: item.kind,
                customerId: id!,
                amount: item.amount,
              });
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['credits', id] }),
                queryClient.invalidateQueries({ queryKey: ['payments', id] }),
                queryClient.invalidateQueries({ queryKey: ['customer', id] }),
                queryClient.invalidateQueries({ queryKey: ['customers'] }),
                queryClient.invalidateQueries({ queryKey: ['stats'] }),
              ]);
              await Promise.all([
                credits.refetch(),
                payments.refetch(),
                customer.refetch(),
              ]);
              showAlert({
                title: 'Movimiento anulado',
                message: `Se canceló el ${isCredit ? 'fiado' : 'abono'} y el saldo fue recalculado.`,
                type: 'success',
              });
            } catch (err: any) {
              showAlert({
                title: 'Error al anular',
                message: err?.message || 'No se pudo anular el movimiento.',
                type: 'destructive',
              });
            }
          },
        },
      ],
    });
  };

  const isOverdue = isOverdueBogota;
  const clientDisplayName =
    customer.data?.alias?.trim() || customer.data?.name?.trim() || 'Cliente';

  return (
    <View style={styles.wrap}>
      <DynamicBrandCurves position="bottom-left" />

      {/* Header superior de Tendero con bordes redondeados inferiores, animación y goteo de marca */}
      <Animated.View
        style={[
          styles.topNav,
          {
            paddingTop: Math.max(insets.top, 14) + 6,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-45, 0],
                }),
              },
              {
                scaleY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.85, 1],
                }),
              },
            ],
            opacity: headerAnim,
          },
        ]}>
        {/* Círculos pequeños decorativos tipo goteo ubicados exclusivamente en los extremos laterales (lejos del nombre/alias) */}
        <View pointerEvents="none" style={styles.headerDropletsContainer}>
          {/* Extremo izquierdo (detrás del botón de regreso) */}
          <View
            style={[
              styles.droplet,
              {
                top: 6,
                left: 14,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#FFE4D0',
                opacity: 0.9,
              },
            ]}
          />
          <View
            style={[
              styles.droplet,
              {
                top: 24,
                left: 28,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: Colors.primary,
                opacity: 0.85,
              },
            ]}
          />
          <View
            style={[
              styles.droplet,
              {
                top: 10,
                left: 42,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#FFE4D0',
                opacity: 0.75,
              },
            ]}
          />
          <View
            style={[
              styles.droplet,
              {
                top: 28,
                left: 44,
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: Colors.primary,
                opacity: 0.7,
              },
            ]}
          />

          {/* Extremo derecho (detrás del badge de tendero) */}
          <View
            style={[
              styles.droplet,
              {
                top: 6,
                right: 14,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#FFE4D0',
                opacity: 0.9,
              },
            ]}
          />
          <View
            style={[
              styles.droplet,
              {
                top: 24,
                right: 28,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: Colors.primary,
                opacity: 0.85,
              },
            ]}
          />
          <View
            style={[
              styles.droplet,
              {
                top: 10,
                right: 42,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#FFE4D0',
                opacity: 0.75,
              },
            ]}
          />
          <View
            style={[
              styles.droplet,
              {
                top: 28,
                right: 44,
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: Colors.primary,
                opacity: 0.7,
              },
            ]}
          />
        </View>

        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={20} color={Colors.primary} />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {clientDisplayName}
        </Text>

        <View style={styles.headerRightRow}>
          {customer.data?.phone ? (
            <TouchableOpacity
              onPress={handleShareWhatsApp}
              style={styles.whatsappBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="logo-whatsapp" size={19} color="#16A34A" />
            </TouchableOpacity>
          ) : null}

          {profile?.merchant_name ? (
            <TouchableOpacity
              style={[
                styles.sessionBadge,
                menuVisible && styles.sessionBadgeActive,
              ]}
              onPress={() => setMenuVisible(prev => !prev)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Usuario ${profile.merchant_name}. Tocar para abrir menú de perfil`}>
              <View style={styles.sessionAvatar}>
                <Ionicons
                  name="person-outline"
                  size={11}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.sessionCol}>
                <Text style={styles.sessionRole}>TENDERO</Text>
                <Text style={styles.sessionName} numberOfLines={1}>
                  {profile.merchant_name}
                </Text>
              </View>
              <Ionicons
                name={menuVisible ? 'chevron-up' : 'chevron-down'}
                size={11}
                color={Colors.textMuted}
                style={{ marginLeft: 2 }}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </Animated.View>

      {/* Menú flotante al dar clic en el nombre de usuario (Tendero) */}
      <Modal
        transparent
        visible={menuVisible}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}>
        <Pressable
          style={styles.menuModalBackdrop}
          onPress={() => setMenuVisible(false)}>
          <Pressable
            style={[
              styles.menuPopover,
              {
                top: Math.max(insets.top, 14) + (isSmall ? 48 : 56),
                right: isSmall ? 16 : isTablet ? 28 : 20,
              },
            ]}
            onPress={e => e.stopPropagation()}>
            {/* Encabezado del menú */}
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatarLarge}>
                <Ionicons name="person" size={15} color={Colors.primary} />
              </View>
              <View style={styles.menuHeaderCol}>
                <Text
                  style={styles.menuNameText}
                  numberOfLines={2}
                  ellipsizeMode="tail">
                  {profile?.merchant_name}
                </Text>
                <Text
                  style={styles.menuRoleText}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {profile?.store_name || 'Tendero'}
                </Text>
              </View>
            </View>

            <View style={styles.menuDivider} />

            {/* Opción 1: Perfil */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleGoToProfile}
              activeOpacity={0.7}>
              <View style={[styles.menuItemIcon, { backgroundColor: Colors.primaryLight }]}>
                <Ionicons name="person-circle-outline" size={18} color={Colors.primary} />
              </View>
              <Text style={styles.menuItemText}>Perfil</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Opción 2: Cerrar sesión */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleLogout}
              activeOpacity={0.7}>
              <View style={[styles.menuItemIcon, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="log-out-outline" size={18} color={Colors.destructive} />
              </View>
              <Text style={[styles.menuItemText, { color: Colors.destructive }]}>
                Cerrar sesión
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        ref={mainScrollRef}
        contentContainerStyle={[styles.content, tabletContainerStyle(720)]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isSyncing}
            onRefresh={handleRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }>
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
              <View style={styles.customerNameRow}>
                <Text style={styles.customerName}>
                  {customer.data?.alias ||
                    customer.data?.name ||
                    'Cargando...'}
                </Text>
                <SyncBadge estadoServidor={customer.data?.estadoServidor} />
              </View>
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
            <TouchableOpacity
              onPress={() => setIsEditAliasLimitOpen(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.pencilBtn}
              activeOpacity={0.7}>
              <Ionicons name="pencil" size={17} color={Colors.primary} />
            </TouchableOpacity>
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
          {hasProAccess ? (
            <TouchableOpacity
              style={styles.historyBtn}
              onPress={() =>
                navigation.navigate('CustomerHistory', {
                  id,
                  customer: customer.data,
                })
              }>
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
          ) : (
            <StoreHistoryLockNotice style={{ marginTop: 8 }} />
          )}

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
        <View style={[styles.actionsRow, isSmall && styles.actionsRowSmall]}>
          <View style={styles.flexOne}>
            <Button
              title="+ Nuevo fiado"
              icon="credit"
              onPress={async () => {
                const check = await canCreateCreditForCustomer(id, profile);
                if (!check.allowed) {
                  showAlert(
                    'Solo abonos',
                    check.message ?? 'Tu plan actual no permite este fiado.',
                  );
                  return;
                }
                navigation.navigate('NewCredit', { customerId: id });
              }}
            />
          </View>
          <View style={styles.flexOne}>
            <Button
              title="− Abonar plata"
              variant="secondary"
              icon="incoming"
              disabled={isPaid}
              onPress={() => {
                if (isPaid) {
                  showAlert(
                    'Cliente al día',
                    'Este cliente no tiene saldo pendiente por pagar.',
                  );
                  return;
                }
                navigation.navigate('NewPayment', { customerId: id });
              }}
            />
          </View>
        </View>

        {creditBlocked ? (
          <View style={styles.freePortfolioNotice}>
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={Colors.destructive}
            />
            <Text style={styles.freePortfolioNoticeText}>
              {creditEligibility?.message}
            </Text>
          </View>
        ) : null}

        {/* ── Título de la sección ── */}
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Libreta de fiados y abonos</Text>
          <Text style={styles.sectionSubtitle}>
            Aquí ves cada compra fiada y cada abono recibido:
          </Text>
        </View>

        {/* ── Filtros Rápidos con animación Magnet ── */}
        <View style={styles.filterBar}>
          <MagnetFilterBar
            options={[
              { key: 'all', label: `Todos (${monthMovements.length})` },
              { key: 'credit', label: `Solo compras (${creditCount})` },
              { key: 'payment', label: `Solo abonos (${paymentCount})` },
            ]}
            selectedKey={filterType}
            onSelect={key => setFilterType(key as 'all' | 'credit' | 'payment')}
          />
        </View>

        {/* ── Libreta de Apuntes en Hoja Argollada ── */}
        <NotebookPaper style={styles.notebookContainer}>
          {/* Cabecera de la Libreta: Fila 1 - Columnas y Controles */}
          <View
            style={styles.tableHeaderContainer}
            onLayout={e => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - headerWidth) > 1) {
                setHeaderWidth(w);
              }
            }}>
            <View
              style={[
                styles.tableHeaderRow,
                (isSearchOpen || searchConcept.trim().length > 0) &&
                styles.tableHeaderRowActive,
              ]}>
              {/* Filtro Mes (Columna Fecha: 74px) */}
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

              {/* Columna QUÉ SE LLEVÓ / ABONO con botón de búsqueda */}
              <View style={styles.colConceptHeader}>
                <Text
                  style={styles.tableColHeader}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  QUÉ SE LLEVÓ / ABONO
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

              {/* Espacio para la columna de anular: 26px */}
              <View style={styles.voidBtnCol} />
            </View>

            {/* Fila 2: Renglón inferior para el buscador con animación fluida de expansión horizontal */}
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
              pointerEvents={
                isSearchOpen || searchConcept.trim().length > 0
                  ? 'auto'
                  : 'none'
              }>
              <Animated.View
                style={[
                  styles.searchBoxDedicated,
                  { width: searchBoxWidth },
                ]}>
                <Ionicons
                  name="search"
                  size={13}
                  color={Colors.primary}
                  style={{ flexShrink: 0, marginLeft: 2 }}
                />
                <Animated.View style={{ flex: 1, opacity: searchInputOpacity }}>
                  <TextInput
                    ref={searchInputRef}
                    style={styles.searchInputDedicated}
                    placeholder="Buscar qué se llevó o abonó..."
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
                      size={15}
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

          {/* Filas de la libreta */}
          {credits.isLoading || payments.isLoading ? (
            <View style={styles.tableEmpty}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.tableEmptyText}>Cargando libreta...</Text>
            </View>
          ) : filteredMovements.length === 0 ? (
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
            <>
              {filteredMovements.map((item, index) => {
                const isCredit = item.kind === 'credit';
                const isCancelled = item.status === 'cancelled';
                const overdue =
                  isCredit && !isCancelled && isOverdue(item.dueDate);
                const paymentTag = isCredit && !isCancelled ? (creditStatusMap[item.id] ?? null) : null;

                return (
                  <View
                    key={`${item.kind}-${item.id}`}
                    style={[
                      styles.tableRow,
                      index % 2 === 1 && styles.tableRowAlt,
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
                          <View
                            style={[
                              styles.kindBadge,
                              styles.kindBadgeCancelled,
                            ]}>
                            <Text
                              style={[
                                styles.kindBadgeText,
                                styles.kindBadgeTextCancelled,
                              ]}>
                              Cancelado
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.rowBadgeWrap}>
                        {isCancelled ? (
                          <View
                            style={[
                              styles.kindBadge,
                              { backgroundColor: '#F1F5F9' },
                            ]}>
                            <Text
                              style={[
                                styles.kindBadgeText,
                                {
                                  color: '#94A3B8',
                                  textDecorationLine: 'line-through',
                                },
                              ]}>
                              {isCredit
                                ? 'Compra fiada (+)'
                                : 'Abono recibido (-)'}
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
                                : 'Abono recibido (-)'}
                            </Text>
                          </View>
                        )}
                        <SyncBadge estadoServidor={item.estadoServidor} />
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
                              : `Vence: ${formatDateCompact(item.dueDate)}`}
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

                    {/* Botón Anular Movimiento: 26px */}
                    <View style={styles.voidBtnCol}>
                      {!isCancelled &&
                        (() => {
                          const diffHours =
                            (Date.now() - new Date(item.date).getTime()) /
                            (1000 * 60 * 60);
                          if (diffHours > 24) return null;

                          return (
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => handleVoidMovement(item)}
                              hitSlop={{
                                top: 8,
                                bottom: 8,
                                left: 8,
                                right: 8,
                              }}
                              style={styles.voidBtn}>
                              <Ionicons
                                name="trash-outline"
                                size={15}
                                color={Colors.textSecondary}
                              />
                            </TouchableOpacity>
                          );
                        })()}
                    </View>
                  </View>
                );
              })}

              {/* Renglones vacíos para completar la libreta si hay pocos movimientos */}
              {Array.from({
                length: Math.max(0, 3 - filteredMovements.length),
              }).map((_, i) => (
                <View key={`blank-dt-${i}`} style={styles.blankLine} />
              ))}
            </>
          )}

          {monthMovements.length > 0 ? (
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
          )}
        </NotebookPaper>
      </ScrollView>

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

      {/* Modal de edición de alias y tope de crédito */}
      {customer.data && (
        <EditCustomerAliasLimitModal
          visible={isEditAliasLimitOpen}
          onClose={() => setIsEditAliasLimitOpen(false)}
          customerId={customer.data.id}
          customerName={customer.data.name}
          initialAlias={customer.data.alias}
          initialCreditLimit={Number(customer.data.credit_limit || 0)}
          onSaved={() => {
            customer.refetch();
            queryClient.invalidateQueries({ queryKey: ['customer', id] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
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
                        : 'Abono recibido (-)'}
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
    paddingBottom: 110,
  },
  notebookContainer: {
    marginBottom: 16,
  },

  // Header superior de Tendero
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
    position: 'relative',
  },
  headerDropletsContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 0,
  },
  droplet: {
    position: 'absolute',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    maxWidth: '46%',
    textAlign: 'center',
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  whatsappBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    justifyContent: 'center',
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
    maxWidth: 150,
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sessionAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  sessionCol: {
    flexShrink: 1,
    minWidth: 0,
  },
  sessionRole: {
    fontSize: 7.5,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    lineHeight: 9,
  },
  sessionName: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 13,
  },
  sessionBadgeActive: {
    borderColor: Colors.primary,
    backgroundColor: '#FFFBF8',
  },
  menuModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  menuPopover: {
    position: 'absolute',
    width: 235,
    maxWidth: '85%',
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
    backgroundColor: Colors.primaryLight,
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
    color: Colors.textSecondary,
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
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
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
  pencilBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
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
  actionsRowSmall: {
    flexDirection: 'column',
    gap: 10,
  },

  freePortfolioNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  freePortfolioNoticeText: {
    flex: 1,
    color: Colors.destructive,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
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
    marginBottom: 10,
    width: '100%',
    minHeight: 40,
  },

  // Tabla Libreta de Cuentas
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
  tableHeaderRowActive: {
    borderBottomWidth: 1,
    borderBottomColor: '#CFE0F1',
    borderStyle: 'dashed',
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
    paddingHorizontal: 2,
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
  voidBtnCol: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voidBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
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

  // Filtro "Qué fue" y buscador animado en fila dedicada
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
    minWidth: 0,
    height: '100%',
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

  // Filas de la tabla
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#CFE0F1',
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
    backgroundColor: 'transparent',
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
  footerSpacer: {
    height: 16,
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
