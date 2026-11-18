import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';
import { ReportStatus } from '../../shared/types';

interface StatusBadgeProps {
  status: ReportStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'OPEN':
        return { bg: Colors.warningLight, text: '#b45309' };
      case 'IN_PROGRESS':
        return { bg: Colors.infoLight, text: '#0369a1' };
      case 'RESOLVED':
        return { bg: Colors.successLight, text: '#047857' };
      case 'REOPENED':
        return { bg: Colors.errorLight, text: '#b91c1c' };
      default:
        return { bg: Colors.border, text: Colors.textMuted };
    }
  };

  const current = getBadgeStyle();

  return (
    <View style={[styles.badge, { backgroundColor: current.bg }]}>
      <Text style={[styles.label, { color: current.text }]}>
        {status.replace('_', ' ')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

