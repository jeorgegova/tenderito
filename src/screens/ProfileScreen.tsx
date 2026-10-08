import {useQuery} from '@tanstack/react-query';
import {useEffect} from 'react';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {MonochromeIcon} from '../components/ui/MonochromeIcon';
import {supabase} from '../lib/supabase';
import {useStore} from '../store/useStore';
import {Colors} from '../theme';

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
  return data;
}

const PLANS = [
  {id: 'free', name: 'Free', desc: 'Hasta 10 clientes', price: '$0'},
  {id: 'basic', name: 'Basic', desc: 'Hasta 100 clientes', price: '$29.900/mes'},
  {
    id: 'pro',
    name: 'Pro',
    desc: 'Ilimitado + reportes avanzados',
    price: '$59.900/mes',
  },
];

export function ProfileScreen() {
  const setProfile = useStore(s => s.setProfile);
  const {data} = useQuery({queryKey: ['profile'], queryFn: fetchProfile});

  useEffect(() => {
    if (data) {
      setProfile(data as any);
    }
  }, [data, setProfile]);

  async function logout() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function changePlan(plan: string) {
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user) {
      return;
    }
    const {error} = await supabase
      .from('profiles')
      .update({subscription_plan: plan})
      .eq('id', user.id);
    if (error) {
      return Alert.alert('Error', error.message);
    }
    Alert.alert('Plan actualizado', `Ahora estás en ${plan}`);
  }

  return (
    <View style={styles.wrap}>
      <Header title="Mi negocio" subtitle="Perfil y suscripción" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.accountCard}>
          <View style={styles.storeIcon}><MonochromeIcon name="store" color={Colors.primary} size={22} /></View>
          <Text style={styles.store}>{(data as any)?.store_name ?? 'Cargando tienda…'}</Text>
          <Text style={styles.merchant}>{(data as any)?.merchant_name ?? ''}</Text>
          <View style={styles.planPill}><View style={styles.planDot} /><Text style={styles.plan}>Plan {(data as any)?.subscription_plan ?? 'free'}</Text></View>
        </Card>
        <View style={styles.sectionHeader}>
          <View><Text style={styles.section}>Tu plan</Text><Text style={styles.sectionHint}>Elige el tamaño que necesita tu negocio</Text></View>
        </View>
        {PLANS.map(p => {
          const selected = (data as any)?.subscription_plan === p.id;
          return <Card key={p.id} style={[styles.planCard, selected && styles.currentPlan]}>
            <View style={[styles.planIcon, selected && styles.planIconActive]}><MonochromeIcon name={p.id === 'free' ? 'wallet' : p.id === 'basic' ? 'credit' : 'store'} color={selected ? Colors.primary : Colors.textSecondary} size={19} /></View>
            <View style={{flex: 1}}>
              <View style={styles.planTitleRow}><Text style={styles.planName}>{p.name}</Text>{selected ? <Text style={styles.currentTag}>ACTUAL</Text> : null}</View>
              <Text style={styles.planDesc}>{p.desc}</Text>
            </View>
            <View style={styles.priceCol}><Text style={styles.price}>{p.price.split('/')[0]}</Text>{p.price.includes('/') ? <Text style={styles.pricePeriod}>/mes</Text> : null}</View>
            {!selected ? <Button title="Elegir" onPress={() => changePlan(p.id)} style={styles.chooseButton} /> : null}
          </Card>;
        })}
        <Button title="Cerrar sesión" icon="logout" variant="secondary" onPress={logout} style={styles.logout} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  content: {padding: 20, paddingTop: 4, paddingBottom: 32, gap: 12},
  accountCard: {alignItems: 'center', paddingVertical: 22},
  storeIcon: {width: 48, height: 48, borderRadius: 17, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center', marginBottom: 10},
  store: {fontSize: 20, fontWeight: '800', color: Colors.text},
  merchant: {color: Colors.textSecondary},
  planPill: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFF1E6'},
  planDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primary},
  plan: {fontWeight: '700', color: Colors.primary, fontSize: 12, textTransform: 'capitalize'},
  sectionHeader: {marginTop: 9, marginBottom: -3},
  section: {fontSize: 19, fontWeight: '800', color: Colors.text},
  sectionHint: {fontSize: 12, color: Colors.textSecondary, marginTop: 3},
  planCard: {flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13},
  currentPlan: {borderColor: '#FFC99E', backgroundColor: '#FFFCF9'},
  planIcon: {width: 38, height: 38, borderRadius: 14, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center'},
  planIconActive: {backgroundColor: '#FFF1E6'},
  planTitleRow: {flexDirection: 'row', alignItems: 'center', gap: 7},
  planName: {fontWeight: '800', color: Colors.text},
  currentTag: {fontSize: 8, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5},
  planDesc: {color: Colors.textSecondary, fontSize: 12},
  priceCol: {alignItems: 'flex-end'},
  price: {fontWeight: '800', color: Colors.text, fontSize: 13},
  pricePeriod: {fontSize: 10, color: Colors.textSecondary},
  chooseButton: {paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, borderRadius: 12},
  logout: {marginTop: 8, backgroundColor: Colors.card, borderColor: Colors.border},
});
