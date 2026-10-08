import {useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Input} from '../components/ui/Input';
import {MonochromeIcon} from '../components/ui/MonochromeIcon';
import {supabase} from '../lib/supabase';
import {customerAuthEmail} from '../lib/customerAuth';
import {Colors} from '../theme';

export function LoginScreen({navigation}: any) {
  const [email, setEmail] = useState('');
  const [document, setDocument] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'store' | 'customer'>('store');
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (
      (!email && role === 'store') ||
      (!document && role === 'customer') ||
      !password
    ) {
      return Alert.alert('Faltan datos', 'Completa tus datos para ingresar');
    }
    setLoading(true);
    const {error} = await supabase.auth.signInWithPassword({
      email: role === 'store' ? email.trim() : customerAuthEmail(document),
      password,
    });
    setLoading(false);
    if (error) {
      return Alert.alert('Error', error.message);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.brandMark}><MonochromeIcon name="store" color="#fff" size={27} strokeWidth={2.2} /></View>
      <Text style={styles.logo}>Tenderito</Text>
      <Text style={styles.sub}>Fiados claros. Negocio tranquilo.</Text>
      <Card style={{marginTop: 24, gap: 12}}>
        <Text style={styles.chooseRole}>¿Cómo quieres ingresar?</Text>
        <View style={styles.roles}>
          <Button
            title="Tienda"
            icon="store"
            variant={role === 'store' ? 'primary' : 'secondary'}
            onPress={() => setRole('store')}
            style={{flex: 1}}
          />
          <Button
            title="Cliente"
            icon="profile"
            variant={role === 'customer' ? 'primary' : 'secondary'}
            onPress={() => setRole('customer')}
            style={{flex: 1}}
          />
        </View>
        {role === 'store' ? (
          <Input
            label="Correo"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="tutienda@mail.com"
          />
        ) : (
          <Input
            label="Número de identificación"
            value={document}
            onChangeText={setDocument}
            keyboardType="number-pad"
            placeholder="Tu cédula"
          />
        )}
        <Input
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
        />
        <Button
          title={loading ? 'Ingresando...' : role === 'store' ? 'Entrar a mi tienda' : 'Entrar a mi cuenta'}
          icon="enter"
          onPress={onLogin}
          disabled={loading}
        />
      </Card>
      <Text
        style={styles.link}
        onPress={() =>
          navigation.navigate(
            role === 'store' ? 'Register' : 'CustomerRegister',
          )
        }>
        {role === 'store'
          ? '¿Sin cuenta? Crear negocio'
          : '¿Aún no activas tu cuenta? Activarla'}
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
  brandMark: {alignSelf: 'center', width: 58, height: 58, borderRadius: 21, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12},
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'center',
  },
  sub: {textAlign: 'center', color: Colors.textSecondary, marginTop: 4, fontSize: 14},
  chooseRole: {fontSize: 13, fontWeight: '700', color: Colors.text},
  link: {
    textAlign: 'center',
    color: Colors.primary,
    marginTop: 16,
    fontWeight: '600',
  },
  roles: {flexDirection: 'row', gap: 8},
});
