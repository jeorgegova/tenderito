import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useEffect, useState} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {MagnetTabBar} from '../components/ui/MagnetTabBar';
import {supabase} from '../lib/supabase';
import {Colors} from '../theme';
import {CustomerDetailScreen} from '../screens/CustomerDetailScreen';
import {CustomersScreen} from '../screens/CustomersScreen';
import {DashboardScreen} from '../screens/DashboardScreen';
import {LoginScreen} from '../screens/LoginScreen';
import {NewCreditScreen} from '../screens/NewCreditScreen';
import {NewPaymentScreen} from '../screens/NewPaymentScreen';
import {ProfileScreen} from '../screens/ProfileScreen';
import {RegisterScreen} from '../screens/RegisterScreen';
import {ReportsScreen} from '../screens/ReportsScreen';
import {StatsScreen} from '../screens/StatsScreen';
import {CustomerRegisterScreen} from '../screens/CustomerRegisterScreen';
import {CustomerHomeScreen} from '../screens/CustomerHomeScreen';
import {CustomerHistoryScreen} from '../screens/CustomerHistoryScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tabs.Navigator
      tabBar={props => <MagnetTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen name="Inicio" component={DashboardScreen} />
      <Tabs.Screen name="Clientes" component={CustomersScreen} />
      <Tabs.Screen name="Estadísticas" component={StatsScreen} />
      <Tabs.Screen name="Perfil" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(false);
  const [userType, setUserType] = useState<'store' | 'customer'>('store');

  function applySession(nextSession: any) {
    setSession(!!nextSession);
    setUserType(
      nextSession?.user?.user_metadata?.user_type === 'customer'
        ? 'customer'
        : 'store',
    );
  }

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => {
      applySession(data.session);
      setLoading(false);
    });
    const {data: sub} = supabase.auth.onAuthStateChange((_e, s) => {
      applySession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{headerShown: false, animation: 'fade', animationDuration: 200, contentStyle: {backgroundColor: Colors.background}, headerTintColor: Colors.primary, headerTitleStyle: {fontWeight: '700', color: Colors.text}, headerShadowVisible: false}}>
      {session ? (
        userType === 'customer' ? (
          <Stack.Screen name="CustomerMain" component={CustomerHomeScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="CustomerDetail"
              component={CustomerDetailScreen}
              options={{headerShown: true, title: 'Cliente'}}
            />
            <Stack.Screen
              name="CustomerHistory"
              component={CustomerHistoryScreen}
              options={{headerShown: true, title: 'Historial entre tiendas'}}
            />
            <Stack.Screen
              name="Alertas"
              component={ReportsScreen}
              options={{headerShown: true, title: 'Fiados vencidos'}}
            />
            <Stack.Screen
              name="NewCredit"
              component={NewCreditScreen}
              options={{
                headerShown: true,
                title: 'Nuevo fiado',
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="NewPayment"
              component={NewPaymentScreen}
              options={{
                headerShown: true,
                title: 'Registrar abono',
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
          </>
        )
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="CustomerRegister"
            component={CustomerRegisterScreen}
            options={{headerShown: true, title: 'Activar cuenta'}}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{headerShown: true, title: 'Crear negocio'}}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
