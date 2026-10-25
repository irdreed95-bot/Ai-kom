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

## Supabase setup and Edge Functions

Apply `supabase/migrations/202610250001_initial_schema.sql` only to a dedicated Ai-kom project.

Deploy the functions from `supabase/functions/` to that project:
- `council`: authenticated multi-provider planning discussion; it does not modify a repository.
- `approve-plan`: records the user's explicit approval for the saved plan; it does not claim to implement code.
- `expire-memory`: deletes project messages and knowledge-source records after 30 days without a user message, then archives the project while preserving its name and description.

Configure these secrets in the Supabase Edge Function secret store (never in browser code):
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_AI_API_KEY`
- `OPENROUTER_API_KEY`
- Supabase's standard `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` where applicable.
- `MEMORY_CLEANUP_SECRET` for the protected cleanup function.

The GitHub Actions workflow `.github/workflows/expire-memory.yml` calls the cleanup function daily. Add these repository Actions secrets for it:
- `VITE_SUPABASE_URL` (the project URL; used here only as the endpoint)
- `MEMORY_CLEANUP_SECRET` (must exactly match the Supabase function secret).

The council UI can submit project messages after the Supabase project and functions are configured. Provider keys are intentionally not exposed in the browser. The approval endpoint is a planning gate, not a repository execution engine.

## Remaining work before the platform is production-ready

- GitHub App/OAuth integration for securely listing, reading, and changing multiple repositories.
- A protected implementation pipeline that creates reviewable commits/branches only after approval.
- File/repository ingestion, indexing, and tests for multi-project isolation, expiry, and approvals.
- Live deployment verification after the dedicated Supabase project is created and configured.

**Never place AI provider secrets, GitHub OAuth secrets, or the Supabase service-role key in Vite `VITE_*` variables.** Static GitHub Pages cannot securely run server-side AI orchestration by itself; server-side operations belong in Edge Functions or another trusted backend.
