import asyncio
import json
import logging
import time
from typing import List, Dict, Any, Optional
from groq import Groq, RateLimitError, APIError, InternalServerError
from app.config import settings

logger = logging.getLogger("groq_service")
logger.setLevel(logging.INFO)


class GroqKeyManager:
    """
    Manages 5 Groq API keys with:
    - Round-robin key rotation
    - Automatic fallback on 429 / rate limits / quota issues
    - Bounded retries with exponential backoff
    - Masked logging (never prints actual keys)
    - Response caching for repeated queries
    - Graceful fallback for local development when keys are not yet configured
    """

    def __init__(self):
        self._current_index = 0
        self._cache: Dict[str, Any] = {}
        self._cache_ttl_seconds = 3600  # 1 hour cache for RAG / repeated calls
        self._cache_timestamps: Dict[str, float] = {}

    def get_configured_keys(self) -> List[str]:
        return settings.groq_keys

    def get_active_key_count(self) -> int:
        return len(self.get_configured_keys())

    def _get_next_key_info(self) -> tuple[str, int]:
        keys = self.get_configured_keys()
        if not keys:
            return "", -1
        idx = self._current_index % len(keys)
        self._current_index = (self._current_index + 1) % len(keys)
        return keys[idx], idx + 1

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        json_mode: bool = False,
        cache_key: Optional[str] = None,
        max_tokens: int = 1024,
    ) -> str:
        # Check cache if key provided
        now = time.time()
        if cache_key and cache_key in self._cache:
            if now - self._cache_timestamps.get(cache_key, 0) < self._cache_ttl_seconds:
                logger.info(f"Returning cached response for key: {cache_key[:30]}...")
                return self._cache[cache_key]

        keys = self.get_configured_keys()

        # Graceful fallback if no Groq keys configured yet (e.g. initial setup)
        if not keys:
            logger.warning("No Groq API keys configured. Using intelligent mock fallback.")
            fallback_res = self._mock_response(messages, json_mode)
            return fallback_res

        total_keys = len(keys)
        max_attempts = min(total_keys * 2, 6)
        backoff_seconds = 1.0

        for attempt in range(max_attempts):
            key, key_number = self._get_next_key_info()
            logger.info(f"Attempt {attempt + 1}: Executing request using Groq Key #{key_number}")

            try:
                # Groq client instantiation
                client = Groq(api_key=key, timeout=25.0)

                kwargs: Dict[str, Any] = {
                    "model": settings.GROQ_MODEL,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
                if json_mode:
                    kwargs["response_format"] = {"type": "json_object"}

                # Run sync client in thread to avoid blocking event loop
                response = await asyncio.to_thread(client.chat.completions.create, **kwargs)
                content = response.choices[0].message.content or ""

                if cache_key:
                    self._cache[cache_key] = content
                    self._cache_timestamps[cache_key] = now

                return content

            except (RateLimitError, APIError, InternalServerError) as e:
                status_code = getattr(e, "status_code", None)
                logger.warning(
                    f"Groq Key #{key_number} failed with error (status={status_code}): {type(e).__name__}. "
                    f"Rotating to next key..."
                )
                if attempt < max_attempts - 1:
                    await asyncio.sleep(backoff_seconds)
                    backoff_seconds = min(backoff_seconds * 1.5, 5.0)
                continue
            except Exception as e:
                logger.error(f"Unexpected error with Groq Key #{key_number}: {e}. Retrying with next key...")
                if attempt < max_attempts - 1:
                    await asyncio.sleep(backoff_seconds)
                continue

        # If all keys exhausted
        logger.error("All Groq keys failed or hit rate limits. Falling back to safe response.")
        return self._mock_response(messages, json_mode)

    def _mock_response(self, messages: List[Dict[str, str]], json_mode: bool) -> str:
        """
        Safe mock response used when keys are not configured or rate-limits are exceeded.
        """
        user_msg = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                user_msg = m.get("content", "")
                break

        user_lower = user_msg.lower()

        # If JSON mode requested (Moderation, Routing, or Insights)
        if json_mode:
            # Moderation request check
            if "moderation" in str(messages).lower() or "allowed" in str(messages).lower():
                # Test check for abusive terms
                abusive_words = ["harass", "threat", "abuse", "slut", "chutiya", "madarchod", "gali", "kill", "bitch", "bastard"]
                is_abusive = any(w in user_lower for w in abusive_words)
                if is_abusive:
                    return json.dumps({
                        "allowed": False,
                        "category": "personal_abuse",
                        "severity": "high",
                        "reason": "Contains abusive or threatening language"
                    })
                return json.dumps({
                    "allowed": True,
                    "category": "criticism",
                    "severity": "low",
                    "reason": "Normal discussion or constructive criticism"
                })

            # Report routing check
            if "route" in str(messages).lower() or "department" in str(messages).lower():
                return json.dumps({
                    "department_id": "dept_academic",
                    "confidence": 0.88,
                    "short_title": user_msg[:40] if user_msg else "Campus Issue"
                })

            # Insights check
            return json.dumps({
                "topic": "Campus Facilities",
                "issue_type": "Infrastructure",
                "is_question": "?" in user_msg,
                "sentiment": "negative" if ("bad" in user_lower or "kharab" in user_lower) else "neutral",
                "mentioned_teacher_id": None,
                "summary": user_msg[:60] if user_msg else "General feedback"
            })

        # Plain text answer
        if "NOT_FOUND" in str(messages) and ("library" not in user_lower and "fee" not in user_lower):
            return "NOT_FOUND"

        return f"Based on the official college circular, please refer to the relevant academic office or submit a ticket via the Report tab."


groq_manager = GroqKeyManager()

