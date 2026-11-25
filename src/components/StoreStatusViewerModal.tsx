import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Colors } from '../theme';
import {
  StoreStatus,
  StoreStatusViewItem,
  fetchStatusViews,
  markStatusAsViewed,
  deleteStoreStatus,
} from '../services/storeStatuses';

interface StoreStatusViewerModalProps {
  visible: boolean;
  onClose: () => void;
  statuses: StoreStatus[];
  initialIndex?: number;
  storeName?: string;
  isMerchant?: boolean;
  customerId?: string;
  onStatusDeleted?: (statusId: string) => void;
}

// 15 segundos predeterminados por estado
const STATUS_DURATION_MS = 15000;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function StoreStatusViewerModal({
  visible,
  onClose,
  statuses,
  initialIndex = 0,
  storeName = 'Tienda',
  isMerchant = false,
  customerId,
  onStatusDeleted,
}: StoreStatusViewerModalProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewsSheet, setShowViewsSheet] = useState(false);
  const [viewsList, setViewsList] = useState<StoreStatusViewItem[]>([]);
  const [dynamicViewsCount, setDynamicViewsCount] = useState<number>(0);
  const [isLoadingViews, setIsLoadingViews] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const startTimeRef = useRef<number>(Date.now());
  const animFrameRef = useRef<number | null>(null);
  const lastNavTimeRef = useRef<number>(0);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(Math.min(initialIndex, Math.max(0, statuses.length - 1)));
      setProgress(0);
      setIsPaused(false);
      setShowViewsSheet(false);
      lastNavTimeRef.current = Date.now();
    }
  }, [visible, initialIndex, statuses.length]);

  const currentStatus = statuses[currentIndex];

  useEffect(() => {
    if (visible && !isMerchant && customerId && currentStatus) {
      markStatusAsViewed(currentStatus.id, customerId);
    }
  }, [visible, isMerchant, customerId, currentStatus?.id]);

  // Para el tendero: consultar en tiempo real quiénes han visto el estado apenas abre el visor o cambia de estado
  useEffect(() => {
    if (!visible || !isMerchant || !currentStatus?.id) return;

    let isMounted = true;
    setDynamicViewsCount(currentStatus.views_count ?? 0);

    fetchStatusViews(currentStatus.id)
      .then(views => {
        if (!isMounted) return;
        setViewsList(views);
        setDynamicViewsCount(views.length);
      })
      .catch(err => {
        console.warn('[StoreStatusViewerModal] Error consultando vistas:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [visible, isMerchant, currentStatus?.id]);

  const goToNext = useCallback(() => {
    const now = Date.now();
    if (now - lastNavTimeRef.current < 380) return;
    lastNavTimeRef.current = now;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setProgress(0);
    startTimeRef.current = now;

    setCurrentIndex(prev => {
      if (prev < statuses.length - 1) {
        return prev + 1;
      } else {
        onClose();
        return prev;
      }
    });
  }, [statuses.length, onClose]);

  const goToPrev = useCallback(() => {
    const now = Date.now();
    if (now - lastNavTimeRef.current < 380) return;
    lastNavTimeRef.current = now;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setProgress(0);
    startTimeRef.current = now;

    setCurrentIndex(prev => {
      if (prev > 0) {
        return prev - 1;
      } else {
        return 0;
      }
    });
  }, []);

  // Temporizador de 15 segundos estilo WhatsApp Stories
  useEffect(() => {
    if (!visible || isPaused || showViewsSheet || statuses.length === 0) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    startTimeRef.current = Date.now() - (progress / 100) * STATUS_DURATION_MS;

    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / STATUS_DURATION_MS) * 100);
      setProgress(pct);

      if (pct >= 100) {
        goToNext();
      } else {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [visible, isPaused, showViewsSheet, currentIndex, statuses.length, goToNext]);

  // PanResponder para gestos horizontales (swipe izquierda -> siguiente, swipe derecha -> anterior) y tap
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          setIsPaused(true);
        },
        onPanResponderRelease: (_, gestureState) => {
          setIsPaused(false);
          const { dx, dy } = gestureState;

          // Swipe horizontal
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) {
              goToNext();
            } else {
              goToPrev();
            }
            return;
          }

          // Tap rápido
          if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
            if (gestureState.x0 < SCREEN_WIDTH * 0.35) {
              goToPrev();
            } else {
              goToNext();
            }
          }
        },
      }),
    [goToNext, goToPrev],
  );

  const handleOpenViewsSheet = async () => {
    if (!currentStatus) return;
    setIsPaused(true);
    setShowViewsSheet(true);
    if (viewsList.length === 0) {
      setIsLoadingViews(true);
    }
    try {
      const views = await fetchStatusViews(currentStatus.id);
      setViewsList(views);
      setDynamicViewsCount(views.length);
    } catch (e) {
      console.warn('Error cargando vistas:', e);
    } finally {
      setIsLoadingViews(false);
    }
  };

  const handleCloseViewsSheet = () => {
    setShowViewsSheet(false);
    setIsPaused(false);
  };

  const handleDelete = async () => {
    if (!currentStatus) return;
    setIsDeleting(true);
    setIsPaused(true);
    const res = await deleteStoreStatus(currentStatus.id, currentStatus.media_path);
    setIsDeleting(false);

    if (res.success) {
      onStatusDeleted?.(currentStatus.id);
      if (statuses.length <= 1) {
        onClose();
      } else {
        goToNext();
      }
    } else {
      setIsPaused(false);
    }
  };

  if (!visible || !currentStatus) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.container} {...panResponder.panHandlers}>
        {/* 1. Barras de progreso superiores (15s por estado) */}
        <View style={[styles.progressRow, { top: insets.top + 8 }]}>
          {statuses.map((s, idx) => {
            let fillPct = 0;
            if (idx < currentIndex) fillPct = 100;
            else if (idx === currentIndex) fillPct = progress;

            return (
              <View key={s.id} style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${fillPct}%` }]} />
              </View>
            );
          })}
        </View>

        {/* 2. Cabecera con botón de cierre visible */}
        <View style={[styles.header, { top: insets.top + 20 }]}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="storefront" size={20} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.headerStoreName}>{storeName}</Text>
              <Text style={styles.headerMeta}>
                {new Date(currentStatus.created_at).toLocaleDateString('es-CO', {
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                · Vence:{' '}
                {new Date(currentStatus.expires_at).toLocaleDateString('es-CO', {
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            {isMerchant && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={isDeleting}
                style={styles.headerBtn}>
                <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={[styles.headerBtn, styles.closeBtn]}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. Contenido Central */}
        <View
          style={[
            styles.mediaArea,
            { backgroundColor: currentStatus.media_url ? '#000000' : currentStatus.bg_color || Colors.primary },
          ]}>
          {currentStatus.media_url ? (
            <Image
              source={{ uri: currentStatus.media_url }}
              style={styles.mediaImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.textOnlyWrap}>
              <Text style={styles.textOnlyCaption}>{currentStatus.caption}</Text>
            </View>
          )}

          {/* Flecha visual izquierda si hay anterior */}
          {currentIndex > 0 && (
            <TouchableOpacity
              style={styles.navArrowLeft}
              onPress={goToPrev}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          {/* Flecha visual derecha si hay siguiente */}
          {currentIndex < statuses.length - 1 && (
            <TouchableOpacity
              style={styles.navArrowRight}
              onPress={goToNext}>
              <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        {/* 4. Pie con descripción y botón de vistas */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          {currentStatus.media_url ? (
            <Text style={styles.captionText}>{currentStatus.caption}</Text>
          ) : null}

          {isMerchant && (
            <View style={styles.viewsBtnRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleOpenViewsSheet}
                style={styles.viewsBtn}>
                <Ionicons name="eye-outline" size={16} color="#FFFFFF" />
                <Text style={styles.viewsBtnText}>
                  Visto por {dynamicViewsCount}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 5. Bottom Sheet: Clientes que han visto el estado */}
        {showViewsSheet && (
          <View style={styles.sheetOverlay}>
            <TouchableWithoutFeedback onPress={handleCloseViewsSheet}>
              <View style={styles.sheetBackdrop} />
            </TouchableWithoutFeedback>

            <View style={[styles.sheetContent, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderLeft}>
                  <Ionicons name="eye-outline" size={20} color={Colors.primary} />
                  <Text style={styles.sheetTitle}>
                    Visto por {viewsList.length} cliente{viewsList.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <TouchableOpacity onPress={handleCloseViewsSheet} style={styles.sheetCloseBtn}>
                  <Ionicons name="close" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
                {isLoadingViews ? (
                  <View style={styles.sheetLoading}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.sheetLoadingText}>Cargando visualizaciones…</Text>
                  </View>
                ) : viewsList.length === 0 ? (
                  <View style={styles.sheetEmpty}>
                    <Text style={styles.sheetEmptyText}>Aún ningún cliente ha visto este estado.</Text>
                  </View>
                ) : (
                  viewsList.map(v => (
                    <View key={v.customer_id} style={styles.sheetItem}>
                      <View style={styles.sheetItemLeft}>
                        <Ionicons name="person-circle-outline" size={34} color="#94A3B8" />
                        <View>
                          <Text style={styles.sheetCustomerName}>
                            {v.customer_alias || v.customer_name}
                          </Text>
                          {v.customer_alias ? (
                            <Text style={styles.sheetCustomerAlias}>{v.customer_name}</Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.sheetItemRight}>
                        <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                        <Text style={styles.sheetTimeText}>
                          {new Date(v.viewed_at).toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
  },
  progressRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 4,
    zIndex: 30,
  },
  progressBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  header: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 30,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerStoreName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerMeta: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  mediaArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  textOnlyWrap: {
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textOnlyCaption: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 30,
  },
  navArrowLeft: {
    position: 'absolute',
    left: 12,
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
  },
  navArrowRight: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 12,
    zIndex: 30,
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  viewsBtnRow: {
    alignItems: 'center',
  },
  viewsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  viewsBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '65%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetList: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetLoading: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  sheetLoadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  sheetEmpty: {
    padding: 24,
    alignItems: 'center',
  },
  sheetEmptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  sheetItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetCustomerName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  sheetCustomerAlias: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  sheetItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sheetTimeText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
