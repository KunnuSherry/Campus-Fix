import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Header } from '../../components/Header';
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

export default function DocumentUploadScreen() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Circular');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; size?: number } | null>(null);

  // Ingestion Preview States
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
    } catch (e: any) {
      showAlert('Publish Error', e.message || 'Failed to publish document.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Upload Document" subtitle="Add circulars, rules, notices to Assist RAG" />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Document Metadata Form */}
        <View style={styles.card}>
          <Text style={styles.label}>Document Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Mid-Semester Exam Schedule 2026"
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
                <Text style={[styles.catText, category === cat && styles.catTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Effective Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            placeholder="2026-03-01"
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
                <Text style={styles.fileSize}>Ready for PyMuPDF &amp; OCR processing</Text>
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

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Total Pages: <Text style={{ fontWeight: '700' }}>{previewData.total_pages}</Text></Text>
              <Text style={styles.metaText}>
                OCR Required:{' '}
                <Text style={{ fontWeight: '700', color: previewData.used_ocr ? Colors.accent : Colors.success }}>
                  {previewData.used_ocr ? `Yes (Pages: ${previewData.ocr_pages.join(', ')})` : 'No (Direct Text)'}
                </Text>
              </Text>
            </View>

            <Text style={styles.label}>Extracted Text (Edit / Correct OCR before publishing):</Text>
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
  card: {
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
  catText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  catTextActive: {
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
    marginBottom: 16,
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metaText: {
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
