"""
platform_handler.py
===================
Entry point for platform queries.

Usage:
    from platform_handler import handle_platform_query
    result = handle_platform_query("What is G1 Healthcare?")
    # {"success": True, "message": "..."}
"""

import logging

try:
    from .platform_rag_query import run_platform_rag
except ImportError:  # pragma: no cover - supports script-style execution
    from platform_related.platform_rag_query import run_platform_rag

logger = logging.getLogger(__name__)


def handle_platform_query(user_question: str) -> dict:
    if not user_question or not user_question.strip():
        return {"success": False, "message": "Please type a question."}

    try:
        answer = run_platform_rag(user_question.strip())
        return {"success": True, "message": answer}

    except Exception as exc:
        logger.exception("handle_platform_query error: %s", exc)
        return {"success": False, "message": "Something went wrong. Please try again."}


if __name__ == "__main__":
    import json
    result = handle_platform_query("medication kese add kare")
    print(json.dumps(result, indent=2))
