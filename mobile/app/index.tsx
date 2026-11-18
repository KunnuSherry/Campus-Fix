import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

export default function IndexScreen() {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (role === 'student') {
    return <Redirect href="/(student)/assist" />;
  } else if (role === 'rep') {
    return <Redirect href="/(rep)/inbox" />;
  } else if (role === 'admin') {
    return <Redirect href="/(admin)/dashboard" />;
  } else if (role === 'superadmin') {
    return <Redirect href="/(superadmin)/colleges" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
