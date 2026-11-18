import time
import re
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, status
from app.models.schemas import IngestDocPreviewResponse, PublishDocRequest
from app.services.firebase_service import firebase_service
from app.services.ocr_service import ocr_service
from app.services.rag_service import rag_service
from app.dependencies.auth import get_current_user, require_rep

router = APIRouter(prefix="/documents", tags=["Document Ingestion & Management"])


@router.post("/upload", response_model=IngestDocPreviewResponse)
async def upload_document_preview(
    title: str = Form(...),
    category: str = Form("CIRCULAR"),
    effective_date: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_rep)
):
    """
    Step 1 of Ingestion:
    Extracts text using PyMuPDF. Scanned pages are rendered and OCR-processed.
    Returns preview and OCR-marked pages to the Admin/Rep before publishing.
    """
    college_id = current_user["college_id"]
    if not effective_date or not effective_date.strip():
        effective_date = time.strftime("%Y-%m-%d")
    contents = await file.read()

    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extracted = ocr_service.extract_text_from_pdf_bytes(contents)

    doc_id = f"doc_{int(time.time())}_{abs(hash(title)) % 1000}"
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    doc_record = {
        "id": doc_id,
        "college_id": college_id,
        "title": title,
        "category": category,
        "effective_date": effective_date,
        "storage_path": f"colleges/{college_id}/docs/{doc_id}.pdf",
        "status": "PENDING_PREVIEW",
        "used_ocr": extracted["used_ocr"],
        "ocr_pages": extracted["ocr_pages"],
        "total_pages": extracted["total_pages"],
        "extracted_text": extracted["full_text"],
        "pages_data": extracted["pages"],
        "created_at": now_iso
    }
    firebase_service.set_doc("documents", doc_id, doc_record)

    return IngestDocPreviewResponse(
        document_id=doc_id,
        title=title,
        category=category,
        effective_date=effective_date,
        total_pages=extracted["total_pages"],
        used_ocr=extracted["used_ocr"],
        ocr_pages=extracted["ocr_pages"],
        extracted_text_preview=extracted["full_text"]
    )


@router.post("/publish")
async def publish_document(
    req: PublishDocRequest,
    current_user: Dict[str, Any] = Depends(require_rep)
):
    """
    Step 2 of Ingestion:
    Admin confirms/edits OCR text and publishes.
    Chunks text, computes embeddings, and stores them in doc_chunks.
    """
    doc = firebase_service.get_doc("documents", req.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document record not found.")

    college_id = current_user["college_id"]
    if doc.get("college_id") != college_id:
        raise HTTPException(status_code=403, detail="Document belongs to another college.")

    pages_data = doc.get("pages_data", [])
    if req.corrected_text and req.corrected_text.strip():
        corrected = req.corrected_text.strip()
        # If admin supplied manual corrections and they differ from original extracted text
        if corrected != doc.get("extracted_text", "").strip():
            # If text includes page headers like "--- Page 1 ---"
            pattern = r"---\s*Page\s+(\d+)\s*---"
            splits = re.split(pattern, corrected)
            if len(splits) > 1:
                new_pages = []
                for i in range(1, len(splits), 2):
                    p_num = int(splits[i])
                    p_txt = splits[i + 1].strip()
                    new_pages.append({
                        "page": p_num,
                        "text": p_txt,
                        "source_type": "corrected"
                    })
                if new_pages:
                    pages_data = new_pages
            else:
                pages_data = [{"page": 1, "text": corrected, "source_type": "corrected"}]

    chunks = rag_service.chunk_document(
        document_id=doc["id"],
        college_id=college_id,
        title=doc["title"],
        category=doc["category"],
        effective_date=doc["effective_date"],
        pages_data=pages_data
    )

    # Store chunks
    for c in chunks:
        firebase_service.set_doc("doc_chunks", c["id"], c)

    # Update document status to PUBLISHED
    firebase_service.update_doc("documents", req.document_id, {
        "status": "PUBLISHED",
        "chunks_count": len(chunks),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
    })

    return {
        "success": True,
        "document_id": req.document_id,
        "chunks_stored": len(chunks),
        "status": "PUBLISHED"
    }


@router.get("")
async def list_documents(current_user: Dict[str, Any] = Depends(get_current_user)):
    college_id = current_user["college_id"]
    docs = firebase_service.query("documents", [("college_id", "==", college_id)])
    # Exclude bulky raw text
    return [{
        "id": d["id"],
        "title": d["title"],
        "category": d["category"],
        "effective_date": d["effective_date"],
        "status": d.get("status", "PUBLISHED"),
        "used_ocr": d.get("used_ocr", False),
        "total_pages": d.get("total_pages", 1),
        "chunks_count": d.get("chunks_count", 0),
        "created_at": d.get("created_at")
    } for d in docs]


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    current_user: Dict[str, Any] = Depends(require_rep)
):
    college_id = current_user["college_id"]
    doc = firebase_service.get_doc("documents", doc_id)
    if not doc or doc.get("college_id") != college_id:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Delete doc record
    firebase_service.delete_doc("documents", doc_id)

    # Delete corresponding RAG vector chunks
    chunks = firebase_service.query("doc_chunks", [("document_id", "==", doc_id)])
    for c in chunks:
        firebase_service.delete_doc("doc_chunks", c["id"])

    return {"success": True, "message": f"Document {doc_id} and its vector chunks deleted."}

