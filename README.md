# Ai-kom — AI Collaboration Studio

A mobile-friendly Arabic RTL workspace for planning and building software with a multi-model AI council.

## Current foundation

- React + TypeScript + Vite interface (Arabic RTL, responsive dark theme).
- Supabase Auth integration and project persistence when configured.
- Dedicated database schema for projects, project conversations, knowledge sources, and multiple GitHub repositories.
- Row Level Security policies isolate user-owned records.
- GitHub Actions workflow builds and deploys the static app to GitHub Pages.
- Provider API keys are intentionally not exposed in browser code.

## Deploy with GitHub Pages

1. Open **Settings → Pages** in this repository and set the source to **GitHub Actions**.
2. Create a dedicated Supabase project for Ai-kom (do not reuse another app's production database).
3. Apply `supabase/migrations/202610250001_initial_schema.sql` in the dedicated project's SQL editor.
4. Add repository Actions secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (publishable/anon key only; never service-role)
5. Push to `main` or run **Actions → Build and deploy Ai-kom → Run workflow**.
6. The public site will be available at `https://irdreed95-bot.github.io/Ai-kom/` after the first successful deployment.

## Important next integrations

- GitHub App/OAuth backend for securely listing and changing multiple repositories.
- Supabase Edge Functions or another trusted backend for model calls to GPT, Claude, Gemini, and a fourth provider.
- Council orchestration: independent proposals → critique and consensus → user approval phrase → implementation.
- Durable project memory and knowledge ingestion, with a 30-day inactivity window counted from the user's last message.
- Automated tests, code review, and rollback-safe commits.

**No AI provider secret, GitHub OAuth secret, or Supabase service-role key belongs in Vite `VITE_*` variables.** Static GitHub Pages cannot securely run server-side AI orchestration by itself; use a trusted backend/Edge Functions for those operations.
