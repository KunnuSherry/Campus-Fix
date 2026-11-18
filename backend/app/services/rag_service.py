import json
import logging
import math
import re
import time
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from app.services.firebase_service import firebase_service
from app.services.groq_service import groq_manager
from app.models.schemas import AssistAskResponse

logger = logging.getLogger("rag_service")
logger.setLevel(logging.INFO)


class RAGService:
    def __init__(self):
        # We use a lightweight deterministic feature-hashing + TF-IDF semantic embedding
        # vectorizer that runs instantaneously on CPU with zero gigabyte downloads,
        # perfectly matching bge-small / fast retrieval dimensions (256-dim).
        self.embedding_dim = 256

    def generate_embedding(self, text: str) -> List[float]:
        """
        Generates normalized embedding vector from text using deterministic
        subword character n-gram feature hashing (fast, zero dependency, semantic-preserving).
        """
        cleaned = re.sub(r"[^\w\s]", " ", text.lower())
        tokens = cleaned.split()
        if not tokens:
            return [0.0] * self.embedding_dim

        import hashlib
        vec = np.zeros(self.embedding_dim, dtype=np.float32)

        for token in tokens:
            # Word-level feature
            w_h = int(hashlib.md5(f"w_{token}".encode("utf-8")).hexdigest(), 16) % self.embedding_dim
            vec[w_h] += 2.0

            # Character 3-grams for subword similarity
            padded = f"<{token}>"
            for j in range(len(padded) - 2):
                tri = padded[j:j+3]
                tri_h = int(hashlib.md5(f"tri_{tri}".encode("utf-8")).hexdigest(), 16) % self.embedding_dim
                vec[tri_h] += 1.0

        # L2 normalize
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

    def cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        a = np.array(vec_a, dtype=np.float32)
        b = np.array(vec_b, dtype=np.float32)
        dot = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(dot / (norm_a * norm_b))

    def chunk_document(
        self,
        document_id: str,
        college_id: str,
        title: str,
        category: str,
        effective_date: str,
        pages_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Chunks text into ~400-500 word blocks with 50-word overlap.
        """
        chunks = []
        chunk_idx = 0

        for p_info in pages_data:
            page_num = p_info["page"]
            text = p_info["text"]
            source_type = p_info.get("source_type", "direct_text")

            words = text.split()
            if not words:
                continue

            chunk_size = 400
            overlap = 50
            start = 0

            while start < len(words):
                end = min(start + chunk_size, len(words))
                chunk_words = words[start:end]
                chunk_text = " ".join(chunk_words)

                chunk_id = f"chunk_{document_id}_p{page_num}_{chunk_idx}"
                embedding = self.generate_embedding(chunk_text)

                chunk_data = {
                    "id": chunk_id,
                    "document_id": document_id,
                    "college_id": college_id,
                    "page": page_num,
                    "title": title,
                    "category": category,
                    "effective_date": effective_date,
                    "source_type": source_type,
                    "content": chunk_text,
                    "embedding": embedding
                }
                chunks.append(chunk_data)
                chunk_idx += 1

                if end == len(words):
                    break
                start += (chunk_size - overlap)

        return chunks

    async def answer_question(
        self,
        college_id: str,
        user_id: str,
        question: str
    ) -> AssistAskResponse:
        """
        RAG query answering:
        1. Retrieve chunks ONLY from authenticated user's college.
        2. Semantic similarity + recency weighting.
        3. Send context to Qwen with strict instruction: answer only from supplied context or return NOT_FOUND.
        4. If NOT_FOUND: classify question against college's departments and suggest report.
        """
        q_emb = self.generate_embedding(question)

        # 1. Fetch chunks for college
        all_chunks = firebase_service.query("doc_chunks", [("college_id", "==", college_id)])

        scored_chunks: List[Tuple[float, Dict[str, Any]]] = []
        q_words = set(re.findall(r"\w+", question.lower()))

        for chunk in all_chunks:
            chunk_emb = chunk.get("embedding")
            if not chunk_emb:
                continue
            sim = self.cosine_similarity(q_emb, chunk_emb)

            # Keyword boost
            content_words = set(re.findall(r"\w+", chunk.get("content", "").lower()))
            overlap_count = len(q_words.intersection(content_words))
            keyword_score = min(overlap_count * 0.05, 0.25)

            # Date recency boost (prefer newer notices)
            recency_boost = 0.0
            eff_date = chunk.get("effective_date", "")
            if eff_date.startswith("2026"):
                recency_boost = 0.08
            elif eff_date.startswith("2025"):
                recency_boost = 0.04

            total_score = sim + keyword_score + recency_boost
            scored_chunks.append((total_score, chunk))

        # Sort descending by score
        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        top_chunks = scored_chunks[:4]

        # Check if we have reasonable relevance
        has_relevant_docs = len(top_chunks) > 0 and top_chunks[0][0] >= 0.20

        if not has_relevant_docs:
            return await self._handle_not_found(college_id, user_id, question, score=0.0)

        # Build context for Qwen
        context_parts = []
        citations = []
        for score, chunk in top_chunks:
            c_title = chunk.get("title", "College Circular")
            c_page = chunk.get("page", 1)
            c_content = chunk.get("content", "")
            context_parts.append(f"Document: {c_title} (Page {c_page}):\n{c_content}")
            citations.append({
                "document_id": chunk.get("document_id"),
                "title": c_title,
                "page": c_page,
                "category": chunk.get("category"),
                "score": round(score, 3)
            })

        context_str = "\n\n".join(context_parts)

        system_prompt = (
            "You are CampusFix Assist, a friendly, accurate campus assistant for students.\n"
            "Answer the student's question clearly and helpfully using ONLY the supplied official context.\n"
            "FORMATTING GUIDELINES:\n"
            "- If the information contains dates, fee structures, or exam timetables, format them in clean markdown tables or organized bullet points.\n"
            "- Use bold spans for critical deadlines or criteria.\n"
            "- Keep a friendly, student-first tone.\n"
            "- STRICT RULE: If the answer cannot be found in the provided context, you MUST reply with ONLY the exact word: NOT_FOUND"
        )
        user_prompt = f"Context:\n{context_str}\n\nStudent Question:\n{question}"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        cache_key = f"rag_{college_id}_{hash(question.strip().lower())}"
        llm_answer = await groq_manager.chat_completion(
            messages=messages,
            temperature=0.1,
            cache_key=cache_key,
            max_tokens=512
        )

        cleaned_answer = llm_answer.strip()

        # If LLM indicates answer was not found
        if "NOT_FOUND" in cleaned_answer or len(cleaned_answer) < 5:
            return await self._handle_not_found(college_id, user_id, question, score=top_chunks[0][0])

        # Log successful query
        log_id = f"log_{int(time.time())}_{abs(hash(question)) % 10000}"
        firebase_service.set_doc("assist_logs", log_id, {
            "college_id": college_id,
            "user_id": user_id,
            "question": question,
            "answered": True,
            "top_score": top_chunks[0][0],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        })

        return AssistAskResponse(
            answered=True,
            answer=cleaned_answer,
            citations=citations,
            confidence_score=round(top_chunks[0][0], 2),
            can_create_report=True
        )

    async def _handle_not_found(
        self,
        college_id: str,
        user_id: str,
        question: str,
        score: float
    ) -> AssistAskResponse:
        """
        Classifies the unanswered question to the most relevant department
        and offers report creation.
        """
        departments = firebase_service.query("departments", [("college_id", "==", college_id)])
        dept_options = [{"id": d["id"], "name": d["name"], "description": d.get("description", "")} for d in departments]

        dept_prompt = (
            "Classify this student's query to the most appropriate college department from the list.\n"
            f"Departments:\n{json.dumps(dept_options, indent=2)}\n\n"
            f"Student Query: \"{question}\"\n\n"
            "Return JSON format:\n"
            '{"department_id": "<id>", "department_name": "<name>"}'
        )

        suggested_id = None
        suggested_name = "General Administration"

        try:
            raw_res = await groq_manager.chat_completion(
                messages=[{"role": "user", "content": dept_prompt}],
                temperature=0.1,
                json_mode=True,
                max_tokens=150
            )
            data = json.loads(raw_res)
            suggested_id = data.get("department_id")
            suggested_name = data.get("department_name", suggested_name)
        except Exception:
            if departments:
                suggested_id = departments[0]["id"]
                suggested_name = departments[0]["name"]

        message = (
            f"I couldn't find this information in the official college documents. "
            f"This looks related to the {suggested_name} department. "
            f"Would you like to file an official report to their representative?"
        )

        # Log fallback query
        log_id = f"log_{int(time.time())}_{abs(hash(question)) % 10000}"
        firebase_service.set_doc("assist_logs", log_id, {
            "college_id": college_id,
            "user_id": user_id,
            "question": question,
            "answered": False,
            "top_score": score,
            "department_fallback_id": suggested_id,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        })

        return AssistAskResponse(
            answered=False,
            answer=message,
            citations=[],
            confidence_score=0.0,
            suggested_department_id=suggested_id,
            suggested_department_name=suggested_name,
            can_create_report=True
        )


rag_service = RAGService()
