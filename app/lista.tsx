import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, KeyboardAvoidingView, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from 'react-native';
import { db } from '../config/firebase';

// --- SKELETON CARD ---
function SkeletonCard() {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.cardT, { opacity: anim }]}>
      <View style={{ flex: 1, gap: 10 }}>
        <View style={{ height: 18, width: '55%', backgroundColor: '#E0E0E0', borderRadius: 6 }} />
        <View style={{ height: 10, width: '35%', backgroundColor: '#EEEEEE', borderRadius: 4 }} />
        <View style={{ height: 6, backgroundColor: '#EEEEEE', borderRadius: 3, marginTop: 4 }} />
      </View>
      <View style={{ height: 36, width: 80, backgroundColor: '#E0E0E0', borderRadius: 8 }} />
    </Animated.View>
  );
}

// --- BADGE DE ESTADO ---
function EstadoBadge({ estado }: { estado: string }) {
  const colores: Record<string, { bg: string; text: string }> = {
    'Trabajado':   { bg: '#E8F5E9', text: '#2E7D32' },
    'Repasando':   { bg: '#E3F2FD', text: '#1565C0' },
    'descansando': { bg: '#FFF3E0', text: '#E65100' },
    'Pendiente':   { bg: '#F3E5F5', text: '#6A1B9A' },
  };
  const c = colores[estado] || { bg: '#F5F5F5', text: '#666' };
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start', marginTop: 6 }}>
      <Text style={{ color: c.text, fontSize: 11, fontWeight: 'bold' }}>{estado || 'Activo'}</Text>
    </View>
  );
}

// --- BARRA DE PROGRESO ---
function BarraProgreso({ trabajadas, total }: { trabajadas: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((trabajadas / total) * 100)) : 0;
  const color = pct === 100 ? '#4CAF50' : pct >= 60 ? '#2196F3' : '#4A148C';
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 11, color: '#888' }}>{trabajadas} / {total} manzanas</Text>
        <Text style={{ fontSize: 11, fontWeight: 'bold', color }}>{pct}%</Text>
      </View>
      <View style={styles.barFondo}>
        <View style={[styles.barRelleno, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function ListaScreen() {
  const router = useRouter();
  const { uLog, rol } = useLocalSearchParams();

  const [territorios, setTerritorios] = useState<any[]>([]);
  const [asignaciones, setAsignaciones] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalRevisitasVisible, setModalRevisitasVisible] = useState(false);
  const [misPines, setMisPines] = useState<any[]>([]);
  const [modalPinVisible, setModalPinVisible] = useState(false);
  const [pinIngresado, setPinIngresado] = useState('');

  const esAdmin = String(rol).toLowerCase().trim() === 'administrador';
  const esCapitanOAdmin = esAdmin || String(rol).toLowerCase().trim() === 'capitán' || String(rol).toLowerCase().trim() === 'capitan';

  const cargarDatosGlobales = async () => {
    try {
      const snapTer = await getDocs(collection(db, 'territorios'));
      const listaT: any[] = [];
      snapTer.forEach(doc => listaT.push({ id: doc.id, ...doc.data() }));
      setTerritorios(listaT.sort((a: any, b: any) => Number(a.id) - Number(b.id)));

      const snapAsig = await getDocs(collection(db, 'asignaciones'));
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarDatosGlobales(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await cargarDatosGlobales();
    setRefreshing(false);
  }, []);

  const abrirLibretaRevisitas = async () => {
    setModalRevisitasVisible(true);
    try {
      const q = query(collection(db, 'notas_privadas'), where('creador', '==', String(uLog)));
      const snap = await getDocs(q);
      const pines: any[] = [];
      snap.forEach(doc => pines.push({ id: doc.id, ...doc.data() }));
      setMisPines(pines);
    } catch (e) { console.log('Error cargando libreta', e); }
  };

  const verificarPin = async () => {
    try {
      const seguridadRef = await getDoc(doc(db, 'configuracion', 'seguridad'));
      if (!seguridadRef.exists()) return Alert.alert('Error', 'Falta configuración en DB.');
      const pinSecreto = seguridadRef.data().pin_maestro;
      if (pinIngresado === pinSecreto) {
        setModalPinVisible(false); setPinIngresado('');
        router.push({ pathname: '/admin', params: { uLog, rol } });
      } else {
        Alert.alert('Error', 'PIN Incorrecto'); setPinIngresado('');
      }
    } catch (e) { Alert.alert('Error', 'No se pudo verificar.'); }
  };

  const entregarTerritorio = async (idTer: string) => {
    Alert.alert('Entregar Territorio', '¿Confirmas que el grupo ha terminado de trabajar este territorio? Al entregar, se borrarán las notas de la bitácora y pasará al Historial de la congregación.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, Entregar', style: 'destructive', onPress: async () => {
          try {
            const batch = writeBatch(db);
            const ahora = new Date();
            const refAsig = doc(db, 'asignaciones', `ter-${idTer}`);
            const asigSnap = await getDoc(refAsig);
            let fechaAsignada = 'Sin registro';
            let publicadoresTrabajando = String(uLog);
            if (asigSnap.exists()) {
              const asigData = asigSnap.data();
              fechaAsignada = asigData.fecha_asignacion || 'Sin registro';
              if (asigData.publicadores?.length > 0) publicadoresTrabajando = asigData.publicadores.join(', ');
              else if (asigData.publicador) publicadoresTrabajando = asigData.publicador;
            }
            const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            const mesNombre = meses[ahora.getMonth()];
            const anioServicio = ahora.getMonth() >= 8 ? ahora.getFullYear() + 1 : ahora.getFullYear();
            const refHistorial = doc(collection(db, 'historial_territorios'));
            batch.set(refHistorial, { territorio: String(idTer), mes: mesNombre, anio_servicio: anioServicio, fecha_corte: ahora.toISOString(), fecha_asignacion: fechaAsignada, publicadores: publicadoresTrabajando, estado: 'Completado desde App', timestamp: serverTimestamp() });
            const refTer = doc(db, 'territorios', String(idTer));
            batch.update(refTer, { estado: 'descansando', fecha_entregado: ahora.toLocaleDateString('es-ES'), trabajadas: 0 });
            batch.delete(refAsig);
            const qManzanas = query(collection(db, 'manzanas'), where('territorio', '==', String(idTer)));
            const snapManzanas = await getDocs(qManzanas);
            snapManzanas.forEach(manzanaDoc => { batch.update(manzanaDoc.ref, { estado: 'Pendiente', arr_notas: [], notas: '', fecha_trabajado: null }); });
            await batch.commit();
            Alert.alert('¡Éxito!', 'Territorio entregado y guardado en el Historial.');
            cargarDatosGlobales();
          } catch (e) { Alert.alert('Error', 'No se pudo entregar el territorio.'); }
        }
      }
    ]);
  };

  const misTerritorios = territorios.filter((t: any) => {
    const pubs = asignaciones[`ter-${t.id}`] || [];
    return pubs.includes(String(uLog));
  });

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.tH} numberOfLines={1} adjustsFontSizeToFit>Mis Asignaciones</Text>
            <Text style={styles.subH} numberOfLines={1}>
              <Ionicons name="person-circle-outline" size={14} color="#E1BEE7" /> {uLog}{esCapitanOAdmin ? '  ·  Capitán' : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.replace('/')} style={styles.btnSalir}>
            <Ionicons name="log-out-outline" size={20} color="#FFC107" />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 20, flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/mapa', params: { territorioSeleccionado: 'radar', uLog, rol } })}
            style={[styles.btnHeader, { backgroundColor: '#2196F3', flex: 1 }]}
          >
            <Ionicons name="radio-outline" size={16} color="white" />
            <Text style={styles.btnHeaderTxt}>Radar del Grupo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={abrirLibretaRevisitas} style={[styles.btnHeader, { backgroundColor: '#FF9800', flex: 1 }]}>
            <Ionicons name="bookmarks-outline" size={16} color="white" />
            <Text style={styles.btnHeaderTxt}>Mis Revisitas</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* LISTA */}
      <ScrollView
        contentContainerStyle={styles.scrollP}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4A148C']} />}
      >
        {/* SKELETON mientras carga */}
        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {/* ESTADO VACÍO */}
        {!loading && misTerritorios.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="map-outline" size={56} color="#ddd" />
            <Text style={styles.emptyTitle}>Sin territorios asignados</Text>
            <Text style={styles.emptySubtitle}>Desliza hacia abajo para actualizar, o usa el Radar para unirte al grupo.</Text>
          </View>
        )}

        {/* TARJETAS DE TERRITORIO */}
        {!loading && misTerritorios.map((t: any, i: number) => {
          const progreso100 = t.trabajadas >= t.manzanas && t.manzanas > 0;
          return (
            <View key={i} style={styles.cardT}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.cardTitle}>Territorio {t.id}</Text>
                  {progreso100 && <Text style={{ fontSize: 16 }}>✨</Text>}
                </View>
                {t.estado && <EstadoBadge estado={t.estado} />}
                <BarraProgreso trabajadas={t.trabajadas || 0} total={t.manzanas || 0} />
                {t.fecha_entregado && (
                  <Text style={{ fontSize: 10, color: '#bbb', marginTop: 6 }}>Entregado: {t.fecha_entregado}</Text>
                )}
              </View>

              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <TouchableOpacity style={styles.btnIr} onPress={() => router.push({ pathname: '/mapa', params: { territorioSeleccionado: t.id, uLog, rol } })}>
                  <Ionicons name="map-outline" size={14} color="white" />
                  <Text style={styles.btnIrTxt}>VER</Text>
                </TouchableOpacity>
                {progreso100 && esCapitanOAdmin && (
                  <TouchableOpacity style={[styles.btnIr, { backgroundColor: '#4CAF50' }]} onPress={() => entregarTerritorio(t.id)}>
                    <Ionicons name="checkmark-done-outline" size={14} color="white" />
                    <Text style={styles.btnIrTxt}>OK</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {esAdmin && !loading && (
          <TouchableOpacity style={styles.btnAdmin} onPress={() => setModalPinVisible(true)}>
            <Ionicons name="shield-checkmark-outline" size={18} color="white" />
            <Text style={styles.btnAdminText}>Panel de Asignaciones</Text>
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

      {/* MODAL REVISITAS */}
      <Modal visible={modalRevisitasVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { flex: 0.8 }]}>
            <Text style={styles.tT}>📌 Mis Revisitas</Text>
            <Text style={{ marginBottom: 15, color: '#666' }}>Tus notas personales guardadas en el mapa:</Text>
            <ScrollView>
              {misPines.length === 0
                ? <Text style={{ textAlign: 'center', marginTop: 20, color: '#999', fontStyle: 'italic' }}>No tienes pines guardados aún.</Text>
                : misPines.map((pin: any, i: number) => (
                  <TouchableOpacity key={i} style={{ backgroundColor: '#fff9c4', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#FFC107', elevation: 1 }}
                    onPress={() => { setModalRevisitasVisible(false); router.push({ pathname: '/mapa', params: { territorioSeleccionado: pin.territorio_id, uLog, rol } }); }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#4A148C', marginBottom: 5 }}>📍 Territorio {pin.territorio_id}</Text>
                    <Text style={{ fontSize: 15, color: '#333' }}>"{pin.texto}"</Text>
                    <Text style={{ fontSize: 11, color: '#888', marginTop: 8, textAlign: 'right' }}>Toca para ver en el mapa 🗺️</Text>
                  </TouchableOpacity>
                ))
              }
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
  container:    { flex: 1, backgroundColor: '#F0F2F5' },
  header:       { backgroundColor: '#4A148C', padding: 24, paddingTop: 52, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, elevation: 6 },
  tH:           { fontSize: 26, fontWeight: 'bold', color: 'white' },
  subH:         { color: '#CE93D8', fontSize: 14, marginTop: 4 },
  btnSalir:     { padding: 10, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12 },
  btnHeader:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12 },
  btnHeaderTxt: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  scrollP:      { padding: 16, paddingBottom: 100 },

  // Skeleton & estados
  emptyState:   { alignItems: 'center', marginTop: 60, paddingHorizontal: 30 },
  emptyTitle:   { fontSize: 18, fontWeight: 'bold', color: '#aaa', marginTop: 16, textAlign: 'center' },
  emptySubtitle:{ fontSize: 13, color: '#bbb', textAlign: 'center', marginTop: 8 },

  // Card
  cardT:        { backgroundColor: 'white', padding: 16, borderRadius: 16, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  cardTitle:    { fontSize: 17, fontWeight: 'bold', color: '#222' },

  // Barra de progreso
  barFondo:     { height: 6, backgroundColor: '#EEEEEE', borderRadius: 3, overflow: 'hidden' },
  barRelleno:   { height: 6, borderRadius: 3 },

  // Botones de card
  btnIr:        { backgroundColor: '#4A148C', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  btnIrTxt:     { color: 'white', fontWeight: 'bold', fontSize: 12 },
  btnAdmin:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#37474F', padding: 16, borderRadius: 14, marginTop: 20 },
  btnAdminText: { color: 'white', fontWeight: 'bold', fontSize: 15 },

  // Modales
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', padding: 25, paddingBottom: 50, borderTopLeftRadius: 24, borderTopRightRadius: 24, minHeight: 300 },
  tT:           { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  inputLogin:   { backgroundColor: '#f0f0f0', padding: 15, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  filaBotones:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  btnMitad:     { width: '48%', padding: 15, borderRadius: 8, alignItems: 'center' },
});