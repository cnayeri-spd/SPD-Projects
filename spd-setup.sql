-- Horizon Project Tracker — Supabase Setup
-- Run this entire script in: Supabase Dashboard → SQL Editor → New Query

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  client_name text default '',
  status text default 'active',
  project_type text default '',
  phase text default '',
  color text default 'blue',
  team_members text default '',
  position int default 0
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
  archived boolean default false
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  event_date date not null,
  description text default ''
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
