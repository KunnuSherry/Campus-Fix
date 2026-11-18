import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Header } from '../../components/Header';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { Colors } from '../../constants/theme';
import { api } from '../../services/api';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';

const showAlert = (title: string, message?: string) => {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(message ? `${title}: ${message}` : title);
  } else {
    Alert.alert(title, message);
  }
};

type DocTab = 'list' | 'upload';

export default function AdminDocumentsScreen() {
  const [activeTab, setActiveTab] = useState<DocTab>('list');
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Upload state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Circular');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; size?: number } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    document_id: string;
    total_pages: number;
    used_ocr: boolean;
    ocr_pages: number[];
    extracted_text_preview: string;
  } | null>(null);
  const [correctedText, setCorrectedText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const fetchDocs = async () => {
    try {
      const data = await api.getDocuments();
      setDocs(data);
    } catch (e) {
      console.warn('Failed to load documents:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleDeleteDoc = (docId: string, docTitle: string) => {
    const doDelete = async () => {
      try {
        await api.deleteDocument(docId);
        await fetchDocs();
        showAlert('Deleted', `Document "${docTitle}" removed from RAG index.`);
      } catch (e: any) {
        showAlert('Error', e.message || 'Failed to delete document.');
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Delete document "${docTitle}" and its RAG vector chunks?`)) doDelete();
    } else {
      Alert.alert('Confirm Delete', `Delete document "${docTitle}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        setSelectedFile(res.assets[0]);
        setPreviewData(null);
        setPublishSuccess(false);
      }
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to pick file.');
    }
  };

  const handleUploadAndExtract = async () => {
    if (!title.trim() || !selectedFile) {
      showAlert('Missing Info', 'Please enter a document title and select a PDF file.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('category', category);
      formData.append('effective_date', effectiveDate);

      const fileName = selectedFile.name || 'document.pdf';
      const fileMime = (selectedFile as any).mimeType || 'application/pdf';

      if (Platform.OS === 'web') {
        const blobRes = await fetch(selectedFile.uri);
        const blob = await blobRes.blob();
        const file = new File([blob], fileName, { type: fileMime });
        formData.append('file', file);
      } else {
        // Native mobile (Android / iOS):
        // Read file bytes to support Expo 58 Winter fetch (bytes) and RN native fetch ({ uri, name, type })
        let fileAppended = false;
        try {
          const blobRes = await fetch(selectedFile.uri);
          const arrayBuffer = await blobRes.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          const filePart: any = {
            uri: selectedFile.uri,
            name: fileName,
            type: fileMime || 'application/pdf',
            bytes: async () => bytes,
          };
          formData.append('file', filePart);
          fileAppended = true;
        } catch (fetchErr) {
          console.warn('Could not read file bytes via fetch:', fetchErr);
        }

        if (!fileAppended) {
          formData.append('file', {
            uri: selectedFile.uri,
            name: fileName,
            type: fileMime || 'application/pdf',
          } as any);
        }
      }

      const preview = await api.uploadDocumentPreview(formData);
      setPreviewData(preview);
      setCorrectedText(preview.extracted_text_preview);
    } catch (e: any) {
      showAlert('Upload Failed', e.message || 'Unable to extract document text.');
    } finally {
      setUploading(false);
    }
  };

  const handlePublish = async () => {
    if (!previewData) return;
    setPublishing(true);
    try {
      await api.publishDocument(previewData.document_id, correctedText);
      setPublishSuccess(true);
      showAlert('Published!', 'Document has been chunked, embedded, and added to Assist RAG knowledge base.');
      // Reset form and switch to list tab
      setTitle('');
      setSelectedFile(null);
      setPreviewData(null);
      setPublishSuccess(false);
      await fetchDocs();
      setActiveTab('list');
    } catch (e: any) {
      showAlert('Publish Error', e.message || 'Failed to publish document.');
    } finally {
      setPublishing(false);
    }
  };

  const renderDoc = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.catBadge}>
          <Text style={styles.catText}>{item.category}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={styles.dateText}>Effective: {item.effective_date}</Text>
          <TouchableOpacity
            onPress={() => handleDeleteDoc(item.id, item.title)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.docTitle}>{item.title}</Text>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="layers-outline" size={14} color={Colors.primary} />
          <Text style={styles.metaText}>{item.chunks_count || 1} Chunks Embedded</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons
            name={item.used_ocr ? 'scan-outline' : 'document-text-outline'}
            size={14}
            color={item.used_ocr ? Colors.accent : Colors.success}
          />
          <Text style={styles.metaText}>{item.used_ocr ? 'OCR Processed' : 'Direct Text'}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header title="College Documents" subtitle="PDF Ingestion &amp; Assist RAG Knowledge Base" />

      {/* Top Tab Bar: Published Notices vs Upload Notice */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'list' && styles.tabBtnActive]}
          onPress={() => setActiveTab('list')}
        >
          <Ionicons
            name="documents-outline"
            size={16}
            color={activeTab === 'list' ? Colors.primary : Colors.textMuted}
          />
          <Text style={[styles.tabBtnText, activeTab === 'list' && styles.tabBtnTextActive]}>
            Published Circulars ({docs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'upload' && styles.tabBtnActive]}
          onPress={() => setActiveTab('upload')}
        >
          <Ionicons
            name="cloud-upload-outline"
            size={16}
            color={activeTab === 'upload' ? Colors.primary : Colors.textMuted}
          />
          <Text style={[styles.tabBtnText, activeTab === 'upload' && styles.tabBtnTextActive]}>
            + Upload Notice
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'list' ? (
        loading ? (
          <LoadingSpinner message="Loading uploaded circulars..." />
        ) : docs.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="No Documents Uploaded"
            description="Upload circulars, timetables, and rules so the Assist RAG chatbot can answer student queries."
            actionText="Upload First Document"
            onAction={() => setActiveTab('upload')}
          />
        ) : (
          <FlatList
            data={docs}
            keyExtractor={(item) => item.id}
            renderItem={renderDoc}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchDocs();
                }}
                colors={[Colors.primary]}
              />
            }
          />
        )
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            <Text style={styles.label}>Document Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. End Semester Exam Schedule May 2026"
              placeholderTextColor={Colors.textLight}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryRow}>
              {['Circular', 'Examination', 'Timetable', 'Hostel', 'Fee'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catPill, category === cat && styles.catPillActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.catPillText, category === cat && styles.catPillTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Effective Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="2026-05-01"
              placeholderTextColor={Colors.textLight}
              value={effectiveDate}
              onChangeText={setEffectiveDate}
            />

            <Text style={styles.label}>Select PDF File *</Text>
            {selectedFile ? (
              <View style={styles.fileSelectedBox}>
                <Ionicons name="document-text" size={24} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName}>{selectedFile.name}</Text>
                  <Text style={styles.fileSize}>Ready for PyMuPDF &amp; Cloud OCR processing</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedFile(null)}>
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.pickButton} onPress={handlePickDocument}>
                <Ionicons name="cloud-upload-outline" size={24} color={Colors.primary} />
                <Text style={styles.pickButtonText}>Choose PDF Document</Text>
              </TouchableOpacity>
            )}

            {!previewData && (
              <TouchableOpacity
                style={[styles.extractBtn, (!selectedFile || uploading) && styles.btnDisabled]}
                onPress={handleUploadAndExtract}
                disabled={!selectedFile || uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.btnText}>Process PDF &amp; Preview OCR</Text>
                    <Ionicons name="scan-outline" size={18} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* OCR & Extracted Text Preview Card */}
          {previewData && (
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Ionicons name="document-attach" size={20} color={Colors.primary} />
                <Text style={styles.previewTitle}>OCR Extraction Preview</Text>
              </View>

              <View style={styles.metaInfoRow}>
                <Text style={styles.metaInfoText}>
                  Total Pages: <Text style={{ fontWeight: '700' }}>{previewData.total_pages}</Text>
                </Text>
                <Text style={styles.metaInfoText}>
                  OCR Required:{' '}
                  <Text style={{ fontWeight: '700', color: previewData.used_ocr ? Colors.accent : Colors.success }}>
                    {previewData.used_ocr ? `Yes (Pages: ${previewData.ocr_pages.join(', ')})` : 'No (Direct Text)'}
                  </Text>
                </Text>
              </View>

              <Text style={styles.label}>Extracted Text (Edit / Correct text before publishing):</Text>
              <TextInput
                style={[styles.input, styles.ocrTextInput]}
                value={correctedText}
                onChangeText={setCorrectedText}
                multiline
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.publishBtn, (publishing || publishSuccess) && styles.btnDisabled]}
                onPress={handlePublish}
                disabled={publishing || publishSuccess}
              >
                {publishing ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name={publishSuccess ? 'checkmark-circle' : 'rocket-outline'} size={18} color="#ffffff" />
                    <Text style={styles.btnText}>
                      {publishSuccess ? 'Published to RAG Knowledge Base!' : 'Confirm & Publish to Assist RAG'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabBtnTextActive: {
    color: Colors.primary,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 50,
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
  catBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  catText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  docTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  catPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  catPillTextActive: {
    color: '#ffffff',
  },
  pickButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primaryLight,
    backgroundColor: '#eff6ff',
    padding: 20,
    borderRadius: 8,
    marginVertical: 6,
  },
  pickButtonText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '700',
  },
  fileSelectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginVertical: 6,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  fileSize: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  extractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 14,
  },
  btnDisabled: {
    backgroundColor: '#94a3b8',
  },
  btnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  previewCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    marginBottom: 20,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#166534',
  },
  metaInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metaInfoText: {
    fontSize: 12,
    color: '#15803d',
  },
  ocrTextInput: {
    minHeight: 220,
    maxHeight: 380,
    backgroundColor: '#ffffff',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    fontSize: 13,
    lineHeight: 18,
  },
});
