import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';

function RootLayoutNavigation() {
  const { usuario, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isLoading) {
      // Si no hay usuario y no estamos en la pantalla de login, ir al login
      if (!usuario && segments[0] !== '(auth)') {
        router.replace('/');
      }
      // Si hay usuario y estamos en login, ir a lista
      else if (usuario && segments[0] === undefined) {
        router.replace('/lista');
      }
    }
  }, [usuario, isLoading]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4A148C" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function Layout() {
  return (
    <AuthProvider>
      <RootLayoutNavigation />
    </AuthProvider>
  );
}