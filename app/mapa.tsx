import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
// Importamos BackHandler aquí
import { Alert, BackHandler, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { WebView } from 'react-native-webview';
// Agregamos 'increment' para la optimización
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDocs, increment, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

export default function MapaScreen() {
  const router = useRouter();
  const { usuario, rol } = useAuth();
  const { territorioSeleccionado: paramTerritorioSeleccionado, uLog, rol: paramRol } = useLocalSearchParams();

  // Usar datos del contexto, con fallback a parámetros
  const territorioSeleccionado = paramTerritorioSeleccionado ? String(paramTerritorioSeleccionado) : undefined;
  const uLogActual = usuario || (uLog ? String(uLog) : '');
  const rolActual = rol || (paramRol ? String(paramRol) : '');

  const rolActualizado = String(rolActual).toLowerCase().trim();
  const esCapitanOAdmin = rolActualizado === 'administrador' || rolActualizado === 'capitan' || rolActualizado === 'capitán';

  // --- ESTADOS ---
  const [radarActivo, setRadarActivo] = useState(false);
  const [territorioDetectadoGps, setTerritorioDetectadoGps] = useState<string | null>(null);
  const [manzanas, setManzanas] = useState<any[]>([]);
  const [capitanes, setCapitanes] = useState<any[]>([]); 
  const [esperandoToqueMapa, setEsperandoToqueMapa] = useState(false);
  const [manzanaEnFoco, setManzanaEnFoco] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  
  // Estados de Notas
  const [notaActual, setNotaActual] = useState('');
  const [notaEditandoId, setNotaEditandoId] = useState<string | null>(null);
  const [pinesPrivados, setPinesPrivados] = useState<any[]>([]);
  const [modalNuevaNotaVisible, setModalNuevaNotaVisible] = useState(false);
  const [nuevaNotaCoords, setNuevaNotaCoords] = useState<{lat: number, lng: number} | null>(null);
  const [textoNuevaNota, setTextoNuevaNota] = useState('');

  // --- ALERTAS DE PELIGRO (visibles para TODOS) ---
  const [alertasGlobales, setAlertasGlobales] = useState<any[]>([]);
  const [modalAlertaVisible, setModalAlertaVisible] = useState(false);
  const [textoNuevaAlerta, setTextoNuevaAlerta] = useState('');
  const [nuevaAlertaCoords, setNuevaAlertaCoords] = useState<{lat: number, lng: number} | null>(null);
  
  const webViewRef = useRef<WebView>(null);
  const cantidadCapitanesAnterior = useRef(0);

  // --- CONTROL DEL BOTÓN FÍSICO "ATRÁS" DE ANDROID ---
  useEffect(() => {
    const backAction = () => {
      // Si hay un modal abierto, lo cerramos en lugar de salir del mapa
      if (modalVisible) {
        setModalVisible(false);
        setNotaEditandoId(null);
        setNotaActual('');
        return true; 
      }
      if (modalNuevaNotaVisible) {
        setModalNuevaNotaVisible(false);
        return true;
      }
      if (modalAlertaVisible) {
        setModalAlertaVisible(false);
        return true;
      }
      // Si no hay modales abiertos, regresamos a la pantalla anterior
      router.back(); 
      return true; 
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [modalVisible, modalNuevaNotaVisible, modalAlertaVisible]);

  // --- NUEVO: GPS AUTOMÁTICO PARA CAPITANES EN TERRITORIOS ---
  useEffect(() => {
    // Si es capitán o admin, y NO está en el radar (está en un mapa de territorio)
    if (esCapitanOAdmin && territorioSeleccionado !== 'radar') {
        setRadarActivo(true);
    }
  }, [esCapitanOAdmin, territorioSeleccionado]);

  useEffect(() => {
    if (cantidadCapitanesAnterior.current > 0 && capitanes.length > cantidadCapitanesAnterior.current) {
        Vibration.vibrate([0, 500, 200, 500]);
        Alert.alert("🚗 ¡Nuevo Carrito en el Mapa!", "Un capitán acaba de establecer su punto de encuentro.");
    }
    cantidadCapitanesAnterior.current = capitanes.length;
  }, [capitanes]);

  const cargarDatos = async () => {
    try {
      let qManzanas;
      if (territorioSeleccionado && territorioSeleccionado !== 'radar') {
          qManzanas = query(collection(db, "manzanas"), where("territorio", "==", territorioSeleccionado));
      } else {
          qManzanas = query(collection(db, "manzanas")); 
      }
      const snapManzanas = await getDocs(qManzanas);
      const listaM: any[] = [];
      snapManzanas.forEach(doc => listaM.push({ id: doc.id, ...doc.data() }));
      setManzanas(listaM);

      const snapCaps = await getDocs(collection(db, "capitanes_activos"));
      const listaC: any[] = [];
      const TRES_HORAS_MS = 3 * 60 * 60 * 1000;
      const ahora = Date.now();
      snapCaps.forEach(doc => {
          const data = doc.data();
          if ((ahora - data.timestamp) < TRES_HORAS_MS) listaC.push(data);
      });
      setCapitanes(listaC);

      // Nota: las notas privadas las carga su propio useEffect (línea 177)
      // No las llamamos aquí para evitar la doble carga en cascada
    } catch (error) { console.log(error); }
  };

  useEffect(() => { cargarDatos(); }, [territorioSeleccionado]);

  // --- EL GPS ---
  useEffect(() => {
    let watcher: Location.LocationSubscription | null = null;
    let isMounted = true;
    if (radarActivo) {
      (async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { 
            if (isMounted) {
                Alert.alert("GPS", "Activa la ubicación para usar el radar."); 
                setRadarActivo(false);
            }
            return; 
        }
        
        const newWatcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
          (location) => {
            if (!isMounted) return;
            const lat = location.coords.latitude; const lng = location.coords.longitude;
            webViewRef.current?.injectJavaScript(`if(typeof actualizarUbicacion === 'function') { actualizarUbicacion(${lat}, ${lng}); } true;`);

            let idEncontrado = "externo";
            for (const mza of manzanasRef.current) {
                if (mza.coordenadas && mza.coordenadas.length > 0) {
                    const latM = mza.coordenadas[0].latitude; const lngM = mza.coordenadas[0].longitude;
                    const dist = Math.abs(latM - lat) + Math.abs(lngM - lng);
                    if (dist < 0.002) { idEncontrado = mza.territorio; break; }
                }
            }
            setTerritorioDetectadoGps((prev) => prev !== idEncontrado ? idEncontrado : prev);
          }
        );
        
        if (isMounted) {
            watcher = newWatcher;
        } else {
            newWatcher.remove();
        }
      })();
    } else { setPinesPrivados([]); setTerritorioDetectadoGps(null); }
    return () => { if (watcher) watcher.remove(); };
  }, [radarActivo, manzanas]);

// --- NOTAS PRIVADAS EN MAPA (CAPITANES VEN TODO EN EL TERRITORIO) ---
  const cargarNotasPrivadas = async () => {
      try {
          if (!uLogActual) return;
          let q;

          if (territorioSeleccionado === 'radar') {
              // En el radar, el capitán solo ve SUS propias revisitas (para no saturar su mapa de toda la ciudad)
              if (!radarActivo || !territorioDetectadoGps) { setPinesPrivados([]); return; }
              q = query(
                  collection(db, "notas_privadas"), 
                  where("creador", "==", String(uLogActual)), 
                  where("territorio_id", "==", territorioDetectadoGps)
              );
          } else if (territorioSeleccionado) {
              // En un territorio específico, descargamos TODOS los pines de ese territorio
              q = query(collection(db, "notas_privadas"), where("territorio_id", "==", territorioSeleccionado));
          } else return;
          
          const snap = await getDocs(q);
          const notas: any[] = [];
          
          snap.forEach(doc => {
              const data = doc.data();
              // 🌟 MAGIA: Lo mostramos si es su creador, o si el usuario es Capitán/Administrador
              if (territorioSeleccionado === 'radar' || data.creador === String(uLogActual) || esCapitanOAdmin) {
                  notas.push({ id: doc.id, ...data });
              }
          });
          setPinesPrivados(notas);
      } catch (e) { console.log("Error cargando notas"); }
  };
    
  useEffect(() => { cargarNotasPrivadas(); }, [territorioDetectadoGps, radarActivo, territorioSeleccionado]);

  const guardarNotaPrivada = async () => {
    if (!nuevaNotaCoords || !textoNuevaNota.trim()) return Alert.alert("Error", "Escribe una nota.");
    let territorioDetectado = "externo";
    for (const mza of manzanas) {
        if (mza.coordenadas && mza.coordenadas.length > 0) {
            const latM = mza.coordenadas[0].latitude; const lngM = mza.coordenadas[0].longitude;
            const dist = Math.abs(latM - nuevaNotaCoords.lat) + Math.abs(lngM - nuevaNotaCoords.lng);
            if (dist < 0.002) { territorioDetectado = mza.territorio; break; }
        }
    }
    try {
        await addDoc(collection(db, "notas_privadas"), {
            lat: nuevaNotaCoords.lat, lng: nuevaNotaCoords.lng, texto: textoNuevaNota.trim(),
            creador: uLogActual, territorio_id: territorioDetectado, timestamp: Date.now()
        });
        setModalNuevaNotaVisible(false); setTextoNuevaNota('');
        Alert.alert("✅ Guardado", `Nota guardada (Territorio: ${territorioDetectado}).`);
        cargarNotasPrivadas();
    } catch (e) { Alert.alert("Error", "No se pudo guardar la nota."); }
  };

  const borrarNotaPrivada = async (id: string) => {
    try {
        await deleteDoc(doc(db, "notas_privadas", id));
        Alert.alert("✅ Borrada", "La nota se ha eliminado del mapa.");
        cargarNotasPrivadas();
    } catch (e) { Alert.alert("Error", "No se pudo borrar la nota."); }
  };

  // --- BITÁCORA DE MANZANAS ---
  const obtenerArregloNotas = (manzana: any) => {
    if (manzana.arr_notas && Array.isArray(manzana.arr_notas)) return manzana.arr_notas;
    if (typeof manzana.notas === 'string' && manzana.notas.trim() !== '') return [{ id: 'legacy', texto: manzana.notas, fecha: 'Anterior', autor: 'Anónimo' }];
    return [];
  };
  const notasActuales = manzanaEnFoco ? obtenerArregloNotas(manzanaEnFoco) : [];

  const guardarNotaHistorial = async () => {
      if (!manzanaEnFoco || !notaActual.trim()) return;
      try {
          let nuevasNotas = [...notasActuales];
          if (notaEditandoId) {
              nuevasNotas = nuevasNotas.map((n: any) => n.id === notaEditandoId ? { ...n, texto: notaActual.trim() } : n);
          } else {
              nuevasNotas.push({ id: Date.now().toString(), texto: notaActual.trim(), fecha: new Date().toLocaleDateString('es-ES'), autor: uLogActual });
          }
          const textoWeb = nuevasNotas.map((n: any) => `• ${n.texto}`).join('\n');
          await updateDoc(doc(db, "manzanas", manzanaEnFoco.id), { arr_notas: nuevasNotas, notas: textoWeb });
          Alert.alert("✅ Guardado", "Nota guardada en la bitácora.");
          setNotaActual(''); setNotaEditandoId(null);
          // Actualizamos el estado local directamente — sin releer Firestore
          const manzanaActualizada = { ...manzanaEnFoco, arr_notas: nuevasNotas, notas: textoWeb };
          setManzanaEnFoco(manzanaActualizada);
          setManzanas(prev => prev.map(m => m.id === manzanaEnFoco.id ? manzanaActualizada : m));
      } catch (e) { Alert.alert("Error", "No se guardó la nota."); }
  };

  const borrarNotaHistorial = (idNota: string) => {
      Alert.alert("Borrar Nota", "¿Seguro que deseas eliminar esta anotación?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Borrar", style: "destructive", onPress: async () => {
              try {
                  const nuevasNotas = notasActuales.filter((n: any) => n.id !== idNota);
                  const textoWeb = nuevasNotas.map((n: any) => `• ${n.texto}`).join('\n');
                  await updateDoc(doc(db, "manzanas", manzanaEnFoco.id), { arr_notas: nuevasNotas, notas: textoWeb });
                  // Actualizamos el estado local directamente — sin releer Firestore
                  const manzanaActualizada = { ...manzanaEnFoco, arr_notas: nuevasNotas, notas: textoWeb };
                  setManzanaEnFoco(manzanaActualizada);
                  setManzanas(prev => prev.map(m => m.id === manzanaEnFoco.id ? manzanaActualizada : m));
              } catch (e) { Alert.alert("Error", "No se pudo borrar."); }
          }}
      ]);
  };

  const editarNotaHistorial = (nota: any) => { setNotaActual(nota.texto); setNotaEditandoId(nota.id); };

  // --- CAPITANES Y MARCAR MANZANA (CON OPTIMIZACIÓN INCREMENT) ---
  const guardarPinFirebase = async (lat: number, lng: number) => {
      try {
          await setDoc(doc(db, "capitanes_activos", String(uLog)), { nombre: uLog, lat: lat, lng: lng, timestamp: Date.now() });
          Alert.alert("✅ ¡Listo!", "El punto de encuentro está activo.");
          setEsperandoToqueMapa(false); cargarDatos(); 
          webViewRef.current?.injectJavaScript(`map.flyTo([${lat}, ${lng}], 16); true;`);
          Alert.alert("✅ ¡Listo!", "El punto de encuentro está activo.");
      } catch (e) { Alert.alert("Error", "No se pudo guardar el punto."); }
  };

  const apagarRadar = async () => {
      try {
          await deleteDoc(doc(db, "capitanes_activos", String(uLog)));
          Alert.alert("🛑 Radar apagado", "Tu carrito ha sido retirado del mapa.");
      } catch (e) { Alert.alert("Error", "No se pudo apagar el radar."); }
  };

  const anclarPuntoCapitan = () => {
      const tienePinActivo = capitanes.some((c: any) => c.nombre === uLogActual);
      if (tienePinActivo) {
          Alert.alert("🛑 Radar Activo", "Tu carrito ya está en el mapa. ¿Qué deseas hacer?", [
              { text: "Cancelar", style: "cancel" },
              { text: "📍 Actualizar mi posición", onPress: () => setEsperandoToqueMapa(true) },
              { text: "🛑 Apagar mi Radar", onPress: apagarRadar, style: "destructive" }
          ]);
      } else {
          Alert.alert("📍 Punto de Encuentro", "¿Cómo quieres marcar tu ubicación para el grupo?", [
              { text: "Cancelar", style: "cancel" },
              { text: "🗺️ Tocar en el mapa", onPress: () => setEsperandoToqueMapa(true) },
              { text: "📍 Usar mi GPS actual", onPress: async () => {
                  try {
                      let { status } = await Location.requestForegroundPermissionsAsync();
                      if (status !== 'granted') return Alert.alert("Error", "Necesitas GPS encendido.");
                      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                      guardarPinFirebase(loc.coords.latitude, loc.coords.longitude);
                  } catch (e) { Alert.alert("Error", "No se pudo obtener tu ubicación."); }
              }}
          ]);
      }
  };

  const centrarEnCapitan = () => {
      if (capitanes.length === 0) { Alert.alert("Radar", "No hay ningún grupo compartiendo su ubicación."); return; }
      const cap = capitanes[0];
      webViewRef.current?.injectJavaScript(`map.flyTo([${cap.lat}, ${cap.lng}], 16, { duration: 1.5 }); true;`);
  };

  // 🚀 OPTIMIZACIÓN APLICADA: Incremento para no gastar lecturas
  const marcarManzana = async (id: string, nuevoEstado: string) => {
    // Protección: si el modal se cerró antes de confirmar, no hacer nada
    if (!manzanaEnFoco) return;
    try { 
      const fechaActual = nuevoEstado === 'Trabajado' ? new Date().toLocaleDateString('es-ES') : null;
      const updateData: any = { estado: nuevoEstado };
      if (fechaActual) updateData.fecha_trabajado = fechaActual;

      const estadoAnterior = manzanaEnFoco.estado;
      let cambioProgreso = 0;
      
      if (estadoAnterior !== 'Trabajado' && nuevoEstado === 'Trabajado') cambioProgreso = 1; 
      else if (estadoAnterior === 'Trabajado' && nuevoEstado !== 'Trabajado') cambioProgreso = -1;

      // 1. Actualiza manzana (Aseguramos ID como string)
      await updateDoc(doc(db, "manzanas", String(id)), updateData); 

      // 2. Actualiza territorio (Sin gastar lecturas, aseguramos ID como string)
      if (cambioProgreso !== 0 && manzanaEnFoco.territorio) {
          await updateDoc(doc(db, "territorios", String(manzanaEnFoco.territorio)), { trabajadas: increment(cambioProgreso) });
      }

      setModalVisible(false);
      // Actualizamos el estado local directamente — sin releer Firestore
      const manzanaActualizada = { ...manzanaEnFoco, estado: nuevoEstado, fecha_trabajado: fechaActual };
      setManzanaEnFoco(manzanaActualizada);
      setManzanas(prev => prev.map(m => m.id === id ? { ...m, estado: nuevoEstado, ...(fechaActual ? { fecha_trabajado: fechaActual } : {}) } : m));
    } catch (error) { Alert.alert("Error", "No se actualizó"); }
  };

  // --- HTML DEL MAPA ---
  const generarHTMLMapa = () => {
    let coordsArray: string[] = [];
    let poligonosJS = "";

    if (territorioSeleccionado !== 'radar') {
        const manzanasDelTerritorio = manzanas.filter((m: any) => m.territorio === territorioSeleccionado);
        poligonosJS = manzanasDelTerritorio.map((m: any) => {
          if (!m.coordenadas) return '';
          const puntos = m.coordenadas.map((c: any) => `[${c.latitude}, ${c.longitude}]`).join(',');
          m.coordenadas.forEach((c: any) => coordsArray.push(`[${c.latitude}, ${c.longitude}]`));
          
          let color = '#4A148C'; 
          if (m.estado === 'Trabajado') color = '#4CAF50'; 
          if (m.estado === 'Repasando') color = '#2196F3'; 

          return `
            var poli = L.polygon([${puntos}], { color: '${color}', weight: 2, fillColor: '${color}', fillOpacity: 0.3 }).addTo(map);
            poli.on('click', function(e) { window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'manzana_click', id: '${m.id}', lat: e.latlng.lat, lng: e.latlng.lng })); });
          `;
        }).join('\n');
    }

    const capitanesJS = capitanes.map((c: any) => {
        const primerNombre = c.nombre ? c.nombre.split(' ')[0].replace(/['"]/g, '') : 'Capitán'; 
        return `
        var capIcon = L.divIcon({ html: '<div style="display: flex; flex-direction: column; align-items: center; margin-top: -15px; margin-left: -25px; width: 60px;"><div style="font-size: 30px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">🚗</div><div style="background: rgba(0,0,0,0.7); color: white; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 10px; margin-top: -5px; box-shadow: 0px 2px 4px rgba(0,0,0,0.3);">' + '${primerNombre}' + '</div></div>', className: 'icono-carro', iconSize: [60, 50] });
        L.marker([${c.lat}, ${c.lng}], {icon: capIcon}).addTo(map);
        `;
    }).join('\n');
    
    // Inyectamos las notas privadas
    const notasPrivadasJS = pinesPrivados.map((n: any) => {
        const textoLimpio = n.texto ? n.texto.replace(/['"\n\r]/g, ' ') : '';
        const creadorLimpio = n.creador ? n.creador.replace(/['"]/g, '') : '';
        return `
        var notaIcon = L.divIcon({ html: '<div style="font-size: 24px; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">📌</div>', className: 'icono-nota', iconSize: [24, 24], iconAnchor: [12, 24] });
        var markerNota = L.marker([${n.lat}, ${n.lng}], {icon: notaIcon}).addTo(map);
        markerNota.on('click', function() { window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'nota_click', id: '${n.id}', texto: '${textoLimpio}', creador: '${creadorLimpio}' })); });
        `;
    }).join('\n');

    // Inyectamos las alertas de peligro (visibles para todos)
    const alertasJS = alertasGlobales.map((a: any) => {
        const textoLimpio = a.texto ? a.texto.replace(/['"\n\r]/g, ' ') : '';
        const creadorLimpio = a.creador ? a.creador.replace(/['"]/g, '') : '';
        return `
        var alertaIcon = L.divIcon({ html: '<div style="font-size: 28px; filter: drop-shadow(2px 2px 3px rgba(0,0,0,0.45));">\u26a0\ufe0f</div>', className: 'icono-alerta', iconSize: [32, 32], iconAnchor: [16, 32] });
        var markerAlerta = L.marker([${a.lat}, ${a.lng}], {icon: alertaIcon}).addTo(map);
        markerAlerta.on('click', function() { window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'alerta_click', id: '${a.id}', texto: '${textoLimpio}', creador: '${creadorLimpio}' })); });
        `;
    }).join('\n');

    const centrarJS = territorioSeleccionado === 'radar' ? `map.setView([${LAT_CENTRO}, ${LNG_CENTRO}], 15);` : (coordsArray.length > 0 ? `map.fitBounds([${coordsArray.join(',')}], { padding: [20, 20] });` : `map.setView([${LAT_CENTRO}, ${LNG_CENTRO}], 16);`);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
        <style> body, html { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; background: #f4f4f4; } #map { width: 100%; height: 100%; } </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var limitesObregon = [[27.3500, -110.0500], [27.5500, -109.8000]];
          var map = L.map('map', { zoomControl: false, maxBounds: limitesObregon, maxBoundsViscosity: 1.0, minZoom: 12 });
          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
          ${poligonosJS}
          ${capitanesJS}
          ${notasPrivadasJS}
          ${alertasJS}
          setTimeout(function() { ${centrarJS} }, 400);
          
          var userMarker;
          var primeraVezGPS = true;
          var esRadar = ${territorioSeleccionado === 'radar'}; 
          
          function actualizarUbicacion(lat, lng) {
            if(!userMarker) { userMarker = L.circleMarker([lat, lng], { radius: 8, fillColor: '#2196F3', color: '#fff', weight: 2, fillOpacity: 1, zIndexOffset: 1000 }).addTo(map); } 
            else { userMarker.setLatLng([lat, lng]); }
            if(primeraVezGPS && esRadar) { map.flyTo([lat, lng], 16, { duration: 1.5 }); primeraVezGPS = false; }
          }
          
          map.on('click', function(e) { window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'map_click', lat: e.latlng.lat, lng: e.latlng.lng })); });
          // Evento de toque largo para agregar notas
          map.on('contextmenu', function(e) { window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'map_longpress', lat: e.latlng.lat, lng: e.latlng.lng })); });
        </script>
      </body>
      </html>
    `;
  };

  // Memoizamos el HTML del mapa: solo se regenera cuando cambian los datos del mapa,
  // no en cada render del componente (evita recargas innecesarias del WebView)
  const htmlMapa = useMemo(() => generarHTMLMapa(), [manzanas, capitanes, pinesPrivados, alertasGlobales, territorioSeleccionado]);

  const alTocarManzanaWeb = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (esperandoToqueMapa) {
        // Solo procesamos eventos que traen coordenadas válidas (map_click, manzana_click)
        // nota_click y alerta_click no tienen lat/lng, así que los ignoramos silenciosamente
        if (typeof data.lat === 'number' && typeof data.lng === 'number') {
          guardarPinFirebase(data.lat, data.lng);
        }
        return;
      }

      if (data.tipo === 'nota_click') {
          const puedeBorrar = (uLog === data.creador || esCapitanOAdmin);
          Alert.alert(`📌 Nota de ${data.creador}`, data.texto, puedeBorrar ? [{ text: "Cerrar", style: "cancel" }, { text: "🗑️ Borrar Nota", style: "destructive", onPress: () => borrarNotaPrivada(data.id) }] : [{ text: "Cerrar", style: "cancel" }]);
          return;
      }

      if (data.tipo === 'map_longpress') {
          const coords = { lat: data.lat, lng: data.lng };
          Alert.alert(
              'Agregar al Mapa',
              '¿Qué quieres colocar en este punto?',
              [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: '📌 Revisita Privada', onPress: () => { setNuevaNotaCoords(coords); setTextoNuevaNota(''); setModalNuevaNotaVisible(true); } },
                  { text: '⚠️ Alerta de Peligro', onPress: () => { setNuevaAlertaCoords(coords); setTextoNuevaAlerta(''); setModalAlertaVisible(true); } },
              ]
          );
          return;
      }

      if (data.tipo === 'manzana_click') {
          const mza = manzanas.find((m: any) => m.id === data.id);
          if(mza) { 
              setManzanaEnFoco(mza); setNotaActual(''); setNotaEditandoId(null); setModalVisible(true); 
          }
      }
    } catch (error) { console.log('Error leyendo toque del mapa'); }
  };

  return (
    <View style={styles.container}>
      {/* HEADER DEL MAPA */}
      <View style={styles.headerMapa}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={20} color="white" />
        </TouchableOpacity>

        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ color: 'white', fontSize: 17, fontWeight: 'bold' }}>
            {territorioSeleccionado === 'radar' ? '📡 Radar' : `Territorio ${territorioSeleccionado}`}
          </Text>
          {radarActivo && territorioSeleccionado === 'radar' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Ionicons name="location" size={10} color="#FFC107" />
              <Text style={{ color: '#FFC107', fontSize: 10, fontWeight: 'bold' }}>
                {territorioDetectadoGps || 'Buscando...'}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {territorioSeleccionado === 'radar' && (
            <TouchableOpacity
              onPress={() => setRadarActivo(!radarActivo)}
              style={[styles.gpsPill, { backgroundColor: radarActivo ? '#4CAF50' : '#E53935' }]}
            >
              <Ionicons name={radarActivo ? 'radio' : 'radio-outline'} size={14} color="white" />
              <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                {radarActivo ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={centrarEnCapitan} style={styles.headerBtn}>
            <Ionicons name="navigate-outline" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* BANNER: esperando toque en el mapa */}
      {esperandoToqueMapa && (
        <View style={styles.toastBanner}>
          <Ionicons name="car-outline" size={20} color="white" style={{ marginRight: 8 }} />
          <Text style={{ color: 'white', fontWeight: 'bold', flex: 1, fontSize: 13 }}>Toca un punto del mapa para estacionar el carrito</Text>
          <TouchableOpacity onPress={() => setEsperandoToqueMapa(false)} style={styles.toastCancelBtn}>
            <Ionicons name="close" size={16} color="#FF9800" />
          </TouchableOpacity>
        </View>
      )}

      <WebView ref={webViewRef} source={{ html: htmlMapa }} style={{ flex: 1 }} onMessage={alTocarManzanaWeb} javaScriptEnabled={true} geolocationEnabled={true} />

      {esCapitanOAdmin && (
        <TouchableOpacity style={styles.fabCapitan} onPress={anclarPuntoCapitan}>
          <Text style={{ fontSize: 28 }}>🚗</Text>
        </TouchableOpacity>
      )}

      {/* MODAL MANZANAS REDISEÑADO */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={{ width: '100%', maxHeight: '92%' }}>
            <View style={[styles.modalContent, { flexShrink: 1 }]}>
              {manzanaEnFoco && (
                <ScrollView keyboardShouldPersistTaps="handled">
                  <Text style={styles.tT}>Manzana {manzanaEnFoco.numero}</Text>
                  <Text style={{ marginBottom: 15, color: '#666' }}>Estado actual: <Text style={{fontWeight:'bold', color: manzanaEnFoco.estado === 'Trabajado' ? 'green' : manzanaEnFoco.estado === 'Repasando' ? '#2196F3' : 'orange'}}>{manzanaEnFoco.estado}</Text></Text>
                  
                  {/* AQUÍ ESTÁ LA SECCIÓN DE NOTAS DE VUELTA */}
                  <Text style={{ fontWeight: 'bold', color: '#333', marginBottom: 5 }}>Bitácora de la Manzana:</Text>
                  <View style={{maxHeight: 180, marginBottom: 15}}>
                      <ScrollView nestedScrollEnabled>
                          {notasActuales.length === 0 && <Text style={{color: '#999', fontStyle: 'italic', fontSize: 13, marginVertical: 10}}>No hay notas registradas aún.</Text>}
                          {notasActuales.map((n: any) => (
                              <View key={n.id} style={{backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: '#FFC107'}}>
                                  <Text style={{fontSize: 14, color: '#333'}}>{n.texto}</Text>
                                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8}}>
                                      <Text style={{fontSize: 11, color: '#888'}}>👤 {n.autor} • {n.fecha}</Text>
                                      {(esCapitanOAdmin || uLog === n.autor) && (
                                          <View style={{flexDirection: 'row', gap: 15}}>
                                              <TouchableOpacity onPress={() => editarNotaHistorial(n)}><Text style={{fontSize: 16}}>✏️</Text></TouchableOpacity>
                                              <TouchableOpacity onPress={() => borrarNotaHistorial(n.id)}><Text style={{fontSize: 16}}>🗑️</Text></TouchableOpacity>
                                          </View>
                                      )}
                                  </View>
                              </View>
                          ))}
                      </ScrollView>
                  </View>

                  {/* INPUT NUEVA NOTA */}
                  <TextInput
                    style={styles.notaInput}
                    multiline
                    placeholder="Escribe una nota aquí..."
                    placeholderTextColor="#bbb"
                    value={notaActual}
                    onChangeText={setNotaActual}
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    <TouchableOpacity
                      style={[styles.btnNota, { backgroundColor: notaEditandoId ? '#FF9800' : '#4A148C', flex: 1 }]}
                      onPress={guardarNotaHistorial}
                    >
                      <Ionicons name={notaEditandoId ? 'save-outline' : 'add-circle-outline'} size={16} color="white" />
                      <Text style={styles.btnNotaTxt}>{notaEditandoId ? 'Actualizar' : 'Agregar Nota'}</Text>
                    </TouchableOpacity>
                    {notaEditandoId && (
                      <TouchableOpacity
                        style={[styles.btnNota, { backgroundColor: '#F5F5F5', paddingHorizontal: 14 }]}
                        onPress={() => { setNotaEditandoId(null); setNotaActual(''); }}
                      >
                        <Ionicons name="close-outline" size={18} color="#666" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Botón cerrar */}
                  <TouchableOpacity
                    style={styles.btnCerrar}
                    onPress={() => { setModalVisible(false); setNotaEditandoId(null); setNotaActual(''); }}
                  >
                    <Text style={styles.btnCerrarTxt}>Cerrar</Text>
                  </TouchableOpacity>

                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal> 

      {/* MODAL DE PIN PRIVADO (REVISITA) */}
      <Modal visible={modalNuevaNotaVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={{ width: '100%' }}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />

              {/* Cabecera */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#EDE7F6', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="location" size={20} color="#4A148C" />
                </View>
                <View>
                  <Text style={styles.modalMainTitle}>Nueva Revisita</Text>
                  <Text style={styles.modalSuperTitle}>Nota privada en el mapa</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <TextInput
                style={[styles.notaInput, { minHeight: 100 }]}
                multiline
                placeholder="Ej. Sra. María pidió volver el martes..."
                placeholderTextColor="#bbb"
                value={textoNuevaNota}
                onChangeText={setTextoNuevaNota}
                autoFocus
              />

              <TouchableOpacity
                style={[styles.btnNota, { backgroundColor: '#4A148C', marginBottom: 10 }]}
                onPress={guardarNotaPrivada}
              >
                <Ionicons name="bookmark-outline" size={16} color="white" />
                <Text style={styles.btnNotaTxt}>Guardar Revisita</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnCerrar}
                onPress={() => setModalNuevaNotaVisible(false)}
              >
                <Text style={styles.btnCerrarTxt}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL: ALERTA DE PELIGRO */}
      <Modal visible={modalAlertaVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={{ width: '100%' }}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="warning" size={22} color="#D32F2F" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalMainTitle}>Alerta de Peligro</Text>
                  <Text style={styles.modalSuperTitle}>⚠️ Visible para TODOS los publicadores</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <TextInput
                style={[styles.notaInput, { minHeight: 100, borderWidth: 1.5, borderColor: '#FFCDD2' }]}
                multiline
                placeholder="Describe el peligro. Ej: Perro suelto, persona conflictiva, zona insegura..."
                placeholderTextColor="#bbb"
                value={textoNuevaAlerta}
                onChangeText={setTextoNuevaAlerta}
                autoFocus
              />

              <TouchableOpacity
                style={[styles.btnNota, { backgroundColor: '#D32F2F', marginBottom: 10 }]}
                onPress={guardarAlerta}
              >
                <Ionicons name="warning-outline" size={16} color="white" />
                <Text style={styles.btnNotaTxt}>Registrar Alerta</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnCerrar} onPress={() => setModalAlertaVisible(false)}>
                <Text style={styles.btnCerrarTxt}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f4f4f4' },
  headerMapa:       { backgroundColor: '#4A148C', paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4 },
  headerBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  gpsPill:          { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  toastBanner:      { position: 'absolute', top: 92, left: 14, right: 14, backgroundColor: '#FF9800', padding: 14, borderRadius: 14, elevation: 6, zIndex: 10, flexDirection: 'row', alignItems: 'center', shadowColor: '#FF9800', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  toastCancelBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  fabCapitan:       { position: 'absolute', bottom: 30, right: 20, backgroundColor: 'white', width: 62, height: 62, borderRadius: 31, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, borderWidth: 2, borderColor: '#FFC107' },

  // Modal base
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalContent:     { backgroundColor: 'white', padding: 20, paddingBottom: 30, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHandle:      { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },

  // Modal header
  modalHeader:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  modalSuperTitle:  { fontSize: 12, color: '#aaa', fontWeight: '500', marginBottom: 2 },
  modalMainTitle:   { fontSize: 22, fontWeight: 'bold', color: '#222' },
  estadoBadge:      { borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  estadoBadgeTxt:   { fontSize: 12, fontWeight: 'bold' },
  fechaTrabajado:   { fontSize: 11, color: '#bbb', marginBottom: 16 },

  // Selector de estado
  selectorEstado:   { flexDirection: 'row', gap: 8, marginBottom: 20 },
  pillEstado:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  pillTxt:          { fontSize: 12, fontWeight: 'bold' },

  // Divider
  divider:          { height: 1, backgroundColor: '#F0F0F0', marginBottom: 16 },
  sectionTitle:     { fontSize: 14, fontWeight: 'bold', color: '#333' },

  // Notas
  emptyNota:        { alignItems: 'center', paddingVertical: 16, gap: 6 },
  emptyNotaTxt:     { color: '#ccc', fontSize: 13 },
  notaCard:         { backgroundColor: '#FAFAFA', padding: 12, borderRadius: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#FFC107' },
  notaTxt:          { fontSize: 13, color: '#333', lineHeight: 19 },
  notaMeta:         { fontSize: 11, color: '#bbb' },
  notaInput:        { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 12, fontSize: 14, color: '#333', minHeight: 70, textAlignVertical: 'top', marginBottom: 10 },
  btnNota:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  btnNotaTxt:       { color: 'white', fontWeight: 'bold', fontSize: 14 },
  btnCerrar:        { backgroundColor: '#F5F5F5', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4, marginBottom: 6 },
  btnCerrarTxt:     { color: '#666', fontWeight: 'bold', fontSize: 15 },

  // Legacy (usados en inputs genéricos)
  tT:           { fontSize: 18, fontWeight: 'bold', color: '#333' },
  btnLogin:     { padding: 15, borderRadius: 8 },
  inputLogin:   { backgroundColor: '#f0f0f0', padding: 15, borderRadius: 8, marginBottom: 15, fontSize: 16 },
});