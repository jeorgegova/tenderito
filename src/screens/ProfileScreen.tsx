import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {useFocusEffect, useScrollToTop} from '@react-navigation/native';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {DynamicBrandCurves} from '../components/ui/DynamicBrandCurves';
import {MonochromeIcon} from '../components/ui/MonochromeIcon';
import {EditStoreModal} from '../components/ui/EditStoreModal';
import {showAlert} from '../components/ui/AlertModal';
import {supabase} from '../lib/supabase';
import {confirmLogout} from '../lib/session';
import {useStore} from '../store/useStore';
import {useResponsive} from '../hooks/useResponsive';
import {Colors} from '../theme';
import {
  calculateSubscriptionStatus,
  downgradeToFreePlan,
  fetchSubscriptionPlans,
  openWhatsAppPlanRequest,
} from '../services/plans';
import {
  getActiveStoreId,
  setActiveStoreId,
  fetchUserStores,
} from '../services/storeContext';
import {syncAll} from '../services/sync';
import {fetchProfile} from '../services/profile';
import type {SubscriptionPlanItem} from '../types';
import {StoreStatusRing} from '../components/ui/StoreStatusRing';
import {CreateStoreStatusModal} from '../components/CreateStoreStatusModal';
import {StoreStatusViewerModal} from '../components/StoreStatusViewerModal';
import {fetchMerchantStoreStatuses} from '../services/storeStatuses';

function formatPlanDescription(description?: string | null): string {
  if (!description) return '';
  const parts = description.split('+').map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) return description;
  return parts
    .map((part, idx) => {
      const capitalized = part.charAt(0).toUpperCase() + part.slice(1);
      return idx < parts.length - 1 ? `${capitalized} +` : capitalized;
    })
    .join('\n');
}

export function ProfileScreen({navigation}: any) {
  const {isSmall, isTablet, tabletContainerStyle} = useResponsive();
  const [isEditStoreOpen, setIsEditStoreOpen] = useState(false);
  const setProfile = useStore(s => s.setProfile);
  const queryClient = useQueryClient();
  const {data, refetch: refetchProfile} = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });

  const {data: plans = []} = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: fetchSubscriptionPlans,
  });

  const {data: userStores = [], refetch: refetchStores} = useQuery({
    queryKey: ['user-stores'],
    queryFn: fetchUserStores,
  });

  const {data: currentStoreId, refetch: refetchActiveStore} = useQuery({
    queryKey: ['active-store-id'],
    queryFn: getActiveStoreId,
  });

  const activeStore = userStores.find(s => s.store_id === currentStoreId) || userStores[0];
  const currentAddress = (data as any)?.address || activeStore?.address || '';

  async function handleSwitchStore(storeId: string) {
    if (storeId === currentStoreId) return;
    try {
      await setActiveStoreId(storeId);
      queryClient.clear();
      await syncAll({force: true});
      await refetchProfile();
      await refetchStores();
      await refetchActiveStore();
      showAlert({
        title: 'Tienda cambiada',
        message: 'Has cambiado a la tienda seleccionada.',
        type: 'success',
      });
    } catch (e: any) {
      showAlert('Error cambiando de tienda', e?.message);
    }
  }

  useEffect(() => {
    if (data) {
      setProfile(data as any);
    }
  }, [data, setProfile]);

  const [isCreateStatusOpen, setIsCreateStatusOpen] = useState(false);
  const [isViewStatusOpen, setIsViewStatusOpen] = useState(false);

  const activeStoreId = currentStoreId || activeStore?.store_id || (data as any)?.id;
  const {data: storeStatuses = [], refetch: refetchStatuses} = useQuery({
    queryKey: ['store-statuses-merchant', activeStoreId],
    queryFn: () => (activeStoreId ? fetchMerchantStoreStatuses(activeStoreId) : []),
    enabled: Boolean(activeStoreId),
  });

  const subStatus = calculateSubscriptionStatus(data as any);
  const hasActivePaidPlan = subStatus.effectivePlan !== 'free' && !subStatus.isExpired;
  const currentPlan = (plans || []).find(
    (p: any) => p.id?.toLowerCase() === subStatus.effectivePlan?.toLowerCase(),
  );
  const customerLimit = currentPlan?.customer_limit ?? (subStatus.effectivePlan !== 'free' ? 999999 : 10);
  const scrollRef = useRef<ScrollView>(null);

  // Al tocar el menú Perfil cuando ya está activo, desplaza suavemente al tope
  useScrollToTop(scrollRef);

  // Al ingresar a Perfil desde cualquier otro menú, garantiza inicio en coordenada 0
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  // Botón físico "Atrás" en Perfil: vuelve a Inicio
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigation.navigate('Inicio');
        return true;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress,
      );
      return () => subscription.remove();
    }, [navigation]),
  );

  function logout() {
    confirmLogout();
  }

  async function handlePlanAction(plan: SubscriptionPlanItem, isRenewal: boolean) {
    const storeName = (data as any)?.store_name ?? 'Mi Tienda';
    const planIdLower = plan.id.toLowerCase();

    // Si elige el plan Free: cambio inmediato directo en la app
    if (planIdLower === 'free') {
      showAlert({
        title: '¿Cambiar a plan Free?',
        message:
          'Pasarás al plan gratuito (hasta 10 clientes). Tus clientes actuales se mantienen, pero no podrás agregar más hasta que te suscribas a un plan pago.',
        type: 'warning',
        buttons: [
          {text: 'Cancelar', style: 'cancel'},
          {
            text: 'Cambiar a Free',
            style: 'default',
            onPress: async () => {
              const res = await downgradeToFreePlan();
              if (res.success) {
                await refetchProfile();
                await queryClient.invalidateQueries({
                  queryKey: ['free-portfolio'],
                });
                showAlert('Plan actualizado', 'Ahora estás en el plan Free.');
              } else {
                showAlert('Error', res.error ?? 'No se pudo actualizar el plan.');
              }
            },
          },
        ],
      });
      return;
    }

    // Para los demás planes: abre WhatsApp con mensaje preescrito
    await openWhatsAppPlanRequest({
      storeName,
      planName: plan.name,
      isRenewal,
    });
  }

  const currentPlanId = ((data as any)?.subscription_plan ?? 'free').toLowerCase();

  return (
    <View style={styles.wrap}>
      <DynamicBrandCurves position="bottom-left" />
      <Header title="Mi negocio" subtitle="Perfil y suscripción" showCurve curveVariant="profile" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, tabletContainerStyle(620)]}
        showsVerticalScrollIndicator={false}>
        <Card style={styles.accountCard}>
          <StoreStatusRing
            size={68}
            strokeWidth={3}
            count={storeStatuses.length}
            unviewedCount={storeStatuses.length}
            showAddBadge={true}
            onAddPress={() => {
              if (!hasActivePaidPlan) {
                showAlert(
                  'Función de suscripción',
                  'Los estados publicitarios están incluidos en la suscripción de pago. Activa o renueva tu plan para promocionar ofertas y productos a tus clientes.',
                );
                return;
              }

              if (storeStatuses.length >= 3) {
                showAlert(
                  'Límite alcanzado',
                  'Tu tienda ya cuenta con el máximo de 3 estados activos simultáneos. Espera a que expire uno o elimínalo para publicar otro.',
                );
                return;
              }
              setIsCreateStatusOpen(true);
            }}
            onPress={() => {
              if (storeStatuses.length > 0) {
                setIsViewStatusOpen(true);
              } else if (hasActivePaidPlan) {
                setIsCreateStatusOpen(true);
              } else {
                showAlert(
                  'Función de suscripción',
                  'Los estados publicitarios están incluidos en la suscripción de pago. Activa o renueva tu plan para promocionar ofertas y productos a tus clientes.',
                );
              }
            }}
            style={{marginBottom: 12}}>
            <View style={styles.storeIcon}>
              <MonochromeIcon name="store" color={Colors.primary} size={26} />
            </View>
          </StoreStatusRing>
          <Text style={styles.store}>{(data as any)?.store_name ?? 'Cargando tienda…'}</Text>
          <Text style={styles.merchant}>
            {(data as any)?.merchant_name ?? ''}
            {(data as any)?.phone ? ` · Tel: ${(data as any).phone}` : ''}
            {currentAddress ? ` · Dir: ${currentAddress}` : ''}
          </Text>

          <TouchableOpacity
            style={styles.editStoreBtn}
            onPress={() => setIsEditStoreOpen(true)}
            activeOpacity={0.7}>
            <Ionicons name="pencil" size={13} color={Colors.primary} />
            <Text style={styles.editStoreBtnText}>Editar datos de la tienda</Text>
          </TouchableOpacity>
          <View
            style={[
              styles.planPill,
              subStatus.expiresToday
                ? {backgroundColor: '#FEE2E2'}
                : subStatus.inGracePeriod
                ? {backgroundColor: '#FEF3C7'}
                : null,
            ]}>
            <View
              style={[
                styles.planDot,
                subStatus.expiresToday
                  ? {backgroundColor: Colors.destructive}
                  : subStatus.inGracePeriod
                  ? {backgroundColor: '#D97706'}
                  : null,
              ]}
            />
            <Text
              style={[
                styles.plan,
                subStatus.expiresToday
                  ? {color: Colors.destructive}
                  : subStatus.inGracePeriod
                  ? {color: '#D97706'}
                  : null,
              ]}>
              {subStatus.effectivePlan === 'free'
                ? 'Plan Free · Vitalicio'
                : subStatus.expiresToday
                ? `Plan ${subStatus.planId.toUpperCase()} · ¡Vence hoy!`
                : subStatus.inGracePeriod
                ? `Plan ${subStatus.planId.toUpperCase()} · Vencido (${subStatus.remainingGraceDays}d de gracia)`
                : subStatus.formattedEndDate
                ? `Plan ${subStatus.planId.toUpperCase()} · Vence ${subStatus.formattedEndDate}`
                : `Plan ${subStatus.planId.toUpperCase()} · Activo`}
            </Text>
          </View>
        </Card>

        {/* Banner informativo de estado de suscripción */}
        {subStatus.inGracePeriod && (
          <Card
            style={{
              padding: 16,
              backgroundColor: '#FEF3C7',
              borderWidth: 1.5,
              borderColor: '#F59E0B',
              marginTop: 12,
            }}>
            <Text style={{fontSize: 14, fontWeight: '800', color: '#92400E', marginBottom: 4}}>
              Tu suscripción {subStatus.planId.toUpperCase()} venció el {subStatus.formattedEndDate}
            </Text>
            <Text style={{fontSize: 13, color: '#B45309', lineHeight: 18}}>
              Te quedan {subStatus.remainingGraceDays} {subStatus.remainingGraceDays === 1 ? 'día de gracia' : 'días de gracia'} para renovar tu suscripción o pasar a la versión Free conservando tus datos.
            </Text>
          </Card>
        )}

        {subStatus.expiresToday && (
          <Card
            style={{
              padding: 16,
              backgroundColor: '#FEE2E2',
              borderWidth: 1.5,
              borderColor: '#EF4444',
              marginTop: 12,
            }}>
            <Text style={{fontSize: 14, fontWeight: '800', color: '#991B1B', marginBottom: 4}}>
              ¡Tu suscripción {subStatus.planId.toUpperCase()} vence hoy!
            </Text>
            <Text style={{fontSize: 13, color: '#B91C1C', lineHeight: 18}}>
              Renueva hoy mismo para evitar entrar en periodo de gracia o interrupciones en tus funciones avanzadas.
            </Text>
          </Card>
        )}

        {!subStatus.isExpired && !subStatus.expiresToday && subStatus.remainingDays > 0 && subStatus.remainingDays <= 5 && (
          <Card
            style={{
              padding: 16,
              backgroundColor: '#FEF3C7',
              borderWidth: 1.5,
              borderColor: '#F59E0B',
              marginTop: 12,
            }}>
            <Text style={{fontSize: 14, fontWeight: '800', color: '#92400E', marginBottom: 4}}>
              Tu suscripción vencerá pronto
            </Text>
            <Text style={{fontSize: 13, color: '#B45309', lineHeight: 18}}>
              Tu plan {subStatus.planId.toUpperCase()} vence el {subStatus.formattedEndDate} (te quedan {subStatus.remainingDays} {subStatus.remainingDays === 1 ? 'día' : 'días'}). Renueva a tiempo para no perder tus beneficios.
            </Text>
          </Card>
        )}

        {userStores.length > 1 && (
          <View style={{marginTop: 8}}>
            <Text style={styles.section}>Tus tiendas</Text>
            <Text style={styles.sectionHint}>
              Toca para cambiar de tienda activa
            </Text>
            <View style={{gap: 8, marginTop: 8}}>
              {userStores.map(st => {
                const isActive = st.store_id === currentStoreId;
                return (
                  <TouchableOpacity
                    key={st.store_id}
                    onPress={() => handleSwitchStore(st.store_id)}
                    activeOpacity={0.7}>
                    <Card
                      style={[
                        styles.storeSwitchCard,
                        isActive && styles.activeStoreCard,
                      ]}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1}}>
                        <View
                          style={[
                            styles.storeIconSmall,
                            isActive && {backgroundColor: Colors.primaryLight},
                          ]}>
                          <MonochromeIcon
                            name="store"
                            size={16}
                            color={isActive ? Colors.primary : Colors.textSecondary}
                          />
                        </View>
                        <View style={{flex: 1}}>
                          <Text style={[styles.storeSwitchName, isActive && {color: Colors.primary}]}>
                            {st.store_name}
                          </Text>
                          <Text style={styles.storeSwitchRole}>
                            {st.role === 'owner' ? 'Propietario' : 'Administrador'} · {st.subscription_plan.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      {isActive && (
                        <View style={styles.activePill}>
                          <Text style={styles.activePillText}>ACTIVA</Text>
                        </View>
                      )}
                    </Card>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.section}>Tu plan</Text>
            <Text style={styles.sectionHint}>Elige el tamaño que necesita tu negocio</Text>
          </View>
        </View>

        {plans.map(p => {
          const planIdLower = p.id.toLowerCase();
          const isContracted = currentPlanId === planIdLower;
          const isSelected = isContracted && !subStatus.needsRenewal;
          const showRenew = isContracted && subStatus.needsRenewal;

          const priceParts = (p.price_text ?? '$0').split('/');
          const priceValue = priceParts[0];
          const pricePeriod = priceParts.length > 1 ? `/${priceParts[1]}` : null;

          return (
            <Card key={p.id} style={[styles.planCard, isSelected && styles.currentPlan]}>
              <View style={[styles.planIcon, isSelected && styles.planIconActive]}>
                <MonochromeIcon
                  name={planIdLower === 'free' ? 'wallet' : planIdLower === 'basic' ? 'credit' : 'store'}
                  color={isSelected ? Colors.primary : Colors.textSecondary}
                  size={19}
                />
              </View>

              <View style={{flex: 1}}>
                <View style={styles.planTitleRow}>
                  <Text style={styles.planName}>{p.name}</Text>
                  {isSelected ? <Text style={styles.currentTag}>ACTUAL</Text> : null}
                  {showRenew ? (
                    <Text style={[styles.currentTag, {color: Colors.destructive}]}>
                      {subStatus.expiresToday ? 'VENCE HOY' : 'VENCIDO'}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.planDesc}>{formatPlanDescription(p.description)}</Text>
                {isContracted ? (
                  <Text
                    style={[
                      styles.planDateText,
                      subStatus.expiresToday
                        ? {color: Colors.destructive}
                        : subStatus.inGracePeriod
                        ? {color: '#D97706'}
                        : null,
                    ]}>
                    {subStatus.effectivePlan === 'free'
                      ? '• Suscripción vitalicia'
                      : subStatus.expiresToday
                      ? `• Vence hoy (${subStatus.formattedEndDate})`
                      : subStatus.inGracePeriod
                      ? `• Venció el ${subStatus.formattedEndDate} (${Math.max(
                          0,
                          10 - subStatus.daysSinceExpiration,
                        )}d de gracia)`
                      : subStatus.formattedEndDate
                      ? `• Vence el ${subStatus.formattedEndDate}`
                      : '• Suscripción activa'}
                  </Text>
                ) : null}
              </View>

              <View style={styles.priceCol}>
                <Text style={styles.price}>{priceValue}</Text>
                {pricePeriod ? <Text style={styles.pricePeriod}>{pricePeriod}</Text> : null}
              </View>

              {showRenew ? (
                <Button
                  title="Renovar"
                  onPress={() => handlePlanAction(p, true)}
                  style={styles.renewButton}
                />
              ) : !isSelected ? (
                <Button
                  title="Elegir"
                  onPress={() => handlePlanAction(p, false)}
                  style={styles.chooseButton}
                />
              ) : null}
            </Card>
          );
        })}

        {customerLimit < 999999 ? (
          <Button
            title="Gestionar cartera activa"
            icon="wallet"
            variant="secondary"
            onPress={() => navigation.navigate('FreePortfolio')}
          />
        ) : null}

        <Button title="Cerrar sesión" icon="logout" variant="secondary" onPress={logout} style={styles.logout} />
      </ScrollView>

      <EditStoreModal
        visible={isEditStoreOpen}
        onClose={() => setIsEditStoreOpen(false)}
        initialStoreName={(data as any)?.store_name || ''}
        initialPhone={(data as any)?.phone || ''}
        initialMerchantName={(data as any)?.merchant_name || ''}
        initialAddress={currentAddress}
        onSaved={async () => {
          await refetchProfile();
          await refetchStores();
          await refetchActiveStore();
          queryClient.invalidateQueries({ queryKey: ['profile'] });
          queryClient.invalidateQueries({ queryKey: ['user-stores'] });
          queryClient.invalidateQueries({ queryKey: ['active-store'] });
        }}
      />

      {/* Modal para crear nuevo estado */}
      {activeStoreId ? (
        <CreateStoreStatusModal
          visible={isCreateStatusOpen}
          onClose={() => setIsCreateStatusOpen(false)}
          storeId={activeStoreId}
          storeName={(data as any)?.store_name || ''}
          currentActiveCount={storeStatuses.length}
          onCreated={async () => {
            await refetchStatuses();
            queryClient.invalidateQueries({
              queryKey: ['store-statuses-merchant', activeStoreId],
            });
          }}
        />
      ) : null}

      {/* Visor de estados para el tendero */}
      {isViewStatusOpen && storeStatuses.length > 0 ? (
        <StoreStatusViewerModal
          visible={isViewStatusOpen}
          onClose={() => setIsViewStatusOpen(false)}
          statuses={storeStatuses}
          storeName={(data as any)?.store_name || ''}
          isMerchant={true}
          onStatusDeleted={async () => {
            await refetchStatuses();
            queryClient.invalidateQueries({
              queryKey: ['store-statuses-merchant', activeStoreId],
            });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background, overflow: 'hidden'},
  content: {padding: 20, paddingTop: 4, paddingBottom: 110, gap: 12},
  accountCard: {
    alignItems: 'center',
    paddingVertical: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  storeIcon: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  store: {fontSize: 22, fontWeight: '800', color: Colors.text},
  merchant: {color: Colors.textSecondary, fontSize: 14, marginTop: 2},
  editStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editStoreBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primaryMid,
  },
  planDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primary},
  plan: {fontWeight: '700', color: Colors.primary, fontSize: 12, textTransform: 'capitalize'},
  sectionHeader: {marginTop: 10, marginBottom: -2},
  section: {fontSize: 18, fontWeight: '800', color: Colors.text},
  sectionHint: {fontSize: 13, color: Colors.textSecondary, marginTop: 2},
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  currentPlan: {borderColor: Colors.primary, borderWidth: 1.5, backgroundColor: '#FFFFFF'},
  planIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: Colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planIconActive: {backgroundColor: Colors.primaryLight},
  planTitleRow: {flexDirection: 'row', alignItems: 'center', gap: 7},
  planName: {fontWeight: '800', color: Colors.text},
  currentTag: {fontSize: 8, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5},
  planDesc: {color: Colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2},
  planDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 3,
  },
  priceCol: {alignItems: 'flex-end', flexShrink: 0},
  price: {fontWeight: '800', color: Colors.text, fontSize: 13},
  pricePeriod: {fontSize: 10, color: Colors.textSecondary},
  chooseButton: {paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, borderRadius: 12},
  renewButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 36,
    borderRadius: 12,
    backgroundColor: '#D97706',
  },
  storeSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  activeStoreCard: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  storeIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeSwitchName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  storeSwitchRole: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  activePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
  },
  activePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  logout: {marginTop: 8, backgroundColor: Colors.card, borderColor: Colors.border},
});
