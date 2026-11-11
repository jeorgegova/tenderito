import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback, useEffect} from 'react';
import {BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {DynamicBrandCurves} from '../components/ui/DynamicBrandCurves';
import {MonochromeIcon} from '../components/ui/MonochromeIcon';
import {showAlert} from '../components/ui/AlertModal';
import {supabase} from '../lib/supabase';
import {confirmLogout} from '../lib/session';
import {useStore} from '../store/useStore';
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
import type {SubscriptionPlanItem} from '../types';

async function fetchProfile() {
  const {
    data: {user},
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('No autenticado');
  }
  const {data, error} = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) {
    throw error;
  }

  // Integrar datos de la tienda activa actual
  try {
    const activeStoreId = await getActiveStoreId();
    let storeQuery = supabase
      .from('stores')
      .select('store_name, subscription_plan, subscription_start_date, subscription_end_date, subscription_status');

    if (activeStoreId) {
      storeQuery = storeQuery.eq('id', activeStoreId);
    } else {
      storeQuery = storeQuery.eq('owner_id', user.id).limit(1);
    }

    const {data: storeData} = await storeQuery.maybeSingle();

    if (storeData) {
      return {
        ...data,
        store_name: storeData.store_name || data.store_name,
        subscription_plan: data.subscription_plan || storeData.subscription_plan || 'free',
        subscription_start_date: data.subscription_start_date || storeData.subscription_start_date,
        subscription_end_date: data.subscription_end_date || storeData.subscription_end_date,
        subscription_status: data.subscription_status || storeData.subscription_status,
      };
    }
  } catch (_e) {}

  return data;
}

export function ProfileScreen({navigation}: any) {
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

  const subStatus = calculateSubscriptionStatus(data as any);

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
      <DynamicBrandCurves position="top-left" />
      <Header title="Mi negocio" subtitle="Perfil y suscripción" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.accountCard}>
          <View style={styles.storeIcon}>
            <MonochromeIcon name="store" color={Colors.primary} size={22} />
          </View>
          <Text style={styles.store}>{(data as any)?.store_name ?? 'Cargando tienda…'}</Text>
          <Text style={styles.merchant}>{(data as any)?.merchant_name ?? ''}</Text>
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
                ? `Plan ${subStatus.planId.toUpperCase()} · Vencido (${Math.max(
                    0,
                    10 - subStatus.daysSinceExpiration,
                  )}d gracia)`
                : subStatus.formattedEndDate
                ? `Plan ${subStatus.planId.toUpperCase()} · Vence ${subStatus.formattedEndDate}`
                : `Plan ${subStatus.planId.toUpperCase()} · Activo`}
            </Text>
          </View>
        </Card>

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
                <Text style={styles.planDesc}>{p.description}</Text>
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

        {subStatus.effectivePlan === 'free' ? (
          <Button
            title="Gestionar cartera Free"
            icon="wallet"
            variant="secondary"
            onPress={() => navigation.navigate('FreePortfolio')}
          />
        ) : null}

        <Button title="Cerrar sesión" icon="logout" variant="secondary" onPress={logout} style={styles.logout} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background, overflow: 'hidden'},
  content: {padding: 20, paddingTop: 4, paddingBottom: 32, gap: 12},
  accountCard: {
    alignItems: 'center',
    paddingVertical: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  storeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  store: {fontSize: 22, fontWeight: '800', color: Colors.text},
  merchant: {color: Colors.textSecondary, fontSize: 14, marginTop: 2},
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
  planDesc: {color: Colors.textSecondary, fontSize: 12},
  planDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 3,
  },
  priceCol: {alignItems: 'flex-end'},
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
