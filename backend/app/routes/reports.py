from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from app.models.schemas import (
    RouteIssueRequest, RouteIssueResponse,
    CreateReportRequest, ReportResponse,
    UpdateReportStatusRequest,
    PostReportMessageRequest, ReportMessageResponse
)
from app.services.report_service import report_service
from app.services.firebase_service import firebase_service
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("/route", response_model=RouteIssueResponse)
async def route_issue_preview(
    req: RouteIssueRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    AI Suggestion for student during report creation.
    Classifies issue to department with confidence score.
    """
    college_id = current_user["college_id"]
    return await report_service.route_issue(college_id, req.description)


@router.post("", response_model=ReportResponse)
async def create_report(
    req: CreateReportRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Creates a new report. AI routes it to the department.
    Enforces candidate name rule: student's email local part is stored for authorized staff.
    """
    college_id = current_user["college_id"]
    student_id = current_user["id"]
    student_email = current_user.get("email", "student@campus.edu")
    student_name = current_user.get("full_name")

    report_data = await report_service.create_report(
        college_id=college_id,
        student_id=student_id,
        student_email=student_email,
        student_full_name=student_name,
        title=req.title,
        description=req.description,
        department_id=req.department_id,
        image_url=req.image_url
    )

    return report_service.get_report_details(report_data["id"])


@router.get("", response_model=List[ReportResponse])
async def list_reports(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Role-isolated report listing:
    - Student: sees ONLY their own reports.
    - Rep: sees ONLY reports assigned to their department.
    - Admin: sees all reports for their college.
    """
    college_id = current_user["college_id"]
    role = current_user.get("role", "student")
    user_id = current_user["id"]

    if role == "student":
        reports = firebase_service.query("reports", [
            ("college_id", "==", college_id),
            ("student_id", "==", user_id)
        ])
    elif role == "rep":
        dept_id = current_user.get("department_id")
        reports = firebase_service.query("reports", [
            ("college_id", "==", college_id),
            ("department_id", "==", dept_id)
        ])
    else:  # admin / superadmin
        reports = firebase_service.query("reports", [("college_id", "==", college_id)])

    # Sort newest first
    reports.sort(key=lambda r: r.get("created_at", ""), reverse=True)

    results = []
    for r in reports:
        dept = firebase_service.get_doc("departments", r.get("department_id", ""))
        dept_name = dept.get("name") if dept else "General Department"
        item = dict(r)
        item["department_name"] = dept_name
        item["messages"] = []
        item["events"] = []
        results.append(ReportResponse(**item))

    return results


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(report_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    college_id = current_user["college_id"]
    role = current_user.get("role", "student")
    user_id = current_user["id"]

    report = firebase_service.get_doc("reports", report_id)
    if not report or report.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Report not found in your college.")

    # Authorization check
    if role == "student" and report.get("student_id") != user_id:
        raise HTTPException(status_code=403, detail="You do not have permission to view this report.")
    if role == "rep" and report.get("department_id") != current_user.get("department_id"):
        raise HTTPException(status_code=403, detail="You can only view reports assigned to your department.")

    return report_service.get_report_details(report_id)


@router.post("/{report_id}/status")
async def update_report_status(
    report_id: str,
    req: UpdateReportStatusRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    college_id = current_user["college_id"]
    role = current_user.get("role", "student")
    user_id = current_user["id"]

    report = firebase_service.get_doc("reports", report_id)
    if not report or report.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Report not found.")

    # Permissions:
    # Students can REOPEN a resolved report.
    # Reps and Admins can move to IN_PROGRESS, RESOLVED, etc.
    if role == "student":
        if req.status != "REOPENED":
            raise HTTPException(status_code=403, detail="Students may only reopen resolved reports.")
        if report.get("student_id") != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized.")
    elif role == "rep":
        if report.get("department_id") != current_user.get("department_id"):
            raise HTTPException(status_code=403, detail="Not assigned to your department.")

    actor_name = current_user.get("full_name") or ("Student" if role == "student" else "Representative")
    updated = report_service.update_status(
        report_id=report_id,
        new_status=req.status,
        actor_id=user_id,
        actor_name=actor_name,
        note=req.note
    )
    return updated


@router.post("/{report_id}/messages", response_model=ReportMessageResponse)
async def post_report_message(
    report_id: str,
    req: PostReportMessageRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    college_id = current_user["college_id"]
    role = current_user.get("role", "student")
    user_id = current_user["id"]

    report = firebase_service.get_doc("reports", report_id)
    if not report or report.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Report not found.")

    if role == "student" and report.get("student_id") != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized.")
    if role == "rep" and report.get("department_id") != current_user.get("department_id"):
        raise HTTPException(status_code=403, detail="Unauthorized.")

    sender_name = report.get("student_display_name", "Student") if role == "student" else (current_user.get("full_name") or "Representative")

    msg = report_service.add_message(
        report_id=report_id,
        sender_id=user_id,
        sender_role=role,
        sender_name=sender_name,
        body=req.body
    )
    return ReportMessageResponse(**msg)


@router.delete("/{report_id}")
async def delete_report(
    report_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    college_id = current_user["college_id"]
    role = current_user.get("role", "student")
    user_id = current_user["id"]

    report = firebase_service.get_doc("reports", report_id)
    if not report or report.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Report not found.")

    if role == "student":
        if report.get("student_id") != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized.")
        if report.get("status") not in ["OPEN", "RESOLVED"]:
            raise HTTPException(status_code=400, detail="Cannot delete a report that is currently in progress.")
    elif role == "rep":
        if report.get("department_id") != current_user.get("department_id"):
            raise HTTPException(status_code=403, detail="Unauthorized.")

    # Delete report doc and sub-records
    firebase_service.delete_doc("reports", report_id)

    # Delete messages
    for m in firebase_service.query("report_messages", [("report_id", "==", report_id)]):
        firebase_service.delete_doc("report_messages", m["id"])

    # Delete events
    for ev in firebase_service.query("report_events", [("report_id", "==", report_id)]):
        firebase_service.delete_doc("report_events", ev["id"])

    return {"success": True, "message": f"Report {report_id} deleted."}

