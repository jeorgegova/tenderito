import {QueryClientProvider} from '@tanstack/react-query';
import React, {useEffect} from 'react';
import {StatusBar, AppState} from 'react-native';
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
import {Toast} from './src/components/ui/Toast';
import {supabase} from './src/lib/supabase';
import {register_fcm_token, syncPendingDeviceToken} from './src/services/deviceService';
import {AuthProvider} from './src/context/AuthContext';
import {SwipeNavigationProvider} from './src/context/SwipeNavigationContext';
import {queryClient} from './src/lib/queryClient';

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

            // Invalidar de inmediato las consultas para actualizar la interfaz en tiempo real
            try {
              await queryClient.invalidateQueries({ queryKey: ['customer-portal'] });
              await queryClient.invalidateQueries({ queryKey: ['customers'] });
              await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
              await queryClient.invalidateQueries({ queryKey: ['customer'] });
              await queryClient.invalidateQueries({ queryKey: ['total-receivable'] });
              await queryClient.invalidateQueries({ queryKey: ['overdue'] });
              await queryClient.invalidateQueries({ queryKey: ['stats'] });
              await queryClient.invalidateQueries({ queryKey: ['profile'] });
            } catch (invErr) {
              console.warn('Error invalidando queries tras notificación FCM:', invErr);
            }
          });
        } catch (onMessageErr) {
          console.warn('Error en onMessage:', onMessageErr);
        }
      } catch (err) {
        console.warn('Excepción general en setupNotificationsSafe:', err);
      }
    };

    // Actualizar consultas al regresar a la app desde segundo plano
    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        queryClient.invalidateQueries({ queryKey: ['customer-portal'] });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['overdue'] });
      }
    });

    // Actualizar cuando se interactúa o recibe evento en primer plano de notificaciones
    let unsubscribeNotifee: (() => void) | null = null;
    try {
      unsubscribeNotifee = notifee.onForegroundEvent(() => {
        queryClient.invalidateQueries({ queryKey: ['customer-portal'] });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      });
    } catch (_e) {}

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
      appStateSub.remove();
      unsubscribeNotifee?.();
    };
  }, []);
}


function AppContent() {
  useDatabase();
  useSync();

  return (
    <SwipeNavigationProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
      <AlertModal />
      <Toast />
    </SwipeNavigationProvider>
  );
}

function App(): React.JSX.Element {
  useFirebaseNotifications();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#FFFFFF"
          translucent={false}
        />
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default App;
