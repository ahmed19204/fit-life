-- =============================================================================
-- FitLife — Production Polish Migration
-- Safe to run on existing databases. All statements are idempotent.
-- =============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Defaults & guards for `meals`
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='meals') then
    alter table public.meals alter column calories set default 0;
    alter table public.meals alter column protein  set default 0;
    alter table public.meals alter column carbs    set default 0;
    alter table public.meals alter column fat      set default 0;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Performance indexes (created only if missing)
-- ───────────────────────────────────────────────────────────────────────────
create index if not exists idx_meals_user_created_at
  on public.meals (user_id, created_at desc);

create index if not exists idx_meals_user_type
  on public.meals (user_id, type);

create index if not exists idx_analysis_history_user_created_at
  on public.analysis_history (user_id, created_at desc);

create index if not exists idx_user_profiles_user_id
  on public.user_profiles (user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. JSONB defaults (avoid NULL when AI returns nothing)
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='analysis_history' and column_name='result' and data_type='jsonb') then
    alter table public.analysis_history alter column result set default '{}'::jsonb;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='user_profiles' and column_name='restrictions' and data_type='jsonb') then
    alter table public.user_profiles alter column restrictions set default '[]'::jsonb;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='user_profiles' and column_name='health_conditions' and data_type='jsonb') then
    alter table public.user_profiles alter column health_conditions set default '[]'::jsonb;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='user_profiles' and column_name='meal_plan' and data_type='jsonb') then
    alter table public.user_profiles alter column meal_plan set default '[]'::jsonb;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Non-negative macro check (added only if not already present)
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'meals_non_negative_macros_chk'
  ) then
    alter table public.meals
      add constraint meals_non_negative_macros_chk
      check (
        coalesce(calories, 0) >= 0 and
        coalesce(protein, 0)  >= 0 and
        coalesce(carbs, 0)    >= 0 and
        coalesce(fat, 0)      >= 0
      ) not valid; -- not valid = don't block existing rows
  end if;
exception when undefined_table then null;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. updated_at auto-touch trigger (used by user_profiles)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.fl_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='user_profiles' and column_name='updated_at') then
    drop trigger if exists trg_user_profiles_touch on public.user_profiles;
    create trigger trg_user_profiles_touch
      before update on public.user_profiles
      for each row execute function public.fl_touch_updated_at();
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Confirm RLS is enabled on all user-data tables
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='meals') then
    alter table public.meals enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='analysis_history') then
    alter table public.analysis_history enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_profiles') then
    alter table public.user_profiles enable row level security;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. View for daily nutrition totals (handy for admin & analytics)
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.v_daily_nutrition as
select
  user_id,
  (created_at at time zone 'UTC')::date as day,
  coalesce(sum(calories), 0)::int as total_calories,
  coalesce(sum(protein), 0)::int  as total_protein,
  coalesce(sum(carbs), 0)::int    as total_carbs,
  coalesce(sum(fat), 0)::int      as total_fat,
  count(*)::int                   as meal_count
from public.meals
group by user_id, day;

-- Grant read on view to authenticated (RLS still applies via underlying table)
grant select on public.v_daily_nutrition to authenticated;

-- Done.
