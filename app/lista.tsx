import { useLocalSearchParams, useRouter } from 'expo-router';
// Importamos writeBatch y deleteDoc para la limpieza masiva
import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
// Importamos RefreshControl para el gesto de jalar hacia abajo
import { Alert, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../config/firebase';

export default function ListaScreen() {
  const router = useRouter();
  const { uLog, rol } = useLocalSearchParams();

  const [territorios, setTerritorios] = useState<any[]>([]);
  const [asignaciones, setAsignaciones] = useState<any>({});
  
  // Estado para la animación de refrescar
  const [refreshing, setRefreshing] = useState(false);

  const [modalRevisitasVisible, setModalRevisitasVisible] = useState(false);
  const [misPines, setMisPines] = useState<any[]>([]);
  const [modalPinVisible, setModalPinVisible] = useState(false);
  const [pinIngresado, setPinIngresado] = useState('');

  const esAdmin = String(rol).toLowerCase().trim() === 'administrador';
  const esCapitanOAdmin = esAdmin || String(rol).toLowerCase().trim() === 'capitán' || String(rol).toLowerCase().trim() === 'capitan';

  const cargarDatosGlobales = async () => {
    try {
      const snapTer = await getDocs(collection(db, "territorios"));
      const listaT: any[] = [];
      snapTer.forEach(doc => listaT.push(doc.data()));
      setTerritorios(listaT.sort((a: any, b: any) => Number(a.id) - Number(b.id)));

      const snapAsig = await getDocs(collection(db, "asignaciones"));
      const asigMap: any = {};
      snapAsig.forEach(doc => { 
          const d = doc.data();
          let pubs: string[] = [];
          if (d.publicadores) pubs = d.publicadores; 
          else if (d.publicador) pubs = [d.publicador]; 
          asigMap[doc.id] = pubs; 
      });
      setAsignaciones(asigMap);
    } catch (error) { 
      console.log(error); 
    }
  };

  useEffect(() => { cargarDatosGlobales(); }, []);

  // Función que se ejecuta al jalar la pantalla hacia abajo
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await cargarDatosGlobales();
    setRefreshing(false);
  }, []);

  const abrirLibretaRevisitas = async () => {
      setModalRevisitasVisible(true);
      try {
          const q = query(collection(db, "notas_privadas"), where("creador", "==", String(uLog)));
          const snap = await getDocs(q);
          const pines: any[] = [];
          snap.forEach(doc => pines.push({ id: doc.id, ...doc.data() }));
          setMisPines(pines);
      } catch (e) { console.log("Error cargando libreta", e); }
  };

  const verificarPin = async () => {
    try {
        const seguridadRef = await getDoc(doc(db, "configuracion", "seguridad"));
        if (!seguridadRef.exists()) return Alert.alert("Error", "Falta configuración en DB.");
        const pinSecreto = seguridadRef.data().pin_maestro;
        if (pinIngresado === pinSecreto) { 
            setModalPinVisible(false); setPinIngresado(''); 
            router.push({ pathname: '/admin', params: { uLog, rol } });
        } else { 
            Alert.alert("Error", "PIN Incorrecto"); setPinIngresado(''); 
        }
    } catch (e) { Alert.alert("Error", "No se pudo verificar."); }
  };

  // --- NUEVA FUNCIÓN MÁGICA DE ENTREGA Y LIMPIEZA ---
  const entregarTerritorio = async (idTer: string) => {
    Alert.alert("Entregar Territorio", "¿Confirmas que el grupo ha terminado de trabajar este territorio? Al entregar, se borrarán las notas de la bitácora de manzanas y el territorio pasará a periodo de descanso.", [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, Entregar", style: "destructive", onPress: async () => {
            try {
                // writeBatch nos permite hacer muchos cambios en la base de datos de un solo golpe
                const batch = writeBatch(db);

                // 1. Sello de descansando y reiniciamos el progreso a 0
                const refTer = doc(db, "territorios", String(idTer));
                batch.update(refTer, { 
                    estado: "descansando", 
                    fecha_entregado: new Date().toLocaleDateString('es-ES'),
                    trabajadas: 0 
                });

                // 2. Liberamos la asignación (te lo quita de tu lista)
                const refAsig = doc(db, "asignaciones", `ter-${idTer}`);
                batch.delete(refAsig);

                // 3. Limpiamos todas las manzanas (Estados y Notas)
                const qManzanas = query(collection(db, "manzanas"), where("territorio", "==", String(idTer)));
                const snapManzanas = await getDocs(qManzanas);
                snapManzanas.forEach(manzanaDoc => {
                    batch.update(manzanaDoc.ref, {
                        estado: 'Pendiente',
                        arr_notas: [],
                        notas: '',
                        fecha_trabajado: null
                    });
                });

                // Ejecutamos todos los cambios al mismo tiempo
                await batch.commit();

                Alert.alert("¡Éxito!", "Territorio entregado. Las manzanas han sido limpiadas para la próxima campaña.");
                cargarDatosGlobales();
            } catch(e) { 
                Alert.alert("Error", "No se pudo entregar el territorio."); 
            }
        }}
    ]);
  };

  const misTerritorios = territorios.filter((t: any) => { 
    const pubs = asignaciones[`ter-${t.id}`] || []; 
    return pubs.includes(String(uLog)); 
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.tH} numberOfLines={1} adjustsFontSizeToFit>Mis Asignaciones</Text>
                <Text style={styles.subH} numberOfLines={1}>👤 {uLog} {esCapitanOAdmin ? '(Capitán)' : ''}</Text>
            </View>
            <TouchableOpacity onPress={() => router.replace('/')} style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 }}>
                <Text style={{ color: '#FFC107', fontWeight: 'bold', fontSize: 16 }}>Salir 🚪</Text>
            </TouchableOpacity>
        </View>
        
        {/* BOTONES MEJORADOS (Radar Expandido y Libreta) */}
        <View style={{ marginTop: 25, gap: 15 }}>
          <TouchableOpacity 
            onPress={() => router.push({ pathname: '/mapa', params: { territorioSeleccionado: 'radar', uLog, rol } })} 
            style={{ width: '100%', backgroundColor: '#2196F3', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>📡 Abrir Radar del Grupo</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={abrirLibretaRevisitas} style={{ backgroundColor: '#FF9800', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>📌 Mis Revisitas (Pines)</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <ScrollView 
        contentContainerStyle={styles.scrollP}
        refreshControl={ <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4A148C']} /> }
      >
        {misTerritorios.length === 0 ? (
          <View style={{ marginTop: 50, padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, color: '#666', textAlign: 'center', fontWeight: 'bold' }}>No tienes territorios asignados.</Text>
            <Text style={{ fontSize: 14, color: '#999', textAlign: 'center', marginTop: 10 }}>Desliza hacia abajo para actualizar, o usa el Radar para unirte al grupo.</Text>
          </View>
        ) : (
          misTerritorios.map((t: any, i: number) => {
            const progreso100 = t.trabajadas >= t.manzanas && t.manzanas > 0;
            return (
              <View key={i} style={styles.cardT}>
                <View style={{flex: 1}}>
                  <Text style={styles.tT}>Territorio {t.id}</Text>
                  <Text style={{ color: '#666', marginTop: 4 }}>Progreso: {t.trabajadas} / {t.manzanas} Manzanas</Text>
                  {progreso100 && <Text style={{color: '#4CAF50', fontWeight: 'bold', fontSize: 13, marginTop: 5}}>✨ ¡100% Completado!</Text>}
                </View>
                
                <View style={{alignItems: 'flex-end', gap: 10}}>
                    <TouchableOpacity style={styles.btnIr} onPress={() => router.push({ pathname: '/mapa', params: { territorioSeleccionado: t.id, uLog, rol } })}>
                      <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>VER MAPA</Text>
                    </TouchableOpacity>
                    
                    {/* BOTÓN ENTREGAR (Aparece al llegar a 100%) */}
                    {progreso100 && esCapitanOAdmin && (
                        <TouchableOpacity style={[styles.btnIr, {backgroundColor: '#4CAF50', width: 110}]} onPress={() => entregarTerritorio(t.id)}>
                            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12, textAlign: 'center' }}>✅ ENTREGAR</Text>
                        </TouchableOpacity>
                    )}
                </View>
              </View>
            );
          })
        )}
        {esAdmin && (
          <TouchableOpacity style={styles.btnAdmin} onPress={() => setModalPinVisible(true)}>
            <Text style={styles.btnAdminText}>🔒 Panel (Asignaciones)</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* MODAL PIN ADMIN */}
      <Modal visible={modalPinVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={{ width: '100%' }}>
            <View style={[styles.modalContent, { height: 250, paddingBottom: 25 }]}>
              <Text style={styles.tT}>🔐 Seguridad Admin</Text>
              <Text style={{ marginBottom: 15, textAlign: 'center', color: '#666' }}>Ingresa el PIN para continuar:</Text>
              <TextInput style={[styles.inputLogin, { textAlign: 'center', fontSize: 24, letterSpacing: 10, color: '#000' }]} keyboardType="numeric" maxLength={4} secureTextEntry value={pinIngresado} onChangeText={setPinIngresado} autoFocus />
              <View style={styles.filaBotones}>
                <TouchableOpacity style={[styles.btnMitad, { backgroundColor: '#4A148C' }]} onPress={verificarPin}><Text style={{ color: '#fff', fontWeight: 'bold' }}>ENTRAR</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.btnMitad, { backgroundColor: '#eee' }]} onPress={() => { setModalPinVisible(false); setPinIngresado(''); }}><Text style={{ color: '#000' }}>CANCELAR</Text></TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL DE REVISITAS */}
      <Modal visible={modalRevisitasVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { flex: 0.8 }]}>
            <Text style={styles.tT}>📌 Mis Revisitas</Text>
            <Text style={{ marginBottom: 15, color: '#666' }}>Tus notas personales guardadas en el mapa:</Text>
            <ScrollView>
              {misPines.length === 0 ? (
                  <Text style={{textAlign: 'center', marginTop: 20, color: '#999', fontStyle: 'italic'}}>No tienes pines guardados aún.</Text>
              ) : (
                  misPines.map((pin: any, i: number) => (
                    <TouchableOpacity 
                        key={i} 
                        style={{ backgroundColor: '#fff9c4', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#FFC107', elevation: 1 }}
                        onPress={() => {
                            setModalRevisitasVisible(false);
                            router.push({ pathname: '/mapa', params: { territorioSeleccionado: pin.territorio_id, uLog, rol } });
                        }}
                    >
                        <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#4A148C', marginBottom: 5 }}>📍 Territorio {pin.territorio_id}</Text>
                        <Text style={{ fontSize: 15, color: '#333' }}>"{pin.texto}"</Text>
                        <Text style={{ fontSize: 11, color: '#888', marginTop: 8, textAlign: 'right' }}>Toca para ver en el mapa 🗺️</Text>
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>
            <TouchableOpacity style={[styles.btnMitad, { backgroundColor: '#eee', width: '100%', marginTop: 15 }]} onPress={() => setModalRevisitasVisible(false)}>
              <Text style={{ color: '#333', fontWeight: 'bold', textAlign: 'center' }}>CERRAR LIBRETA</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  header: { backgroundColor: '#4A148C', padding: 25, paddingTop: 50, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  tH: { fontSize: 28, fontWeight: 'bold', color: 'white' },
  subH: { color: '#E1BEE7', fontSize: 16, marginTop: 5 },
  // Aquí está el truco: le puse paddingBottom 100 para que el panel no estorbe abajo
  scrollP: { padding: 15, paddingBottom: 100 },
  cardT: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  tT: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  btnIr: { backgroundColor: '#4A148C', padding: 10, borderRadius: 8, width: 90, alignItems: 'center' },
  btnAdmin: { backgroundColor: '#333', padding: 15, borderRadius: 10, marginTop: 20 },
  btnAdminText: { color: 'white', textAlign: 'center', fontWeight: 'bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', padding: 25, paddingBottom: 50, borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: 300 },
  inputLogin: { backgroundColor: '#f0f0f0', padding: 15, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  filaBotones: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  btnMitad: { width: '48%', padding: 15, borderRadius: 8, alignItems: 'center' },
});