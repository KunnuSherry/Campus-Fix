from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import AssistAskRequest, AssistAskResponse
from app.services.rag_service import rag_service
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/assist", tags=["Assist RAG Chatbot"])


@router.post("/ask", response_model=AssistAskResponse)
async def ask_assist(
    req: AssistAskRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Assist RAG Chatbot:
    - Scoped strictly to student's college.
    - Searches approved circulars/documents.
    - Qwen answers ONLY from supplied context or returns NOT_FOUND.
    - If NOT_FOUND, classifies question to department and offers Report creation.
    """
    college_id = current_user["college_id"]
    user_id = current_user["id"]

    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    res = await rag_service.answer_question(
        college_id=college_id,
        user_id=user_id,
        question=req.question.strip()
    )
    return res

