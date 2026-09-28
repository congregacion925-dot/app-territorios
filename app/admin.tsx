import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert, Animated, BackHandler, Modal, ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

// --- SKELETON CARD (igual que en lista) ---
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
        <View style={{ height: 18, width: '50%', backgroundColor: '#E0E0E0', borderRadius: 6 }} />
        <View style={{ height: 10, width: '30%', backgroundColor: '#EEEEEE', borderRadius: 4 }} />
        <View style={{ height: 6, backgroundColor: '#EEEEEE', borderRadius: 3, marginTop: 4 }} />
      </View>
      <View style={{ height: 36, width: 80, backgroundColor: '#E0E0E0', borderRadius: 8 }} />
    </Animated.View>
  );
}

// --- BARRA DE PROGRESO ---
function BarraProgreso({ trabajadas, total }: { trabajadas: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((trabajadas / total) * 100)) : 0;
  const color = pct === 100 ? '#4CAF50' : pct >= 60 ? '#2196F3' : '#4A148C';
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 11, color: '#888' }}>{trabajadas} / {total} manzanas</Text>
        <Text style={{ fontSize: 11, fontWeight: 'bold', color }}>{pct}%</Text>
      </View>
      <View style={styles.barFondo}>
        <View style={[styles.barRelleno, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function AdminScreen() {
  const router = useRouter();
  const { usuario, rol } = useAuth();
  const { uLog, rol: paramRol } = useLocalSearchParams();

  // Fallback a parámetros si no hay contexto (para compatibilidad)
  const uLogActual = usuario || (uLog ? String(uLog) : '');
  const rolActual = rol || (paramRol ? String(paramRol) : '');

  const [territorios, setTerritorios] = useState<any[]>([]);
  const [asignaciones, setAsignaciones] = useState<any>({});
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchAdmin, setSearchAdmin] = useState('');
  const [gruposColapsados, setGruposColapsados] = useState<any>({});

  const [modalAsignarVisible, setModalAsignarVisible] = useState(false);
  const [territorioAAsignar, setTerritorioAAsignar] = useState<string | null>(null);
  const [modalCapitanesVisible, setModalCapitanesVisible] = useState(false);

  useEffect(() => {
    const backAction = () => { router.back(); return true; };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const cargarDatosAdmin = async () => {
    try {
      const snapTer = await getDocs(collection(db, 'territorios'));
      const listaT: any[] = [];
      snapTer.forEach(doc => listaT.push({ id_str: doc.id, ...doc.data() }));
      setTerritorios(listaT);

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

      const snapUsers = await getDocs(collection(db, 'usuarios'));
      const listaU: any[] = [];
      snapUsers.forEach(doc => listaU.push({ id: doc.id, ...doc.data() }));
      setUsuarios(listaU.sort((a: any, b: any) => a.nombre_completo.localeCompare(b.nombre_completo)));
    } catch (error) {
      console.log('Error cargando panel admin', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargarDatosAdmin(); }, []);

  const toggleGrupo = (dia: string) => {
    setGruposColapsados((prev: any) => ({ ...prev, [dia]: !prev[dia] }));
  };

  const asignarTerritorio = async (nombrePublicador: string) => {
    if (!territorioAAsignar) return;
    try {
      const fecha = new Date().toLocaleDateString('es-ES');
      const idAsig = `ter-${territorioAAsignar}`;
      const actuales = asignaciones[idAsig] || [];
      if (actuales.includes(nombrePublicador)) {
        Alert.alert('Aviso', 'El hermano ya está asignado a este territorio.'); return;
      }
      const nuevosPublicadores = [...actuales, nombrePublicador];
      await setDoc(doc(db, 'asignaciones', idAsig), { publicadores: nuevosPublicadores, fecha_asignacion: fecha }, { merge: true });
      await updateDoc(doc(db, 'territorios', String(territorioAAsignar)), { estado: 'activo' });
      setModalAsignarVisible(false);
      cargarDatosAdmin();
      Alert.alert('✅ Asignado', `Se añadió a ${nombrePublicador} al Territorio ${territorioAAsignar}.`);
    } catch (e) { Alert.alert('Error', 'No se pudo asignar'); }
  };

  const quitarUnPublicador = (terId: string, nombreAQuitar: string) => {
    Alert.alert('Quitar publicador', `¿Deseas quitar a ${nombreAQuitar} del Territorio ${terId}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, quitar', onPress: async () => {
          try {
            const idAsig = `ter-${terId}`;
            const actuales = asignaciones[idAsig] || [];
            const nuevos = actuales.filter((p: string) => p !== nombreAQuitar);
            if (nuevos.length === 0) { await deleteDoc(doc(db, 'asignaciones', idAsig)); }
            else { await updateDoc(doc(db, 'asignaciones', idAsig), { publicadores: nuevos }); }
            cargarDatosAdmin();
          } catch (error) { Alert.alert('Error', 'No se pudo actualizar.'); }
        }
      }
    ]);
  };

  const liberarTerritorio = async (terId: string) => {
    Alert.alert('Liberar Territorio', `¿Confirmas que el Territorio ${terId} fue devuelto por completo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, Liberar Todo', onPress: async () => {
          try { await deleteDoc(doc(db, 'asignaciones', `ter-${terId}`)); cargarDatosAdmin(); }
          catch (e) { Alert.alert('Error', 'No se pudo liberar'); }
        }
      }
    ]);
  };

  const cambiarRolMovil = (userId: string, rolActual: string) => {
    if (rolActual === 'administrador') { Alert.alert('Aviso', 'No puedes modificar tu propio rol de administrador.'); return; }
    const nuevoRol = rolActual === 'capitan' ? 'publicador' : 'capitan';
    Alert.alert('Cambiar Rol', `¿Deseas que este hermano pase a ser ${nuevoRol.toUpperCase()}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, cambiar', onPress: async () => {
          try { await updateDoc(doc(db, 'usuarios', userId), { rol: nuevoRol }); Alert.alert('✅ Listo', 'El rol ha sido actualizado.'); cargarDatosAdmin(); }
          catch (e) { Alert.alert('Error', 'No se pudo actualizar el rol.'); }
        }
      }
    ]);
  };

  const territoriosFiltrados = territorios.filter((t: any) =>
    t.id.toString().includes(searchAdmin.toLowerCase()) ||
    (t.dia && t.dia.toLowerCase().includes(searchAdmin.toLowerCase()))
  );
  const territoriosPorDia: any = {};
  territoriosFiltrados.forEach((t: any) => {
    const dia = t.dia || 'General';
    if (!territoriosPorDia[dia]) territoriosPorDia[dia] = [];
    territoriosPorDia[dia].push(t);
  });

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.tH}>Panel Admin</Text>
            <Text style={styles.subH}>Asignación de Territorios</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} style={styles.btnVolver}>
            <Ionicons name="arrow-back-outline" size={20} color="#FFC107" />
            <Text style={{ color: '#FFC107', fontWeight: 'bold', fontSize: 13 }}>Volver</Text>
          </TouchableOpacity>
        </View>

        {/* Buscador */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color="#ccc" />
          <TextInput
            style={styles.inputSearch}
            placeholder="Buscar territorio o grupo..."
            placeholderTextColor="#aaa"
            value={searchAdmin}
            onChangeText={setSearchAdmin}
          />
        </View>

        {/* Botón capitanes */}
        <TouchableOpacity onPress={() => setModalCapitanesVisible(true)} style={styles.btnCapitanes}>
          <Ionicons name="people-outline" size={16} color="white" />
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>Gestión de Capitanes</Text>
        </TouchableOpacity>
      </View>

      {/* LISTA */}
      <ScrollView contentContainerStyle={styles.scrollP}>

        {/* SKELETON */}
        {loading && <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>}

        {Object.keys(territoriosPorDia).sort().map((dia: string, indexDia: number) => {
          const estaColapsado = gruposColapsados[dia];
          const territoriosDelDia = territoriosPorDia[dia];
          const libresEnGrupo = territoriosDelDia.filter((t: any) => {
            const asig = asignaciones[`ter-${t.id}`] || [];
            return asig.length === 0 && t.estado !== 'descansando';
          }).length;

          return (
            <View key={indexDia} style={{ marginBottom: 16 }}>
              {/* CABECERA DEL GRUPO */}
              <TouchableOpacity style={styles.grupoHeader} onPress={() => toggleGrupo(dia)} activeOpacity={0.8}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar-outline" size={16} color="white" />
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>{dia}</Text>
                  {libresEnGrupo > 0 && (
                    <View style={styles.badgeRojo}>
                      <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{libresEnGrupo} libres</Text>
                    </View>
                  )}
                </View>
                <Ionicons name={estaColapsado ? 'chevron-down-outline' : 'chevron-up-outline'} size={18} color="white" />
              </TouchableOpacity>

              {!estaColapsado && territoriosDelDia.sort((a: any, b: any) => {
                const aDescansa = a.estado === 'descansando';
                const bDescansa = b.estado === 'descansando';
                if (aDescansa && !bDescansa) return 1;
                if (!aDescansa && bDescansa) return -1;
                return Number(a.id) - Number(b.id);
              }).map((t: any, i: number) => {
                const publicadoresAsignados = asignaciones[`ter-${t.id}`] || [];
                const estaAsignado = publicadoresAsignados.length > 0;
                const estaDescansando = t.estado === 'descansando';

                return (
                  <View key={i} style={[styles.cardT, estaDescansando && styles.cardDescansando]}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      {/* Título + Badge de semáforo */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.cardTitle}>T-{t.id}</Text>
                        {estaDescansando && (
                          <View style={[styles.badge, { backgroundColor: '#E8F5E9' }]}>
                            <Text style={{ color: '#2E7D32', fontSize: 10, fontWeight: 'bold' }}>🟢 Descansando</Text>
                          </View>
                        )}
                        {!estaDescansando && !estaAsignado && (
                          <View style={[styles.badge, { backgroundColor: '#FFEBEE' }]}>
                            <Text style={{ color: '#C62828', fontSize: 10, fontWeight: 'bold' }}>🔴 Libre</Text>
                          </View>
                        )}
                        {estaAsignado && !estaDescansando && (
                          <View style={[styles.badge, { backgroundColor: '#E3F2FD' }]}>
                            <Text style={{ color: '#1565C0', fontSize: 10, fontWeight: 'bold' }}>🔵 Asignado</Text>
                          </View>
                        )}
                      </View>

                      {/* Progreso */}
                      <BarraProgreso trabajadas={t.trabajadas || 0} total={t.manzanas || 0} />

                      {/* Publicadores asignados */}
                      {estaAsignado && (
                        <View style={{ marginTop: 8, gap: 4 }}>
                          {publicadoresAsignados.map((pub: string, idx: number) => (
                            <TouchableOpacity key={idx} onPress={() => quitarUnPublicador(t.id, pub)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="person-circle-outline" size={14} color="#4CAF50" />
                              <Text style={{ color: '#2E7D32', fontSize: 12, fontWeight: '600', flex: 1 }}>{pub}</Text>
                              <View style={{ backgroundColor: '#FFEBEE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ color: '#C62828', fontSize: 10, fontWeight: 'bold' }}>✖ Quitar</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {estaDescansando && t.fecha_entregado && (
                        <Text style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>Entregado: {t.fecha_entregado}</Text>
                      )}
                    </View>

                    {/* Botones de acción */}
                    <View style={{ gap: 8, justifyContent: 'center' }}>
                      <TouchableOpacity
                        style={[styles.btnAccion, { backgroundColor: estaDescansando ? '#9E9E9E' : '#4A148C' }]}
                        onPress={() => { setTerritorioAAsignar(t.id); setModalAsignarVisible(true); }}
                      >
                        <Ionicons name="person-add-outline" size={13} color="white" />
                        <Text style={styles.btnAccionTxt}>{estaAsignado ? 'Añadir' : 'Asignar'}</Text>
                      </TouchableOpacity>
                      {estaAsignado && (
                        <TouchableOpacity style={[styles.btnAccion, { backgroundColor: '#D32F2F' }]} onPress={() => liberarTerritorio(t.id)}>
                          <Ionicons name="close-circle-outline" size={13} color="white" />
                          <Text style={styles.btnAccionTxt}>Liberar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        {!loading && Object.keys(territoriosPorDia).length === 0 && (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Ionicons name="map-outline" size={52} color="#ddd" />
            <Text style={{ color: '#aaa', marginTop: 12, fontSize: 16 }}>No se encontraron territorios.</Text>
          </View>
        )}
      </ScrollView>

      {/* MODAL ASIGNAR */}
      <Modal visible={modalAsignarVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { flex: 0.8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Ionicons name="person-add-outline" size={20} color="#4A148C" />
              <Text style={styles.modalTitle}>Asignar Territorio {territorioAAsignar}</Text>
            </View>
            <Text style={styles.modalSubtitle}>Selecciona un publicador de la lista:</Text>
            <ScrollView>
              {usuarios.map((u: any, i: number) => (
                <TouchableOpacity key={i} style={styles.userRow} onPress={() => asignarTerritorio(u.nombre_completo)}>
                  <Ionicons name="person-outline" size={16} color="#4A148C" />
                  <Text style={{ fontSize: 15, color: '#333', flex: 1 }}>{u.nombre_completo}</Text>
                  <Ionicons name="chevron-forward-outline" size={16} color="#ccc" />
                </TouchableOpacity>
              ))}
              {usuarios.length === 0 && <Text style={{ textAlign: 'center', marginTop: 20, color: '#999' }}>No hay publicadores registrados aún.</Text>}
            </ScrollView>
            <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalAsignarVisible(false)}>
              <Text style={{ textAlign: 'center', color: '#666', fontWeight: 'bold' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL CAPITANES */}
      <Modal visible={modalCapitanesVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { flex: 0.85 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Ionicons name="people-outline" size={20} color="#4A148C" />
              <Text style={styles.modalTitle}>Gestión de Capitanes</Text>
            </View>
            <Text style={styles.modalSubtitle}>Toca un publicador para cambiar su rol:</Text>
            <ScrollView>
              {usuarios.map((u: any, i: number) => {
                const esCapitan = u.rol === 'capitan';
                const esAdmin = u.rol === 'administrador';
                return (
                  <View key={i} style={styles.userRolRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, color: '#333', fontWeight: '600' }}>{u.nombre_completo}</Text>
                      <View style={[styles.badge, { alignSelf: 'flex-start', marginTop: 3, backgroundColor: esAdmin ? '#EDE7F6' : esCapitan ? '#E3F2FD' : '#F5F5F5' }]}>
                        <Text style={{ color: esAdmin ? '#4A148C' : esCapitan ? '#1565C0' : '#666', fontSize: 10, fontWeight: 'bold' }}>
                          {u.rol.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    {!esAdmin && (
                      <TouchableOpacity
                        onPress={() => cambiarRolMovil(u.id, u.rol)}
                        style={[styles.btnRol, { backgroundColor: esCapitan ? '#D32F2F' : '#2E7D32' }]}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 11 }}>
                          {esCapitan ? 'Quitar' : 'Hacer Capitán'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalCapitanesVisible(false)}>
              <Text style={{ textAlign: 'center', color: '#666', fontWeight: 'bold' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F0F2F5' },
  header:           { backgroundColor: '#4A148C', padding: 24, paddingTop: 52, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, elevation: 6, gap: 12 },
  tH:               { fontSize: 26, fontWeight: 'bold', color: 'white' },
  subH:             { color: '#CE93D8', fontSize: 13, marginTop: 2 },
  btnVolver:        { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10 },
  searchWrap:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  inputSearch:      { flex: 1, color: 'white', fontSize: 14 },
  btnCapitanes:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(76,175,80,0.85)', paddingVertical: 10, borderRadius: 12 },
  scrollP:          { padding: 16, paddingBottom: 40 },

  // Grupo header
  grupoHeader:      { backgroundColor: '#6A1B9A', padding: 14, borderRadius: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeRojo:        { backgroundColor: '#D32F2F', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },

  // Cards
  cardT:            { backgroundColor: 'white', padding: 14, borderRadius: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  cardDescansando:  { opacity: 0.75, backgroundColor: '#FAFFF8' },
  cardTitle:        { fontSize: 16, fontWeight: 'bold', color: '#222' },
  badge:            { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },

  // Progress bar
  barFondo:         { height: 5, backgroundColor: '#EEEEEE', borderRadius: 3, overflow: 'hidden' },
  barRelleno:       { height: 5, borderRadius: 3 },

  // Botones de acción en card
  btnAccion:        { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnAccionTxt:     { color: 'white', fontWeight: 'bold', fontSize: 11 },

  // Modales
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:     { backgroundColor: 'white', padding: 24, paddingBottom: 50, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalTitle:       { fontSize: 18, fontWeight: 'bold', color: '#333' },
  modalSubtitle:    { color: '#888', fontSize: 13, marginBottom: 16 },
  userRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: '#F5F5F5' },
  userRolRow:       { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderColor: '#F5F5F5', gap: 12 },
  btnRol:           { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  btnCancelar:      { backgroundColor: '#F5F5F5', padding: 14, borderRadius: 12, marginTop: 16 },
});