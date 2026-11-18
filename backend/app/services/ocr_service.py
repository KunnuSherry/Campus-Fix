import io
import os
import logging
from typing import Tuple, List, Dict, Any
import fitz  # PyMuPDF
from PIL import Image
import pytesseract
from app.config import settings

logger = logging.getLogger("ocr_service")
logger.setLevel(logging.INFO)


class OCRService:
    def __init__(self):
        # Auto-detect Tesseract binary on Windows / Linux
        if settings.TESSERACT_CMD and os.path.exists(settings.TESSERACT_CMD):
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
        elif os.path.exists(r"C:\Program Files\Tesseract-OCR\tesseract.exe"):
            pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        elif os.path.exists(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"):
            pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"

    def extract_text_from_pdf_bytes(self, pdf_bytes: bytes) -> Dict[str, Any]:
        """
        Extracts text from PDF bytes using PyMuPDF.
        Pages with little or no extractable text (< 60 chars) are rendered
        and processed with Tesseract OCR.
        """
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        pages_data: List[Dict[str, Any]] = []
        ocr_pages: List[int] = []

        for page_idx in range(total_pages):
            page_num = page_idx + 1
            page = doc[page_idx]
            direct_text = page.get_text("text").strip()

            if len(direct_text) >= 60:
                pages_data.append({
                    "page": page_num,
                    "text": direct_text,
                    "source_type": "direct_text"
                })
            else:
                # Scanned page: render image and run OCR
                logger.info(f"Page {page_num} has minimal direct text ({len(direct_text)} chars). Running OCR...")
                ocr_text = self._ocr_page(page)
                combined_text = (direct_text + "\n" + ocr_text).strip() if direct_text else ocr_text.strip()
                pages_data.append({
                    "page": page_num,
                    "text": combined_text,
                    "source_type": "ocr"
                })
                ocr_pages.append(page_num)

        doc.close()

        full_text = "\n\n".join([f"--- Page {p['page']} ---\n{p['text']}" for p in pages_data])
        used_ocr = len(ocr_pages) > 0

        return {
            "total_pages": total_pages,
            "pages": pages_data,
            "used_ocr": used_ocr,
            "ocr_pages": ocr_pages,
            "full_text": full_text
        }

    def _ocr_page(self, page) -> str:
        pix = page.get_pixmap(dpi=150)
        png_bytes = pix.tobytes("png")

        # 1. Try local Tesseract if installed
        try:
            img = Image.open(io.BytesIO(png_bytes))
            ocr_text = pytesseract.image_to_string(img).strip()
            if ocr_text:
                logger.info(f"Local Tesseract OCR extracted {len(ocr_text)} chars")
                return ocr_text
        except Exception:
            pass

        # 2. Free Cloud OCR API (OCR.space - 500 free calls/day, zero local installation)
        try:
            import requests
            api_key = getattr(settings, "OCR_SPACE_API_KEY", None) or "helloworld"
            logger.info("Running free Cloud OCR via OCR.space...")
            res = requests.post(
                "https://api.ocr.space/parse/image",
                files={"filename": ("page.png", png_bytes, "image/png")},
                data={
                    "apikey": api_key,
                    "language": "eng",
                    "isOverlayRequired": False,
                    "detectOrientation": True,
                    "scale": True,
                    "OCREngine": "2",
                },
                timeout=20,
            )
            if res.status_code == 200:
                data = res.json()
                parsed_results = data.get("ParsedResults", [])
                if parsed_results:
                    parsed_text = parsed_results[0].get("ParsedText", "").strip()
                    if parsed_text:
                        logger.info(f"Cloud OCR succeeded: extracted {len(parsed_text)} chars")
                        return parsed_text
                    elif data.get("ErrorMessage"):
                        logger.warning(f"OCR.space message: {data.get('ErrorMessage')}")
        except Exception as cloud_err:
            logger.warning(f"Cloud OCR attempt error: {cloud_err}")

        logger.warning("All OCR methods exhausted. Falling back to manual entry.")
        return "(Scanned page: OCR engine pending or image text unreadable)"


ocr_service = OCRService()

