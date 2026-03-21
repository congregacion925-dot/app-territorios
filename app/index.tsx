import { useRouter } from 'expo-router'; // <-- ¡Nuestra nueva herramienta de navegación!
import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../config/firebase';

export default function LoginScreen() {
  const router = useRouter(); // Inicializamos el enrutador
  
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);

  // --- ESTADOS DE REGISTRO ---
  const [modalRegistroVisible, setModalRegistroVisible] = useState(false);
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regCode, setRegCode] = useState('');

  const login = async () => {
    if (!user.trim() || !pass.trim()) return Alert.alert("Error", "Llena todos los campos");
    setLoading(true);
    try {
      const q = query(collection(db, "usuarios"), where("nombre_completo", "==", user.trim()), where("contrasena", "==", pass.trim()));
      const res = await getDocs(q);
      if (!res.empty) {
        const datos = res.docs[0].data();
        
        // ¡Magia de Expo Router! Navegamos a la pantalla "lista" y le pasamos los datos del usuario
        router.replace({
          pathname: '/lista',
          params: { uLog: datos.nombre_completo, rol: datos.rol }
        });
        
      } else {
        Alert.alert("Error", "Credenciales incorrectas");
      }
    } catch (e) { 
      Alert.alert("Error", "Falla de red"); 
    }
    setLoading(false);
  };

const registrarUsuarioNuevo = async () => {
    if (!regUser.trim() || !regPass.trim() || !regCode.trim()) return Alert.alert("Error", "Faltan datos");
    
    setLoading(true);
    try {
      // 1. Preguntamos a la caja fuerte de Firebase
      const seguridadRef = await getDoc(doc(db, "configuracion", "seguridad"));
      if (!seguridadRef.exists()) {
          setLoading(false);
          return Alert.alert("Error", "No se encontró la configuración de seguridad.");
      }
      
      const codigoSecreto = seguridadRef.data().codigo_congregacion;
      
      // 2. Verificamos el código
      if (regCode.trim().toLowerCase() !== codigoSecreto.toLowerCase()) {
          setLoading(false);
          return Alert.alert("Error", "Código de congregación incorrecto.");
      }

      // 3. Si el código es correcto, creamos la cuenta
      const q = query(collection(db, "usuarios"), where("nombre_completo", "==", regUser.trim()));
      const res = await getDocs(q);
      if (!res.empty) Alert.alert("Error", "Este nombre ya está registrado.");
      else {
        await addDoc(collection(db, "usuarios"), { nombre_completo: regUser.trim(), contrasena: regPass.trim(), rol: "publicador" });
        Alert.alert("¡Éxito!", "Cuenta creada exitosamente. Ya puedes iniciar sesión.");
        setModalRegistroVisible(false);
        setRegUser(''); setRegPass(''); setRegCode('');
      }
    } catch (e) { Alert.alert("Error", "Fallo de conexión."); }
    setLoading(false);
  };

  return (
    <View style={styles.containerLogin}>
      {!modalRegistroVisible ? (
          <View style={styles.loginCard}>
            <Text style={styles.tL}>Territorios</Text>
            <TextInput style={[styles.inputLogin, { color: '#000' }]} placeholder="Nombre Completo" placeholderTextColor="#999" value={user} onChangeText={setUser} autoCapitalize="words"/>
            <TextInput style={[styles.inputLogin, { color: '#000' }]} placeholder="Contraseña" placeholderTextColor="#999" value={pass} onChangeText={setPass} secureTextEntry />
            <TouchableOpacity style={styles.btnLogin} onPress={login}>
              {loading ? <ActivityIndicator color="#4A148C" /> : <Text style={styles.bT}>ENTRAR</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnLogin, { backgroundColor: '#E0E0E0', marginTop: 15 }]} onPress={() => setModalRegistroVisible(true)}>
              <Text style={{ color: '#333', fontWeight: 'bold', textAlign: 'center' }}>Crear nueva cuenta</Text>
            </TouchableOpacity>
          </View>
      ) : (
          <View style={styles.loginCard}>
            <Text style={[styles.tL, {fontSize: 22, marginBottom: 15}]}>Nueva Cuenta</Text>
            <TextInput style={[styles.inputLogin, { color: '#000' }]} placeholder="Nombre Completo" placeholderTextColor="#999" value={regUser} onChangeText={setRegUser} autoCapitalize="words"/>
            <TextInput style={[styles.inputLogin, { color: '#000' }]} placeholder="Contraseña" placeholderTextColor="#999" value={regPass} onChangeText={setRegPass} secureTextEntry />
            <TextInput style={[styles.inputLogin, { color: '#000', borderColor: '#FFC107', borderWidth: 2 }]} placeholder="Código de Congregación" placeholderTextColor="#999" value={regCode} onChangeText={setRegCode} autoCapitalize="none" />
            <TouchableOpacity style={styles.btnLogin} onPress={registrarUsuarioNuevo}>
              {loading ? <ActivityIndicator color="#4A148C" /> : <Text style={styles.bT}>REGISTRARSE</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnLogin, { backgroundColor: '#eee', marginTop: 15 }]} onPress={() => setModalRegistroVisible(false)}>
              <Text style={{ color: '#333', fontWeight: 'bold', textAlign: 'center' }}>Volver al Login</Text>
            </TouchableOpacity>
          </View>
      )}
    </View>
  );
}

// Extraemos solo los estilos que usa el Login
const styles = StyleSheet.create({
  containerLogin: { flex: 1, backgroundColor: '#4A148C', justifyContent: 'center', padding: 20 },
  loginCard: { backgroundColor: 'white', padding: 30, borderRadius: 15, elevation: 5 },
  inputLogin: { backgroundColor: '#f0f0f0', padding: 15, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  btnLogin: { backgroundColor: '#FFC107', padding: 15, borderRadius: 8 },
  bT: { textAlign: 'center', fontWeight: 'bold', color: '#4A148C', fontSize: 16 },
  tL: { fontSize: 26, fontWeight: 'bold', color: '#4A148C', textAlign: 'center', marginBottom: 25 },
});