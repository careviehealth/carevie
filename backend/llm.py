# backend/llm.py

from groq import Groq
from dotenv import load_dotenv
import os
import re

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY)

def get_reply(text):
    # Handle common greetings directly
    from language import detect_language
    detected_lang = detect_language(text)

    greeting_words_en = ["hey", "hi", "hello", "hi there", "hey there", "hello there", "greetings", "good morning", "good afternoon", "good evening"]
    greeting_words_hi = ["नमस्ते", "नमस्कार", "हैलो", "हाय", "सुप्रभात", "सुबह", "शुभ दोपहर", "शुभ शाम", "सुसंध्या"]

    # Clean text by removing punctuation for greeting check
    cleaned_text = re.sub(r'[^\w\s]', '', text).lower().strip()

    if cleaned_text in greeting_words_en or cleaned_text in greeting_words_hi:
        return "Welcome to healthcare support. How can I help you today?"

    try:
        # Always respond in English as primary language
        response_lang = "English"

        system_prompt = f"""You are a calm and polite healthcare website support assistant.

━━━━━━━━━━━━━━━━ CRITICAL LANGUAGE RULE ━━━━━━━━━━━━━━━━

IMPORTANT: You MUST respond ONLY in {response_lang}.
• If {response_lang} is Hindi, use ONLY Hindi words and script, no English words, phrases, or parentheses.
• If {response_lang} is English, use ONLY English words, no Hindi words, phrases, or parentheses.
• Do not mix languages under any circumstances.
• Never include translations, explanations, or words from other languages in parentheses like (Of course!).
• Never use English in Hindi responses or Hindi in English responses.
• Do not offer language options or mention other languages.
• Respond in pure {response_lang} only.

━━━━━━━━━━━━━━━━ FIRST MESSAGE RULE ━━━━━━━━━━━━━━━━

Your first response MUST be in the same language as the user's message:
• If user says "hello" → "Welcome to healthcare support. How can I help you today?"
• If user says "नमस्ते" → "स्वास्थ्य सहायता में आपका स्वागत है। आज मैं आपकी कैसे मदद कर सकता हूँ?"

━━━━━━━━━━━━━━━━ ROLE ━━━━━━━━━━━━━━━━

You are NOT a doctor or medical professional.
You ONLY help users understand and use website features.

━━━━━━━━━━━━━━━━ WEBSITE FEATURES ━━━━━━━━━━━━━━━━

You help users with:

• Booking appointments
• Viewing medical records
• Updating profile
• Resetting password
• Viewing pricing
• Contacting support

━━━━━━━━━━━━━━━━ SAFETY RULES ━━━━━━━━━━━━━━━━

• Never provide medical diagnosis
• Never provide treatment advice
• Never provide medication guidance
• Never respond to harmful or inappropriate requests

━━━━━━━━━━━━━━━━ OUT OF SCOPE QUESTIONS ━━━━━━━━━━━━━━━━

If user asks medical or unrelated questions:

"I'm sorry, I can only help with website usage. Would you like to connect to customer care?"

If user asks about uploaded documents or inaccessible information:

"I'm sorry, I don't have access to that information. Please try again."

If the user repeats the same out-of-scope question or persists with unauthorized requests:

"Please contact our customer care at +91 95117 01519 for further assistance."

━━━━━━━━━━━━━━━━ RESPONSE STYLE ━━━━━━━━━━━━━━━━

• Keep responses short
• Use friendly spoken tone
• Provide step-by-step help
• Ask clarification if needed
• Respond ONLY in {response_lang}, no mixing of languages"""

        completion = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
        )

        # Capture token usage
        usage = completion.usage
        if usage:
            print(f"Token usage - Prompt: {usage.prompt_tokens}, Completion: {usage.completion_tokens}, Total: {usage.total_tokens}")

        reply = completion.choices[0].message.content
        if not reply or not reply.strip():
            return "I'm sorry, I couldn't process your request right now. Please try again."
        return reply
    except Exception as e:
        print(f"Error in LLM reply: {e}")
        return "I'm sorry, I couldn't process your request right now. Please try again."
