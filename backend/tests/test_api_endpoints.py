import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.firebase_service import firebase_service


@pytest.mark.asyncio
async def test_health_check_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert "groq_model" in data


@pytest.mark.asyncio
async def test_auth_domain_check_allowed_and_rejected():
    firebase_service.set_doc("colleges", "col_bpit", {"id": "col_bpit", "name": "BPIT", "active": True})
    firebase_service.set_doc("college_domains", "dom_bpit", {"id": "dom_bpit", "college_id": "col_bpit", "domain": "bpitindia.in"})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Allowed domain (bpitindia.in is registered)
        res_ok = await ac.post("/auth/check-domain", json={"email": "kunal123@bpitindia.in"})
        assert res_ok.status_code == 200
        assert res_ok.json()["allowed"] is True
        assert res_ok.json()["college_id"] == "col_bpit"

        # 2. Unregistered domain
        res_bad = await ac.post("/auth/check-domain", json={"email": "student@randomunregisteredcollege.ac.in"})
        assert res_bad.status_code == 200
        assert res_bad.json()["allowed"] is False
        assert "not registered" in res_bad.json()["message"]

    firebase_service.delete_doc("colleges", "col_bpit")
    firebase_service.delete_doc("college_domains", "dom_bpit")


@pytest.mark.asyncio
async def test_auth_full_onboarding_flow():
    firebase_service.set_doc("colleges", "col_bpit", {"id": "col_bpit", "name": "BPIT", "active": True})
    firebase_service.set_doc("college_domains", "dom_bpit", {"id": "dom_bpit", "college_id": "col_bpit", "domain": "bpitindia.in"})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Send OTP
        res_otp = await ac.post("/auth/send-otp", json={"email": "aarav.test@bpitindia.in"})
        assert res_otp.status_code == 200
        code = res_otp.json().get("debug_code") or "123456"

        # 2. Verify OTP and create profile
        res_ver = await ac.post("/auth/verify", json={
            "email": "aarav.test@bpitindia.in",
            "code": code,
            "full_name": "Aarav Sharma"
        })
        assert res_ver.status_code == 200
        data = res_ver.json()
        assert data["success"] is True
        assert data["college_id"] == "col_bpit"
        assert "pseudonym" in data
        assert len(data["pseudonym"]) > 3
        token = data["token"]

        # 3. Use Token to get profile
        headers = {"Authorization": f"Bearer {token}"}
        res_me = await ac.get("/auth/me", headers=headers)
        assert res_me.status_code == 200
        me = res_me.json()
        assert me["email"] == "aarav.test@bpitindia.in"
        assert me["role"] == "student"

    firebase_service.delete_doc("colleges", "col_bpit")
    firebase_service.delete_doc("college_domains", "dom_bpit")


@pytest.mark.asyncio
async def test_community_publish_flow():
    token = "mock_stu_aarav_test"
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Publish valid criticism
        res = await ac.post("/community/publish", json={
            "body": "Hostel mess mein aaj dinner achha nahi tha, menu change hona chahiye."
        }, headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["published_message"]["body"] == "Hostel mess mein aaj dinner achha nahi tha, menu change hona chahiye."
        assert "user_id" not in data["published_message"]  # Anonymity preserved in public payload!

        # Attempt to publish abusive message
        res_abusive = await ac.post("/community/publish", json={
            "body": "You chutiya idiot I will beat you up."
        }, headers=headers)
        assert res_abusive.status_code == 200
        data_abusive = res_abusive.json()
        assert data_abusive["success"] is False
        assert data_abusive["published_message"] is None
        assert data_abusive["moderation"]["allowed"] is False

