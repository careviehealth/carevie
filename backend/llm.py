from groq import Groq
from dotenv import load_dotenv
import os
import re

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY)

def get_reply(text):
    from language import detect_language
    detected_lang = detect_language(text)

    greeting_words_en = ["hey", "hi", "hello", "hi there", "hey there", "hello there", "greetings", "good morning", "good afternoon", "good evening"]
    greeting_words_hi = ["नमस्ते", "नमस्कार", "हैलो", "हाय", "सुप्रभात", "सुबह", "शुभ दोपहर", "शुभ शाम", "सुसंध्या"]

    cleaned_text = re.sub(r'[^\w\s]', '', text).lower().strip()

    if cleaned_text in greeting_words_en or cleaned_text in greeting_words_hi:
        return "Welcome to healthcare support. How can I help you today?"

    try:
        response_lang = "English"

        system_prompt = f"""You are a calm and polite healthcare website support assistant.

━━━━━━━━━━━━━━━━ CRITICAL LANGUAGE RULE ━━━━━━━━━━━━━━━━

IMPORTANT: You MUST respond ONLY in {response_lang}.
• If {response_lang} is Hindi, use ONLY Hindi words and script.
• If {response_lang} is English, use ONLY English words.

━━━━━━━━━━━━━━━━ SCOPE & LIMITATIONS ━━━━━━━━━━━━━━━━

Your ONLY purpose is to assist users with:
1. Navigation: Finding pages like Book Appointment, My Profile, Lab Reports, etc.
2. Troubleshooting: Help with login issues or missing reports.

For medical or unrelated questions:
"I'm sorry, I can only help with website usage. Would you like to connect to customer care?"

If user asks about uploaded documents or inaccessible information:
"I'm sorry, I don't have access to that information. Please try again."

If the user repeats out-of-scope questions or unauthorized requests:
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