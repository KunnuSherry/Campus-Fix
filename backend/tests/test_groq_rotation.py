import pytest
import asyncio
from unittest.mock import patch, MagicMock
from app.services.groq_service import GroqKeyManager
from groq import RateLimitError


@pytest.mark.asyncio
async def test_groq_key_round_robin():
    manager = GroqKeyManager()
    # Mock configured keys with 5 keys
    with patch.object(manager, 'get_configured_keys', return_value=["key1", "key2", "key3", "key4", "key5"]):
        k1, idx1 = manager._get_next_key_info()
        k2, idx2 = manager._get_next_key_info()
        k3, idx3 = manager._get_next_key_info()
        k4, idx4 = manager._get_next_key_info()
        k5, idx5 = manager._get_next_key_info()
        k6, idx6 = manager._get_next_key_info()

        assert idx1 == 1 and k1 == "key1"
        assert idx2 == 2 and k2 == "key2"
        assert idx3 == 3 and k3 == "key3"
        assert idx4 == 4 and k4 == "key4"
        assert idx5 == 5 and k5 == "key5"
        # Wrap around
        assert idx6 == 1 and k6 == "key1"


@pytest.mark.asyncio
async def test_groq_fallback_on_rate_limit():
    manager = GroqKeyManager()
    with patch.object(manager, 'get_configured_keys', return_value=["key_bad", "key_good"]):
        call_count = 0

        def mock_create(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # Simulate 429 RateLimitError on first key
                response = MagicMock()
                response.status_code = 429
                raise RateLimitError("Rate limit exceeded", response=response, body=None)
            
            # Second key succeeds
            mock_res = MagicMock()
            mock_res.choices = [MagicMock(message=MagicMock(content="Success on key 2"))]
            return mock_res

        with patch('groq.resources.chat.completions.Completions.create', side_effect=mock_create):
            result = await manager.chat_completion(
                messages=[{"role": "user", "content": "Hello"}],
                temperature=0.1
            )
            assert result == "Success on key 2"
            assert call_count == 2

