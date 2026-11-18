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
import { Report, ReportMessage, ReportEvent } from '../../../shared/types';
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

export default function RepInboxScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web'
    ? 12
    : Math.max(insets.top, Platform.OS === 'android' ? 28 : 16);

  // List State
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');

  // Selected Report State (Immediate Detail View without fragile route hopping)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(params?.id || null);
  const [selectedReport, setSelectedReport] = useState<(Report & { messages: ReportMessage[]; events: ReportEvent[] }) | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Status Modal State
  const [statusModal, setStatusModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'IN_PROGRESS' | 'RESOLVED' | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const scrollViewRef = useRef<any>(null);

  // Sync params if passed from external navigation
  useEffect(() => {
    if (params?.id) {
      setSelectedReportId(params.id);
    }
  }, [params?.id]);

  // Fetch Inbox List
  const fetchReports = async () => {
    try {
      const data = await api.getReports();
      setReports(data);
    } catch (e) {
      console.warn('Failed to load rep inbox:', e);
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

  // Fetch Report Detail when selected
  const fetchReportDetail = async (reportId: string) => {
    try {
      const data = await api.getReportDetails(reportId);
      setSelectedReport(data);
      setDetailError(null);
    } catch (e: any) {
      console.warn('Failed to load report detail:', e);
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

  const handleOpenReport = (id: string) => {
    setSelectedReportId(id);
  };

  const handleBackToList = () => {
    setSelectedReportId(null);
    setSelectedReport(null);
    fetchReports();
  };

  // Send message
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

  // Status Change
  const openStatusModal = (status: 'IN_PROGRESS' | 'RESOLVED') => {
    setPendingStatus(status);
    setStatusNote(
      status === 'RESOLVED'
        ? 'Issue has been verified and resolved.'
        : 'Representative is actively investigating this issue.'
    );
    setStatusModal(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedReportId || !pendingStatus) return;
    setUpdatingStatus(true);
    try {
      await api.updateReportStatus(selectedReportId, pendingStatus, statusNote.trim() || undefined);
      setStatusModal(false);
      setStatusNote('');
      await fetchReportDetail(selectedReportId);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Delete
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
      if (window.confirm('Delete this report from department records?')) doDelete();
    } else {
      Alert.alert('Delete Report', 'Permanently delete this report?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
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
          <LoadingSpinner message="Fetching report details and messages..." />
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
              {detailError || 'Report not found or not in your department.'}
            </Text>
            <TouchableOpacity style={styles.primaryBackBtn} onPress={handleBackToList}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Return to Inbox</Text>
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
              Ticket #{selectedReport.id.slice(-6).toUpperCase()} · {selectedReport.student_display_name}
            </Text>
          </View>
          <TouchableOpacity onPress={handleDeleteReport} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
          style={styles.keyboardContainer}
        >
          {/* ── Chat Thread & Report Details inside ScrollView ── */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
          >
            {/* ── Description Card ── */}
            <View style={styles.descCard}>
              <Text style={styles.descText}>{selectedReport.description}</Text>
              {selectedReport.image_url && (
                <Image source={{ uri: selectedReport.image_url }} style={styles.attachedImage} resizeMode="cover" />
              )}
              <View style={styles.metaRow}>
                <View style={styles.reporterRow}>
                  <Ionicons name="person-circle-outline" size={15} color={Colors.textMuted} />
                  <Text style={styles.reporterText}>
                    Filed by Student: <Text style={{ color: Colors.primary, fontWeight: '700' }}>{selectedReport.student_display_name}</Text>
                  </Text>
                </View>
                <Text style={styles.dateText}>
                  {new Date(selectedReport.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                </Text>
              </View>
            </View>

            {/* ── Rep Action Buttons ── */}
            {!isResolved && (
              <View style={styles.actionRow}>
                {selectedReport.status !== 'IN_PROGRESS' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnProgress]}
                    onPress={() => openStatusModal('IN_PROGRESS')}
                  >
                    <Ionicons name="hammer-outline" size={14} color="#fff" />
                    <Text style={styles.actionBtnText}>Mark In Progress</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnResolve]}
                  onPress={() => openStatusModal('RESOLVED')}
                >
                  <Ionicons name="checkmark-done" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>Resolve Issue</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Section Divider ── */}
            <View style={styles.sectionDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>DISCUSSION & TIMELINE</Text>
              <View style={styles.dividerLine} />
            </View>

            {timeline.length === 0 && (
              <Text style={styles.emptyChatText}>
                No messages yet. Send a message to {selectedReport.student_display_name} below.
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
              const isMe = msg.sender_role === 'rep' || msg.sender_role === 'admin';
              return (
                <View key={`msg-${msg.id}`} style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                  <Text style={[styles.bubbleSender, isMe ? styles.bubbleSenderMe : styles.bubbleSenderThem]}>
                    {msg.sender_name} {isMe ? '(You)' : `(${msg.sender_role})`}
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
                  : `Reply to ${selectedReport.student_display_name}…`
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

        {/* ── Status Change Modal ── */}
        <Modal visible={statusModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {pendingStatus === 'RESOLVED' ? '✅ Resolve Report' : '🔧 Mark In Progress'}
              </Text>
              <Text style={styles.modalSub}>
                Add an optional note — it will appear directly in the ticket thread for the student.
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Note (optional)…"
                placeholderTextColor={Colors.textLight}
                value={statusNote}
                onChangeText={setStatusNote}
                multiline
                numberOfLines={3}
              />
              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => { setStatusModal(false); setStatusNote(''); }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalConfirm,
                    pendingStatus === 'RESOLVED' ? styles.modalConfirmGreen : styles.modalConfirmAmber,
                  ]}
                  onPress={handleUpdateStatus}
                  disabled={updatingStatus}
                >
                  {updatingStatus ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalConfirmText}>
                      {pendingStatus === 'RESOLVED' ? 'Confirm Resolved' : 'Confirm In Progress'}
                    </Text>
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
  // VIEW 2: INBOX LIST VIEW
  // ==========================================
  const filteredReports = reports.filter((r) => {
    if (filter === 'ALL') return true;
    return r.status === filter;
  });

  const renderReportItem = ({ item }: { item: Report }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleOpenReport(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <StatusBadge status={item.status} />
        <Text style={styles.dateText}>
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
        <View style={styles.reporterBadge}>
          <Ionicons name="person-circle-outline" size={14} color={Colors.primary} />
          <Text style={styles.reporterName}>Student: {item.student_display_name}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header title="Department Inbox" subtitle="Assigned Student Issues" />

      {/* Filter Tabs */}
      <View style={styles.filterBar}>
        {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loadingList ? (
        <LoadingSpinner message="Loading assigned issues..." />
      ) : filteredReports.length === 0 ? (
        <EmptyState
          icon="file-tray-outline"
          title="No Reports Found"
          description="There are currently no reports matching this filter."
        />
      ) : (
        <FlatList
          data={filteredReports}
          keyExtractor={(item) => item.id}
          renderItem={renderReportItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
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

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnProgress: { backgroundColor: '#d97706' },
  btnResolve: { backgroundColor: '#16a34a' },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Section Divider
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
  bubbleSenderThem: { color: Colors.primary },
  bubbleText: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { fontSize: 9, color: Colors.textMuted, alignSelf: 'flex-end', marginTop: 4 },
  bubbleTimeMe: { color: '#93c5fd' },

  // System events in chat
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

  // Input
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

  // Modal
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
  modalConfirm: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalConfirmGreen: { backgroundColor: '#16a34a' },
  modalConfirmAmber: { backgroundColor: '#d97706' },
  modalConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // List View Styles
  filterBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  filterTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
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
  reporterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reporterName: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
});
