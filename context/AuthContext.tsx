import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  usuario: string | null;
  rol: string | null;
  login: (usuario: string, rol: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Al iniciar, restaurar datos
  useEffect(() => {
    const restaurarDatos = async () => {
      try {
        const usuarioGuardado = await AsyncStorage.getItem('usuario');
        const rolGuardado = await AsyncStorage.getItem('rol');
        if (usuarioGuardado) setUsuario(usuarioGuardado);
        if (rolGuardado) setRol(rolGuardado);
      } catch (error) {
        console.error('Error restaurando datos:', error);
      } finally {
        setIsLoading(false);
      }
    };
    restaurarDatos();
  }, []);

  const login = async (usuario: string, rol: string) => {
    try {
      await AsyncStorage.setItem('usuario', usuario);
      await AsyncStorage.setItem('rol', rol);
      setUsuario(usuario);
      setRol(rol);
    } catch (error) {
      console.error('Error guardando datos:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('usuario');
      await AsyncStorage.removeItem('rol');
      setUsuario(null);
      setRol(null);
    } catch (error) {
      console.error('Error borrando datos:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ usuario, rol, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
