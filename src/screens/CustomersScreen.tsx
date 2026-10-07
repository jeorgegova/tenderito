import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Badge} from '../components/ui/Badge';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {Input} from '../components/ui/Input';
import {
  canCreateCustomer,
  createCustomer,
  fetchCustomers,
} from '../services/customers';
import {useStore} from '../store/useStore';
import {Colors, formatCOP} from '../theme';

export function CustomersScreen({navigation}: any) {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState('CC');
  const [documentNumber, setDocumentNumber] = useState('');
  const [phone, setPhone] = useState('');
  const profile = useStore(s => s.profile);
  const setShowUpgrade = useStore(s => s.setShowUpgradeModal);
  const showUpgrade = useStore(s => s.showUpgradeModal);

  const {data, refetch, isLoading} = useQuery({
    queryKey: ['customers', search],
    queryFn: () => fetchCustomers(search),
  });

  async function onCreate() {
    if (!name.trim() || !documentNumber.trim()) {
      return Alert.alert('Faltan datos', 'Nombre e identificación son obligatorios');
    }
    const plan = profile?.subscription_plan ?? 'free';
    try {
      const check = await canCreateCustomer(plan);
      if (!check.allowed) {
        setModal(false);
        setShowUpgrade(true);
        return;
      }
      await createCustomer({
        name: name.trim(),
        document_type: documentType.trim().toUpperCase(),
        document_number: documentNumber.trim(),
        phone: phone.trim() || null,
      });
      setName('');
      setDocumentNumber('');
      setPhone('');
      setModal(false);
      refetch();
    } catch (error: any) {
      Alert.alert('No se pudo guardar', error?.message ?? 'Intenta de nuevo');
    }
  }

  return (
    <View style={styles.wrap}>
      <Header title="Clientes" subtitle="Busca y gestiona tus fiados" />
      <View style={{paddingHorizontal: 20, gap: 12}}>
        <Input
          placeholder="Buscar cliente..."
          value={search}
          onChangeText={setSearch}
        />
        <Button title="+ Nuevo cliente" onPress={() => setModal(true)} />
      </View>
      <FlatList
        contentContainerStyle={{padding: 20, gap: 12}}
        data={data ?? []}
        keyExtractor={i => i.id}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Text style={{color: Colors.textSecondary}}>
                Sin clientes. Crea el primero.
              </Text>
            </Card>
          ) : null
        }
        renderItem={({item}) => (
          <Pressable
            onPress={() =>
              navigation.navigate('CustomerDetail', {id: item.id})
            }>
            <Card style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{item.phone ?? 'Sin teléfono'}</Text>
              </View>
              <View style={{alignItems: 'flex-end', gap: 4}}>
                <Text
                  style={[
                    styles.balance,
                    Number(item.current_balance) > 0 && {
                      color: Colors.destructive,
                    },
                  ]}>
                  {formatCOP(Number(item.current_balance))}
                </Text>
                <Badge
                  status={Number(item.current_balance) > 0 ? 'pending' : 'paid'}
                />
              </View>
            </Card>
          </Pressable>
        )}
      />
      <Modal
        visible={modal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModal(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Nuevo cliente</Text>
          <Input
            label="Nombre"
            value={name}
            onChangeText={setName}
            placeholder="Nombre completo"
          />
          <View style={{flexDirection: 'row', gap: 8}}>
            <View style={{width: 72}}>
              <Input label="Tipo" value={documentType} onChangeText={setDocumentType} placeholder="CC" />
            </View>
            <View style={{flex: 1}}>
              <Input label="Identificación" value={documentNumber} onChangeText={setDocumentNumber} keyboardType="number-pad" placeholder="123456789" />
            </View>
          </View>
          <Input
            label="Teléfono"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="300 123 4567"
          />
          <Button title="Guardar" onPress={onCreate} />
          <Button
            title="Cancelar"
            variant="ghost"
            onPress={() => setModal(false)}
          />
        </View>
      </Modal>
      <Modal
        visible={showUpgrade}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpgrade(false)}>
        <View style={styles.overlay}>
          <Card style={{gap: 8}}>
            <Text style={styles.sheetTitle}>Límite del plan Free</Text>
            <Text style={{color: Colors.textSecondary}}>
              Llegaste a 10 clientes. Sube a Basic (100 clientes) o Pro
              (ilimitado) para seguir creciendo.
            </Text>
            <Button
              title="Ver planes"
              onPress={() => {
                setShowUpgrade(false);
                navigation.navigate('Perfil');
              }}
            />
            <Button
              title="Cerrar"
              variant="ghost"
              onPress={() => setShowUpgrade(false)}
            />
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFEAD6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {color: Colors.primary, fontWeight: '800', fontSize: 18},
  name: {fontWeight: '700', color: Colors.text},
  sub: {color: Colors.textSecondary, fontSize: 12},
  balance: {fontWeight: '800', color: Colors.text},
  sheet: {
    flex: 1,
    backgroundColor: Colors.card,
    padding: 20,
    gap: 12,
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
});
