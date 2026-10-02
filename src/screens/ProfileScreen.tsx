import {useQuery} from '@tanstack/react-query';
import {useEffect} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
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
      <View style={{padding: 20, gap: 12}}>
        <Card>
          <Text style={styles.store}>{(data as any)?.store_name ?? '…'}</Text>
          <Text style={styles.merchant}>{(data as any)?.merchant_name ?? ''}</Text>
          <Text style={styles.plan}>
            Plan actual: {(data as any)?.subscription_plan ?? 'free'}
          </Text>
        </Card>
        <Text style={styles.section}>Planes</Text>
        {PLANS.map(p => (
          <Card key={p.id} style={styles.planCard}>
            <View style={{flex: 1}}>
              <Text style={styles.planName}>
                {p.name} · {p.price}
              </Text>
              <Text style={styles.planDesc}>{p.desc}</Text>
            </View>
            <Button
              title="Elegir"
              variant={
                (data as any)?.subscription_plan === p.id
                  ? 'secondary'
                  : 'primary'
              }
              onPress={() => changePlan(p.id)}
            />
          </Card>
        ))}
        <Button title="Cerrar sesión" variant="destructive" onPress={logout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  store: {fontSize: 20, fontWeight: '800', color: Colors.text},
  merchant: {color: Colors.textSecondary},
  plan: {marginTop: 8, fontWeight: '700', color: Colors.primary},
  section: {fontSize: 18, fontWeight: '700', color: Colors.text},
  planCard: {flexDirection: 'row', alignItems: 'center', gap: 12},
  planName: {fontWeight: '700', color: Colors.text},
  planDesc: {color: Colors.textSecondary, fontSize: 12},
});
