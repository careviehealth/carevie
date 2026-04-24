"""
qr_rag_pipeline
===============
QR Emergency Profile pipeline — backend data fetching and RAG summary
generation for emergency QR code scans.

Public API
----------
    stream_qr_profile(profile_id)           → Generator[str]  (SSE events)
    generate_medical_summary(profile_id)     → str             (pure text)
    generate_insurance_summary(profile_id)   → dict            (structured JSON)
"""

from qr_rag_pipeline.qr_profile_fetcher import stream_qr_profile
from qr_rag_pipeline.qr_summary_generator import (
    generate_medical_summary,
    generate_insurance_summary,
)

__all__ = [
    "stream_qr_profile",
    "generate_medical_summary",
    "generate_insurance_summary",
]
