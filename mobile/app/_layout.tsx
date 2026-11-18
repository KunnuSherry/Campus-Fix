import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(student)" />
          <Stack.Screen name="(rep)" />
          <Stack.Screen name="(admin)" />
          <Stack.Screen name="(superadmin)" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

