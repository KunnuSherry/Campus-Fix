import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UserProfile,
  Report,
  ReportMessage,
  ModerationResult,
  RoutingResult,
  CollegeDocument,
  Department,
  Teacher
} from '../../shared/types';

// Automatically use direct localhost on browser for instant connection; use EXPO_PUBLIC_API_URL on mobile
const getBaseUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:8000';
  }
  return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
};
const API_BASE_URL = getBaseUrl();

class ApiService {
  private token: string | null = (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage)
    ? window.localStorage.getItem('campusfix_token')
    : null;

  async setToken(token: string | null) {
    this.token = token;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      if (token) {
        window.localStorage.setItem('campusfix_token', token);
      } else {
        window.localStorage.removeItem('campusfix_token');
      }
    }
    try {
      if (token) {
        await AsyncStorage.setItem('campusfix_token', token);
      } else {
        await AsyncStorage.removeItem('campusfix_token');
      }
    } catch {}
  }

  async loadStoredToken(): Promise<string | null> {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const webToken = window.localStorage.getItem('campusfix_token');
      if (webToken) {
        this.token = webToken;
        return webToken;
      }
    }
    try {
      const stored = await AsyncStorage.getItem('campusfix_token');
      this.token = stored;
      return stored;
    } catch {
      return null;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.token) {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        this.token = window.localStorage.getItem('campusfix_token');
      }
      if (!this.token) {
        this.token = await this.loadStoredToken();
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const url = `${API_BASE_URL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(url, { ...options, headers, signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'An unexpected error occurred. Please try again.');
      }
      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  }

  // ==========================================
  // Auth & Onboarding
  // ==========================================

  async checkDomain(email: string) {
    return this.request<{ allowed: boolean; college_id?: string; college_name?: string; message: string }>(
      '/auth/check-domain',
      { method: 'POST', body: JSON.stringify({ email }) }
    );
  }

  async sendOtp(email: string) {
    return this.request<{ success: boolean; message: string; debug_code?: string }>(
      '/auth/send-otp',
      { method: 'POST', body: JSON.stringify({ email }) }
    );
  }

  async verifyOtp(email: string, code: string, fullName?: string, password?: string) {
    const res = await this.request<{
      success: boolean;
      token: string;
      user_id: string;
      role: 'student' | 'rep' | 'admin' | 'superadmin';
      college_id: string;
      pseudonym: string;
      full_name?: string;
      email: string;
    }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, full_name: fullName, password }),
    });
    if (res.token) {
      await this.setToken(res.token);
    }
    return res;
  }

  async studentLogin(email: string, password: string) {
    const res = await this.request<{
      success: boolean;
      token: string;
      user_id: string;
      role: 'student' | 'rep' | 'admin' | 'superadmin';
      college_id: string;
      pseudonym: string;
      full_name?: string;
      email: string;
    }>('/auth/student-login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.token) {
      await this.setToken(res.token);
    }
    return res;
  }

  async staffLogin(email: string, password: string) {
    const res = await this.request<{
      success: boolean;
      token: string;
      user_id: string;
      role: 'student' | 'rep' | 'admin' | 'superadmin';
      college_id: string;
      pseudonym: string;
      full_name?: string;
      email: string;
    }>('/auth/staff-login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.token) {
      await this.setToken(res.token);
    }
    return res;
  }

  async getMyProfile(): Promise<UserProfile> {
    return this.request<UserProfile>('/auth/me');
  }

  // ==========================================
  // Assist RAG Chatbot
  // ==========================================

  async askAssist(question: string) {
    return this.request<{
      answered: boolean;
      answer: string;
      citations: Array<{ document_id: string; title: string; page: number; category: string; score: number }>;
      confidence_score: number;
      suggested_department_id?: string;
      suggested_department_name?: string;
      can_create_report: boolean;
    }>('/assist/ask', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  }

  // ==========================================
  // Reports
  // ==========================================

  async routeIssuePreview(description: string): Promise<RoutingResult> {
    return this.request<RoutingResult>('/reports/route', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  }

  async createReport(data: { title: string; description: string; department_id?: string; image_url?: string }) {
    return this.request<Report>('/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getReports(): Promise<Report[]> {
    return this.request<Report[]>('/reports');
  }

  async getReportDetails(reportId: string): Promise<Report & { messages: ReportMessage[]; events: any[] }> {
    return this.request<Report & { messages: ReportMessage[]; events: any[] }>(`/reports/${reportId}`);
  }

  async updateReportStatus(reportId: string, status: string, note?: string) {
    return this.request<Report>(`/reports/${reportId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    });
  }

  async postReportMessage(reportId: string, body: string): Promise<ReportMessage> {
    return this.request<ReportMessage>(`/reports/${reportId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async deleteReport(reportId: string) {
    return this.request<{ success: boolean; message: string }>(`/reports/${reportId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Community & Moderation
  // ==========================================

  async moderateAndPublishCommunityMessage(body: string) {
    return this.request<{
      success: boolean;
      moderation: ModerationResult;
      message_id?: string;
      published_message?: { id: string; college_id: string; pseudonym: string; body: string; created_at: string };
    }>('/community/publish', {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async getCommunityMessages(limit: number = 50) {
    return this.request<Array<{
      id: string;
      college_id: string;
      pseudonym: string;
      body: string;
      upvotes: number;
      user_has_upvoted: boolean;
      created_at: string;
    }>>(
      `/community/messages?limit=${limit}`
    );
  }

  async upvoteCommunityMessage(messageId: string) {
    return this.request<{ success: boolean; upvotes: number; user_has_upvoted: boolean }>(
      `/community/messages/${messageId}/upvote`,
      { method: 'POST' }
    );
  }

  async reportCommunityMessage(messageId: string, reason: string) {
    return this.request<{ success: boolean; message: string }>('/community/report-message', {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId, reason }),
    });
  }

  async deleteCommunityMessage(messageId: string) {
    return this.request<{ success: boolean; message: string }>(`/community/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Documents & OCR
  // ==========================================

  async uploadDocumentPreview(formData: FormData) {
    // Always re-load token from localStorage on web before upload (in case of page refresh)
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem('campusfix_token');
      if (stored) this.token = stored;
    }
    if (!this.token) {
      this.token = await this.loadStoredToken();
    }
    const headers: Record<string, string> = {
      'ngrok-skip-browser-warning': 'true',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const res = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let errMsg = 'Upload failed';
      if (typeof data.detail === 'string') {
        errMsg = data.detail;
      } else if (Array.isArray(data.detail)) {
        errMsg = data.detail.map((d: any) => `${d.loc?.slice(-1)[0] || 'field'}: ${d.msg}`).join(', ');
      }
      throw new Error(errMsg);
    }
    return data;
  }

  async publishDocument(documentId: string, correctedText?: string) {
    return this.request<{ success: boolean; document_id: string; chunks_stored: number; status: string }>(
      '/documents/publish',
      {
        method: 'POST',
        body: JSON.stringify({ document_id: documentId, corrected_text: correctedText }),
      }
    );
  }

  async getDocuments(): Promise<any[]> {
    return this.request<any[]>('/documents');
  }

  async deleteDocument(docId: string) {
    return this.request<{ success: boolean; message: string }>(`/documents/${docId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Admin & Management
  // ==========================================

  async getDepartments(): Promise<Department[]> {
    return this.request<Department[]>('/admin/departments');
  }

  async createDepartment(name: string, description: string): Promise<Department> {
    return this.request<Department>('/admin/departments', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  async updateDepartment(deptId: string, data: { name?: string; description?: string }): Promise<Department> {
    return this.request<Department>(`/admin/departments/${deptId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteDepartment(deptId: string) {
    return this.request<{ success: boolean; message: string }>(`/admin/departments/${deptId}`, {
      method: 'DELETE',
    });
  }

  async getRepresentatives(): Promise<any[]> {
    return this.request<any[]>('/admin/reps');
  }

  async createRepresentative(data: { email: string; full_name: string; department_id: string; password?: string }) {
    return this.request<any>('/admin/reps', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRepresentative(repId: string, data: { full_name?: string; department_id?: string }) {
    return this.request<any>(`/admin/reps/${repId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRepresentative(repId: string) {
    return this.request<{ success: boolean; message: string }>(`/admin/reps/${repId}`, {
      method: 'DELETE',
    });
  }

  async getTeachers(): Promise<Teacher[]> {
    return this.request<Teacher[]>('/admin/teachers');
  }

  async createTeacher(name: string, aliases: string[]): Promise<Teacher> {
    return this.request<Teacher>('/admin/teachers', {
      method: 'POST',
      body: JSON.stringify({ name, aliases }),
    });
  }

  async deleteTeacher(teacherId: string) {
    return this.request<{ success: boolean; message: string }>(`/admin/teachers/${teacherId}`, {
      method: 'DELETE',
    });
  }

  async getFlaggedMessages(): Promise<any[]> {
    return this.request<any[]>('/admin/flagged-messages');
  }

  async resolveFlaggedMessage(messageId: string, action: 'dismiss' | 'delete' = 'dismiss') {
    return this.request<{ success: boolean; message: string }>(
      `/admin/flagged-messages/${messageId}/resolve?action=${action}`,
      { method: 'POST' }
    );
  }

  async askAdminInsights(question: string, days: number = 7) {
    return this.request<{ answer: string; insights_data: any }>('/insights/ask', {
      method: 'POST',
      body: JSON.stringify({ question, days }),
    });
  }

  async getOverviewStats() {
    return this.request<{
      report_stats: any;
      top_issues: any[];
      trending_questions: any[];
      teacher_mentions: any[];
    }>('/insights/stats');
  }

  async getColleges() {
    return this.request<any[]>('/admin/colleges');
  }

  async createCollege(data: { name: string; domain: string; admin_email: string; admin_name: string; admin_password?: string }) {
    return this.request<any>('/admin/colleges', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCollege(collegeId: string, data: {
    name?: string;
    domain?: string;
    admin_email?: string;
    admin_name?: string;
    admin_password?: string;
  }) {
    return this.request<any>(`/admin/colleges/${collegeId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCollege(collegeId: string) {
    return this.request<{ success: boolean; message: string }>(`/admin/colleges/${collegeId}`, {
      method: 'DELETE',
    });
  }

  async getAdmins() {
    return this.request<any[]>('/admin/admins');
  }

  async createAdmin(data: { email: string; full_name: string; college_id: string; password?: string }) {
    return this.request<any>('/admin/admins', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteAdmin(adminId: string) {
    return this.request<{ success: boolean; message: string }>(`/admin/admins/${adminId}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiService();

