import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
// Importamos BackHandler para controlar el botón de atrás físico de Android
import { Alert, BackHandler, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../config/firebase';

export default function AdminScreen() {
  const router = useRouter();
  // Recibimos los datos del administrador
  const { uLog, rol } = useLocalSearchParams();

  const [territorios, setTerritorios] = useState<any[]>([]);
  const [asignaciones, setAsignaciones] = useState<any>({});
  const [usuarios, setUsuarios] = useState<any[]>([]);
  
  const [searchAdmin, setSearchAdmin] = useState(''); 
  const [gruposColapsados, setGruposColapsados] = useState<any>({});
  
  const [modalAsignarVisible, setModalAsignarVisible] = useState(false);
  const [territorioAAsignar, setTerritorioAAsignar] = useState<string | null>(null);
  const [modalCapitanesVisible, setModalCapitanesVisible] = useState(false);

  // --- CONTROL DEL BOTÓN FÍSICO "ATRÁS" DE ANDROID ---
  useEffect(() => {
    const backAction = () => {
      router.back(); // Obliga al botón a hacer lo mismo que "Volver a la Lista"
      return true; // Retornar 'true' evita que Android cierre la aplicación
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const cargarDatosAdmin = async () => {
    try {
      // 1. Territorios
      const snapTer = await getDocs(collection(db, "territorios"));
      const listaT: any[] = [];
      snapTer.forEach(doc => listaT.push({ id_str: doc.id, ...doc.data() })); // Guardamos el ID como string por si acaso
      setTerritorios(listaT); // Ya no ordenamos aquí, lo ordenaremos con el semáforo más abajo

      // 2. Asignaciones
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

      // 3. Usuarios
      const snapUsers = await getDocs(collection(db, "usuarios"));
      const listaU: any[] = [];
      snapUsers.forEach(doc => listaU.push({ id: doc.id, ...doc.data() }));
      setUsuarios(listaU.sort((a: any, b: any) => a.nombre_completo.localeCompare(b.nombre_completo)));

    } catch (error) { console.log("Error cargando panel admin", error); }
  };

  useEffect(() => {
    cargarDatosAdmin();
  }, []);

  // --- FUNCIONES DE ASIGNACIÓN ---
  const toggleGrupo = (dia: string) => { 
      setGruposColapsados((prev: any) => ({ ...prev, [dia]: !prev[dia] })); 
  };

  const asignarTerritorio = async (nombrePublicador: string) => {
    if(!territorioAAsignar) return;
    try {
      const fecha = new Date().toLocaleDateString('es-ES');
      const idAsig = `ter-${territorioAAsignar}`;
      const actuales = asignaciones[idAsig] || [];
      if(actuales.includes(nombrePublicador)) { Alert.alert("Aviso", "El hermano ya está asignado a este territorio."); return; }
      
      const nuevosPublicadores = [...actuales, nombrePublicador];
      await setDoc(doc(db, "asignaciones", idAsig), { publicadores: nuevosPublicadores, fecha_asignacion: fecha }, { merge: true });
      
      // Si el territorio estaba descansando, le quitamos el estado para que vuelva a estar activo
      await updateDoc(doc(db, "territorios", String(territorioAAsignar)), { estado: 'activo' });
      
      setModalAsignarVisible(false); 
      cargarDatosAdmin();
      Alert.alert("✅ Asignado", `Se añadió a ${nombrePublicador} al Territorio ${territorioAAsignar}.`);
    } catch(e) { Alert.alert("Error", "No se pudo asignar"); }
  };

  const quitarUnPublicador = (terId: string, nombreAQuitar: string) => {
    Alert.alert("Quitar publicador", `¿Deseas quitar a ${nombreAQuitar} del Territorio ${terId}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, quitar", onPress: async () => {
          try {
            const idAsig = `ter-${terId}`;
            const actuales = asignaciones[idAsig] || [];
            const nuevos = actuales.filter((p: string) => p !== nombreAQuitar);
            if (nuevos.length === 0) { await deleteDoc(doc(db, "asignaciones", idAsig)); } 
            else { await updateDoc(doc(db, "asignaciones", idAsig), { publicadores: nuevos }); }
            cargarDatosAdmin();
          } catch (error) { Alert.alert("Error", "No se pudo actualizar."); }
      }}
    ]);
  };

  const liberarTerritorio = async (terId: string) => {
    Alert.alert("Liberar Territorio", `¿Confirmas que el Territorio ${terId} fue devuelto por completo?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, Liberar Todo", onPress: async () => {
          try { await deleteDoc(doc(db, "asignaciones", `ter-${terId}`)); cargarDatosAdmin(); } 
          catch(e) { Alert.alert("Error", "No se pudo liberar"); }
      }}
    ]);
  };

  const cambiarRolMovil = (userId: string, rolActual: string) => {
    if (rolActual === 'administrador') {
        Alert.alert("Aviso", "No puedes modificar tu propio rol de administrador.");
        return;
    }
    const nuevoRol = rolActual === 'capitan' ? 'publicador' : 'capitan';
    Alert.alert("Cambiar Rol", `¿Deseas que este hermano pase a ser ${nuevoRol.toUpperCase()}?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, cambiar", onPress: async () => {
            try {
                await updateDoc(doc(db, "usuarios", userId), { rol: nuevoRol });
                Alert.alert("✅ Listo", "El rol ha sido actualizado.");
                cargarDatosAdmin();
            } catch (e) { Alert.alert("Error", "No se pudo actualizar el rol."); }
        }}
    ]);
  };

  // --- FILTROS Y AGRUPACIÓN ---
  const territoriosFiltrados = territorios.filter((t: any) => t.id.toString().includes(searchAdmin.toLowerCase()) || (t.dia && t.dia.toLowerCase().includes(searchAdmin.toLowerCase())));
  const territoriosPorDia: any = {};
  territoriosFiltrados.forEach((t: any) => { 
      const dia = t.dia || 'General';
      if (!territoriosPorDia[dia]) territoriosPorDia[dia] = []; 
      territoriosPorDia[dia].push(t); 
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tH}>Panel Web</Text>
        <Text style={styles.subH}>Asignación de Territorios</Text>
        <TextInput style={[styles.inputSearch, {marginTop: 15}]} placeholder="🔍 Buscar territorio o grupo..." placeholderTextColor="#ccc" value={searchAdmin} onChangeText={setSearchAdmin} />
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
            <TouchableOpacity onPress={() => setModalCapitanesVisible(true)} style={styles.btnCapitanes}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>👥 Capitanes</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 8 }}>
                <Text style={{ color: '#FFC107', fontWeight: 'bold' }}>⬅ Volver a la Lista</Text>
            </TouchableOpacity>
        </View>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollP}>
        {Object.keys(territoriosPorDia).sort().map((dia: string, indexDia: number) => {
          const estaColapsado = gruposColapsados[dia]; 
          return (
            <View key={indexDia} style={{ marginBottom: 20 }}>
              <TouchableOpacity style={styles.grupoHeader} onPress={() => toggleGrupo(dia)}>
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>📅 Grupo: {dia}</Text>
                <Text style={{ color: 'white', fontSize: 16 }}>{estaColapsado ? '➕' : '➖'}</Text>
              </TouchableOpacity>
              
              {!estaColapsado && territoriosPorDia[dia].sort((a: any, b: any) => {
                // 🚦 LÓGICA DEL SEMÁFORO:
                const aDescansa = a.estado === 'descansando';
                const bDescansa = b.estado === 'descansando';
                
                // Si 'a' está descansando y 'b' no, 'a' se va para abajo (retorna positivo)
                if (aDescansa && !bDescansa) return 1;
                // Si 'b' está descansando y 'a' no, 'a' se va para arriba (retorna negativo)
                if (!aDescansa && bDescansa) return -1;
                
                // Si ambos tienen el mismo estado, los ordenamos por número de T-
                return Number(a.id) - Number(b.id);

              }).map((t: any, i: number) => {
                const publicadoresAsignados = asignaciones[`ter-${t.id}`] || [];
                const estaAsignado = publicadoresAsignados.length > 0;
                const porcentaje = t.manzanas > 0 ? Math.round((t.trabajadas / t.manzanas) * 100) : 0;
                const estaDescansando = t.estado === 'descansando';

                return (
                  <View key={i} style={[styles.cardT, estaDescansando ? { opacity: 0.7, backgroundColor: '#f9fbe7' } : {}]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tT}>Territorio {t.id}</Text>
                      <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }}>Progreso: {t.trabajadas}/{t.manzanas} mzas ({porcentaje}%)</Text>
                      
                      {/* ETIQUETA DE SEMÁFORO VISUAL */}
                      {estaDescansando && (
                          <Text style={{ color: '#4CAF50', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>
                              🟢 En descanso desde: {t.fecha_entregado}
                          </Text>
                      )}
                      {!estaDescansando && !estaAsignado && (
                          <Text style={{ color: '#ff4444', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>
                              🔴 Prioridad (Libre)
                          </Text>
                      )}

                      <View style={{ marginTop: 6 }}>
                        {estaAsignado ? (
                          publicadoresAsignados.map((pub: string, idx: number) => (
                            <TouchableOpacity key={idx} onPress={() => quitarUnPublicador(t.id, pub)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                               <Text style={{ color: '#4CAF50', fontWeight: 'bold', fontSize: 13 }}>👤 {pub}</Text>
                               <Text style={{ color: '#ff4444', fontSize: 12, marginLeft: 10 }}>✖ Quitar</Text>
                            </TouchableOpacity>
                          ))
                        ) : (
                          <Text style={{ color: '#FF9800', fontWeight: 'bold', fontSize: 13 }}></Text> 
                        )}
                      </View>
                    </View>
                    
                    <View style={{ justifyContent: 'center', gap: 8 }}>
                      {estaAsignado && (<TouchableOpacity style={[styles.btnIr, { backgroundColor: '#ff4444' }]} onPress={() => liberarTerritorio(t.id)}><Text style={{ color: 'white', fontWeight: 'bold', fontSize: 10, textAlign: 'center' }}>LIBERAR TODO</Text></TouchableOpacity>)}
                      <TouchableOpacity style={[styles.btnIr, { backgroundColor: estaDescansando ? '#9E9E9E' : '#4A148C' }]} onPress={() => { setTerritorioAAsignar(t.id); setModalAsignarVisible(true); }}><Text style={{ color: 'white', fontWeight: 'bold', fontSize: 10, textAlign: 'center' }}>{estaAsignado ? '➕ AÑADIR OTRO' : 'ASIGNAR'}</Text></TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
        {Object.keys(territoriosPorDia).length === 0 && <Text style={{textAlign: 'center', marginTop: 20, color: '#666'}}>No se encontraron territorios.</Text>}
      </ScrollView>

      {/* MODAL ASIGNAR */}
      <Modal visible={modalAsignarVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { flex: 0.8 }]}>
            <Text style={styles.tT}>Asignar Territorio {territorioAAsignar}</Text>
            <Text style={{ marginBottom: 15, color: '#666' }}>Selecciona un publicador de la lista:</Text>
            <ScrollView>
              {usuarios.map((u: any, i: number) => (
                <TouchableOpacity key={i} style={styles.userRow} onPress={() => asignarTerritorio(u.nombre_completo)}><Text style={{ fontSize: 16, color: '#333' }}>{u.nombre_completo}</Text></TouchableOpacity>
              ))}
              {usuarios.length === 0 && <Text style={{textAlign: 'center', marginTop: 20}}>No hay publicadores registrados aún.</Text>}
            </ScrollView>
            <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalAsignarVisible(false)}><Text style={{ textAlign: 'center', color: '#333', fontWeight: 'bold' }}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL CAPITANES */}
      <Modal visible={modalCapitanesVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { flex: 0.8 }]}>
            <Text style={styles.tT}>👥 Gestión de Capitanes</Text>
            <Text style={{ marginBottom: 15, color: '#666' }}>Toca un publicador para darle o quitarle permisos de Capitán:</Text>
            <ScrollView>
              {usuarios.map((u: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#eee' }}>
                    <View>
                        <Text style={{ fontSize: 16, color: '#333', fontWeight: 'bold' }}>{u.nombre_completo}</Text>
                        <Text style={{ fontSize: 12, color: u.rol === 'capitan' ? '#ff4444' : (u.rol === 'administrador' ? '#4A148C' : '#666') }}>Rol: {u.rol.toUpperCase()}</Text>
                    </View>
                    {u.rol !== 'administrador' && (
                        <TouchableOpacity onPress={() => cambiarRolMovil(u.id, u.rol)} style={{ backgroundColor: u.rol === 'capitan' ? '#ff4444' : '#4CAF50', padding: 8, borderRadius: 5 }}>
                            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>{u.rol === 'capitan' ? 'QUITAR' : 'HACER CAPITÁN'}</Text>
                        </TouchableOpacity>
                    )}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalCapitanesVisible(false)}><Text style={{ textAlign: 'center', color: '#333', fontWeight: 'bold' }}>Cerrar</Text></TouchableOpacity>
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
  inputSearch: { padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 8 },
  btnCapitanes: { backgroundColor: '#4CAF50', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6 },
  scrollP: { padding: 15, paddingBottom: 40 }, // Agregamos un colchoncito abajo
  grupoHeader: { backgroundColor: '#4A148C', padding: 12, borderRadius: 8, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardT: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  tT: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  btnIr: { backgroundColor: '#4A148C', padding: 10, borderRadius: 8, width: 90 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', padding: 25, paddingBottom: 50, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  userRow: { padding: 15, borderBottomWidth: 1, borderColor: '#eee' },
  btnCancelar: { backgroundColor: '#eee', padding: 15, borderRadius: 8, marginTop: 15 }
});