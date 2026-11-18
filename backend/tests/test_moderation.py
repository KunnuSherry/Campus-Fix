import pytest
from app.services.moderation_service import moderation_service


@pytest.mark.asyncio
async def test_criticism_allowed():
    # Negative criticism should be allowed
    criticism_hinglish = "Canteen ka food quality bahut kharab hai, college ko improve karna chahiye."
    result = await moderation_service.moderate(criticism_hinglish)
    assert result.allowed is True
    assert result.category in ["criticism", "general_discussion"]

    criticism_english = "The library AC is constantly broken and staff is very slow to fix it."
    result_en = await moderation_service.moderate(criticism_english)
    assert result_en.allowed is True


@pytest.mark.asyncio
async def test_abuse_blocked():
    # Targeted personal abuse must be blocked
    abusive_msg = "You are a dirty chutiya and idiot."
    result = await moderation_service.moderate(abusive_msg)
    assert result.allowed is False
    assert result.severity in ["medium", "high"]


@pytest.mark.asyncio
async def test_threat_blocked():
    threat_msg = "I will kill you after class outside gate."
    result = await moderation_service.moderate(threat_msg)
    assert result.allowed is False


@pytest.mark.asyncio
async def test_doxxing_blocked():
    dox_msg = "Call this student on 9876543210 to harass them."
    result = await moderation_service.moderate(dox_msg)
    assert result.allowed is False
    assert result.category == "doxxing"

