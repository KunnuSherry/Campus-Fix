import pytest
from app.services.rag_service import rag_service
from app.services.firebase_service import firebase_service


def test_embedding_and_cosine_similarity():
    emb1 = rag_service.generate_embedding("Library operating hours are from 9 AM to 8 PM on weekdays.")
    emb2 = rag_service.generate_embedding("What time does the college library open and close?")
    emb3 = rag_service.generate_embedding("Canteen menu has samosa, dosa, and noodles.")

    sim_related = rag_service.cosine_similarity(emb1, emb2)
    sim_unrelated = rag_service.cosine_similarity(emb1, emb3)

    assert len(emb1) == rag_service.embedding_dim
    assert sim_related > sim_unrelated


def test_chunking_preserves_metadata():
    pages = [
        {"page": 1, "text": "College circular regarding mid-semester examinations. All students must bring admit cards.", "source_type": "direct_text"}
    ]
    chunks = rag_service.chunk_document(
        document_id="doc_test_1",
        college_id="col_bpit",
        title="Exam Notice 2026",
        category="Academics",
        effective_date="2026-03-01",
        pages_data=pages
    )

    assert len(chunks) >= 1
    first_chunk = chunks[0]
    assert first_chunk["document_id"] == "doc_test_1"
    assert first_chunk["college_id"] == "col_bpit"
    assert first_chunk["page"] == 1
    assert "embedding" in first_chunk


@pytest.mark.asyncio
async def test_tenant_isolation_in_rag():
    # Insert chunk for College A
    chunk_a = {
        "id": "chunk_col_a",
        "document_id": "doc_a",
        "college_id": "col_bpit",
        "page": 1,
        "title": "BPIT Library Rules",
        "category": "Rules",
        "effective_date": "2026-01-01",
        "source_type": "direct_text",
        "content": "BPIT library cards allow borrowing 4 books for 14 days.",
        "embedding": rag_service.generate_embedding("BPIT library cards allow borrowing 4 books for 14 days.")
    }
    firebase_service.set_doc("doc_chunks", "chunk_col_a", chunk_a)

    # Student from College B asks the exact question
    res_b = await rag_service.answer_question(
        college_id="col_other_college",
        user_id="student_other",
        question="How many books can I borrow from BPIT library?"
    )

    # Should NOT retrieve chunks from College A
    assert res_b.answered is False
    assert len(res_b.citations) == 0

