# Carevie

Carevie is a healthcare-focused platform with:

- A **Next.js web app** (`src/`) for patient profiles, family/care-circle access, emergency SOS, and medical vault management.
- A **Flask AI backend** (`backend/`) for OCR + RAG processing of medical reports.
- An **Expo React Native app** (`mobile/`) that consumes the same APIs for mobile users.
- **Supabase SQL schema + migrations** (`supabase/`) for auth/data/storage policies.

---

## 1) Detailed code file and folder map

## Repository root

- `README.md` — this documentation file.
- `package.json` — root web scripts/dependencies (`next dev`, backend helpers, mobile pass-through scripts).
- `package-lock.json` — npm lockfile for root dependencies.
- `tsconfig.json` — TypeScript compiler options for the web app.
- `next.config.ts` — Next.js runtime/build config.
- `eslint.config.mjs` — linting rules.
- `postcss.config.mjs` — PostCSS/Tailwind processing config.
- `components.json` — component/tooling metadata.
- `app.json` — Expo app config at repository root level.
- `generate_sb3.py` — helper script for `.sb3` generation.
- `project.sb3` — generated Scratch project artifact.

## `scripts/`

- `scripts/start-backend.js` — starts Flask backend processes for local full-stack development.

## `src/` (Next.js web app)

### `src/app/` (App Router pages and server routes)

- `src/app/layout.tsx` — global HTML shell and shared providers for the public app.
- `src/app/page.tsx` — root entry route.
- `src/app/globals.css` — global CSS.
- `src/app/favicon.ico` — site icon.
- `src/proxy.ts` — Supabase proxy/client edge wiring.

#### Public/auth/legal pages

- `src/app/landing/page.tsx` — landing page route.
- `src/app/landing-page/page.tsx` — alternate landing page route.
- `src/app/dashboard/page.tsx` — dashboard page.
- `src/app/signup/page.tsx` — signup page variant.
- `src/app/verified/page.tsx` — account verification screen.
- `src/app/medicalinfoform-1/MedicalFormClient.tsx` — medical information form client UI.
- `src/app/auth/layout.tsx` — auth flow layout shell.
- `src/app/auth/login/page.tsx` — login page.
- `src/app/auth/login/LoginClient.tsx` — client login logic and form behavior.
- `src/app/auth/signup/page.tsx` — signup page in auth namespace.
- `src/app/legal/privacy-policy/page.tsx` — privacy policy page.
- `src/app/legal/terms-of-service/page.tsx` — terms page.
- `src/app/legal/cookie-policy/page.tsx` — cookie policy page.
- `src/app/legal/health-data-privacy/page.tsx` — healthcare data privacy policy page.

#### Authenticated app pages (`src/app/app/*`)

- `src/app/app/layout.tsx` — authenticated app shell.
- `src/app/app/homepage/page.tsx` — main home experience.
- `src/app/app/profilepage/page.tsx` — profile + health details editor/view.
- `src/app/app/family/page.tsx` — family management module.
- `src/app/app/carecircle/page.tsx` — care-circle collaboration module.
- `src/app/app/vaultpage/page.tsx` — medical vault file management page.
- `src/app/app/settings/page.tsx` — settings/preferences page.
- `src/app/app/health-onboarding/page.tsx` — onboarding workflow page.

#### API routes (`src/app/api/*`)

- `src/app/api/chat/route.ts` — chatbot relay API (with fallback/back-end routing).
- `src/app/api/medical/route.ts` — medical report API gateway to Flask backend.
- `src/app/api/feedback/route.ts` — feedback intake endpoint.
- `src/app/api/sos/route.ts` — Twilio SOS message dispatch endpoint.
- `src/app/api/health-profile/route.ts` — health profile CRUD endpoint.
- `src/app/api/notifications/state/route.ts` — notification preference/state endpoint.
- `src/app/api/vault/signed/route.ts` — signed file URL generation for vault documents.
- `src/app/api/account/delete/route.ts` — account deletion orchestration.
- `src/app/api/profile/activity/route.ts` — profile activity logging endpoint.
- `src/app/api/profile/delete/route.ts` — profile deletion endpoint.

##### Auth API

- `src/app/api/auth/otp/send/route.ts` — OTP send flow.
- `src/app/api/auth/otp/verify/route.ts` — OTP verify flow and JWT-related post-processing.
- `src/app/api/auth/remember-device/route.ts` — remember-device registration endpoint.
- `src/app/api/auth/remember-device/profile/route.ts` — remembered-device profile lookup endpoint.
- `src/app/api/auth/remember-device/consume/route.ts` — remembered-device token/session consume endpoint.

##### Family API

- `src/app/api/family/links/route.ts` — family link listing endpoint.
- `src/app/api/family/health/route.ts` — family health snapshot endpoint.
- `src/app/api/family/capacity/route.ts` — family capacity/business-rule endpoint.
- `src/app/api/family/delete/route.ts` — family relation removal endpoint.
- `src/app/api/family/relations/route.ts` — family relation CRUD/listing endpoint.
- `src/app/api/family/invite/route.ts` — family invite creation endpoint.
- `src/app/api/family/member/details/route.ts` — selected family member detail endpoint.
- `src/app/api/family/member/vault/route.ts` — family member vault listing endpoint.
- `src/app/api/family/member/vault/signed/route.ts` — signed URL generation for family member vault docs.

##### Care-circle API

- `src/app/api/care-circle/links/route.ts` — care-circle link listing endpoint.
- `src/app/api/care-circle/role/route.ts` — care-circle role assignment/updates.
- `src/app/api/care-circle/activity/route.ts` — care-circle activity logs endpoint.
- `src/app/api/care-circle/respond/route.ts` — invite response endpoint.
- `src/app/api/care-circle/invite/route.ts` — invite creation endpoint.
- `src/app/api/care-circle/member/details/route.ts` — care-circle member detail endpoint.
- `src/app/api/care-circle/member/appointments/route.ts` — care-circle member appointments endpoint.
- `src/app/api/care-circle/member/medications/route.ts` — care-circle member medications endpoint.
- `src/app/api/care-circle/member/vault/route.ts` — care-circle member vault listing endpoint.
- `src/app/api/care-circle/member/vault/signed/route.ts` — signed URL endpoint for care-circle vault docs.
- `src/app/api/care-circle/member/emergency-card/route.ts` — emergency-card data endpoint.

### `src/components/`

- `src/components/Navbar.tsx` — top navigation + auth/menu controls.
- `src/components/Modal.tsx` — base modal component.
- `src/components/modalMotion.ts` — motion/animation presets for modals.
- `src/components/AppProfileProvider.tsx` — profile context provider.
- `src/components/AppTourController.tsx` — guided app-tour state/logic.
- `src/components/ThemeBootstrap.tsx` — theme bootstrapping logic.
- `src/components/FloatingThemeButton.tsx` — floating UI theme switcher.
- `src/components/ConveyThisProvider.tsx` — ConveyThis integration wrapper.
- `src/components/GoogleAnalytics.tsx` — GA integration component.
- `src/components/NotificationsPanel.tsx` — notifications UI panel.
- `src/components/FeedbackPanel.tsx` — feedback form panel.
- `src/components/FeedbackTab.tsx` — quick feedback entry tab.
- `src/components/ChatWidget.jsx` — chatbot widget UI.
- `src/components/ChatWidget.module.css` — chatbot widget styles.
- `src/components/HealthOnboardingChatbot.tsx` — onboarding chat assistant UI.
- `src/components/MedicalSummaryModal.tsx` — generated medical summary modal.
- `src/components/MedicationsModal.tsx` — medications modal UI.
- `src/components/AppointmentsModal.tsx` — appointments modal UI.
- `src/components/MedicalTeamModal.tsx` — medical team modal UI.
- `src/components/EmergencyContactsModal.tsx` — emergency contacts modal UI.
- `src/components/Silk.tsx` — visual/animation component.
- `src/components/auth/AuthLayout.tsx` — auth-specific page layout wrapper.
- `src/components/types.ts` — shared component types.

### `src/lib/`

- `src/lib/supabaseClient.ts` — browser Supabase client helper.
- `src/lib/server.ts` — server-side Supabase client helper.
- `src/lib/createClient.js` — legacy Supabase client helper.
- `src/lib/auth.ts` — auth/session helper utilities.
- `src/lib/supabaseJwt.ts` — Supabase JWT utility functions.
- `src/lib/backendInternalAuth.ts` — internal API-key header signing/validation helpers.
- `src/lib/rememberDevice.ts` — remember-device cookie/token utilities.
- `src/lib/rememberedAccount.ts` — remembered account handling utilities.
- `src/lib/rateLimit.ts` — rate limiting helper utilities.
- `src/lib/careCircleActivityLogs.ts` — care-circle activity log helpers.
- `src/lib/medicalStorage.ts` — medical storage path and upload helpers.
- `src/lib/medications.ts` — medication domain helpers.
- `src/lib/validation.ts` — shared input validation helpers.
- `src/lib/countries.ts` — country metadata list/utilities.
- `src/lib/themeUtils.ts` — theme utility logic.
- `src/lib/utils.ts` — generic utility helpers.

### `src/constants/`

- `src/constants/medicalFolders.ts` — canonical medical folder constants.
- `src/constants/medicalFolders 2.ts` — duplicate/alternate medical folder constant file.

## `backend/` (Flask AI service)

- `backend/README.md` — backend-only setup docs.
- `backend/requirements.txt` — Python dependency pins.
- `backend/Procfile` — process definition (deploy/runtime).
- `backend/app.py` — Flask app for chat/QA-related endpoints.
- `backend/app_api.py` — Flask app for medical report processing API.
- `backend/internal_auth.py` — internal header/API-key guard middleware.
- `backend/language.py` — language detection/handling utilities.
- `backend/llm.py` — LLM client initialization (Groq/OpenAI related wrappers).
- `backend/profile_manager.py` — profile-level data operations for backend tasks.
- `backend/supabase_helper.py` — Supabase backend connector/helper logic.
- `backend/faq_data.py` — static FAQ dataset.
- `backend/faq_engine.py` — FAQ retrieval/response logic.
- `backend/test_language.py` — language module tests.
- `backend/test_greeting.py` — greeting/tests for backend behavior.

### `backend/rag_pipeline/`

- `backend/rag_pipeline/__init__.py` — package initializer.
- `backend/rag_pipeline/extractor_OCR.py` — OCR and text extraction.
- `backend/rag_pipeline/clean_chunk.py` — chunk cleaning and normalization.
- `backend/rag_pipeline/key_points.py` — key point extraction logic.
- `backend/rag_pipeline/extract_metadata.py` — metadata extraction from reports.
- `backend/rag_pipeline/embed_store.py` — embeddings/vector storage operations.
- `backend/rag_pipeline/profile_checker.py` — profile consistency checks.
- `backend/rag_pipeline/rag_query.py` — retrieval + generation query pipeline.

## `supabase/`

- `supabase/scheme.sql` — baseline schema SQL.
- `supabase/fix_signup_trigger.sql` — signup trigger fix SQL.
- `supabase/debug_triggers.sql` — trigger debugging SQL helpers.

### `supabase/migrations/`

- `20260207130000_add_structured_columns_to_medical_reports_processed.sql` — adds structured columns.
- `20260207143000_add_source_file_hash_to_medical_reports_processed.sql` — adds file hash column.
- `20260213100000_create_profiles_table.sql` — creates profiles table.
- `20260213101000_add_profile_id_to_medical_tables.sql` — adds profile IDs to medical tables.
- `20260213120000_add_profile_id_to_remaining_tables.sql` — extends profile ID support.
- `20260213140000_make_personal_profile_specific.sql` — personal-profile refactor.
- `20260213150000_add_profile_personal_trigger.sql` — profile trigger additions.
- `20260213151000_fix_personal_foreign_keys.sql` — personal FK corrections.
- `20260213170000_profile_based_rls_migration.sql` — profile-based RLS migration.
- `20260214103000_move_profile_personal_fields_to_profiles.sql` — moves personal fields to profiles.
- `20260214110000_profiles_phone_lookup_and_family_read.sql` — phone lookup + family read policies.
- `20260214123000_fix_medical_vault_profile_rls.sql` — medical vault RLS fix.
- `20260214131000_fix_medical_vault_policy_name_reference.sql` — policy-name reference fix.
- `20260214153000_care_circle_role_standardization.sql` — role model standardization.
- `20260214162000_care_circle_two_role_model.sql` — two-role care-circle model.
- `20260216100000_fix_new_user_profile_trigger_auth_id.sql` — new-user trigger auth-id fix.
- `20260216113000_care_circle_primary_invites_multi_profile.sql` — multi-profile primary invites support.
- `20260216120000_care_circle_drop_legacy_pair_unique.sql` — removes legacy unique pair constraint.
- `20260217121000_create_profile_activity_logs.sql` — adds profile activity logs.
- `20260217134000_create_notification_states.sql` — adds notification states table/policies.
- `20260220113000_add_profile_activity_logs_retention.sql` — adds retention support for activity logs.
- `20260228120000_remove_me_default_profile_name.sql` — removes default "Me" profile naming behavior.
- `20260304173000_add_onboarding_tour_flags.sql` — onboarding tour flags.
- `20260309110000_add_theme_preference_to_user_profile_preferences.sql` — theme preference persistence.
- `20260324113000_create_feedback_widget_support.sql` — feedback widget schema support.

## `mobile/` (Expo React Native app)

- `mobile/package.json` — mobile app scripts/dependencies.
- `mobile/package-lock.json` — lockfile for mobile dependencies.
- `mobile/tsconfig.json` — mobile TypeScript config.
- `mobile/babel.config.js` — Babel config.
- `mobile/app.json` — Expo app metadata.
- `mobile/eas.json` — Expo EAS build config.

### `mobile/app/` routes

- `mobile/app/_layout.tsx` — root mobile layout.
- `mobile/app/+html.tsx` — web HTML wrapper for Expo web.
- `mobile/app/+not-found.tsx` — not-found route.
- `mobile/app/modal.tsx` — modal route.
- `mobile/app/manage-profiles.tsx` — profile management screen.
- `mobile/app/profile-selection.tsx` — profile picker screen.
- `mobile/app/health-onboarding.tsx` — onboarding screen.
- `mobile/app/settings.tsx` — settings screen.
- `mobile/app/(auth)/_layout.tsx` — auth segment layout.
- `mobile/app/(auth)/login.tsx` — login screen.
- `mobile/app/(auth)/signup.tsx` — signup screen.
- `mobile/app/(tabs)/_layout.tsx` — tab shell.
- `mobile/app/(tabs)/index.tsx` — tab index.
- `mobile/app/(tabs)/home.tsx` — home tab.
- `mobile/app/(tabs)/vault.tsx` — vault tab.
- `mobile/app/(tabs)/carecircle.tsx` — care-circle tab.
- `mobile/app/(tabs)/profile.tsx` — profile tab.
- `mobile/app/(tabs)/two.tsx` — secondary/example tab.

### `mobile/api/`

- `mobile/api/client.ts` — fetch client and base URL handling.
- `mobile/api/index.ts` — API exports.
- `mobile/api/types/errors.ts` — typed API error shapes.
- `mobile/api/modules/auth.ts` — auth API wrappers.
- `mobile/api/modules/profile.ts` — profile API wrappers.
- `mobile/api/modules/carecircle.ts` — care-circle API wrappers.
- `mobile/api/modules/vault.ts` — vault API wrappers.

### `mobile/components/`

- `mobile/components/AppointmentsModal.tsx` — appointments modal.
- `mobile/components/ChatWidget.tsx` — mobile chatbot component.
- `mobile/components/EditScreenInfo.tsx` — helper/info UI.
- `mobile/components/EmergencyContactsModal.tsx` — emergency contacts modal.
- `mobile/components/EmptyState.tsx` — empty-state placeholder UI.
- `mobile/components/ExternalLink.tsx` — outbound link wrapper.
- `mobile/components/GradientText.tsx` — gradient text renderer.
- `mobile/components/MedicalTeamModal.tsx` — medical-team modal.
- `mobile/components/MedicationsModal.tsx` — medications modal.
- `mobile/components/NotificationPanel.tsx` — notifications panel.
- `mobile/components/ProfileAvatar.tsx` — avatar renderer.
- `mobile/components/ProfileAvatarSelector.tsx` — avatar selector.
- `mobile/components/Screen.tsx` — screen container wrapper.
- `mobile/components/Skeleton.tsx` — skeleton loading components.
- `mobile/components/StyledText.tsx` — typography component.
- `mobile/components/Themed.tsx` — themed view/text wrappers.
- `mobile/components/ThemeSelector.tsx` — theme selection UI.
- `mobile/components/TypingIndicator.tsx` — chat typing indicator.
- `mobile/components/useClientOnlyValue.ts` — client-only value hook helper.
- `mobile/components/useClientOnlyValue.web.ts` — web variant of client-only helper.
- `mobile/components/useColorScheme.ts` — native color scheme helper.
- `mobile/components/useColorScheme.web.ts` — web color scheme helper.
- `mobile/components/__tests__/StyledText-test.js` — component test.

### `mobile/hooks/`

- `mobile/hooks/useAppTheme.ts` — app theme hook.
- `mobile/hooks/useAuth.ts` — auth state hook.
- `mobile/hooks/useNotifications.ts` — notifications hook.
- `mobile/hooks/useProfile.ts` — profile hook.
- `mobile/hooks/useResponsive.ts` — responsive layout hook.

### `mobile/lib/`

- `mobile/lib/supabase.ts` — mobile Supabase client initializer.
- `mobile/lib/rememberDevice.ts` — remember-device utilities.
- `mobile/lib/profileActivity.ts` — profile activity utilities.
- `mobile/lib/medications.ts` — medication helpers.
- `mobile/lib/countries.ts` — country metadata.
- `mobile/lib/onboardingTour.ts` — onboarding state helpers.
- `mobile/lib/themePreferences.ts` — theme preference persistence.
- `mobile/lib/installState.ts` — install-state helpers.
- `mobile/lib/toast.tsx` — toast wrapper helpers.

### `mobile/providers/`

- `mobile/providers/AuthProvider.tsx` — auth context provider.
- `mobile/providers/ProfileProvider.tsx` — profile context provider.
- `mobile/providers/OnboardingTourProvider.tsx` — onboarding tour provider.
- `mobile/providers/ThemeProvider.tsx` — theme provider.

### `mobile/repositories/`

- `mobile/repositories/profileRepository.ts` — profile data abstraction.
- `mobile/repositories/userProfilesRepository.ts` — profile-list data abstraction.
- `mobile/repositories/careCircleRepository.ts` — care-circle data abstraction.
- `mobile/repositories/vaultRepository.ts` — vault data abstraction.

### `mobile/constants/`

- `mobile/constants/Colors.ts` — color palette constants.
- `mobile/constants/Theme.ts` — theme constants.
- `mobile/constants/appThemes.ts` — named theme definitions.
- `mobile/constants/medicalFolders.ts` — medical folder constants.

### `mobile/types/`

- `mobile/types/assets.d.ts` — asset typing declarations.

### `mobile/assets/`

- `mobile/assets/images/*` — app icons/logo/splash assets.
- `mobile/assets/fonts/*` — bundled fonts.

## Other folders

- `public/` — static web assets (icons, screenshots, demo video).
- `ios/` — generated/native iOS project files for the Expo app.

---

## 2) Step-by-step local setup (including API keys)

## Prerequisites

- Node.js 20+ and npm
- Python 3.10+ (for Flask backend)
- A Supabase project (URL, anon key, service role key)
- (Optional) Twilio account for SOS messages
- (Optional) 2Factor account for OTP provider
- (Optional) OpenAI and/or Groq keys for AI features

## Step A — Clone and install dependencies

```bash
git clone <your-repo-url>
cd carevie
npm install
npm --prefix mobile install
```

## Step B — Create `/.env.local` for Next.js

Create `.env.local` in the repository root:

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>

# Supabase JWT / auth internals (required for OTP + remember-device APIs)
SUPABASE_JWT_SECRET=<supabase-jwt-secret>
SUPABASE_JWT_ISSUER=supabase
SUPABASE_JWT_EXPIRES_IN_SECONDS=3600

# Backend routing (recommended for local Flask)
USE_LOCAL_FLASK=true
NEXT_PUBLIC_USE_LOCAL_FLASK=true
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_CHATBOT_URL=http://localhost:5000

# Internal backend auth (recommended)
BACKEND_INTERNAL_API_KEY=<shared-internal-key>

# OTP provider (required if OTP login is used)
TWOFACTOR_API_KEY=<2factor-api-key>
TWOFACTOR_TEMPLATE=<2factor-template-name-or-id>
TWOFACTOR_BASE_URL=https://2factor.in/API/V1

# SOS / Twilio (required only if SOS API is used)
TWILIO_ACCOUNT_SID_SOS=<twilio-account-sid>
TWILIO_AUTH_TOKEN_SOS=<twilio-auth-token>
TWILIO_PHONE_NUMBER=<twilio-number>

# Optional features
SUPABASE_FEEDBACK_TABLE=feedback
NEXT_PUBLIC_CONVEYTHIS_API_KEY=<conveythis-key>
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

## Step C — Create `/backend/.env` for Flask services

Create `backend/.env`:

```env
# Required for backend DB reads/writes
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<supabase-service-role-key>

# Required for chatbot (Groq path)
GROQ_API_KEY=<groq-api-key>

# Required for metadata/RAG OpenAI calls
OPENAI_API_KEY=<openai-api-key>

# Must match root .env.local if internal auth is enabled
BACKEND_INTERNAL_API_KEY=<shared-internal-key>
```

Install Python dependencies and start local backend services:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

## Step D — (Optional) Create `/mobile/.env` for Expo app

Create `mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
```

> If testing on a physical iPhone/Android, set `EXPO_PUBLIC_API_URL` to your machine LAN IP (e.g., `http://192.168.1.20:3000`).

## Step E — Run services

### Option 1: Full local stack (recommended)

```bash
npm run dev:all
```

This runs:

- Next.js app on `http://localhost:3000`
- Flask services through `scripts/start-backend.js` (typically `:5000` and `:8000`)

### Option 2: Run each service separately

Terminal 1:
```bash
npm run dev:backend
```

Terminal 2:
```bash
npm run dev
```

## Step F — Run mobile app

```bash
npm run ios
# or
npm run android
```

## Step G — Helpful checks

```bash
npm run lint
curl http://localhost:5000/api/health
```

---

## 3) Tech stack

### Web app

- **Next.js 16 (App Router)**
- **React 19 + TypeScript**
- **Supabase JS / SSR clients**
- **Framer Motion + GSAP + OGL/Three** (interactive UI/animation)
- **Tailwind/PostCSS tooling**

### Mobile app

- **Expo 54 + React Native 0.81**
- **Expo Router**
- **Supabase JS (mobile client usage)**

### Backend / AI

- **Python Flask** (`app.py`, `app_api.py`)
- **RAG pipeline** with OCR + chunking + embeddings + retrieval
- **OpenAI API** (metadata/extraction helpers)
- **Groq API** (chat completion path)

### Data / infrastructure

- **Supabase Postgres + Auth + Storage + RLS policies**
- **SQL migrations** under `supabase/migrations`
- **Twilio** for SOS messaging
- **2Factor** for OTP delivery/verification
- **Google Analytics** and **ConveyThis** (optional front-end integrations)

---

## Common run commands

```bash
# Web
npm run dev
npm run build
npm run start
npm run lint

# Backend helper
npm run dev:backend
npm run dev:all

# Mobile
npm run ios
npm run android
```
