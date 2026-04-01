import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, StyleSheet, Text,
  TextInput, TouchableOpacity, View
} from 'react-native';
import { db } from '../config/firebase';

export default function LoginScreen() {
  const router = useRouter();

  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [mostrarPass, setMostrarPass] = useState(false);

  const [modalRegistroVisible, setModalRegistroVisible] = useState(false);
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regCode, setRegCode] = useState('');
  const [mostrarRegPass, setMostrarRegPass] = useState(false);

  const login = async () => {
    if (!user.trim() || !pass.trim()) return Alert.alert('Error', 'Llena todos los campos');
    setLoading(true);
    try {
      const q = query(
        collection(db, 'usuarios'),
        where('nombre_completo', '==', user.trim()),
        where('contrasena', '==', pass.trim())
      );
      const res = await getDocs(q);
      if (!res.empty) {
        const datos = res.docs[0].data();
        router.replace({ pathname: '/lista', params: { uLog: datos.nombre_completo, rol: datos.rol } });
      } else {
        Alert.alert('Error', 'Credenciales incorrectas');
      }
    } catch (e) {
      Alert.alert('Error', 'Falla de red');
    } finally {
      setLoading(false);
    }
  };

  const registrarUsuarioNuevo = async () => {
    if (!regUser.trim() || !regPass.trim() || !regCode.trim()) return Alert.alert('Error', 'Faltan datos');
    setLoading(true);
    try {
      const seguridadRef = await getDoc(doc(db, 'configuracion', 'seguridad'));
      if (!seguridadRef.exists()) return Alert.alert('Error', 'No se encontró la configuración de seguridad.');
      const codigoSecreto = seguridadRef.data().codigo_congregacion;
      if (regCode.trim().toLowerCase() !== codigoSecreto.toLowerCase()) return Alert.alert('Error', 'Código de congregación incorrecto.');
      const q = query(collection(db, 'usuarios'), where('nombre_completo', '==', regUser.trim()));
      const res = await getDocs(q);
      if (!res.empty) {
        Alert.alert('Error', 'Este nombre ya está registrado.');
      } else {
        await addDoc(collection(db, 'usuarios'), { nombre_completo: regUser.trim(), contrasena: regPass.trim(), rol: 'publicador' });
        Alert.alert('¡Éxito!', 'Cuenta creada. Ya puedes iniciar sesión.');
        setModalRegistroVisible(false);
        setRegUser(''); setRegPass(''); setRegCode('');
      }
    } catch (e) {
      Alert.alert('Error', 'Fallo de conexión.');
    } finally {
      setLoading(false);
    }
  };

  if (!modalRegistroVisible) {
    return (
      <LinearGradient colors={['#3a0d7a', '#4A148C', '#6a1aad']} style={styles.container}>
        {/* Círculos decorativos de fondo */}
        <View style={styles.circle1} />
        <View style={styles.circle2} />

        <View style={styles.card}>
          {/* Ícono */}
          <View style={styles.iconWrap}>
            <Ionicons name="map" size={34} color="#4A148C" />
          </View>

          <Text style={styles.title}>Territorios</Text>
          <Text style={styles.subtitle}>Congregación 27367</Text>

          {/* Campo Nombre */}
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={18} color="#aaa" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Nombre Completo"
              placeholderTextColor="#bbb"
              value={user}
              onChangeText={setUser}
              autoCapitalize="words"
            />
          </View>

          {/* Campo Contraseña */}
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color="#aaa" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Contraseña"
              placeholderTextColor="#bbb"
              value={pass}
              onChangeText={setPass}
              secureTextEntry={!mostrarPass}
            />
            <TouchableOpacity onPress={() => setMostrarPass(!mostrarPass)} style={styles.eyeBtn}>
              <Ionicons name={mostrarPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#aaa" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.btnLogin} onPress={login} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#4A148C" />
              : <Text style={styles.btnText}>ENTRAR</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setModalRegistroVisible(true)} style={styles.linkWrap}>
            <Text style={styles.linkText}>¿Sin cuenta? <Text style={{ fontWeight: 'bold', color: '#4A148C' }}>Regístrate aquí</Text></Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>v2.0</Text>
      </LinearGradient>
    );
  }

  // --- PANTALLA DE REGISTRO ---
  return (
    <LinearGradient colors={['#3a0d7a', '#4A148C', '#6a1aad']} style={styles.container}>
      <View style={styles.circle1} />
      <View style={styles.circle2} />

      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="person-add" size={30} color="#4A148C" />
        </View>
        <Text style={styles.title}>Nueva Cuenta</Text>
        <Text style={styles.subtitle}>Completa los datos</Text>

        <View style={styles.inputWrap}>
          <Ionicons name="person-outline" size={18} color="#aaa" style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="Nombre Completo" placeholderTextColor="#bbb" value={regUser} onChangeText={setRegUser} autoCapitalize="words" />
        </View>

        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={18} color="#aaa" style={styles.inputIcon} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Contraseña" placeholderTextColor="#bbb" value={regPass} onChangeText={setRegPass} secureTextEntry={!mostrarRegPass} />
          <TouchableOpacity onPress={() => setMostrarRegPass(!mostrarRegPass)} style={styles.eyeBtn}>
            <Ionicons name={mostrarRegPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#aaa" />
          </TouchableOpacity>
        </View>

        <View style={[styles.inputWrap, { borderColor: '#FFC107', borderWidth: 1.5 }]}>
          <Ionicons name="key-outline" size={18} color="#FFC107" style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="Código de Congregación" placeholderTextColor="#bbb" value={regCode} onChangeText={setRegCode} autoCapitalize="none" />
        </View>

        <TouchableOpacity style={styles.btnLogin} onPress={registrarUsuarioNuevo} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color="#4A148C" /> : <Text style={styles.btnText}>REGISTRARSE</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setModalRegistroVisible(false)} style={styles.linkWrap}>
          <Text style={styles.linkText}>← <Text style={{ fontWeight: 'bold', color: '#4A148C' }}>Volver al Login</Text></Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>v2.0</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  // Decoración de fondo
  circle1: { position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.06)' },
  circle2: { position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.04)' },

  // Card principal
  card: { width: '100%', backgroundColor: 'white', borderRadius: 24, padding: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 12 },

  // Ícono circular
  iconWrap: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#EDE7F6', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 },

  title: { fontSize: 26, fontWeight: 'bold', color: '#4A148C', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 24, marginTop: 4 },

  // Inputs
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, marginBottom: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#eee' },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: '#333' },
  eyeBtn: { padding: 6 },

  // Botón principal
  btnLogin: { backgroundColor: '#FFC107', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#4A148C', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },

  // Link registro
  linkWrap: { marginTop: 18, alignItems: 'center' },
  linkText: { color: '#999', fontSize: 14 },

  version: { color: 'rgba(255,255,255,0.3)', marginTop: 24, fontSize: 12 },
});