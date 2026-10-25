-- Ai-kom initial schema. Apply only to a dedicated Ai-kom Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  status text not null default 'planning' check (status in ('planning','approved','in_progress','paused','completed','archived')),
  plan jsonb not null default '{}'::jsonb,
  last_user_message_at timestamptz not null default now(),
  memory_expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','agent','system')),
  agent_name text,
  content text not null check (char_length(content) <= 50000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  source_type text not null check (source_type in ('repository','file','url','instruction')),
  source_uri text,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_repositories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  repository_full_name text not null,
  default_branch text not null default 'main',
  installation_id text,
  created_at timestamptz not null default now(),
  unique (project_id, repository_full_name)
);

-- OAuth access/refresh tokens must not be stored in these client-readable tables.
-- Keep credentials encrypted in a trusted server/Edge Function secret store.
create index if not exists projects_user_updated_idx on public.projects(user_id, updated_at desc);
create index if not exists project_messages_project_created_idx on public.project_messages(project_id, created_at);
create index if not exists knowledge_sources_user_created_idx on public.knowledge_sources(user_id, created_at desc);
create index if not exists project_repositories_user_idx on public.project_repositories(user_id);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_messages enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.project_repositories enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "projects_select_own" on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "projects_insert_own" on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "projects_update_own" on public.projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "projects_delete_own" on public.projects for delete to authenticated using ((select auth.uid()) = user_id);

create policy "project_messages_select_own" on public.project_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "project_messages_insert_own" on public.project_messages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "knowledge_sources_select_own" on public.knowledge_sources for select to authenticated using ((select auth.uid()) = user_id);
create policy "knowledge_sources_insert_own" on public.knowledge_sources for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "knowledge_sources_update_own" on public.knowledge_sources for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "knowledge_sources_delete_own" on public.knowledge_sources for delete to authenticated using ((select auth.uid()) = user_id);
create policy "project_repositories_select_own" on public.project_repositories for select to authenticated using ((select auth.uid()) = user_id);
create policy "project_repositories_insert_own" on public.project_repositories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "project_repositories_delete_own" on public.project_repositories for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_project_memory()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.last_user_message_at is distinct from old.last_user_message_at then
    new.memory_expires_at := new.last_user_message_at + interval '30 days';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at before update on public.projects
for each row execute function public.touch_project_memory();

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_ai_kom on auth.users;
create trigger on_auth_user_created_ai_kom after insert on auth.users
for each row execute function public.create_profile_for_new_user();
