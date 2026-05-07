-- SPD Projects — Supabase Setup (full fresh install)
-- Run in: Supabase Dashboard → SQL Editor → New Query

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  client_name text default '',
  status text default 'active',
  phase text default '',
  color text default 'blue',
  position int default 0,
  categories text[] default '{}',
  phases jsonb default '[]',
  team_members_json jsonb default '[]'
);

create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text default '',
  assignee text default '',
  status text default 'not_started',
  due_at date,
  notes text default '',
  archived boolean default false,
  category text default 'client',
  due_time text default ''
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  event_date date not null,
  description text default '',
  event_time text default ''
);

-- Enable Row Level Security
alter table projects enable row level security;
alter table deliverables enable row level security;
alter table events enable row level security;

-- Allow all authenticated team members full access
create policy "team_projects" on projects
  for all to authenticated using (true) with check (true);
create policy "team_deliverables" on deliverables
  for all to authenticated using (true) with check (true);
create policy "team_events" on events
  for all to authenticated using (true) with check (true);


create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  title text default '',
  email text default '',
  color text default 'blue',
  emoji text default ''
);
alter table team_members enable row level security;
create policy "team_team_members" on team_members
  for all to authenticated using (true) with check (true);

-- ── MIGRATION (only if you already ran an earlier version) ────────────────
-- Uncomment and run these if the tables exist without the new columns:

-- alter table projects add column if not exists categories text[] default '{}';
-- alter table projects add column if not exists phases jsonb default '[]';
-- alter table projects add column if not exists team_members_json jsonb default '[]';
-- alter table deliverables add column if not exists category text default 'client';
-- alter table deliverables add column if not exists due_time text default '';
-- alter table events add column if not exists event_time text default '';
