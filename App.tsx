import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import React, {useEffect, useState} from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
} from '@react-native-firebase/messaging';
import notifee, {AndroidImportance} from 'react-native-notify-kit';
import {RootNavigator} from './src/navigation/RootNavigator';
import {useDatabase} from './src/hooks/useDatabase';
import {useSync} from './src/hooks/useSync';
import {AlertModal} from './src/components/ui/AlertModal';
import {supabase} from './src/lib/supabase';
import {register_fcm_token, syncPendingDeviceToken} from './src/services/deviceService';

function useFirebaseNotifications() {
  useEffect(() => {
    let mounted = true;
    let unsubscribeMessage: (() => void) | null = null;
    let unsubscribeRefresh: (() => void) | null = null;
    let authSubscription: {unsubscribe: () => void} | null = null;

    const setupNotificationsSafe = async () => {
      try {
        // 1. Configurar Notifee (permisos y canal) de forma protegida
        let channelId = 'mensajes';
        try {
          const settings = await notifee.requestPermission();
          console.log('FCM_PERMISO_STATUS:', (settings as any)?.authorizationStatus);

          await notifee.createChannel({
            id: 'mensajes',
            name: 'Mensajes',
            importance: AndroidImportance.HIGH,
            sound: 'default',
            vibration: true,
          });
          console.log('FCM_CANAL_CREADO: mensajes');
        } catch (notifeeErr) {
          console.warn('Error configurando canal Notifee:', notifeeErr);
        }

        if (!mounted) return;

        // 2. Inicializar Firebase Messaging
        let messaging: any = null;
        try {
          messaging = getMessaging();
        } catch (msgInitErr) {
          console.warn('No se pudo inicializar Firebase Messaging:', msgInitErr);
          return;
        }

        if (!messaging || !mounted) return;

        // 3. Obtener el token FCM de forma segura
        try {
          const token = await getToken(messaging);
          if (mounted && token) {
            console.log('FCM_TOKEN:', token);
            await register_fcm_token(token);
          }
        } catch (tokenError) {
          console.warn('No fue posible obtener el token FCM (posible falta de Google Play Services o red):', tokenError);
        }

        if (!mounted) return;

        // 4. Suscripción a rotación de tokens
        try {
          unsubscribeRefresh = onTokenRefresh(messaging, token => {
            console.log('FCM_TOKEN_REFRESCADO:', token);
            register_fcm_token(token);
          });
        } catch (refreshErr) {
          console.warn('Error en onTokenRefresh:', refreshErr);
        }

        // 5. Suscripción a mensajes en primer plano
        try {
          unsubscribeMessage = onMessage(messaging, async remoteMessage => {
            console.log('FCM_MENSAJE_RECIBIDO:', JSON.stringify(remoteMessage));
            const title = String(
              remoteMessage?.notification?.title ??
                remoteMessage?.data?.title ??
                'Nuevo mensaje',
            );
            const body = String(
              remoteMessage?.notification?.body ??
                remoteMessage?.data?.body ??
                'Tienes un mensaje nuevo.',
            );

            try {
              const notificationId = await notifee.displayNotification({
                title,
                body,
                android: {
                  channelId: 'mensajes',
                  pressAction: {id: 'default'},
                },
                ios: {sound: 'default'},
              });
              console.log('FCM_MOSTRADA_ID:', notificationId);
            } catch (notificationError) {
              console.warn('No fue posible mostrar la notificación:', notificationError);
            }
          });
        } catch (onMessageErr) {
          console.warn('Error en onMessage:', onMessageErr);
        }
      } catch (err) {
        console.warn('Excepción general en setupNotificationsSafe:', err);
      }
    };

    // Pequeño retardo (600ms) para garantizar que la Activity nativa esté totalmente lista
    const timer = setTimeout(() => {
      setupNotificationsSafe();
    }, 600);

    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session?.user &&
        (event === 'SIGNED_IN' ||
          event === 'INITIAL_SESSION' ||
          event === 'TOKEN_REFRESHED')
      ) {
        syncPendingDeviceToken();
      }
    });
    authSubscription = subscription;

    return () => {
      mounted = false;
      clearTimeout(timer);
      unsubscribeMessage?.();
      unsubscribeRefresh?.();
      authSubscription?.unsubscribe();
    };
  }, []);
}


function AppContent() {
  useDatabase();
  useSync();

  return (
    <>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
      <AlertModal />
    </>
  );
}

function App(): React.JSX.Element {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 30,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
          },
        },
      }),
  );
  useFirebaseNotifications();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <StatusBar barStyle="dark-content" />
        <AppContent />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default App;
