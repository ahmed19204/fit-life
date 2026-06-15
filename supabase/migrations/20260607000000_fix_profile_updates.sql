-- =============================================================================
-- FitLife — Fix profile updates / RLS alignment
-- Safe to run on existing projects. All operations are idempotent.
-- =============================================================================

-- 1) profiles table for basic identity fields ---------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

alter table if exists public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- 2) ensure user_profiles has the fields the frontend updates ------------------
create table if not exists public.user_profiles (
  id bigserial primary key,
  user_id uuid unique not null references auth.users(id) on delete cascade,
  age integer,
  weight numeric,
  height numeric,
  goal text,
  activity_level text,
  diet_type text default 'balanced',
  restrictions jsonb default '[]'::jsonb,
  health_conditions jsonb default '[]'::jsonb,
  meals_per_day integer default 3,
  calories integer,
  protein integer,
  carbs integer,
  fat integer,
  meal_plan jsonb default '[]'::jsonb,
  gender text,
  onboarding_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_profiles enable row level security;

alter table if exists public.user_profiles
  add column if not exists age integer,
  add column if not exists weight numeric,
  add column if not exists height numeric,
  add column if not exists goal text,
  add column if not exists activity_level text,
  add column if not exists diet_type text default 'balanced',
  add column if not exists restrictions jsonb default '[]'::jsonb,
  add column if not exists health_conditions jsonb default '[]'::jsonb,
  add column if not exists meals_per_day integer default 3,
  add column if not exists calories integer,
  add column if not exists protein integer,
  add column if not exists carbs integer,
  add column if not exists fat integer,
  add column if not exists meal_plan jsonb default '[]'::jsonb,
  add column if not exists gender text,
  add column if not exists onboarding_completed boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_user_profiles_user_id_unique on public.user_profiles(user_id);
create index if not exists idx_profiles_id on public.profiles(id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- 3) updated_at touch trigger -------------------------------------------------
create or replace function public.fl_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
before update on public.profiles
for each row execute function public.fl_touch_updated_at();

drop trigger if exists trg_user_profiles_touch_fix on public.user_profiles;
create trigger trg_user_profiles_touch_fix
before update on public.user_profiles
for each row execute function public.fl_touch_updated_at();

-- 4) normalize defaults and helpful constraints -------------------------------
alter table if exists public.user_profiles alter column diet_type set default 'balanced';
alter table if exists public.user_profiles alter column restrictions set default '[]'::jsonb;
alter table if exists public.user_profiles alter column health_conditions set default '[]'::jsonb;
alter table if exists public.user_profiles alter column meal_plan set default '[]'::jsonb;
alter table if exists public.user_profiles alter column meals_per_day set default 3;
alter table if exists public.user_profiles alter column onboarding_completed set default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_macro_non_negative_chk'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_macro_non_negative_chk
      check (
        coalesce(calories, 0) >= 0 and
        coalesce(protein, 0) >= 0 and
        coalesce(carbs, 0) >= 0 and
        coalesce(fat, 0) >= 0
      ) not valid;
  end if;
end $$;

-- 5) replace RLS policies with strict self-access rules ----------------------
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can view own nutrition profile" on public.user_profiles;
drop policy if exists "Users can upsert own nutrition profile" on public.user_profiles;
drop policy if exists "Users can update own nutrition profile" on public.user_profiles;

create policy "Users can view own nutrition profile" on public.user_profiles
  for select using (auth.uid() = user_id);

create policy "Users can upsert own nutrition profile" on public.user_profiles
  for insert with check (auth.uid() = user_id);

create policy "Users can update own nutrition profile" on public.user_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 6) backfill profiles from auth.users when missing ---------------------------
insert into public.profiles (id, email, full_name)
select
  u.id,
  u.email,
  nullif(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;
