import time
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from app.models.schemas import (
    CreateCollegeRequest, UpdateCollegeRequest, CollegeResponse,
    CreateAdminRequest, AdminUserResponse,
    AddDomainRequest,
    CreateDepartmentRequest, UpdateDepartmentRequest, DepartmentResponse,
    CreateRepRequest, UpdateRepRequest, RepResponse,
    CreateTeacherRequest, TeacherResponse,
    FlaggedMessageResponse
)
from app.services.firebase_service import firebase_service
from app.dependencies.auth import get_current_user, require_admin, require_superadmin

router = APIRouter(prefix="/admin", tags=["Admin & Management"])


# ==========================================
# Super Admin Endpoints (Colleges & Admins CRUD)
# ==========================================

@router.post("/colleges", response_model=CollegeResponse)
async def create_college(
    req: CreateCollegeRequest,
    current_user: Dict[str, Any] = Depends(require_superadmin)
):
    """
    Super Admin endpoint to provision a new college tenant, its primary domain,
    and the College Administrator account.
    """
    college_id = f"col_{req.name.lower().replace(' ', '_')[:12]}_{int(time.time()) % 1000}"
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    # 1. Create College Record
    college_data = {
        "id": college_id,
        "name": req.name,
        "created_by": current_user["id"],
        "created_at": now_iso,
        "active": True
    }
    firebase_service.set_doc("colleges", college_id, college_data)

    # 2. Add Domain
    clean_domain = req.domain.replace("@", "").lower().strip()
    dom_id = f"dom_{clean_domain.replace('.', '_')}"
    firebase_service.set_doc("college_domains", dom_id, {
        "id": dom_id,
        "college_id": college_id,
        "domain": clean_domain
    })

    # 3. Create College Admin Profile
    admin_id = f"adm_{clean_domain.replace('.', '_')}"
    password = req.admin_password or "Admin@CampusFix123"
    firebase_service.set_doc("profiles", admin_id, {
        "id": admin_id,
        "college_id": college_id,
        "role": "admin",
        "full_name": req.admin_name,
        "email": str(req.admin_email).lower().strip(),
        "password": password,
        "created_at": now_iso
    })

    return CollegeResponse(
        id=college_id,
        name=req.name,
        created_by=current_user["id"],
        created_at=now_iso,
        domains=[clean_domain]
    )


@router.get("/colleges", response_model=List[CollegeResponse])
async def list_colleges(current_user: Dict[str, Any] = Depends(require_superadmin)):
    colleges = firebase_service.query("colleges")
    result = []
    for c in colleges:
        domains = [d["domain"] for d in firebase_service.query("college_domains", [("college_id", "==", c["id"])])]
        result.append(CollegeResponse(
            id=c["id"],
            name=c["name"],
            created_by=c.get("created_by", "system"),
            created_at=c.get("created_at", ""),
            domains=domains
        ))
    return result


@router.put("/colleges/{college_id}", response_model=CollegeResponse)
async def update_college(
    college_id: str,
    req: UpdateCollegeRequest,
    current_user: Dict[str, Any] = Depends(require_superadmin)
):
    college = firebase_service.get_doc("colleges", college_id)
    if not college:
        raise HTTPException(status_code=404, detail="College not found.")

    updates: Dict[str, Any] = {}
    if req.name:
        updates["name"] = req.name.strip()
    if updates:
        firebase_service.update_doc("colleges", college_id, updates)
        college.update(updates)

    if req.domain:
        clean_domain = req.domain.replace("@", "").lower().strip()
        # Clean previous domains for this college to maintain clean single/primary domain
        old_domains = firebase_service.query("college_domains", [("college_id", "==", college_id)])
        for od in old_domains:
            firebase_service.delete_doc("college_domains", od["id"])

        dom_id = f"dom_{clean_domain.replace('.', '_')}"
        firebase_service.set_doc("college_domains", dom_id, {
            "id": dom_id,
            "college_id": college_id,
            "domain": clean_domain
        })

    # Update or provision admin account
    admin_profiles = firebase_service.query("profiles", [("college_id", "==", college_id), ("role", "==", "admin")])
    if admin_profiles and (req.admin_email or req.admin_name or req.admin_password):
        admin_p = admin_profiles[0]
        admin_updates: Dict[str, Any] = {}
        if req.admin_email:
            admin_updates["email"] = str(req.admin_email).lower().strip()
        if req.admin_name:
            admin_updates["full_name"] = req.admin_name.strip()
        if req.admin_password and req.admin_password.strip():
            admin_updates["password"] = req.admin_password.strip()
        if admin_updates:
            firebase_service.update_doc("profiles", admin_p["id"], admin_updates)
    elif not admin_profiles and (req.admin_email or req.admin_name):
        clean_dom = (req.domain or "college").replace("@", "").lower().strip()
        admin_id = f"adm_{clean_dom.replace('.', '_')}"
        firebase_service.set_doc("profiles", admin_id, {
            "id": admin_id,
            "college_id": college_id,
            "role": "admin",
            "full_name": req.admin_name or "College Admin",
            "email": str(req.admin_email).lower().strip() if req.admin_email else f"admin@{clean_dom}",
            "password": req.admin_password or "Admin@CampusFix123",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        })

    domains = [d["domain"] for d in firebase_service.query("college_domains", [("college_id", "==", college_id)])]
    return CollegeResponse(
        id=college_id,
        name=college.get("name", ""),
        created_by=college.get("created_by", "system"),
        created_at=college.get("created_at", ""),
        domains=domains
    )


@router.delete("/colleges/{college_id}")
async def delete_college(
    college_id: str,
    current_user: Dict[str, Any] = Depends(require_superadmin)
):
    college = firebase_service.get_doc("colleges", college_id)
    if not college:
        raise HTTPException(status_code=404, detail="College not found.")

    # Cascading delete of associated tenant records
    firebase_service.delete_doc("colleges", college_id)

    # Delete domains
    for d in firebase_service.query("college_domains", [("college_id", "==", college_id)]):
        firebase_service.delete_doc("college_domains", d["id"])

    # Delete profiles (admins, reps, students of this college)
    for p in firebase_service.query("profiles", [("college_id", "==", college_id)]):
        firebase_service.delete_doc("profiles", p["id"])

    # Delete departments
    for dept in firebase_service.query("departments", [("college_id", "==", college_id)]):
        firebase_service.delete_doc("departments", dept["id"])

    # Delete reports
    for rep in firebase_service.query("reports", [("college_id", "==", college_id)]):
        firebase_service.delete_doc("reports", rep["id"])

    # Delete community messages
    for msg in firebase_service.query("community_messages", [("college_id", "==", college_id)]):
        firebase_service.delete_doc("community_messages", msg["id"])

    # Delete documents
    for doc in firebase_service.query("documents", [("college_id", "==", college_id)]):
        firebase_service.delete_doc("documents", doc["id"])

    return {"success": True, "message": f"College {college_id} and associated data deleted."}


# ── College Admins Management (Super Admin) ─────────────────────

@router.get("/admins", response_model=List[AdminUserResponse])
async def list_college_admins(current_user: Dict[str, Any] = Depends(require_superadmin)):
    admins = firebase_service.query("profiles", [("role", "==", "admin")])
    colleges_cache = {c["id"]: c["name"] for c in firebase_service.query("colleges")}
    result = []
    for a in admins:
        result.append(AdminUserResponse(
            id=a["id"],
            email=a["email"],
            full_name=a.get("full_name", "College Admin"),
            college_id=a.get("college_id", ""),
            college_name=colleges_cache.get(a.get("college_id", ""), "Unknown College"),
            created_at=a.get("created_at")
        ))
    return result


@router.post("/admins", response_model=AdminUserResponse)
async def create_college_admin(
    req: CreateAdminRequest,
    current_user: Dict[str, Any] = Depends(require_superadmin)
):
    email_str = str(req.email).lower().strip()
    admin_id = f"adm_{email_str.replace('@', '_').replace('.', '_')}"
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    profile_data = {
        "id": admin_id,
        "college_id": req.college_id,
        "role": "admin",
        "email": email_str,
        "full_name": req.full_name,
        "password": req.password or "Admin@CampusFix123",
        "created_at": now_iso
    }
    firebase_service.set_doc("profiles", admin_id, profile_data)
    college = firebase_service.get_doc("colleges", req.college_id)

    return AdminUserResponse(
        id=admin_id,
        email=email_str,
        full_name=req.full_name,
        college_id=req.college_id,
        college_name=college.get("name") if college else "Unknown College",
        created_at=now_iso
    )


@router.delete("/admins/{admin_id}")
async def delete_college_admin(
    admin_id: str,
    current_user: Dict[str, Any] = Depends(require_superadmin)
):
    profile = firebase_service.get_doc("profiles", admin_id)
    if not profile or profile.get("role") != "admin":
        raise HTTPException(status_code=404, detail="Admin account not found.")
    firebase_service.delete_doc("profiles", admin_id)
    return {"success": True, "message": f"Admin {admin_id} removed."}


# ==========================================
# College Admin Endpoints (Departments, Reps, Teachers, Moderation)
# ==========================================

@router.post("/domains")
async def add_college_domain(
    req: AddDomainRequest,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    college_id = current_user["college_id"]
    clean_domain = req.domain.replace("@", "").lower().strip()
    dom_id = f"dom_{clean_domain.replace('.', '_')}"

    firebase_service.set_doc("college_domains", dom_id, {
        "id": dom_id,
        "college_id": college_id,
        "domain": clean_domain
    })
    return {"success": True, "domain": clean_domain, "college_id": college_id}


# ── Departments CRUD ─────────────────────────────────────────────

@router.post("/departments", response_model=DepartmentResponse)
async def create_department(
    req: CreateDepartmentRequest,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    college_id = current_user["college_id"]
    dept_id = f"dept_{req.name.lower().replace(' ', '_')[:10]}_{int(time.time()) % 1000}"
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    dept_data = {
        "id": dept_id,
        "college_id": college_id,
        "name": req.name.strip(),
        "description": req.description.strip(),
        "created_at": now_iso
    }
    firebase_service.set_doc("departments", dept_id, dept_data)
    return DepartmentResponse(**dept_data)


@router.get("/departments", response_model=List[DepartmentResponse])
async def list_departments(current_user: Dict[str, Any] = Depends(get_current_user)):
    college_id = current_user["college_id"]
    depts = firebase_service.query("departments", [("college_id", "==", college_id)])
    return [DepartmentResponse(**d) for d in depts]


@router.put("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: str,
    req: UpdateDepartmentRequest,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    college_id = current_user["college_id"]
    dept = firebase_service.get_doc("departments", dept_id)
    if not dept or dept.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Department not found.")

    updates: Dict[str, Any] = {}
    if req.name:
        updates["name"] = req.name.strip()
    if req.description:
        updates["description"] = req.description.strip()

    if updates:
        firebase_service.update_doc("departments", dept_id, updates)
        dept.update(updates)

    return DepartmentResponse(**dept)


@router.delete("/departments/{dept_id}")
async def delete_department(
    dept_id: str,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    college_id = current_user["college_id"]
    dept = firebase_service.get_doc("departments", dept_id)
    if not dept or dept.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Department not found.")

    firebase_service.delete_doc("departments", dept_id)
    return {"success": True, "message": f"Department {dept_id} deleted."}


# ── Representatives CRUD ─────────────────────────────────────────

@router.post("/reps", response_model=RepResponse)
async def create_representative(
    req: CreateRepRequest,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    college_id = current_user["college_id"]
    email_str = str(req.email).lower().strip()
    rep_id = f"rep_{email_str.replace('@', '_').replace('.', '_')}"
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    profile_data = {
        "id": rep_id,
        "college_id": college_id,
        "role": "rep",
        "email": email_str,
        "full_name": req.full_name,
        "department_id": req.department_id,
        "password": req.password or "Rep@CampusFix123",
        "created_at": now_iso
    }
    firebase_service.set_doc("profiles", rep_id, profile_data)

    return RepResponse(
        id=rep_id,
        college_id=college_id,
        email=email_str,
        full_name=req.full_name,
        department_id=req.department_id,
        role="rep"
    )


@router.get("/reps", response_model=List[RepResponse])
async def list_representatives(current_user: Dict[str, Any] = Depends(require_admin)):
    college_id = current_user["college_id"]
    reps = firebase_service.query("profiles", [("college_id", "==", college_id), ("role", "==", "rep")])
    return [RepResponse(
        id=r["id"],
        college_id=r["college_id"],
        email=r["email"],
        full_name=r.get("full_name", "Representative"),
        department_id=r.get("department_id", ""),
        role=r["role"]
    ) for r in reps]


@router.put("/reps/{rep_id}", response_model=RepResponse)
async def update_representative(
    rep_id: str,
    req: UpdateRepRequest,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    college_id = current_user["college_id"]
    profile = firebase_service.get_doc("profiles", rep_id)
    if not profile or profile.get("college_id") != college_id or profile.get("role") != "rep":
        raise HTTPException(status_code=404, detail="Representative not found.")

    updates: Dict[str, Any] = {}
    if req.full_name:
        updates["full_name"] = req.full_name.strip()
    if req.department_id:
        updates["department_id"] = req.department_id.strip()

    if updates:
        firebase_service.update_doc("profiles", rep_id, updates)
        profile.update(updates)

    return RepResponse(
        id=rep_id,
        college_id=college_id,
        email=profile["email"],
        full_name=profile.get("full_name", "Representative"),
        department_id=profile.get("department_id", ""),
        role="rep"
    )


@router.delete("/reps/{rep_id}")
async def delete_representative(
    rep_id: str,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    college_id = current_user["college_id"]
    profile = firebase_service.get_doc("profiles", rep_id)
    if not profile or profile.get("college_id") != college_id or profile.get("role") != "rep":
        raise HTTPException(status_code=404, detail="Representative not found.")

    firebase_service.delete_doc("profiles", rep_id)
    return {"success": True, "message": f"Representative {rep_id} deleted."}


# ── Teachers / Entities CRUD ─────────────────────────────────────

@router.post("/teachers", response_model=TeacherResponse)
async def create_teacher(
    req: CreateTeacherRequest,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    college_id = current_user["college_id"]
    t_id = f"t_{int(time.time())}_{abs(hash(req.name)) % 1000}"

    teacher_data = {
        "id": t_id,
        "college_id": college_id,
        "name": req.name.strip(),
        "aliases": req.aliases
    }
    firebase_service.set_doc("teachers", t_id, teacher_data)
    return TeacherResponse(**teacher_data)


@router.get("/teachers", response_model=List[TeacherResponse])
async def list_teachers(current_user: Dict[str, Any] = Depends(require_admin)):
    college_id = current_user["college_id"]
    teachers = firebase_service.query("teachers", [("college_id", "==", college_id)])
    return [TeacherResponse(**t) for t in teachers]


@router.delete("/teachers/{teacher_id}")
async def delete_teacher(
    teacher_id: str,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    college_id = current_user["college_id"]
    teacher = firebase_service.get_doc("teachers", teacher_id)
    if not teacher or teacher.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Teacher not found.")

    firebase_service.delete_doc("teachers", teacher_id)
    return {"success": True, "message": f"Teacher {teacher_id} deleted."}


# ── Moderation Review Queue ──────────────────────────────────────

@router.get("/flagged-messages", response_model=List[FlaggedMessageResponse])
async def get_flagged_messages(current_user: Dict[str, Any] = Depends(require_admin)):
    """
    Harmful Messages & Moderation review queue for College Admins.
    Lists:
    1. Pre-moderation blocked harmful messages (with student's real name and email).
    2. Post-publication student reported messages.
    """
    college_id = current_user["college_id"]
    results = []

    # 1. Fetch pre-moderation blocked harmful messages
    blocked_records = firebase_service.query("flagged_messages", [("college_id", "==", college_id)])
    for b in blocked_records:
        if b.get("status", "pending") == "pending":
            results.append(FlaggedMessageResponse(
                message_id=b["id"],
                college_id=college_id,
                pseudonym=b.get("author_name", "Student User"),
                body=b.get("body", ""),
                flagged_reasons=[f"Blocked: {b.get('category', 'Harmful Content')} - {b.get('reason', 'Cuss words or abusive language')}"],
                report_count=1,
                created_at=b.get("created_at", ""),
                author_name=b.get("author_name"),
                author_email=b.get("author_email"),
                category=b.get("category", "Harmful Content"),
                reason=b.get("reason"),
                source=b.get("source", "pre_moderation_block")
            ))

    # 2. Fetch reported live messages
    flagged_msgs = firebase_service.query("community_messages", [("college_id", "==", college_id), ("flagged", "==", True)])
    for msg in flagged_msgs:
        # Try finding real author profile
        author_prof = firebase_service.get_doc("profiles", msg.get("user_id", ""))
        real_name = author_prof.get("full_name") if author_prof else None
        real_email = author_prof.get("email") if author_prof else None

        results.append(FlaggedMessageResponse(
            message_id=msg["id"],
            college_id=college_id,
            pseudonym=msg.get("pseudonym", "Anonymous Student"),
            body=msg.get("body", ""),
            flagged_reasons=[msg.get("flag_reason", "Reported by student")],
            report_count=1,
            created_at=msg.get("created_at", ""),
            author_name=real_name,
            author_email=real_email,
            category="User Reported",
            reason=msg.get("flag_reason", "Reported by community member"),
            source="community_report"
        ))

    # Sort newest first
    results.sort(key=lambda x: x.created_at, reverse=True)
    return results


@router.post("/flagged-messages/{message_id}/resolve")
async def resolve_flagged_message(
    message_id: str,
    action: str = "dismiss",  # "dismiss" or "delete"
    current_user: Dict[str, Any] = Depends(require_admin)
):
    college_id = current_user["college_id"]

    # Check in flagged_messages (pre-moderation)
    harmful_doc = firebase_service.get_doc("flagged_messages", message_id)
    if harmful_doc and harmful_doc.get("college_id") == college_id:
        if action == "delete":
            firebase_service.delete_doc("flagged_messages", message_id)
            return {"success": True, "message": "Harmful message log deleted."}
        else:
            firebase_service.update_doc("flagged_messages", message_id, {"status": "dismissed"})
            return {"success": True, "message": "Harmful message marked resolved."}

    # Check in community_messages (live reported)
    msg = firebase_service.get_doc("community_messages", message_id)
    if not msg or msg.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Message not found.")

    if action == "delete":
        firebase_service.delete_doc("community_messages", message_id)
        return {"success": True, "message": "Flagged message removed from feed."}
    else:
        firebase_service.update_doc("community_messages", message_id, {"flagged": False})
        return {"success": True, "message": "Flag dismissed."}
