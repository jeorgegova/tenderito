import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import React, {useEffect, useState} from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {
  getMessaging,
  getToken,
  onMessage,
} from '@react-native-firebase/messaging';
import notifee, {AndroidImportance} from 'react-native-notify-kit';
import {RootNavigator} from './src/navigation/RootNavigator';

function useFirebaseNotifications() {
  useEffect(() => {
    const messaging = getMessaging();
    let mounted = true;

    const notificationSetup = (async () => {
      const settings = await notifee.requestPermission();
      console.log(
        'FCM_PERMISO_STATUS:',
        (settings as any)?.authorizationStatus,
      );
      await notifee.createChannel({
        id: 'mensajes',
        name: 'Mensajes',
        importance: AndroidImportance.HIGH,
        sound: 'default',
        vibration: true,
      });
      console.log('FCM_CANAL_CREADO: mensajes');
      return 'mensajes';
    })().catch(notificationError => {
      console.warn(
        'No fue posible configurar las notificaciones:',
        notificationError,
      );
      return null;
    });

    getToken(messaging)
      .then(token => {
        if (mounted) console.log('FCM_TOKEN:', token);
      })
      .catch(tokenError => {
        console.warn('No fue posible obtener el token FCM:', tokenError);
      });

    const unsubscribe = onMessage(messaging, async remoteMessage => {
      console.log('FCM_MENSAJE_RECIBIDO:', JSON.stringify(remoteMessage));
      console.log('FCM_TITULO:', remoteMessage?.notification?.title);
      console.log('FCM_CUERPO:', remoteMessage?.notification?.body);
      console.log('FCM_DATA:', JSON.stringify(remoteMessage?.data ?? {}));
      console.log('FCM_MESSAGE_ID:', (remoteMessage as any)?.messageId);

      const channelId = await notificationSetup;
      console.log('FCM_CHANNEL_ID:', channelId);
      if (!channelId) {
        console.warn('FCM_SIN_CANAL: no se muestra notificación');
        return;
      }

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
            channelId,
            pressAction: {id: 'default'},
          },
          ios: {sound: 'default'},
        });
        console.log('FCM_MOSTRADA_ID:', notificationId);
      } catch (notificationError) {
        console.warn(
          'No fue posible mostrar la notificación:',
          notificationError,
        );
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
}

function App(): React.JSX.Element {
  const [client] = useState(() => new QueryClient());
  useFirebaseNotifications();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <StatusBar barStyle="dark-content" />
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default App;
