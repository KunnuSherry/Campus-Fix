import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function AdminLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'web' ? 0 : 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          height: Platform.OS === 'web' ? 60 : 56 + bottomInset,
          paddingBottom: Platform.OS === 'web' ? 8 : bottomInset,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="analytics" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Documents',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="documents-outline" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="management"
        options={{
          title: 'Campus Setup',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="flagged"
        options={{
          title: 'Harmful Messages',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="alert-circle-outline" size={size} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}

