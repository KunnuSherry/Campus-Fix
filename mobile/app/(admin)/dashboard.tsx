import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Header } from '../../components/Header';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import { FormattedText } from '../../components/FormattedText';
import { Ionicons } from '@expo/vector-icons';

export default function AdminDashboardScreen() {
  const [statsData, setStatsData] = useState<{
    report_stats: { total_reports: number; open: number; in_progress: number; resolved: number; reopened: number };
    top_issues: Array<{ issue: string; count: number }>;
    trending_questions: Array<{ topic: string; question_count: number }>;
    teacher_mentions: Array<{ teacher_name: string; distinct_student_mentions: number; disclaimer: string }>;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Insights Chatbot
  const [insightQuery, setInsightQuery] = useState('');
  const [insightAnswer, setInsightAnswer] = useState<string | null>(null);
  const [querying, setQuerying] = useState(false);

  const fetchStats = async () => {
    try {
      const data = await api.getOverviewStats();
      setStatsData(data as any);
    } catch (e) {
      console.warn('Failed to load dashboard stats:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const handleAskInsights = async (q?: string) => {
    const query = (q || insightQuery).trim();
    if (!query || querying) return;

    setQuerying(true);
    setInsightAnswer(null);
    try {
      const res = await api.askAdminInsights(query);
      setInsightAnswer(res.answer);
    } catch (e: any) {
      setInsightAnswer('Error analyzing metrics: ' + (e.message || 'Please try again.'));
    } finally {
      setQuerying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Admin Insights" subtitle="Privacy-preserving aggregate metrics" />
        <LoadingSpinner message="Aggregating campus analytics..." />
      </View>
    );
  }

  const rStats = statsData?.report_stats || { total_reports: 0, open: 0, in_progress: 0, resolved: 0, reopened: 0 };

  return (
    <View style={styles.container}>
      <Header title="Admin Insights" subtitle="Operational Dashboard &amp; Analytics" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* KPI Stat Cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: Colors.primary }]}>
            <Text style={styles.statNumber}>{rStats.total_reports}</Text>
            <Text style={styles.statLabel}>Total Reports</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: Colors.warning }]}>
            <Text style={[styles.statNumber, { color: Colors.warning }]}>{rStats.open}</Text>
            <Text style={styles.statLabel}>Open</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: Colors.info }]}>
            <Text style={[styles.statNumber, { color: Colors.info }]}>{rStats.in_progress}</Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: Colors.success }]}>
            <Text style={[styles.statNumber, { color: Colors.success }]}>{rStats.resolved}</Text>
            <Text style={styles.statLabel}>Resolved</Text>
          </View>
        </View>

        {/* AI Admin Insights Chatbot */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Ask CampusFix Admin Insights AI</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Queries safe aggregate data functions (top_issues, report_stats, trending_questions). Never reads raw student messages.
          </Text>

          <View style={styles.queryInputRow}>
            <TextInput
              style={styles.queryInput}
              placeholder="e.g. What are the most common issues students discussed this week?"
              placeholderTextColor={Colors.textLight}
              value={insightQuery}
              onChangeText={setInsightQuery}
              onSubmitEditing={() => handleAskInsights()}
            />
            <TouchableOpacity
              style={[styles.queryBtn, (!insightQuery.trim() || querying) && styles.queryBtnDisabled]}
              onPress={() => handleAskInsights()}
              disabled={!insightQuery.trim() || querying}
            >
              {querying ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Quick Questions */}
          <View style={styles.quickQuestions}>
            {[
              'What feedback are students giving about faculty or teachers?',
              'Are there complaints regarding study materials or facilities?',
              'What are the report resolution statistics?',
            ].map((q, idx) => (
              <TouchableOpacity key={idx} style={styles.quickQ} onPress={() => { setInsightQuery(q); handleAskInsights(q); }}>
                <Text style={styles.quickQText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Answer Box */}
          {insightAnswer && (
            <View style={styles.answerBox}>
              <View style={styles.answerHeader}>
                <Ionicons name="document-text-outline" size={16} color="#0f172a" />
                <Text style={styles.answerTitle}>Executive Briefing</Text>
              </View>
              <FormattedText content={insightAnswer} />
            </View>
          )}
        </View>

        {/* Top Student Issues */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Top Trending Campus Issues (7 Days)</Text>
          {statsData?.top_issues && statsData.top_issues.length > 0 ? (
            statsData.top_issues.map((item, idx) => (
              <View key={idx} style={styles.issueRow}>
                <Text style={styles.issueName}>{item.issue}</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{item.count} mentions</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No issue trends detected yet.</Text>
          )}
        </View>

        {/* Teacher Mentions (With 5-Student Threshold Rule) */}
        <View style={styles.card}>
          <View style={styles.teacherHeader}>
            <Text style={styles.sectionTitle}>Faculty Mentions (Aggregate)</Text>
            <View style={styles.thresholdBadge}>
              <Text style={styles.thresholdText}>Min 5 Distinct Students</Text>
            </View>
          </View>
          <Text style={styles.privacyNote}>
            Privacy Rule: Mentions require at least 5 distinct students before appearing. No quotes or names are ever exposed.
          </Text>

          {statsData?.teacher_mentions && statsData.teacher_mentions.length > 0 ? (
            statsData.teacher_mentions.map((t, idx) => (
              <View key={idx} style={styles.teacherCard}>
                <Text style={styles.teacherName}>{t.teacher_name}</Text>
                <Text style={styles.teacherCount}>{t.distinct_student_mentions} distinct student discussions</Text>
                <Text style={styles.disclaimerText}>{t.disclaimer}</Text>
              </View>
            ))
          ) : (
            <View style={styles.noTeacherBox}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.success} />
              <Text style={styles.noTeacherText}>
                No faculty members have reached the 5 distinct student discussion threshold.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 1,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 16,
    marginBottom: 12,
  },
  queryInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  queryInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.text,
  },
  queryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  queryBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  quickQuestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  quickQ: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  quickQText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
  },
  answerBox: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 8,
    padding: 12,
    marginTop: 6,
  },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  answerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
  },
  answerText: {
    fontSize: 13,
    color: '#0f172a',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  issueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  issueName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  countBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  teacherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  thresholdBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  thresholdText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309',
  },
  privacyNote: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 10,
  },
  teacherCard: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  teacherName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  teacherCount: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  disclaimerText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: Colors.accent,
    marginTop: 4,
  },
  noTeacherBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
  },
  noTeacherText: {
    flex: 1,
    fontSize: 12,
    color: '#166534',
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
  },
});

