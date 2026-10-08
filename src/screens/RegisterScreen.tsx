import {useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Input} from '../components/ui/Input';
import {supabase} from '../lib/supabase';
import {Colors} from '../theme';

export function RegisterScreen({navigation}: any) {
  const [storeName, setStoreName] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    if (!storeName || !merchantName || !email || !password) {
      return Alert.alert('Faltan datos', 'Completa todos los campos');
    }
    setLoading(true);
    const {data, error} = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          store_name: storeName,
          merchant_name: merchantName,
          subscription_plan: 'free',
        },
      },
    });
    if (error || !data.user) {
      setLoading(false);
      return Alert.alert('Error', error?.message ?? 'No se pudo registrar');
    }
    setLoading(false);

    if (!data.session) {
      return Alert.alert(
        'Revisa tu correo',
        'Te enviamos un correo de comprobación. Valida tu cuenta para poder iniciar sesión.',
        [
          {
            text: 'Ir al inicio de sesión',
            onPress: () => navigation.replace('Login'),
          },
        ],
      );
    }

    Alert.alert('Cuenta creada', 'Tu cuenta ya está lista para usar.');
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.logo}>Crear tu negocio</Text>
      <Card style={{marginTop: 16, gap: 12}}>
        <Input
          label="Nombre tienda"
          value={storeName}
          onChangeText={setStoreName}
          placeholder="Tienda La Esquina"
        />
        <Input
          label="Tu nombre"
          value={merchantName}
          onChangeText={setMerchantName}
          placeholder="Doña María"
        />
        <Input
          label="Correo"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="tutienda@mail.com"
        />
        <Input
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Mínimo 6 caracteres"
        />
        <Button
          title={loading ? 'Creando...' : 'Crear cuenta'}
          onPress={onRegister}
          disabled={loading}
        />
      </Card>
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
  logo: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
});
