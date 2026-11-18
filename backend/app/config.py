from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    PROJECT_NAME: str = "CampusFix API"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Groq API Configuration (5 Keys for safe rotation and rate-limit fallback)
    GROQ_API_KEY_1: str = ""
    GROQ_API_KEY_2: str = ""
    GROQ_API_KEY_3: str = ""
    GROQ_API_KEY_4: str = ""
    GROQ_API_KEY_5: str = ""
    GROQ_MODEL: str = "qwen/qwen3.8-27b"

    # Resend Transactional Email
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "CampusFix <onboarding@resend.dev>"

    # Firebase Admin SDK Configuration
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_PRIVATE_KEY: str = ""
    FIREBASE_CLIENT_EMAIL: str = ""
    FIREBASE_CREDENTIALS_PATH: Optional[str] = None
    FIREBASE_STORAGE_BUCKET: str = ""

    # OCR / Tesseract & Cloud OCR
    TESSERACT_CMD: Optional[str] = None
    OCR_SPACE_API_KEY: Optional[str] = "helloworld"

    # Dev / Testing Mode
    AUTH_DEV_MODE: bool = True  # Allows OTP bypass/mocking in tests when Resend key is empty

    # CORS
    CORS_ORIGINS: List[str] = ["*"]

    @property
    def groq_keys(self) -> List[str]:
        keys = [
            self.GROQ_API_KEY_1.strip(),
            self.GROQ_API_KEY_2.strip(),
            self.GROQ_API_KEY_3.strip(),
            self.GROQ_API_KEY_4.strip(),
            self.GROQ_API_KEY_5.strip(),
        ]
        return [k for k in keys if k]




settings = Settings()
