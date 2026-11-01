create or replace function public.valid_reminder_intervals(intervals integer[])
returns boolean
language sql
immutable
as $$
  select cardinality(intervals) <= 1440
    and array_position(intervals, null) is null
    and not exists (
      select 1 from unnest(intervals) as item(value)
      where value < 1 or value > 1440
    );
$$;
revoke all on function public.valid_reminder_intervals(integer[]) from public, anon;
grant execute on function public.valid_reminder_intervals(integer[]) to authenticated;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminders integer[] not null default array[5, 10, 30],
  timer jsonb,
  updated_at timestamptz not null default now(),
  constraint reminders_valid check (public.valid_reminder_intervals(reminders)),
  constraint timer_shape check (timer is null or jsonb_typeof(timer) = 'object')
);

alter table public.user_preferences enable row level security;
alter table public.user_preferences force row level security;

create policy "Users can read their own preferences" on public.user_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own preferences" on public.user_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own preferences" on public.user_preferences
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own preferences" on public.user_preferences
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_preferences to authenticated;
alter publication supabase_realtime add table public.user_preferences;
