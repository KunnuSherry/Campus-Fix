import time
import asyncio
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, status
from app.models.schemas import (
    ModerateMessageRequest, ModerationResult,
    PostCommunityMessageResponse, ReportMessageRequest,
    UpvoteMessageResponse
)
from app.services.moderation_service import moderation_service
from app.services.firebase_service import firebase_service
from app.services.insights_service import insights_service
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/community", tags=["Community & Moderation"])


@router.post("/moderate", response_model=ModerationResult)
async def check_moderation_only(
    req: ModerateMessageRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Checks text with Groq/Qwen moderation without publishing.
    Used for live pre-check or validation.
    """
    return await moderation_service.moderate(req.body)


@router.post("/publish", response_model=PostCommunityMessageResponse)
async def moderate_and_publish(
    req: ModerateMessageRequest,
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    MANDATORY PRE-PUBLICATION PIPELINE:
    1. Student submits message.
    2. Backend passes message to Groq/Qwen moderation.
    3. If disallowed -> rejected immediately with non-judgmental reason. Never written to public feed.
    4. If allowed -> published to Firestore community_messages with student's pseudonym.
    5. Background task triggers privacy-preserving analytics analysis.
    """
    college_id = current_user["college_id"]
    user_id = current_user["id"]
    pseudonym = current_user.get("pseudonym", "Student")
    body = req.body.strip()

    # 1. Moderation Step
    mod_result = await moderation_service.moderate(body)

    if not mod_result.allowed:
        # Immediately record harmful/vulgar attempt in Harmful Messages queue with real student name & email
        flag_id = f"harm_{int(time.time())}_{abs(hash(body)) % 10000}"
        student_name = current_user.get("full_name") or current_user.get("pseudonym") or "Student"
        student_email = current_user.get("email", "")

        harmful_record = {
            "id": flag_id,
            "college_id": college_id,
            "message_id": None,
            "body": body,
            "author_id": user_id,
            "author_name": student_name,
            "author_email": student_email,
            "category": mod_result.category,
            "reason": mod_result.reason,
            "status": "pending",
            "source": "pre_moderation_block",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }
        firebase_service.set_doc("flagged_messages", flag_id, harmful_record)

        return PostCommunityMessageResponse(
            success=False,
            moderation=mod_result,
            message_id=None,
            published_message=None
        )

    # 2. Publish to Firestore
    msg_id = f"cmsg_{int(time.time())}_{abs(hash(body)) % 10000}"
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    msg_record = {
        "id": msg_id,
        "college_id": college_id,
        "user_id": user_id,  # Kept in database for audit/security, NEVER exposed in UI
        "pseudonym": pseudonym,
        "body": body,
        "upvotes": 0,
        "upvoted_by": [],
        "flagged": False,
        "removed": False,
        "created_at": now_iso
    }
    firebase_service.set_doc("community_messages", msg_id, msg_record)

    # 3. Spawn background analytics extraction (Privacy preserving)
    background_tasks.add_task(
        insights_service.analyze_message_for_insights,
        message_id=msg_id,
        college_id=college_id,
        user_id=user_id,
        body=body
    )

    # User-facing payload: real user_id is stripped
    public_payload = {
        "id": msg_id,
        "college_id": college_id,
        "pseudonym": pseudonym,
        "body": body,
        "upvotes": 0,
        "user_has_upvoted": False,
        "created_at": now_iso
    }

    return PostCommunityMessageResponse(
        success=True,
        moderation=mod_result,
        message_id=msg_id,
        published_message=public_payload
    )


@router.get("/messages")
async def get_community_messages(
    current_user: Dict[str, Any] = Depends(get_current_user),
    limit: int = 50
):
    """
    Fetches real-time community messages for user's college.
    Student real names and emails are NEVER exposed. Only pseudonyms are returned.
    """
    college_id = current_user["college_id"]
    user_id = current_user["id"]
    messages = firebase_service.query("community_messages", [
        ("college_id", "==", college_id),
        ("removed", "==", False)
    ])

    # Sort oldest first for chat flow
    messages.sort(key=lambda m: m.get("created_at", ""))

    safe_list = []
    for m in messages[-limit:]:
        upvoted_by = m.get("upvoted_by") or []
        safe_list.append({
            "id": m["id"],
            "college_id": m["college_id"],
            "pseudonym": m.get("pseudonym", "Student"),
            "body": m.get("body", ""),
            "upvotes": m.get("upvotes", len(upvoted_by)),
            "user_has_upvoted": user_id in upvoted_by,
            "created_at": m.get("created_at", "")
        })
    return safe_list


@router.post("/messages/{message_id}/upvote", response_model=UpvoteMessageResponse)
async def upvote_community_message(
    message_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Toggle upvote for a community message.
    Increments severity and community importance.
    """
    college_id = current_user["college_id"]
    user_id = current_user["id"]
    msg = firebase_service.get_doc("community_messages", message_id)
    if not msg or msg.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Message not found.")

    upvoted_by = list(msg.get("upvoted_by") or [])
    if user_id in upvoted_by:
        upvoted_by.remove(user_id)
        user_has_upvoted = False
    else:
        upvoted_by.append(user_id)
        user_has_upvoted = True

    new_count = len(upvoted_by)
    firebase_service.update_doc("community_messages", message_id, {
        "upvotes": new_count,
        "upvoted_by": upvoted_by
    })

    return UpvoteMessageResponse(
        success=True,
        upvotes=new_count,
        user_has_upvoted=user_has_upvoted
    )


@router.post("/report-message")
async def report_community_message(
    req: ReportMessageRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Allows a student to flag an already visible community message.
    The message enters the Admin moderation review queue.
    """
    college_id = current_user["college_id"]
    msg = firebase_service.get_doc("community_messages", req.message_id)

    if not msg or msg.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Message not found.")

    firebase_service.update_doc("community_messages", req.message_id, {
        "flagged": True,
        "flag_reason": req.reason
    })

    return {"success": True, "message": "Message reported to moderators."}


@router.delete("/messages/{message_id}")
async def delete_community_message(
    message_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    college_id = current_user["college_id"]
    role = current_user.get("role", "student")
    user_id = current_user["id"]

    msg = firebase_service.get_doc("community_messages", message_id)
    if not msg or msg.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Message not found.")

    # Student can delete only their own message. Admin can delete any message in college.
    if role == "student" and msg.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages.")

    firebase_service.delete_doc("community_messages", message_id)
    return {"success": True, "message": f"Message {message_id} removed."}

