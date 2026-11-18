import time
import pytest
from app.services.insights_service import insights_service
from app.services.firebase_service import firebase_service
from app.utils.pseudonym import generate_author_hash


def test_author_hash_privacy():
    # Author hash must be consistent for same user in college but non-reversible
    h1 = generate_author_hash("user_123", "col_bpit")
    h2 = generate_author_hash("user_123", "col_bpit")
    h3 = generate_author_hash("user_456", "col_bpit")

    assert h1 == h2
    assert h1 != h3
    assert "user_123" not in h1


def test_teacher_mention_threshold_safety():
    # Use isolated test college id to prevent collisions in live Firestore
    college_id = f"col_ins_{int(time.time())}"
    teacher_id = f"t_{int(time.time())}"

    # Ensure teacher record exists for the test
    firebase_service.set_doc("teachers", teacher_id, {
        "id": teacher_id,
        "college_id": college_id,
        "name": "Dr. A. K. Verma",
        "aliases": ["Verma Sir"]
    })

    # Clear previous mock data if in mock mode
    if hasattr(firebase_service, "_mock_data") and "message_analysis" in firebase_service._mock_data:
        firebase_service._mock_data["message_analysis"] = {}

    # Case 1: Only 3 distinct students mention the teacher -> MUST NOT appear
    for i in range(1, 4):
        msg_id = f"msg_t_{i}"
        author_hash = generate_author_hash(f"student_{i}", college_id)
        firebase_service.set_doc("message_analysis", msg_id, {
            "message_id": msg_id,
            "college_id": college_id,
            "topic": "Academics",
            "issue_type": "Feedback",
            "is_question": False,
            "sentiment": "positive",
            "mentioned_teacher_id": teacher_id,
            "summary": "Great lecture delivered",
            "author_hash": author_hash,
            "created_at": "2026-03-01T12:00:00Z"
        })

    mentions_below_threshold = insights_service.teacher_mentions(college_id, days=14)
    assert len(mentions_below_threshold) == 0

    # Case 2: 2 more distinct students mention the teacher (total = 5) -> MUST NOW APPEAR
    for i in range(4, 6):
        msg_id = f"msg_t_{i}"
        author_hash = generate_author_hash(f"student_{i}", college_id)
        firebase_service.set_doc("message_analysis", msg_id, {
            "message_id": msg_id,
            "college_id": college_id,
            "topic": "Academics",
            "issue_type": "Feedback",
            "is_question": False,
            "sentiment": "positive",
            "mentioned_teacher_id": teacher_id,
            "summary": "Helpful notes provided",
            "author_hash": author_hash,
            "created_at": "2026-03-01T12:00:00Z"
        })

    mentions_at_threshold = insights_service.teacher_mentions(college_id, days=14)
    assert len(mentions_at_threshold) == 1
    assert mentions_at_threshold[0]["distinct_student_mentions"] == 5
    assert mentions_at_threshold[0]["teacher_name"] == "Dr. A. K. Verma"
    assert "Unverified student sentiment" in mentions_at_threshold[0]["disclaimer"]

