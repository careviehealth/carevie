# Voice Assistant integration – files to push to main

**Update this list whenever you add, remove, or change any file that is part of the Voice Assistant / chat integration.**

---

## Copied from Voice Assistant (source: `C:\Users\Devesh\Documents\Voice Assistant`)

| Path | Purpose |
|------|---------|
| `backend/faq_data.py` | FAQ content (keywords + EN/HI answers) |
| `backend/faq_engine.py` | FAQ matching (uses `faq_data`) |
| `backend/language.py` | Language detection (EN/HI) |
| `backend/llm.py` | Groq LLM replies |

---

## Related (use the above modules or the chat API)

| Path | Relation |
|------|----------|
| `backend/app_api.py` | Imports `faq_engine`, `language`, `llm`; defines `POST /api/chat` |
| `backend/requirements.txt` | Includes `groq`, `python-dotenv` for `llm.py` |
| `src/components/ChatWidget.jsx` | Web: calls `POST /api/chat` |
| `src/components/ChatWidget.module.css` | Web: styles for ChatWidget |
| `src/app/api/chat/route.ts` | Next.js proxy: forwards `/api/chat` to Flask backend |
| `mobile/components/ChatWidget.tsx` | Mobile: FAB + bottom sheet chat widget, calls `POST /api/chat` via `apiRequest` |
| `mobile/components/TypingIndicator.tsx` | Mobile: animated bouncing dots typing indicator used by ChatWidget |
| `mobile/app/(tabs)/_layout.tsx` | Mobile: renders `<ChatWidget />` overlay on all tab screens |
| `mobile/app/_layout.tsx` | Mobile: wraps app in `GestureHandlerRootView` for bottom sheet support |

---

## Checklist for push to main

```
backend/faq_data.py
backend/faq_engine.py
backend/language.py
backend/llm.py
backend/app_api.py
backend/requirements.txt
src/components/ChatWidget.jsx
src/components/ChatWidget.module.css
src/app/api/chat/route.ts
mobile/components/ChatWidget.tsx
mobile/components/TypingIndicator.tsx
mobile/app/(tabs)/_layout.tsx
mobile/app/_layout.tsx
```

---

## Changelog (edit when you change files)

- When you add/remove/rename any file in the lists above, add a line here and keep the list in sync.

| Date | Change |
|------|--------|
| (initial) | List created from Voice Assistant integration |
| 2025-02-07 | Added `src/app/api/chat/route.ts` (Next.js proxy to Flask for chat) |
| 2026-02-24 | Added mobile chat widget: `mobile/components/ChatWidget.tsx`, `mobile/components/TypingIndicator.tsx`; updated `mobile/app/(tabs)/_layout.tsx` and `mobile/app/_layout.tsx` |
