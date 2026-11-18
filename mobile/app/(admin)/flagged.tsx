import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { Header } from '../../components/Header';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';

export default function AdminFlaggedMessagesScreen() {
  const [flaggedMsgs, setFlaggedMsgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFlagged = async () => {
    try {
      const data = await api.getFlaggedMessages();
      setFlaggedMsgs(data);
    } catch (e) {
      console.warn('Failed to load flagged messages:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFlagged();
  }, []);

  const handleDismiss = async (msgId: string) => {
    try {
      await api.resolveFlaggedMessage(msgId, 'dismiss');
      setFlaggedMsgs((prev) => prev.filter((m) => m.message_id !== msgId));
      Alert.alert('Dismissed', 'Flag removed. Message remains visible in community.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to dismiss flag');
    }
  };

  const handleRemove = async (msgId: string) => {
    const doRemove = async () => {
      try {
        await api.resolveFlaggedMessage(msgId, 'delete');
        setFlaggedMsgs((prev) => prev.filter((m) => m.message_id !== msgId));
        Alert.alert('Removed', 'Message removed from the community feed.');
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to remove message');
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Permanently remove this message from the community feed?')) doRemove();
    } else {
      Alert.alert('Remove Message', 'Remove this message from the community feed permanently?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isPreBlocked = item.source === 'pre_moderation_block';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, isPreBlocked && { backgroundColor: '#fee2e2' }]}>
            <Ionicons
              name={isPreBlocked ? 'shield-half-outline' : 'flag'}
              size={12}
              color={isPreBlocked ? '#b91c1c' : Colors.error}
            />
            <Text style={[styles.badgeText, isPreBlocked && { color: '#b91c1c' }]}>
              {isPreBlocked ? 'Blocked Pre-Publication' : 'Reported Content'}
            </Text>
          </View>
          <Text style={styles.dateText}>
            {new Date(item.created_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {/* Student's Actual Real Name and Email */}
        <View style={styles.studentInfoRow}>
          <Ionicons name="person-circle-outline" size={18} color="#0f172a" />
          <View style={{ flex: 1 }}>
            <Text style={styles.studentRealName}>
              {item.author_name || item.pseudonym || 'Student User'}
            </Text>
            {item.author_email && (
              <Text style={styles.studentEmail}>{item.author_email}</Text>
            )}
          </View>
          {item.pseudonym && (
            <View style={styles.pseudoBadge}>
              <Text style={styles.pseudoBadgeText}>Posted as: {item.pseudonym}</Text>
            </View>
          )}
        </View>

        <View style={styles.messageBox}>
          <Text style={styles.bodyText}>"{item.body}"</Text>
        </View>

        <View style={styles.reasonRow}>
          <Text style={styles.reasonLabel}>
            {isPreBlocked ? 'Flagged Reason:' : 'Report Reason:'}
          </Text>
          <Text style={styles.reasonValue}>
            {item.flagged_reasons?.join(', ') || item.reason || 'Cuss words or abusive content detected'}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.dismissBtn} onPress={() => handleDismiss(item.message_id)}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.dismissBtnText}>Resolve / Dismiss</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(item.message_id)}>
            <Ionicons name="trash-outline" size={16} color="#ffffff" />
            <Text style={styles.removeBtnText}>Delete Record</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Harmful Messages" subtitle="Blocked Vulgar Language &amp; Reported Content" />

      {loading ? (
        <LoadingSpinner message="Checking harmful messages queue..." />
      ) : flaggedMsgs.length === 0 ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title="No Harmful Messages"
          description="There are currently no blocked vulgar messages or reported content."
        />
      ) : (
        <FlatList
          data={flaggedMsgs}
          keyExtractor={(item) => item.message_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchFlagged(); }} colors={[Colors.primary]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.errorLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.error,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  studentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  studentRealName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  studentEmail: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  pseudoBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  pseudoBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  pseudonym: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 6,
  },
  messageBox: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  bodyText: {
    fontSize: 14,
    color: Colors.text,
    fontStyle: 'italic',
  },
  reasonRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  reasonValue: {
    fontSize: 12,
    color: Colors.error,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dismissBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    borderRadius: 8,
  },
  dismissBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  removeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.error,
    paddingVertical: 10,
    borderRadius: 8,
  },
  removeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

