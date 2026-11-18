# CampusFix — Autonomous Multi-College Platform

CampusFix is an autonomous, multi-college student problem solving and community mobile application and backend built completely from scratch using **Expo (React Native) + TypeScript**, **Python FastAPI**, **Cloud Firestore**, **Groq API with Qwen LLM (5-key rotation & fallback)**, and **Resend Transactional Email**.

---

## 1. Quick Start — Run Locally on Browser

### Step 1: Ensure Backend is Running
Open a terminal in the `backend` folder:
```powershell
cd backend
.\.venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
> Verify backend health by visiting: `http://localhost:8000/health` (should return `"status": "healthy"`).

### Step 2: Start Mobile App in Web Browser
Open a second terminal in the `mobile` folder:
```powershell
cd mobile
npx expo start --web
```
*(Or if Expo is already running with `npx expo start`, simply press **`w`** in the terminal).*

The web version of CampusFix will automatically bundle and launch in your browser at:
👉 **`http://localhost:8081`**

---

## 2. Default Login Credentials & Fresh Start State

> **Database is Freshly Cleaned:** All demo colleges, dummy reports, and sample data have been wiped.
> **Only the Super Admin account exists in the database.** You can now create your own college, configure official allowed domains, provision departments, and onboard real students from scratch!

### 🔑 Super Admin Credentials (Use the "Staff & Admin" Tab)

| Role | Email | Password | Landing Portal |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@campusfix.internal` | `SuperAdmin@CampusFix123` | `/(superadmin)/colleges` |

> *(Testing Master Password: `CampusFix@2026` also works for any staff account during testing).*

---

### 🌐 How Domain Verification Works (Zero-Trust Security)

When a student signs in:
1. They enter their college email (e.g. `rohit@dtu.ac.in`).
2. The backend **strictly validates the domain** (`@dtu.ac.in`) against registered colleges in Firestore (`college_domains`).
3. **If the domain is NOT registered:**
   - 🛑 The system halts onboarding immediately.
   - Shows: *"Your college domain (@dtu.ac.in) is not registered on CampusFix. Please contact your college administration."*
   - No OTP is sent, and no user profile is created.
4. **If the domain IS registered:**
   - ✅ Generates a 6-digit OTP delivered via Resend email (and displayed on screen in Dev Mode).
   - Once verified, the student is strictly locked to that college's isolated tenant data.

---

## 3. Complete CRUD Operations Across All Roles

### 👑 Super Admin
- **Colleges (Tenants)**:
  - **Create**: Add new college with name, official domain, and admin credentials.
  - **Read**: View list of all active college tenants and allowed domains.
  - **Delete**: Remove college and its associated data (with safety confirmation).
- **College Administrators**:
  - **Create**: Add new administrator accounts for any college.
  - **Read**: View list of registered college administrators.
  - **Delete**: Revoke and delete administrator accounts.

### 🏛️ College Administrator
- **Departments**:
  - **Create**: Add departments (e.g. *Infrastructure*, *Hostels*, *Academics*).
  - **Read**: View all college departments and descriptions.
  - **Delete**: Remove departments.
- **Department Representatives**:
  - **Create**: Add reps with email, password, and assigned department.
  - **Read**: View list of representatives and their assigned department pills.
  - **Delete**: Remove representatives.
- **Faculty / Entities**:
  - **Create**: Register teachers and their common student aliases (for insights & routing).
  - **Read**: View registered faculty list.
  - **Delete**: Remove faculty member.
- **Documents & Circulars**:
  - **Upload & Publish**: Upload PDF circulars, perform OCR, and index chunks into vector search.
  - **Read**: List published circulars and embedded chunk counts.
  - **Delete**: Remove circular and its corresponding vector chunks from RAG.
- **Moderation Queue**:
  - **Read**: Review student-reported community messages.
  - **Resolve**: Dismiss flag or permanently delete inappropriate message from feed.

### 👔 Department Representative
- **Reports (Tickets)**:
  - **Read**: View reports strictly assigned to their department.
  - **Update Status**: Transition ticket (`IN_PROGRESS`, `RESOLVED`).
  - **Chat**: Exchange real-time messages with the student.
  - **Delete**: Remove/archive resolved reports.

### 🎓 Student
- **Reports (Tickets)**:
  - **Create**: File issue with description, auto AI department routing, and base64 image evidence.
  - **Read**: View own submitted tickets, timelines, and status badges.
  - **Chat**: Reply to department representative in realtime.
  - **Cancel/Delete**: Cancel own ticket if still in `OPEN` status.
  - **Reopen**: Reopen ticket if resolved unsatisfactorily.
- **Community Chat**:
  - **Create**: Post messages under an anonymous pseudonym (e.g. *Blue Falcon 214*).
  - **Read**: Real-time group chat.
  - **Delete**: Delete own messages at any time.
  - **Flag/Report**: Report inappropriate messages for admin review.

---

## 3. Step-by-Step Testing Guide

### Test 1: Super Admin — College Management
1. Go to **Staff & Admin** tab on the Login page.
2. Sign in with:
   - Email: `superadmin@campusfix.internal`
   - Password: `SuperAdmin@CampusFix123`
3. You will be routed to the Super Admin Colleges view.
4. View the list of registered colleges (e.g., *Bhagwan Parshuram Institute of Technology*).
5. Click **+ New College**:
   - College Name: `Delhi Technological University`
   - Allowed Email Domain: `dtu.ac.in`
   - Admin Full Name: `DTU Admin`
   - Admin Email: `admin@dtu.ac.in`
6. Click **Create College**. The new college and its admin profile will be provisioned in Firestore.
7. Click the top-right **Logout** icon.

---

### Test 2: Student — RAG Assist (AI Circular Assistant)
1. Sign in as a student using `kunal123@bpitindia.in`.
2. On the **Assist** tab, type a question:
   - Try: *"What is the attendance requirement to sit in end-term exams?"*
   - Or: *"When is the mid-term fee submission deadline?"*
3. The Groq Qwen-powered RAG pipeline searches the official college circulars indexed in Firestore, computes semantic similarity, and provides a sourced answer.
4. If you ask something not in the official documents (e.g., *"How do I fix the broken AC in Lab 3?"*), the AI responds with `NOT_FOUND` and immediately provides a button: **"File a Report with Infrastructure Dept"**.

---

### Test 3: Student — File a Report & AI Routing
1. Tap the **Report** tab at the bottom navigation.
2. Click **+ New Report**:
   - **Title**: *"Water leakage in Room 302 third floor"*
   - **Description**: *"Severe water leakage from the ceiling causing puddles near electric points."*
3. Notice how the AI auto-suggests the assigned department (**Infrastructure & Facilities**) with a confidence score.
4. (Optional) Attach a photo evidence. Photos are compressed and saved directly as base64 in Firestore.
5. Submit the report. You will see your ticket created with status `OPEN` and an event timeline.
6. Open the ticket and send a message to the department representative: *"Please fix this urgently before tomorrow's class."*

---

### Test 4: Department Representative — Ticket Resolution & Chat
1. Log out and switch to the **Staff & Admin** tab.
2. Sign in as Department Rep:
   - Email: `rohan.rep@bpitindia.in`
   - Password: `Rep@CampusFix123`
3. You will be routed to the Representative Inbox (`/(rep)/inbox`).
4. You will see the report filed by student `kunal123` assigned to your department.
5. Open the ticket:
   - Notice the student's identity is strictly their email prefix (`kunal123`) to prevent bias.
   - Reply to the student: *"Maintenance team has been dispatched."*
   - Change status to **IN_PROGRESS**, then **RESOLVED**.
6. The student immediately sees the status update and timeline in real time.

---

### Test 5: Student — Anonymous Community & AI Pre-Moderation
1. Sign back in as student (`kunal123@bpitindia.in`).
2. Tap the **Community** tab.
3. You will see your pseudonym (e.g. `Blue Falcon 214`). Your real name and email are completely hidden.
4. **Test Safe Post / Criticism**:
   - Type: *"The mess food quality this week has been really inconsistent."*
   - Post it. Notice it publishes successfully because legitimate student complaints/criticism are allowed.
5. **Test AI Content Moderation Filter**:
   - Type an abusive or threatening message (e.g., abusive slurs, personal threats, or doxxing phone numbers/addresses).
   - Post it.
   - Notice the message is **blocked before publication** with a clear explanation: *"Violates community safety rules: personal abuse/threat detected."*

---

### Test 6: College Admin — Document Upload & Analytics
1. Sign in as College Admin:
   - Email: `admin@bpitindia.in`
   - Password: `Admin@CampusFix123`
2. You will be routed to the Admin Dashboard (`/(admin)/dashboard`).
3. View high-level metrics:
   - Open reports vs resolved reports
   - Department breakdown
   - Flagged community moderation logs
4. **Document Upload**:
   - Upload academic notices or circulars (PDF or text).
   - The backend extracts text, generates vector embeddings, and updates the RAG Assist index for students.

---

## 4. Architecture & Key Technical Decisions

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend** | React Native (Expo SDK 58) | Runs on Web, Android, and iOS using Expo Router |
| **Backend** | Python FastAPI (Python 3.11+) | Asynchronous, Pydantic v2 schemas, REST endpoints |
| **Database** | Google Cloud Firestore | NoSQL tenant-isolated collections (`colleges`, `profiles`, `reports`, `community_messages`, `documents`) |
| **Image Storage** | Firestore Base64 Data URI | Free-tier compatible; images compressed (`quality: 0.5`) and stored directly in Firestore |
| **AI LLM** | Groq API (`qwen/qwen3.8-27b`) | 5 API keys rotated round-robin with automatic fallback on rate limit (HTTP 429) |
| **Email** | Resend API | Transactional OTP delivery to institutional emails |
| **Tests** | Pytest | 17 automated tests covering Auth, RAG, Routing, Moderation, and Key Rotation |

---

## 5. Running Automated Backend Tests

To verify that all backend services, Groq key rotation, and Firestore rules pass:
```powershell
cd backend
.\.venv\Scripts\pytest.exe -v
```
Expected result: **17 passed, 0 failed**.
