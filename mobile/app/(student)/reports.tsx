import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../../components/Header';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { Report, ReportMessage, ReportEvent, Department, RoutingResult } from '../../../shared/types';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

type ChatItem =
  | { type: 'message'; data: ReportMessage }
  | { type: 'event'; data: ReportEvent };

function buildChatTimeline(messages: ReportMessage[], events: ReportEvent[]): ChatItem[] {
  const items: ChatItem[] = [
    ...messages.map((m) => ({ type: 'message' as const, data: m })),
    ...events
      .filter((e) => e.status !== 'OPEN')
      .map((e) => ({ type: 'event' as const, data: e })),
  ];
  items.sort((a, b) => {
    const aTime = a.type === 'message' ? a.data.created_at : (a.data as ReportEvent).created_at;
    const bTime = b.type === 'message' ? b.data.created_at : (b.data as ReportEvent).created_at;
    return aTime.localeCompare(bTime);
  });
  return items;
}

const STATUS_COLOR: Record<string, string> = {
  IN_PROGRESS: '#d97706',
  RESOLVED: '#16a34a',
  REOPENED: '#dc2626',
};

export default function StudentReportsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; new?: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web'
    ? 12
    : Math.max(insets.top, Platform.OS === 'android' ? 28 : 16);

  // ── List State ──
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Mode State ──
  const [selectedReportId, setSelectedReportId] = useState<string | null>(params?.id || null);
  const [isCreatingNew, setIsCreatingNew] = useState(params?.new === '1');

  // ── Detail State ──
  const [selectedReport, setSelectedReport] = useState<(Report & { messages: ReportMessage[]; events: ReportEvent[] }) | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [reopenModal, setReopenModal] = useState(false);
  const [reopenNote, setReopenNote] = useState('');
  const [reopening, setReopening] = useState(false);
  const scrollViewRef = useRef<any>(null);

  // ── New Report Form State ──
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [aiRouting, setAiRouting] = useState<RoutingResult | null>(null);
  const [checkingAi, setCheckingAi] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Handle URL param changes
  useEffect(() => {
    if (params?.id) {
      setSelectedReportId(params.id);
      setIsCreatingNew(false);
    } else if (params?.new === '1') {
      setIsCreatingNew(true);
      setSelectedReportId(null);
    }
  }, [params?.id, params?.new]);

  // Load Reports List
  const fetchReports = async () => {
    try {
      const data = await api.getReports();
      setReports(data);
    } catch (e) {
      console.warn('Failed to load reports:', e);
    } finally {
      setLoadingList(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  // Fetch Report Detail
  const fetchReportDetail = async (reportId: string) => {
    try {
      const data = await api.getReportDetails(reportId);
      setSelectedReport(data);
      setDetailError(null);
    } catch (e: any) {
      console.warn('Failed to load student report detail:', e);
      setDetailError(e.message || 'Failed to load report');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!selectedReportId) {
      setSelectedReport(null);
      return;
    }
    setLoadingDetail(true);
    fetchReportDetail(selectedReportId);
    const interval = setInterval(() => {
      fetchReportDetail(selectedReportId);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedReportId]);

  useEffect(() => {
    if (selectedReport?.messages?.length) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [selectedReport?.messages?.length]);

  // Load departments when opening new report
  useEffect(() => {
    if (isCreatingNew) {
      api.getDepartments().then(setDepartments).catch(() => {});
    }
  }, [isCreatingNew]);

  // ── Actions ──
  const handleOpenReport = (id: string) => {
    setSelectedReportId(id);
    setIsCreatingNew(false);
  };

  const handleBackToList = () => {
    setSelectedReportId(null);
    setSelectedReport(null);
    setIsCreatingNew(false);
    fetchReports();
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !selectedReportId || sendingMsg) return;
    setSendingMsg(true);
    const msgToSend = chatInput.trim();
    setChatInput('');
    try {
      await api.postReportMessage(selectedReportId, msgToSend);
      await fetchReportDetail(selectedReportId);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    } catch (e: any) {
      setChatInput(msgToSend);
      Alert.alert('Error', e.message || 'Failed to send message');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleConfirmReopen = async () => {
    if (!selectedReportId) return;
    setReopening(true);
    try {
      const note = reopenNote.trim() || 'Student reported issue was not resolved satisfactorily.';
      await api.updateReportStatus(selectedReportId, 'REOPENED', note);
      setReopenModal(false);
      setReopenNote('');
      await fetchReportDetail(selectedReportId);
      scrollViewRef.current?.scrollToEnd({ animated: true });
      Alert.alert('Report Reopened', 'The department representative has been notified.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to reopen report');
    } finally {
      setReopening(false);
    }
  };

  const handleDeleteReport = () => {
    if (!selectedReportId) return;
    const doDelete = async () => {
      try {
        await api.deleteReport(selectedReportId);
        handleBackToList();
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to delete report');
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Cancel and delete this report?')) doDelete();
    } else {
      Alert.alert('Cancel Report', 'Cancel and delete this report?', [
        { text: 'Keep', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // AI Routing in New Report
  const triggerAiRouting = async (descText: string) => {
    if (!descText || descText.trim().length < 10) return;
    setCheckingAi(true);
    try {
      const res = await api.routeIssuePreview(descText);
      setAiRouting(res);
      if (res.department_id && !selectedDeptId) {
        setSelectedDeptId(res.department_id);
      }
      if (!newTitle && res.short_title) {
        setNewTitle(res.short_title);
      }
    } catch (e) {
      console.warn('AI routing preview error:', e);
    } finally {
      setCheckingAi(false);
    }
  };

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Camera roll access is needed to attach photos of the issue.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const mimeType = asset.mimeType || 'image/jpeg';
        setImageUri(`data:${mimeType};base64,${asset.base64}`);
      } else {
        setImageUri(asset.uri);
      }
    }
  };

  const handleCreateSubmit = async () => {
    if (!newDescription.trim()) {
      Alert.alert('Required Field', 'Please provide a description of the issue.');
      return;
    }
    setSubmitting(true);
    try {
      const finalTitle = newTitle.trim() || aiRouting?.short_title || 'Reported Campus Issue';
      const created = await api.createReport({
        title: finalTitle,
        description: newDescription.trim(),
        department_id: selectedDeptId || aiRouting?.department_id,
        image_url: imageUri || undefined,
      });

      // Clear form
      setNewTitle('');
      setNewDescription('');
      setSelectedDeptId('');
      setImageUri(null);
      setAiRouting(null);
      setIsCreatingNew(false);

      // Open new report directly
      setSelectedReportId(created.id);
      fetchReports();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // VIEW 1: DETAIL & CHAT VIEW
  // ==========================================
  if (selectedReportId) {
    if (loadingDetail && !selectedReport) {
      return (
        <View style={styles.container}>
          <View style={[styles.topBar, { paddingTop: topPadding }]}>
            <TouchableOpacity onPress={handleBackToList} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.topTitle}>Loading Report...</Text>
          </View>
          <LoadingSpinner message="Fetching report details and chat..." />
        </View>
      );
    }

    if (!selectedReport) {
      return (
        <View style={styles.container}>
          <View style={[styles.topBar, { paddingTop: topPadding }]}>
            <TouchableOpacity onPress={handleBackToList} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.topTitle}>Report Error</Text>
          </View>
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: Colors.error, fontSize: 14, marginBottom: 16 }}>
              {detailError || 'Report not found or access restricted.'}
            </Text>
            <TouchableOpacity style={styles.primaryBackBtn} onPress={handleBackToList}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Back to My Reports</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const timeline = buildChatTimeline(selectedReport.messages || [], selectedReport.events || []);
    const isResolved = selectedReport.status === 'RESOLVED';

    return (
      <View style={styles.container}>
        {/* ── Top Bar ── */}
        <View style={[styles.topBar, { paddingTop: topPadding }]}>
          <TouchableOpacity onPress={handleBackToList} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.topTitle} numberOfLines={1}>{selectedReport.title}</Text>
              <StatusBadge status={selectedReport.status} />
            </View>
            <Text style={styles.topSub}>
              Ticket #{selectedReport.id.slice(-6).toUpperCase()} · {selectedReport.department_name}
            </Text>
          </View>
          {selectedReport.status === 'OPEN' && (
            <TouchableOpacity onPress={handleDeleteReport} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
            </TouchableOpacity>
          )}
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
          style={styles.keyboardContainer}
        >
          {/* ── Chat Thread & Ticket Header inside ScrollView ── */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
          >
            {/* ── Overview Card ── */}
            <View style={styles.descCard}>
              <Text style={styles.descText}>{selectedReport.description}</Text>
              {selectedReport.image_url && (
                <Image source={{ uri: selectedReport.image_url }} style={styles.attachedImage} resizeMode="cover" />
              )}
              <View style={styles.metaRow}>
                <View style={styles.reporterRow}>
                  <Ionicons name="person-circle-outline" size={15} color={Colors.textMuted} />
                  <Text style={styles.reporterText}>
                    Reported as: <Text style={{ color: Colors.primary, fontWeight: '700' }}>{selectedReport.student_display_name}</Text>
                  </Text>
                </View>
                {selectedReport.ai_confidence && (
                  <View style={styles.aiChip}>
                    <Ionicons name="sparkles" size={11} color="#15803d" />
                    <Text style={styles.aiChipText}>{Math.round(selectedReport.ai_confidence * 100)}% Routed</Text>
                  </View>
                )}
                <Text style={styles.dateText}>
                  {new Date(selectedReport.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                </Text>
              </View>
            </View>

            {/* ── Reopen Callout (If Resolved) ── */}
            {isResolved && (
              <View style={styles.resolvedBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resolvedTitle}>Ticket Marked Resolved</Text>
                  <Text style={styles.resolvedSub}>If the issue still persists, you can reopen it.</Text>
                </View>
                <TouchableOpacity
                  style={styles.reopenBtn}
                  onPress={() => setReopenModal(true)}
                >
                  <Ionicons name="refresh" size={14} color="#fff" />
                  <Text style={styles.reopenBtnText}>Reopen</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Discussion Section Divider ── */}
            <View style={styles.sectionDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>DISCUSSION & TIMELINE</Text>
              <View style={styles.dividerLine} />
            </View>

            {timeline.length === 0 && (
              <Text style={styles.emptyChatText}>
                No messages exchanged yet. Send a message to the department representative below.
              </Text>
            )}

            {timeline.map((item, idx) => {
              if (item.type === 'event') {
                const ev = item.data as ReportEvent;
                const color = STATUS_COLOR[ev.status] ?? Colors.textMuted;
                return (
                  <View key={`evt-${idx}`} style={styles.systemMsg}>
                    <View style={[styles.systemDot, { backgroundColor: color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.systemStatus, { color }]}>
                        {ev.status.replace('_', ' ')}
                      </Text>
                      {ev.note && <Text style={styles.systemNote}>{ev.note}</Text>}
                      <Text style={styles.systemMeta}>
                        By {ev.actor_name} · {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              }

              const msg = item.data as ReportMessage;
              const isMe = msg.sender_role === 'student';
              return (
                <View key={`msg-${msg.id}`} style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                  <Text style={[styles.bubbleSender, isMe ? styles.bubbleSenderMe : styles.bubbleSenderThem]}>
                    {msg.sender_name} {isMe ? '(You)' : `(${msg.sender_role.toUpperCase()})`}
                  </Text>
                  <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{msg.body}</Text>
                  <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {/* ── Chat Input ── */}
          <View style={[styles.inputBar, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 10) : 10 }]}>
            <TextInput
              style={styles.chatInput}
              placeholder={
                isResolved
                  ? 'Report is resolved. Reopen to reply…'
                  : 'Message department representative…'
              }
              placeholderTextColor={Colors.textLight}
              value={chatInput}
              onChangeText={setChatInput}
              editable={!isResolved}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!chatInput.trim() || sendingMsg || isResolved) && styles.sendBtnDisabled,
              ]}
              onPress={handleSendMessage}
              disabled={!chatInput.trim() || sendingMsg || isResolved}
            >
              {sendingMsg ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="send" size={16} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* ── Reopen Modal ── */}
        <Modal visible={reopenModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>🔄 Reopen Ticket</Text>
              <Text style={styles.modalSub}>
                Explain why this issue is still unresolved so the representative can take further action.
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. The issue occurred again this afternoon…"
                placeholderTextColor={Colors.textLight}
                value={reopenNote}
                onChangeText={setReopenNote}
                multiline
                numberOfLines={3}
              />
              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => { setReopenModal(false); setReopenNote(''); }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalConfirmRed}
                  onPress={handleConfirmReopen}
                  disabled={reopening}
                >
                  {reopening ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Confirm Reopen</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ==========================================
  // VIEW 2: CREATE NEW REPORT VIEW
  // ==========================================
  if (isCreatingNew) {
    return (
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingTop: topPadding }]}>
          <TouchableOpacity onPress={handleBackToList} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.topTitle}>File a Campus Report</Text>
            <Text style={styles.topSub}>Official Department Routing</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.formLabel}>Describe the Problem *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What is the problem, location, classroom number, or specific concern?"
            placeholderTextColor={Colors.textLight}
            value={newDescription}
            onChangeText={setNewDescription}
            onBlur={() => triggerAiRouting(newDescription)}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {checkingAi ? (
            <View style={styles.aiLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.aiLoadingText}>AI is analyzing your report &amp; department assignment...</Text>
            </View>
          ) : aiRouting ? (
            <View style={styles.aiBadge}>
              <View style={styles.aiHeader}>
                <Ionicons name="sparkles" size={16} color="#15803d" />
                <Text style={styles.aiTitle}>AI Suggested Department</Text>
                <Text style={styles.confidenceScore}>
                  {Math.round(aiRouting.confidence * 100)}% Match
                </Text>
              </View>
              <Text style={styles.aiDeptName}>{aiRouting.department_name}</Text>
            </View>
          ) : null}

          <Text style={styles.formLabel}>Summary Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Short summary (e.g. Broken AC in Lab 302)"
            placeholderTextColor={Colors.textLight}
            value={newTitle}
            onChangeText={setNewTitle}
          />

          <Text style={styles.formLabel}>Assign to Department</Text>
          <View style={styles.deptContainer}>
            {departments.map((dept) => {
              const isSelected = selectedDeptId === dept.id;
              return (
                <TouchableOpacity
                  key={dept.id}
                  style={[styles.deptChipBtn, isSelected && styles.deptChipBtnSelected]}
                  onPress={() => setSelectedDeptId(dept.id)}
                >
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'business-outline'}
                    size={14}
                    color={isSelected ? '#ffffff' : Colors.textMuted}
                  />
                  <Text style={[styles.deptChipBtnText, isSelected && styles.deptChipBtnTextSelected]}>
                    {dept.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.formLabel}>Photo Proof (Optional)</Text>
          {imageUri ? (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              <TouchableOpacity style={styles.removeImageBtn} onPress={() => setImageUri(null)}>
                <Ionicons name="close-circle" size={24} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.uploadButton} onPress={handlePickImage}>
              <Ionicons name="camera-outline" size={20} color={Colors.primary} />
              <Text style={styles.uploadButtonText}>Attach Photo</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleCreateSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.submitButtonText}>Submit Report</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ==========================================
  // VIEW 3: REPORTS LIST VIEW
  // ==========================================
  const renderReportItem = ({ item }: { item: Report }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleOpenReport(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <StatusBadge status={item.status} />
        <Text style={styles.cardDateText}>
          {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.desc} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={styles.cardFooter}>
        <View style={styles.deptBadge}>
          <Ionicons name="business-outline" size={12} color={Colors.textMuted} />
          <Text style={styles.deptText}>{item.department_name || 'Assigned Department'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header title="My Reports" subtitle="Track issues and chat with representatives" />

      {loadingList ? (
        <LoadingSpinner message="Loading your reports..." />
      ) : reports.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No Reports Filed"
          description="Have an issue with infrastructure, academics, hostel, or canteen? Submit a report to get it resolved."
          actionText="File New Report"
          onAction={() => setIsCreatingNew(true)}
        />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          renderItem={renderReportItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setIsCreatingNew(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={24} color="#ffffff" />
        <Text style={styles.fabText}>Report Issue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  topTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  topSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  deleteBtn: { padding: 6 },
  primaryBackBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },

  keyboardContainer: {
    flex: 1,
  },

  // Status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  deptChip: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  aiChipText: { fontSize: 10, fontWeight: '700', color: '#15803d' },
  dateText: { fontSize: 11, color: Colors.textMuted },

  // Description Card
  descCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  descText: { fontSize: 13, color: Colors.text, lineHeight: 20, marginBottom: 8 },
  attachedImage: { width: '100%', height: 180, borderRadius: 8, marginBottom: 10 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
    marginTop: 4,
  },
  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reporterText: { fontSize: 12, color: Colors.textMuted },

  // Resolved Callout
  resolvedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    gap: 10,
  },
  resolvedTitle: { fontSize: 12, fontWeight: '700', color: '#065f46' },
  resolvedSub: { fontSize: 11, color: '#047857', marginTop: 1 },
  reopenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  reopenBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Discussion Section Divider
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },

  // Chat
  chatScroll: { flex: 1 },
  chatContent: { padding: 14, paddingBottom: 16, gap: 8 },
  emptyChatText: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    marginVertical: 20,
  },

  // Bubbles
  bubble: {
    maxWidth: '82%',
    borderRadius: 14,
    padding: 10,
    marginBottom: 2,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderBottomLeftRadius: 4,
  },
  bubbleSender: { fontSize: 10, fontWeight: '700', marginBottom: 3 },
  bubbleSenderMe: { color: '#bfdbfe' },
  bubbleSenderThem: { color: Colors.info },
  bubbleText: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { fontSize: 9, color: Colors.textMuted, alignSelf: 'flex-end', marginTop: 4 },
  bubbleTimeMe: { color: '#93c5fd' },

  // System events
  systemMsg: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  systemDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  systemStatus: { fontSize: 12, fontWeight: '700' },
  systemNote: { fontSize: 12, color: Colors.text, marginTop: 1, fontStyle: 'italic' },
  systemMeta: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },

  // Chat Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    color: Colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#cbd5e1' },

  // Reopen Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  modalSub: { fontSize: 13, color: Colors.textMuted, marginBottom: 14, lineHeight: 18 },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: Colors.text,
    marginBottom: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  modalConfirmRed: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    alignItems: 'center',
  },
  modalConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // List View Styles
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardDateText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  desc: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  deptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deptText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 28,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Form Styles
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  textArea: {
    minHeight: 90,
  },
  aiLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginTop: 8,
  },
  aiLoadingText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  aiBadge: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
    flex: 1,
  },
  confidenceScore: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
  aiDeptName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
    marginTop: 4,
  },
  deptContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  deptChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deptChipBtnSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  deptChipBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text,
  },
  deptChipBtnTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primaryLight,
    borderRadius: 8,
    padding: 14,
    marginTop: 4,
  },
  uploadButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  imagePreviewContainer: {
    position: 'relative',
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
