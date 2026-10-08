import {useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Input} from '../components/ui/Input';
import {customerAuthEmail} from '../lib/customerAuth';
import {supabase} from '../lib/supabase';
import {findCustomerForActivation} from '../services/customerPortal';
import {Colors} from '../theme';

export function CustomerRegisterScreen({navigation}: any) {
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function checkDocument() {
    if (!document.trim())
      return Alert.alert('Faltan datos', 'Ingresa tu cédula');
    setLoading(true);
    try {
      const result = await findCustomerForActivation(document);
      if (!result) {
        return Alert.alert(
          'No te encontramos',
          'Pídele al tendero que te registre primero.',
        );
      }
      setCustomer(result);
    } catch (error: any) {
      Alert.alert('No se pudo consultar', error?.message ?? 'Intenta de nuevo');
    } finally {
      setLoading(false);
    }
  }

  async function activate() {
    if (!customer || !phone.trim() || password.length < 6) {
      return Alert.alert(
        'Faltan datos',
        'Confirma tu teléfono y crea una contraseña de mínimo 6 caracteres.',
      );
    }
    setLoading(true);
    const {data, error} = await supabase.auth.signUp({
      email: customerAuthEmail(document),
      password,
      options: {
        data: {user_type: 'customer', customer_id: customer.customer_id, phone},
      },
    });
    setLoading(false);
    if (error || !data.user)
      return Alert.alert(
        'No se pudo activar',
        error?.message ?? 'Intenta de nuevo',
      );
    if (!data.session) {
      return Alert.alert(
        'Cuenta pendiente',
        'Desactiva la confirmación de correo en Supabase para activar inmediatamente.',
      );
    }
    await supabase.auth.signOut();
    Alert.alert('Cuenta activada', 'Ya puedes ingresar como cliente.', [
      {text: 'Ir al inicio', onPress: () => navigation.replace('Login')},
    ]);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Activar cuenta de cliente</Text>
      <Text style={styles.sub}>
        Usa la cédula con la que te registró el tendero.
      </Text>
      <Card style={styles.card}>
        <Input
          label="Número de identificación"
          value={document}
          onChangeText={setDocument}
          keyboardType="number-pad"
        />
        <Button
          title={loading ? 'Consultando...' : 'Buscar mis datos'}
          onPress={checkDocument}
          disabled={loading}
        />
        {customer ? (
          <>
            <Card style={{gap: 4}}>
              <Text style={styles.name}>{customer.name_masked}</Text>
              <Text style={styles.sub}>
                Teléfono registrado: {customer.phone_masked}
              </Text>
            </Card>
            <Input
              label="Confirma tu teléfono"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Input
              label="Crea tu contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!!phone.trim()}
              placeholder="Mínimo 6 caracteres"
            />
            <Button
              title={loading ? 'Activando...' : 'Activar mi cuenta'}
              onPress={activate}
              disabled={loading}
            />
          </>
        ) : null}
      </Card>
      <Text style={styles.link} onPress={() => navigation.replace('Login')}>
        Volver al inicio de sesión
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  sub: {color: Colors.textSecondary, textAlign: 'center'},
  card: {marginTop: 20, gap: 12},
  name: {fontWeight: '800', color: Colors.text},
  link: {
    textAlign: 'center',
    color: Colors.primary,
    marginTop: 16,
    fontWeight: '600',
  },
});
