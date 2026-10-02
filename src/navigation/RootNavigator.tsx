import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useEffect, useState} from 'react';
import {ActivityIndicator, View} from 'react-native';
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

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
      }}>
      <Tabs.Screen name="Inicio" component={DashboardScreen} />
      <Tabs.Screen name="Clientes" component={CustomersScreen} />
      <Tabs.Screen name="Alertas" component={ReportsScreen} />
      <Tabs.Screen name="Perfil" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => {
      setSession(!!data.session);
      setLoading(false);
    });
    const {data: sub} = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(!!s);
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
    <Stack.Navigator screenOptions={{headerShown: false}}>
      {session ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="CustomerDetail"
            component={CustomerDetailScreen}
            options={{headerShown: true, title: 'Cliente'}}
          />
          <Stack.Screen
            name="NewCredit"
            component={NewCreditScreen}
            options={{
              headerShown: true,
              title: 'Nuevo fiado',
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="NewPayment"
            component={NewPaymentScreen}
            options={{
              headerShown: true,
              title: 'Registrar abono',
              presentation: 'modal',
            }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
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
