/**
 * CampusFix - Shared Domain Types & Interfaces
 * Shared across Mobile App and Backend documentation/schemas.
 */

export type UserRole = 'student' | 'rep' | 'admin' | 'superadmin';

export type ReportStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REOPENED';

export type ModerationSeverity = 'low' | 'medium' | 'high';

export interface UserProfile {
  id: string;
  college_id: string;
  role: UserRole;
  full_name?: string;
  email: string;
  pseudonym?: string;
  department_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface College {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  active?: boolean;
}

export interface CollegeDomain {
  id: string;
  college_id: string;
  domain: string; // e.g. "bpitindia.in" (without @)
}

export interface Department {
  id: string;
  college_id: string;
  name: string;
  description: string;
  created_at?: string;
}

export interface CollegeDocument {
  id: string;
  college_id: string;
  title: string;
  category: string;
  effective_date: string;
  storage_path: string;
  status: 'PENDING_PREVIEW' | 'PUBLISHED' | 'ARCHIVED';
  used_ocr: boolean;
  pages_count?: number;
  ocr_pages?: number[];
  created_at: string;
  updated_at?: string;
}

export interface DocChunk {
  id: string;
  document_id: string;
  college_id: string;
  page: number;
  title?: string;
  category?: string;
  effective_date?: string;
  source_type: 'direct_text' | 'ocr';
  content: string;
  embedding?: number[];
}

export interface AssistLog {
  id: string;
  college_id: string;
  user_id: string;
  question: string;
  answered: boolean;
  top_score?: number;
  department_fallback_id?: string;
  feedback?: 'helpful' | 'unhelpful';
  created_at: string;
}

export interface Report {
  id: string;
  college_id: string;
  student_id: string;
  student_display_name: string; // Report-only rule: email local-part e.g. "kunal123"
  title: string;
  description: string;
  image_url?: string;
  department_id: string;
  department_name?: string;
  ai_department_id?: string;
  ai_confidence?: number;
  status: ReportStatus;
  created_at: string;
  updated_at?: string;
  resolved_at?: string;
  resolved_by?: string;
}

export interface ReportMessage {
  id: string;
  report_id: string;
  sender_id: string;
  sender_role: UserRole;
  sender_name: string;
  body: string;
  created_at: string;
}

export interface ReportEvent {
  id: string;
  report_id: string;
  status: ReportStatus;
  actor_id: string;
  actor_name: string;
  created_at: string;
  note?: string;
}

export interface CommunityMessage {
  id: string;
  college_id: string;
  user_id: string;
  pseudonym: string; // e.g. "Blue Falcon 214"
  body: string;
  flagged: boolean;
  removed: boolean;
  flag_reason?: string;
  created_at: string;
}

export interface MessageAnalysis {
  message_id: string;
  college_id: string;
  topic: string;
  issue_type: string;
  is_question: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
  mentioned_teacher_id?: string;
  summary: string;
  author_hash: string; // One-way non-reversible hash for distinct student counting
  created_at: string;
}

export interface Teacher {
  id: string;
  college_id: string;
  name: string;
  aliases: string[];
}

export interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  target: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface ModerationResult {
  allowed: boolean;
  category: string;
  severity: ModerationSeverity;
  reason: string;
}

export interface RoutingResult {
  department_id: string;
  department_name?: string;
  confidence: number;
  short_title: string;
}
