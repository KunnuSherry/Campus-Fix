import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../../components/Header';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { FormattedText } from '../../components/FormattedText';
import { Ionicons } from '@expo/vector-icons';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  citations?: Array<{ title: string; page: number; category: string }>;
  suggestedDepartmentId?: string;
  suggestedDepartmentName?: string;
  canCreateReport?: boolean;
}

const showAlert = (title: string, message?: string) => {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(message ? `${title}: ${message}` : title);
  } else {
    Alert.alert(title, message);
  }
};

export default function AssistScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_1',
      sender: 'bot',
      text: 'Hello! I am **CampusFix Assist**. Ask me questions about official circulars, exam schedules, rules, notices, or hostel policies. I answer directly from verified college documents.',
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<any>(null);

  // Quick report modal states
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const quickPrompts = [
    'What is the attendance criteria for exams?',
    'When is the end term examination schedule?',
    'What are the library borrowing rules?',
  ];

  const handleSend = async (queryText?: string) => {
    const q = (queryText || inputQuery).trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: q,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await api.askAssist(q);
      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: res.answer,
        citations: res.citations,
        suggestedDepartmentId: res.suggested_department_id,
        suggestedDepartmentName: res.suggested_department_name,
        canCreateReport: true, // Always offer report creation
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_err_${Date.now()}`,
          sender: 'bot',
          text: 'Unable to reach the assistant service right now. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const openReportModal = (defaultDesc?: string, defaultTitle?: string) => {
    setReportTitle(defaultTitle || 'Campus Query / Issue');
    setReportDescription(defaultDesc || '');
    setShowReportModal(true);
  };

  const handleSubmitQuickReport = async () => {
    if (!reportDescription.trim()) {
      showAlert('Required', 'Please describe your issue or report summary.');
      return;
    }

    setSubmittingReport(true);
    try {
      // 1. Use Groq AI to automatically route to the right department
      let chosenDeptId: string | undefined = undefined;
      let shortTitle = reportTitle.trim();
      try {
        const routeRes = await api.routeIssuePreview(reportDescription.trim());
        chosenDeptId = routeRes.department_id || undefined;
        if (!shortTitle || shortTitle === 'Campus Query / Issue') {
          shortTitle = routeRes.short_title || reportDescription.trim().slice(0, 40);
        }
      } catch {}

      // 2. Create the report
      const newReport = await api.createReport({
        title: shortTitle || 'Student Report',
        description: reportDescription.trim(),
        department_id: chosenDeptId,
      });

      setShowReportModal(false);
      setReportTitle('');
      setReportDescription('');

      // Add confirmation card to chat
      setMessages((prev) => [
        ...prev,
        {
          id: `rep_conf_${Date.now()}`,
          sender: 'bot',
          text: `✅ **Ticket Created Successfully!**\n\nYour report **#${newReport.id.slice(-6).toUpperCase()}** has been submitted and automatically assigned to **${newReport.department_name || 'Department'}**.\n\nYou can track updates and chat directly with representatives in the **Reports** tab.`,
        },
      ]);
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to submit report. Please try again.');
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Assist" subtitle="AI Academic &amp; Notice Chatbot" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((m) => (
            <View
              key={m.id}
              style={[
                styles.messageBubble,
                m.sender === 'user' ? styles.userBubble : styles.botBubble,
              ]}
            >
              <View style={styles.senderHeader}>
                <Ionicons
                  name={m.sender === 'user' ? 'person-circle' : 'sparkles'}
                  size={14}
                  color={m.sender === 'user' ? '#93c5fd' : Colors.primary}
                />
                <Text
                  style={[
                    styles.senderName,
                    m.sender === 'user' ? styles.userSenderText : styles.botSenderText,
                  ]}
                >
                  {m.sender === 'user' ? 'You' : 'CampusFix Assist'}
                </Text>
              </View>

              {m.sender === 'user' ? (
                <Text style={styles.userMessageText}>{m.text}</Text>
              ) : (
                <FormattedText content={m.text} />
              )}

              {/* Citations */}
              {m.citations && m.citations.length > 0 && (
                <View style={styles.citationsContainer}>
                  <Text style={styles.citationsTitle}>Verified Document Citations:</Text>
                  {m.citations.map((c, idx) => (
                    <View key={idx} style={styles.citationBadge}>
                      <Ionicons name="document-text-outline" size={12} color="#0369a1" />
                      <Text style={styles.citationText}>
                        {c.title} &bull; Page {c.page}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Always Available Report Creation Button */}
              {m.sender === 'bot' && m.id !== 'welcome_1' && (
                <TouchableOpacity
                  style={styles.reportCtaButton}
                  onPress={() => openReportModal(messages[messages.length - 2]?.text || '')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="create-outline" size={15} color={Colors.primary} />
                  <Text style={styles.reportCtaText}>
                    Still need assistance? File a Ticket
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          {loading && (
            <View style={[styles.messageBubble, styles.botBubble, styles.loadingBubble]}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingText}>Searching official notices &amp; drafting answer...</Text>
            </View>
          )}

          {/* Quick Prompts */}
          {messages.length === 1 && (
            <View style={styles.promptsContainer}>
              <Text style={styles.promptsHeader}>Suggested Questions:</Text>
              {quickPrompts.map((p, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.promptPill}
                  onPress={() => handleSend(p)}
                >
                  <Text style={styles.promptPillText}>{p}</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask about notices, exams, rules, fees..."
            placeholderTextColor={Colors.textLight}
            value={inputQuery}
            onChangeText={setInputQuery}
            onSubmitEditing={() => handleSend()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputQuery.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!inputQuery.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Quick File Report Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>File Campus Report</Text>
                <Text style={styles.modalSubtitle}>AI will automatically categorize and route this issue</Text>
              </View>
              <TouchableOpacity onPress={() => setShowReportModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Report Title</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Broken AC in Lab 3 or Fee Portal Error"
              placeholderTextColor={Colors.textLight}
              value={reportTitle}
              onChangeText={setReportTitle}
            />

            <Text style={styles.label}>Summary / Description of the Issue *</Text>
            <TextInput
              style={[styles.modalInput, styles.descInput]}
              placeholder="Describe what is happening so the department representative can resolve it..."
              placeholderTextColor={Colors.textLight}
              value={reportDescription}
              onChangeText={setReportDescription}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={14} color={Colors.primary} />
              <Text style={styles.aiBadgeText}>
                Groq Qwen will automatically inspect this summary and route it to the right department.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowReportModal(false)}
                disabled={submittingReport}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSubmitQuickReport}
                disabled={submittingReport}
              >
                {submittingReport ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={15} color="#ffffff" />
                    <Text style={styles.modalSubmitText}>Submit Report</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderBottomLeftRadius: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  senderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '700',
  },
  userSenderText: {
    color: '#bfdbfe',
  },
  botSenderText: {
    color: Colors.primary,
  },
  userMessageText: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
  },
  citationsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  citationsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    marginBottom: 4,
  },
  citationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  citationText: {
    fontSize: 11,
    color: '#0369a1',
    fontWeight: '600',
  },
  reportCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  reportCtaText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  promptsContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  promptsHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: 8,
  },
  promptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  promptPillText: {
    fontSize: 13,
    color: Colors.text,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  descInput: {
    minHeight: 90,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    padding: 8,
    borderRadius: 6,
    marginTop: 10,
  },
  aiBadgeText: {
    fontSize: 11,
    color: Colors.primary,
    flex: 1,
    fontWeight: '500',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  modalSubmitText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
