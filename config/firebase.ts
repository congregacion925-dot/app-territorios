import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyArLwvDxyCYeMofZ9RBk0qmX4_D4IsFDHw",
  authDomain: "appterritorios.firebaseapp.com",
  projectId: "appterritorios",
  storageBucket: "appterritorios.firebasestorage.app",
  messagingSenderId: "406188772954",
  appId: "1:406188772954:web:fd517b4d989cf2eb01d263"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { 
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }) 
});

// Esto permite que el resto de tu app pueda usar "db"
export { app, db };

