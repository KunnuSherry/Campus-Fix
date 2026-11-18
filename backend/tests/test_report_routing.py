import pytest
from app.utils.pseudonym import extract_email_local_part
from app.services.report_service import report_service
from app.services.firebase_service import firebase_service


def test_candidate_name_rule():
    # If the student email is kunal123@bpitindia.in,
    # candidate/student name in report must be 'kunal123' (no domain).
    email = "kunal123@bpitindia.in"
    local_part = extract_email_local_part(email)
    assert local_part == "kunal123"
    assert "@" not in local_part
    assert "bpitindia.in" not in local_part


@pytest.mark.asyncio
async def test_report_lifecycle_and_events():
    report = await report_service.create_report(
        college_id="col_bpit",
        student_id="student_101",
        student_email="kunal123@bpitindia.in",
        student_full_name="Kunal Sharma",
        title="Water cooler not working",
        description="The 3rd floor water cooler in CSE block is leaking water continuously.",
        department_id="dept_infra"
    )

    report_id = report["id"]
    assert report["status"] == "OPEN"
    assert report["student_display_name"] == "kunal123"

    # Rep updates status to IN_PROGRESS
    updated = report_service.update_status(
        report_id=report_id,
        new_status="IN_PROGRESS",
        actor_id="rep_infra",
        actor_name="Rohan Sharma",
        note="Technician dispatched to 3rd floor"
    )
    assert updated["status"] == "IN_PROGRESS"
    assert len(updated["events"]) >= 2

    # Rep resolves report
    resolved = report_service.update_status(
        report_id=report_id,
        new_status="RESOLVED",
        actor_id="rep_infra",
        actor_name="Rohan Sharma",
        note="Pipe valve replaced, tested successfully"
    )
    assert resolved["status"] == "RESOLVED"
    assert resolved["resolved_at"] is not None

    # Student reopens report
    reopened = report_service.update_status(
        report_id=report_id,
        new_status="REOPENED",
        actor_id="student_101",
        actor_name="kunal123",
        note="Still dripping slowly"
    )
    assert reopened["status"] == "REOPENED"
    assert len(reopened["events"]) >= 4

