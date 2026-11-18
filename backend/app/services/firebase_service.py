import os
import json
import logging
import time
from typing import Dict, Any, List, Optional
import firebase_admin
from firebase_admin import credentials, firestore, auth, storage
from app.config import settings

logger = logging.getLogger("firebase_service")
logger.setLevel(logging.INFO)


class FirebaseService:
    def __init__(self):
        self.app = None
        self.db = None
        self.bucket = None
        self.is_live = False

        # In-memory storage for dev / mock mode when live credentials are not present
        self._mock_data: Dict[str, Dict[str, Dict[str, Any]]] = {
            "colleges": {},
            "college_domains": {},
            "profiles": {},
            "departments": {},
            "documents": {},
            "doc_chunks": {},
            "assist_logs": {},
            "reports": {},
            "report_messages": {},
            "report_events": {},
            "community_messages": {},
            "message_analysis": {},
            "teachers": {},
            "audit_log": {},
            "otps": {}
        }
        self._init_firebase()
        self._ensure_superadmin_exists()

    def _init_firebase(self):
        try:
            cred = None
            if settings.FIREBASE_CREDENTIALS_PATH and os.path.exists(settings.FIREBASE_CREDENTIALS_PATH):
                cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            elif settings.FIREBASE_PROJECT_ID and settings.FIREBASE_PRIVATE_KEY and settings.FIREBASE_CLIENT_EMAIL:
                private_key = settings.FIREBASE_PRIVATE_KEY.replace("\\n", "\n")
                cred = credentials.Certificate({
                    "type": "service_account",
                    "project_id": settings.FIREBASE_PROJECT_ID,
                    "private_key": private_key,
                    "client_email": settings.FIREBASE_CLIENT_EMAIL,
                    "token_uri": "https://oauth2.googleapis.com/token",
                })

            if cred:
                options = {}
                if settings.FIREBASE_STORAGE_BUCKET:
                    options["storageBucket"] = settings.FIREBASE_STORAGE_BUCKET
                
                if not firebase_admin._apps:
                    self.app = firebase_admin.initialize_app(cred, options)
                else:
                    self.app = firebase_admin.get_app()

                self.db = firestore.client()
                if settings.FIREBASE_STORAGE_BUCKET:
                    try:
                        self.bucket = storage.bucket()
                    except Exception as b_err:
                        logger.warning(f"Storage bucket skipped (using Firestore Base64): {b_err}")
                self.is_live = True
                logger.info("Connected to live Firebase Firestore & Auth successfully.")
            else:
                logger.warning("No Firebase credentials provided. Running in high-fidelity in-memory store for local development.")
                self.is_live = False
        except Exception as e:
            logger.error(f"Failed to initialize live Firebase: {e}. Falling back to in-memory store.")
            self.is_live = False

    def _ensure_superadmin_exists(self):
        """Seed ONLY superadmin profile if not already present. NEVER recreate demo colleges or departments."""
        superadmin = self.get_doc("profiles", "superadmin_1")
        if not superadmin:
            self.set_doc("profiles", "superadmin_1", {
                "id": "superadmin_1",
                "college_id": "platform",
                "role": "superadmin",
                "full_name": "CampusFix Super Admin",
                "email": "superadmin@campusfix.internal",
                "password": "SuperAdmin@CampusFix123",
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
            })

    # ==========================================
    # Firestore CRUD operations
    # ==========================================

    def get_doc(self, collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
        if self.is_live and self.db:
            try:
                snap = self.db.collection(collection).document(doc_id).get()
                if snap.exists:
                    data = snap.to_dict()
                    data["id"] = snap.id
                    return data
                return None
            except Exception as e:
                logger.error(f"Error fetching {collection}/{doc_id}: {e}")

        # Fallback to in-memory store
        return self._mock_data.get(collection, {}).get(doc_id)

    def set_doc(self, collection: str, doc_id: str, data: Dict[str, Any]) -> None:
        data["id"] = doc_id
        if self.is_live and self.db:
            try:
                self.db.collection(collection).document(doc_id).set(data)
            except Exception as e:
                logger.error(f"Error writing to live Firestore {collection}/{doc_id}: {e}")

        # Always update memory cache
        if collection not in self._mock_data:
            self._mock_data[collection] = {}
        self._mock_data[collection][doc_id] = data

    def update_doc(self, collection: str, doc_id: str, data: Dict[str, Any]) -> None:
        if self.is_live and self.db:
            try:
                self.db.collection(collection).document(doc_id).update(data)
            except Exception as e:
                logger.error(f"Error updating live Firestore {collection}/{doc_id}: {e}")

        if collection in self._mock_data and doc_id in self._mock_data[collection]:
            self._mock_data[collection][doc_id].update(data)

    def delete_doc(self, collection: str, doc_id: str) -> None:
        if self.is_live and self.db:
            try:
                self.db.collection(collection).document(doc_id).delete()
            except Exception as e:
                logger.error(f"Error deleting live Firestore {collection}/{doc_id}: {e}")

        if collection in self._mock_data and doc_id in self._mock_data[collection]:
            del self._mock_data[collection][doc_id]

    def query(self, collection: str, filters: List[tuple] = None) -> List[Dict[str, Any]]:
        """
        filters: list of (field, op, value) tuples e.g. [('college_id', '==', 'col_bpit')]
        """
        if self.is_live and self.db:
            try:
                ref = self.db.collection(collection)
                if filters:
                    for field, op, val in filters:
                        ref = ref.where(field, op, val)
                docs = ref.stream()
                results = []
                for d in docs:
                    item = d.to_dict()
                    item["id"] = d.id
                    results.append(item)
                return results
            except Exception as e:
                logger.error(f"Error querying live Firestore {collection}: {e}")

        # In-memory query
        coll = self._mock_data.get(collection, {})
        results = list(coll.values())
        if filters:
            for field, op, val in filters:
                if op == "==":
                    results = [item for item in results if item.get(field) == val]
                elif op == "!=":
                    results = [item for item in results if item.get(field) != val]
                elif op == "in":
                    results = [item for item in results if item.get(field) in val]
        return results

    # ==========================================
    # Authentication & Tokens
    # ==========================================

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verifies a Firebase ID token.
        In dev mode, allows simulated Bearer tokens of form 'mock_user_<id>' or 'user_<id>'.
        """
        if not token:
            return None

        clean_token = token.replace("Bearer ", "").strip()

        if self.is_live and not clean_token.startswith("mock_"):
            try:
                decoded = auth.verify_id_token(clean_token)
                return decoded
            except Exception as e:
                logger.warning(f"Live token verification failed: {e}")

        # Dev / Mock token support
        if clean_token.startswith("mock_") or settings.AUTH_DEV_MODE:
            uid = clean_token.replace("mock_", "")
            # Look up profile
            profile = self.get_doc("profiles", uid)
            if profile:
                return {
                    "uid": uid,
                    "email": profile.get("email"),
                    "role": profile.get("role"),
                    "college_id": profile.get("college_id"),
                }
            # Or if clean_token has format mock_<role>_<college>
            parts = uid.split("_")
            role = parts[0] if len(parts) > 0 else "student"
            return {
                "uid": uid,
                "email": f"{uid}@bpitindia.in",
                "role": role if role in ["student", "rep", "admin", "superadmin"] else "student",
                "college_id": "col_bpit"
            }

        return None


firebase_service = FirebaseService()

