from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, EmailStr, Field


# ==========================================
# Authentication & Onboarding
# ==========================================

class CheckDomainRequest(BaseModel):
    email: EmailStr

class CheckDomainResponse(BaseModel):
    allowed: bool
    college_id: Optional[str] = None
    college_name: Optional[str] = None
    message: str

class SendOtpRequest(BaseModel):
    email: EmailStr

class SendOtpResponse(BaseModel):
    success: bool
    message: str
    debug_code: Optional[str] = None  # Populated only in dev mode when Resend API key is not configured

class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str
    full_name: Optional[str] = None
    password: Optional[str] = None

class VerifyOtpResponse(BaseModel):
    success: bool
    token: str
    user_id: str
    role: str
    college_id: str
    pseudonym: str
    full_name: Optional[str] = None
    email: str

class StaffLoginRequest(BaseModel):
    email: EmailStr
    password: str


# ==========================================
# User Profiles
# ==========================================

class UserProfileResponse(BaseModel):
    id: str
    college_id: str
    role: Literal["student", "rep", "admin", "superadmin"]
    email: str
    full_name: Optional[str] = None
    pseudonym: Optional[str] = None
    department_id: Optional[str] = None
    created_at: str


# ==========================================
# Super Admin & College Management
# ==========================================

class CreateCollegeRequest(BaseModel):
    name: str
    domain: str  # Initial allowed domain, e.g. "bpitindia.in"
    admin_email: EmailStr
    admin_name: str
    admin_password: Optional[str] = "Admin@CampusFix123"

class UpdateCollegeRequest(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    admin_email: Optional[EmailStr] = None
    admin_name: Optional[str] = None
    admin_password: Optional[str] = None

class CreateAdminRequest(BaseModel):
    email: EmailStr
    full_name: str
    college_id: str
    password: Optional[str] = "Admin@CampusFix123"

class AdminUserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    college_id: str
    college_name: Optional[str] = None
    created_at: Optional[str] = None

class CollegeResponse(BaseModel):
    id: str
    name: str
    created_by: str
    created_at: str
    domains: List[str] = []

class AddDomainRequest(BaseModel):
    domain: str

class CreateDepartmentRequest(BaseModel):
    name: str
    description: str

class UpdateDepartmentRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class DepartmentResponse(BaseModel):
    id: str
    college_id: str
    name: str
    description: str
    created_at: str

class CreateRepRequest(BaseModel):
    email: EmailStr
    full_name: str
    department_id: str
    password: Optional[str] = "Rep@CampusFix123"

class UpdateRepRequest(BaseModel):
    full_name: Optional[str] = None
    department_id: Optional[str] = None

class RepResponse(BaseModel):
    id: str
    college_id: str
    email: str
    full_name: str
    department_id: str
    role: str

class CreateTeacherRequest(BaseModel):
    name: str
    aliases: List[str] = []

class TeacherResponse(BaseModel):
    id: str
    college_id: str
    name: str
    aliases: List[str] = []


# ==========================================
# Document Ingestion & RAG
# ==========================================

class IngestDocPreviewResponse(BaseModel):
    document_id: str
    title: str
    category: str
    effective_date: str
    total_pages: int
    used_ocr: bool
    ocr_pages: List[int]
    extracted_text_preview: str

class PublishDocRequest(BaseModel):
    document_id: str
    corrected_text: Optional[str] = None  # Admin can edit or confirm OCR text

class AssistAskRequest(BaseModel):
    question: str

class AssistAskResponse(BaseModel):
    answered: bool
    answer: str
    citations: List[Dict[str, Any]] = []
    confidence_score: float = 0.0
    suggested_department_id: Optional[str] = None
    suggested_department_name: Optional[str] = None
    can_create_report: bool = False


# ==========================================
# Report Module
# ==========================================

class RouteIssueRequest(BaseModel):
    description: str

class RouteIssueResponse(BaseModel):
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    confidence: float
    short_title: str

class CreateReportRequest(BaseModel):
    title: str
    description: str
    department_id: Optional[str] = None
    image_url: Optional[str] = None

class ReportEventResponse(BaseModel):
    id: str
    report_id: str
    status: str
    actor_id: str
    actor_name: str
    created_at: str
    note: Optional[str] = None

class ReportMessageResponse(BaseModel):
    id: str
    report_id: str
    sender_id: str
    sender_role: str
    sender_name: str
    body: str
    created_at: str

class ReportResponse(BaseModel):
    id: str
    college_id: str
    student_id: str
    student_display_name: str  # Email local-part (e.g. kunal123) for authorized staff
    title: str
    description: str
    image_url: Optional[str] = None
    department_id: str
    department_name: Optional[str] = None
    ai_department_id: Optional[str] = None
    ai_confidence: Optional[float] = None
    status: Literal["OPEN", "IN_PROGRESS", "RESOLVED", "REOPENED"]
    created_at: str
    updated_at: Optional[str] = None
    resolved_at: Optional[str] = None
    resolved_by: Optional[str] = None
    messages: List[ReportMessageResponse] = []
    events: List[ReportEventResponse] = []

class UpdateReportStatusRequest(BaseModel):
    status: Literal["OPEN", "IN_PROGRESS", "RESOLVED", "REOPENED"]
    note: Optional[str] = None

class PostReportMessageRequest(BaseModel):
    body: str


# ==========================================
# Community & Moderation
# ==========================================

class ModerateMessageRequest(BaseModel):
    body: str

class ModerationResult(BaseModel):
    allowed: bool
    category: str
    severity: Literal["low", "medium", "high"]
    reason: str

class PostCommunityMessageResponse(BaseModel):
    success: bool
    moderation: ModerationResult
    message_id: Optional[str] = None
    published_message: Optional[Dict[str, Any]] = None

class ReportMessageRequest(BaseModel):
    message_id: str
    reason: str

class FlaggedMessageResponse(BaseModel):
    message_id: str
    college_id: str
    pseudonym: str
    body: str
    flagged_reasons: List[str] = []
    report_count: int = 1
    created_at: str
    author_name: Optional[str] = None
    author_email: Optional[str] = None
    category: Optional[str] = None
    reason: Optional[str] = None
    source: Optional[str] = None

class UpvoteMessageResponse(BaseModel):
    success: bool
    upvotes: int
    user_has_upvoted: bool


# ==========================================
# Admin Insights
# ==========================================

class AdminInsightsRequest(BaseModel):
    question: str
    days: int = 7

class AdminInsightsResponse(BaseModel):
    answer: str
    insights_data: Dict[str, Any]

