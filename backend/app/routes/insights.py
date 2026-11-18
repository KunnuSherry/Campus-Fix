from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import AdminInsightsRequest, AdminInsightsResponse
from app.services.insights_service import insights_service
from app.dependencies.auth import require_admin

router = APIRouter(prefix="/insights", tags=["Admin Insights & Analytics"])


@router.post("/ask", response_model=AdminInsightsResponse)
async def ask_admin_insights(
    req: AdminInsightsRequest,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    """
    Admin Insights Chatbot:
    Answers administrator questions using privacy-preserving aggregate metrics.
    Enforces 5-student teacher mention safety threshold and never reads raw student chats.
    """
    college_id = current_user["college_id"]
    res = await insights_service.answer_insights_query(
        college_id=college_id,
        query=req.question,
        days=req.days
    )
    return AdminInsightsResponse(**res)


@router.get("/stats")
async def get_overview_stats(current_user: Dict[str, Any] = Depends(require_admin)):
    """
    Returns dashboard statistics for reports, top issues, and trending topics.
    """
    college_id = current_user["college_id"]
    return {
        "report_stats": insights_service.report_stats(college_id),
        "top_issues": insights_service.top_issues(college_id, days=7),
        "trending_questions": insights_service.trending_questions(college_id, days=7),
        "teacher_mentions": insights_service.teacher_mentions(college_id, days=14)
    }

