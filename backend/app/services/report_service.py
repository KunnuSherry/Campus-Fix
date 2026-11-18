import json
import logging
import time
from typing import Dict, Any, List, Optional
from app.services.firebase_service import firebase_service
from app.services.groq_service import groq_manager
from app.utils.pseudonym import extract_email_local_part
from app.models.schemas import RouteIssueResponse, ReportResponse, ReportMessageResponse, ReportEventResponse

logger = logging.getLogger("report_service")
logger.setLevel(logging.INFO)


class ReportService:
    async def route_issue(self, college_id: str, description: str) -> RouteIssueResponse:
        """
        Sends issue description and college departments to Groq/Qwen.
        Returns department_id, confidence (0.0 to 1.0), and short_title.
        """
        departments = firebase_service.query("departments", [("college_id", "==", college_id)])
        dept_summary = [{"id": d["id"], "name": d["name"], "description": d.get("description", "")} for d in departments]

        system_prompt = (
            "You are CampusFix AI Report Router. Given an issue reported by a college student and the list of available "
            "college departments, classify which department is responsible for resolving this issue.\n"
            "Respond ONLY with valid JSON in this exact structure:\n"
            "{\n"
            '  "department_id": "<id from the department list>",\n'
            '  "department_name": "<name>",\n'
            '  "confidence": <float between 0.0 and 1.0>,\n'
            '  "short_title": "<concise 4-8 word title summarizing the issue>"\n'
            "}"
        )
        user_prompt = f"Available Departments:\n{json.dumps(dept_summary, indent=2)}\n\nStudent Issue Description:\n\"{description}\""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        try:
            raw_res = await groq_manager.chat_completion(
                messages=messages,
                temperature=0.1,
                json_mode=True,
                max_tokens=200
            )
            data = json.loads(raw_res)
            return RouteIssueResponse(
                department_id=data.get("department_id"),
                department_name=data.get("department_name"),
                confidence=float(data.get("confidence", 0.75)),
                short_title=data.get("short_title", description[:45])
            )
        except Exception as e:
            logger.error(f"Error routing report with LLM: {e}")
            default_dept = departments[0] if departments else {"id": "dept_admin", "name": "General Administration"}
            return RouteIssueResponse(
                department_id=default_dept["id"],
                department_name=default_dept["name"],
                confidence=0.50,
                short_title=description[:40] if description else "Campus Issue"
            )

    async def create_report(
        self,
        college_id: str,
        student_id: str,
        student_email: str,
        student_full_name: Optional[str],
        title: str,
        description: str,
        department_id: Optional[str] = None,
        image_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Creates a new student report with AI routing and initial status timeline event.
        Enforces report identity rule: candidate display name is student email local-part.
        """
        # Report-only name rule: extract local part of email
        student_display_name = extract_email_local_part(student_email)

        # AI Routing
        routing = await self.route_issue(college_id, description)
        ai_dept_id = routing.department_id
        ai_conf = routing.confidence

        final_dept_id = department_id
        if not final_dept_id:
            # If AI confidence is high (>= 0.70), auto-route
            if ai_conf >= 0.70 and ai_dept_id:
                final_dept_id = ai_dept_id
            else:
                # Low confidence: routes to General Admin queue for manual routing
                admin_depts = [d for d in firebase_service.query("departments", [("college_id", "==", college_id)]) if "admin" in d["id"].lower()]
                final_dept_id = admin_depts[0]["id"] if admin_depts else ai_dept_id

        report_id = f"rep_{int(time.time())}_{abs(hash(description)) % 10000}"
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")

        report_data = {
            "id": report_id,
            "college_id": college_id,
            "student_id": student_id,
            "student_display_name": student_display_name,
            "title": title or routing.short_title,
            "description": description,
            "image_url": image_url,
            "department_id": final_dept_id,
            "ai_department_id": ai_dept_id,
            "ai_confidence": ai_conf,
            "status": "OPEN",
            "created_at": now_iso,
            "updated_at": now_iso,
            "resolved_at": None,
            "resolved_by": None
        }

        firebase_service.set_doc("reports", report_id, report_data)

        # Initial Event in Timeline
        event_id = f"evt_{report_id}_0"
        firebase_service.set_doc("report_events", event_id, {
            "id": event_id,
            "report_id": report_id,
            "status": "OPEN",
            "actor_id": student_id,
            "actor_name": student_display_name,
            "created_at": now_iso,
            "note": "Issue reported by student"
        })

        return report_data

    def update_status(
        self,
        report_id: str,
        new_status: str,
        actor_id: str,
        actor_name: str,
        note: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Updates report status (OPEN, IN_PROGRESS, RESOLVED, REOPENED)
        and adds an immutable event to the status timeline.
        """
        report = firebase_service.get_doc("reports", report_id)
        if not report:
            raise ValueError(f"Report {report_id} not found")

        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        updates: Dict[str, Any] = {
            "status": new_status,
            "updated_at": now_iso
        }
        if new_status == "RESOLVED":
            updates["resolved_at"] = now_iso
            updates["resolved_by"] = actor_id

        firebase_service.update_doc("reports", report_id, updates)

        # Append timeline event
        event_id = f"evt_{report_id}_{time.time_ns()}"
        firebase_service.set_doc("report_events", event_id, {
            "id": event_id,
            "report_id": report_id,
            "status": new_status,
            "actor_id": actor_id,
            "actor_name": actor_name,
            "created_at": now_iso,
            "note": note or f"Status changed to {new_status}"
        })

        return self.get_report_details(report_id)

    def add_message(
        self,
        report_id: str,
        sender_id: str,
        sender_role: str,
        sender_name: str,
        body: str
    ) -> Dict[str, Any]:
        """
        Adds a message to the report conversation.
        """
        msg_id = f"msg_{report_id}_{int(time.time())}_{abs(hash(body)) % 1000}"
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")

        msg_data = {
            "id": msg_id,
            "report_id": report_id,
            "sender_id": sender_id,
            "sender_role": sender_role,
            "sender_name": sender_name,
            "body": body,
            "created_at": now_iso
        }

        firebase_service.set_doc("report_messages", msg_id, msg_data)
        firebase_service.update_doc("reports", report_id, {"updated_at": now_iso})
        return msg_data

    def get_report_details(self, report_id: str) -> Dict[str, Any]:
        report = firebase_service.get_doc("reports", report_id)
        if not report:
            raise ValueError(f"Report {report_id} not found")

        messages = firebase_service.query("report_messages", [("report_id", "==", report_id)])
        messages.sort(key=lambda m: m.get("created_at", ""))

        events = firebase_service.query("report_events", [("report_id", "==", report_id)])
        events.sort(key=lambda e: e.get("created_at", ""))

        dept = firebase_service.get_doc("departments", report.get("department_id", ""))
        dept_name = dept.get("name") if dept else "General Department"

        report_copy = dict(report)
        report_copy["department_name"] = dept_name
        report_copy["messages"] = messages
        report_copy["events"] = events
        return report_copy


report_service = ReportService()
