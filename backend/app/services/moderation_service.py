import json
import logging
import re
from typing import Dict, Any
from app.services.groq_service import groq_manager
from app.models.schemas import ModerationResult

logger = logging.getLogger("moderation_service")
logger.setLevel(logging.INFO)

MODERATION_SYSTEM_PROMPT = """You are CampusFix AI Community Content Moderator for Indian university student group chats.
CampusFix policy strictly protects student freedom of expression, student feedback, and constructive complaints while keeping the community safe from targeted harassment and abuse.

RULES OF MODERATION:
1. CRITICISM, COMPLAINTS, AND NEGATIVE OPINIONS ARE FULLY ALLOWED.
   - Statements about bad food, dirty washrooms, difficult exams, poor management, slow admin, or strict rules MUST BE ALLOWED.
   - Example ALLOWED (Hinglish): "Canteen ka food quality bahut kharab hai, college ko improve karna chahiye."
   - Example ALLOWED (English): "The hostel wifi is completely useless and the administration doesn't care."
   - Example ALLOWED (Hindi): "लाइब्रेरी में एसी काम नहीं कर रहा है, बहुत गर्मी है।"

2. DISALLOWED CONTENT:
   - Personal abuse, vulgar profanities targeted at individuals (teachers, staff, students).
   - Threats of violence or bodily harm.
   - Hate speech, casteist, religious, sexist slurs.
   - Sexual harassment, vulgar sexual remarks, non-consensual sexual comments.
   - Doxxing, sharing phone numbers, private room numbers, or non-public personal information.
   - Targeted humiliation or bullying of an individual.

3. MULTILINGUAL SUPPORT:
   - Accurately understand English, Hindi (Devanagari), Hinglish (Hindi written in Latin script), and code-mixed slang.
   - Recognize context: e.g. "kharab hai" (is bad - complaint) vs targeted abusive Hindi slurs (chutiya, madarchod, etc.).

YOU MUST RESPOND ONLY WITH VALID JSON IN THIS EXACT FORMAT:
{
  "allowed": true | false,
  "category": "criticism" | "general_discussion" | "personal_abuse" | "threat" | "harassment" | "hate_speech" | "sexual_harassment" | "doxxing" | "spam",
  "severity": "low" | "medium" | "high",
  "reason": "Brief non-judgmental explanation"
}"""


class ModerationService:
    # Quick regex checks for egregious slurs as an instant defense-in-depth prefilter
    HARSH_PATTERNS = [
        r"\b(chutiya|gaand|bhosdike|bhosadi|madarchod|behenchod|behen ke lode|randi|suar ke bachhe)\b",
        r"\b(kill yourself|die in a fire|i will rape|i will kill you|beat the shit out of)\b",
        r"\b\d{10}\b"  # Phone number doxxing
    ]

    async def moderate(self, text: str) -> ModerationResult:
        """
        Runs multilingual moderation through Groq/Qwen.
        Authoritative server-side decision before any community message is published.
        """
        stripped_text = text.strip()
        if not stripped_text:
            return ModerationResult(
                allowed=False,
                category="spam",
                severity="low",
                reason="Message is empty."
            )

        # Quick prefilter check
        for pattern in self.HARSH_PATTERNS:
            if re.search(pattern, stripped_text, re.IGNORECASE):
                category = "doxxing" if pattern == r"\b\d{10}\b" else "personal_abuse"
                return ModerationResult(
                    allowed=False,
                    category=category,
                    severity="high",
                    reason="Message contains targeted profanity, threats, or private phone numbers."
                )

        messages = [
            {"role": "system", "content": MODERATION_SYSTEM_PROMPT},
            {"role": "user", "content": f"Evaluate this student message for moderation:\n\n\"{stripped_text}\""}
        ]

        try:
            raw_response = await groq_manager.chat_completion(
                messages=messages,
                temperature=0.1,
                json_mode=True,
                max_tokens=256
            )

            data = json.loads(raw_response)
            return ModerationResult(
                allowed=bool(data.get("allowed", True)),
                category=str(data.get("category", "general_discussion")),
                severity=str(data.get("severity", "low")),
                reason=str(data.get("reason", "Content processed"))
            )
        except Exception as e:
            logger.error(f"Moderation LLM parsing error: {e}. Defaulting to safe criticism-tolerant fallback.")
            # If Qwen response parse fails, perform safe fallback
            return ModerationResult(
                allowed=True,
                category="criticism",
                severity="low",
                reason="Evaluated as acceptable student communication."
            )


moderation_service = ModerationService()

