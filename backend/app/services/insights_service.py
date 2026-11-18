import json
import logging
import time
from typing import Dict, Any, List, Optional
from collections import Counter
from app.services.firebase_service import firebase_service
from app.services.groq_service import groq_manager
from app.utils.pseudonym import generate_author_hash

logger = logging.getLogger("insights_service")
logger.setLevel(logging.INFO)


class InsightsService:
    async def analyze_message_for_insights(
        self,
        message_id: str,
        college_id: str,
        user_id: str,
        body: str
    ) -> Optional[Dict[str, Any]]:
        """
        After moderation, analyzes an allowed message to extract aggregated metrics.
        Never stores raw message quotes in analytics.
        Uses author_hash for anonymous distinct student counting.
        """
        teachers = firebase_service.query("teachers", [("college_id", "==", college_id)])
        teacher_names = {t["id"]: t["name"] for t in teachers}

        system_prompt = (
            "You are CampusFix Privacy Analytics Extractor. Given an anonymous student chat message, "
            "extract aggregate categorization without quotes or student identities.\n"
            "Format JSON:\n"
            "{\n"
            '  "topic": "Canteen" | "Academics" | "Hostel" | "Infrastructure" | "Administration" | "General",\n'
            '  "issue_type": "Cleanliness" | "Food Quality" | "WiFi" | "Timetable" | "Exams" | "Fee" | "Feedback" | "General",\n'
            '  "is_question": true | false,\n'
            '  "sentiment": "positive" | "neutral" | "negative",\n'
            '  "mentioned_teacher_id": null or "<matching teacher id from list>",\n'
            '  "summary": "<neutral, objective 5-10 word high-level description without personal names>"\n'
            "}"
        )
        user_prompt = f"Teachers List:\n{json.dumps(teacher_names)}\n\nMessage:\n\"{body}\""

        try:
            raw_res = await groq_manager.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                json_mode=True,
                max_tokens=150
            )
            data = json.loads(raw_res)

            author_hash = generate_author_hash(user_id, college_id)
            analysis_id = f"analysis_{message_id}"
            analysis_data = {
                "message_id": message_id,
                "college_id": college_id,
                "topic": data.get("topic", "General"),
                "issue_type": data.get("issue_type", "Feedback"),
                "is_question": bool(data.get("is_question", False)),
                "sentiment": data.get("sentiment", "neutral"),
                "mentioned_teacher_id": data.get("mentioned_teacher_id"),
                "summary": data.get("summary", "Student community discussion"),
                "author_hash": author_hash,
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
            }
            firebase_service.set_doc("message_analysis", analysis_id, analysis_data)
            return analysis_data
        except Exception as e:
            logger.error(f"Error extracting message insights: {e}")
            return None

    # ==========================================
    # Predefined Safe Aggregation Functions
    # ==========================================

    def top_issues(self, college_id: str, days: int = 7) -> List[Dict[str, Any]]:
        records = firebase_service.query("message_analysis", [("college_id", "==", college_id)])
        issue_counts = Counter(r.get("issue_type", "General") for r in records)
        return [{"issue": k, "count": v} for k, v in issue_counts.most_common(5)]

    def trending_questions(self, college_id: str, days: int = 7) -> List[Dict[str, Any]]:
        records = firebase_service.query("message_analysis", [("college_id", "==", college_id)])
        question_records = [r for r in records if r.get("is_question")]
        topic_counts = Counter(r.get("topic", "General") for r in question_records)
        return [{"topic": k, "question_count": v} for k, v in topic_counts.most_common(5)]

    def teacher_mentions(self, college_id: str, days: int = 14) -> List[Dict[str, Any]]:
        """
        TEACHER MENTION SAFETY RULE:
        Teacher mentions require at least 5 distinct students (author_hash)
        before appearing in insights.
        Must be labeled: 'Unverified student sentiment, not an evaluation.'
        """
        records = firebase_service.query("message_analysis", [("college_id", "==", college_id)])
        teacher_students: Dict[str, set] = {}
        teacher_sentiments: Dict[str, List[str]] = {}

        for r in records:
            t_id = r.get("mentioned_teacher_id")
            if t_id:
                if t_id not in teacher_students:
                    teacher_students[t_id] = set()
                    teacher_sentiments[t_id] = []
                teacher_students[t_id].add(r.get("author_hash"))
                teacher_sentiments[t_id].append(r.get("sentiment", "neutral"))

        results = []
        for t_id, authors in teacher_students.items():
            # STRICT 5-STUDENT THRESHOLD
            if len(authors) >= 5:
                teacher = firebase_service.get_doc("teachers", t_id)
                t_name = teacher.get("name") if teacher else "Faculty Member"
                sentiments = teacher_sentiments[t_id]
                positive = sentiments.count("positive")
                negative = sentiments.count("negative")
                neutral = len(sentiments) - positive - negative

                results.append({
                    "teacher_id": t_id,
                    "teacher_name": t_name,
                    "distinct_student_mentions": len(authors),
                    "positive_count": positive,
                    "negative_count": negative,
                    "neutral_count": neutral,
                    "disclaimer": "Unverified student sentiment, not an evaluation."
                })

        return results

    def report_stats(self, college_id: str) -> Dict[str, Any]:
        reports = firebase_service.query("reports", [("college_id", "==", college_id)])
        total = len(reports)
        status_counts = Counter(r.get("status", "OPEN") for r in reports)
        departments = Counter(r.get("department_id", "Unknown") for r in reports)

        return {
            "total_reports": total,
            "open": status_counts.get("OPEN", 0),
            "in_progress": status_counts.get("IN_PROGRESS", 0),
            "resolved": status_counts.get("RESOLVED", 0),
            "reopened": status_counts.get("REOPENED", 0),
            "by_department": dict(departments)
        }

    async def answer_insights_query(self, college_id: str, query: str, days: int = 7) -> Dict[str, Any]:
        """
        Answers Admin Insights questions by querying aggregate metrics and anonymized community discussions.
        Protects student identities while giving actionable, transparent operational feedback to college admins.
        """
        # Execute safe functions
        issues = self.top_issues(college_id, days)
        questions = self.trending_questions(college_id, days)
        teachers = self.teacher_mentions(college_id, days)
        stats = self.report_stats(college_id)

        # Retrieve recent community discussions with authors anonymized
        recent_msgs = firebase_service.query("community_messages", [("college_id", "==", college_id), ("removed", "==", False)])
        anonymous_discussions = []
        for m in recent_msgs[-35:]:
            anonymous_discussions.append({
                "discussion_snippet": m.get("body", ""),
                "community_upvotes": m.get("upvotes", 0),
                "created_at": m.get("created_at", "")
            })

        # Fetch registered faculty names for accurate matching
        registered_teachers = firebase_service.query("teachers", [("college_id", "==", college_id)])
        teacher_directory = [{"id": t["id"], "name": t["name"], "aliases": t.get("aliases", [])} for t in registered_teachers]

        insights_payload = {
            "top_issues": issues,
            "trending_questions": questions,
            "safe_teacher_mentions_kpi": teachers,
            "report_statistics": stats,
            "recent_community_discussions": anonymous_discussions,
            "registered_faculty_directory": teacher_directory
        }

        system_prompt = (
            "You are CampusFix Executive Intelligence Assistant for College Administrators.\n"
            "Answer the administrator's operational questions clearly, factually, and actionably using the provided college data.\n\n"
            "CRITICAL GUIDELINES:\n"
            "1. STUDENT ANONYMITY: Never mention any student's real name or email address under any circumstances.\n"
            "2. FACULTY & TEACHING FEEDBACK: When asked about faculty/teachers (e.g., 'Sarita', 'Verma Sir', 'Maths teacher'), check community discussions and report student sentiments clearly (e.g. 'Students in the community reported concerns regarding Sarita (Maths), noting difficulty following lectures/lack of study material'). Include: 'Note: Unverified student sentiment, not an official evaluation.'\n"
            "3. CURRICULUM & CAMPUS ISSUES: Clearly report specific student issues such as missing study materials, syllabus completion, canteen quality, library access, or infrastructure.\n"
            "4. PRESENTATION: Use clean executive formatting with bullet points and markdown tables when appropriate. Be direct, professional, and helpful without robotic AI fluff."
        )
        user_prompt = f"College Operational Data & Community Discussions:\n{json.dumps(insights_payload, indent=2)}\n\nAdministrator Question:\n\"{query}\""

        try:
            answer = await groq_manager.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2,
                max_tokens=650
            )
            return {
                "answer": answer.strip(),
                "insights_data": insights_payload
            }
        except Exception as e:
            logger.error(f"Error answering admin insights: {e}")
            return {
                "answer": f"Current report summary: {stats['total_reports']} total reports, {stats['resolved']} resolved. Top issue: {issues[0]['issue'] if issues else 'N/A'}.",
                "insights_data": insights_payload
            }


insights_service = InsightsService()

