import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { Header } from '../../components/Header';
import { Colors } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { ModerationResult } from '../../../shared/types';
import { Ionicons } from '@expo/vector-icons';

interface CommunityMsg {
  id: string;
  college_id: string;
  pseudonym: string;
  body: string;
  upvotes?: number;
  user_has_upvoted?: boolean;
  created_at: string;
}

export default function CommunityScreen() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<CommunityMsg[]>([]);
  const [inputBody, setInputBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Moderation feedback state
  const [blockedResult, setBlockedResult] = useState<ModerationResult | null>(null);
  const [showBlockedModal, setShowBlockedModal] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  const fetchMessages = async () => {
    try {
      const data = await api.getCommunityMessages(60);
      setMessages(data);
    } catch (e) {
      console.warn('Failed to load community messages:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 4000); // Polling sync for real-time feed
    return () => clearInterval(interval);
  }, []);

  const handleSendMessage = async () => {
    const text = inputBody.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      const res = await api.moderateAndPublishCommunityMessage(text);

      if (!res.success) {
        // BLOCKED by Groq/Qwen moderation
        setBlockedResult(res.moderation);
        setShowBlockedModal(true);
      } else {
        // ALLOWED and published
        setInputBody('');
        await fetchMessages();
        flatListRef.current?.scrollToEnd({ animated: true });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit message.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportMessage = (msgId: string) => {
    Alert.prompt
      ? Alert.prompt(
          'Report Message',
          'Why are you reporting this message for moderation review?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Report',
              onPress: async (reason?: string) => {
                await api.reportCommunityMessage(msgId, reason || 'Inappropriate content');
                Alert.alert('Reported', 'The message has been placed in the moderation review queue.');
              },
            },
          ]
        )
      : Alert.alert('Report Message', 'Do you want to flag this message for admin review?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Flag Message',
            onPress: async () => {
              await api.reportCommunityMessage(msgId, 'Reported by student user');
              Alert.alert('Reported', 'The message has been placed in the moderation review queue.');
            },
          },
        ]);
  };

  const handleDeleteMyMessage = (msgId: string) => {
    const doDelete = async () => {
      try {
        await api.deleteCommunityMessage(msgId);
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to delete message');
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Delete your message from the community feed?')) doDelete();
    } else {
      Alert.alert('Delete Message', 'Delete your message?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleToggleUpvote = async (msgId: string) => {
    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === msgId) {
          const currentlyUpvoted = !!m.user_has_upvoted;
          const currentCount = m.upvotes || 0;
          return {
            ...m,
            user_has_upvoted: !currentlyUpvoted,
            upvotes: currentlyUpvoted ? Math.max(0, currentCount - 1) : currentCount + 1,
          };
        }
        return m;
      })
    );

    try {
      const res = await api.upvoteCommunityMessage(msgId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, upvotes: res.upvotes, user_has_upvoted: res.user_has_upvoted }
            : m
        )
      );
    } catch (e) {
      console.warn('Failed to toggle upvote:', e);
    }
  };

  const renderMessageItem = ({ item }: { item: CommunityMsg }) => {
    const isMe = item.pseudonym === user?.pseudonym;
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <View style={styles.bubbleHeader}>
            <Text style={[styles.pseudonym, isMe ? styles.pseudonymMe : styles.pseudonymOther]}>
              {item.pseudonym}
            </Text>
            {isMe ? (
              <TouchableOpacity onPress={() => handleDeleteMyMessage(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={13} color="#bfdbfe" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => handleReportMessage(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="flag-outline" size={12} color={Colors.textLight} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.bodyText, isMe && styles.bodyTextMe]}>{item.body}</Text>

          <View style={styles.bubbleFooter}>
            <TouchableOpacity
              style={[styles.upvoteBtn, item.user_has_upvoted && styles.upvoteBtnActive]}
              onPress={() => handleToggleUpvote(item.id)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name={item.user_has_upvoted ? 'thumbs-up' : 'thumbs-up-outline'}
                size={12}
                color={item.user_has_upvoted ? (isMe ? '#ffffff' : Colors.primary) : (isMe ? '#bfdbfe' : Colors.textMuted)}
              />
              <Text style={[styles.upvoteText, isMe && styles.upvoteTextMe, item.user_has_upvoted && styles.upvoteTextActive]}>
                {item.upvotes || 0}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.timeText, isMe && styles.timeTextMe]}>
              {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="Community"
        subtitle={`Anonymous Campus Chat \u2022 You are ${user?.pseudonym || 'Pseudonymous'}`}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Connecting to campus group chat...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles" size={40} color={Colors.textLight} />
                <Text style={styles.emptyTitle}>Be the first to speak!</Text>
                <Text style={styles.emptySubtitle}>
                  Share constructive criticism, ask questions, or discuss campus events. All messages are pseudonymous.
                </Text>
              </View>
            }
          />
        )}

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type in English, Hindi, Hinglish..."
            placeholderTextColor={Colors.textLight}
            value={inputBody}
            onChangeText={setInputBody}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputBody.trim() || submitting) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!inputBody.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="send" size={16} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Moderation Blocked Feedback Modal */}
      <Modal
        visible={showBlockedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBlockedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="shield-outline" size={32} color={Colors.error} />
              <Text style={styles.modalTitle}>Message Not Published</Text>
            </View>

            <Text style={styles.modalCategory}>
              Reason: <Text style={{ fontWeight: '700', textTransform: 'capitalize' }}>{blockedResult?.category.replace('_', ' ')}</Text>
            </Text>

            <View style={styles.reasonBox}>
              <Text style={styles.reasonText}>
                {blockedResult?.reason || 'Violated campus community guidelines.'}
              </Text>
            </View>

            <View style={styles.policyNotice}>
              <Ionicons name="information-circle" size={16} color={Colors.primary} />
              <Text style={styles.policyText}>
                <Text style={{ fontWeight: 'bold' }}>CampusFix Policy:</Text> Constructive criticism and complaints about food, hostel, or academics are always allowed. Personal abuse, threats, and cuss words are blocked and logged for administration review.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowBlockedModal(false)}
            >
              <Text style={styles.modalButtonText}>Edit and Rewrite Message</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  listContent: {
    padding: 16,
    paddingBottom: 16,
  },
  msgRow: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  msgRowMe: {
    justifyContent: 'flex-end',
  },
  msgRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  pseudonym: {
    fontSize: 11,
    fontWeight: '700',
  },
  pseudonymMe: {
    color: '#bfdbfe',
  },
  pseudonymOther: {
    color: Colors.accent,
  },
  bodyText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  bodyTextMe: {
    color: '#ffffff',
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  upvoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
  },
  upvoteBtnActive: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  upvoteText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  upvoteTextMe: {
    color: '#bfdbfe',
  },
  upvoteTextActive: {
    color: Colors.primary,
  },
  timeText: {
    fontSize: 9,
    color: Colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  timeTextMe: {
    color: '#93c5fd',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    maxHeight: 90,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    elevation: 6,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.error,
    marginTop: 6,
  },
  modalCategory: {
    fontSize: 13,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  reasonBox: {
    backgroundColor: Colors.errorLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 14,
  },
  reasonText: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  policyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 18,
  },
  policyText: {
    flex: 1,
    fontSize: 12,
    color: Colors.primary,
    lineHeight: 16,
  },
  modalButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});

