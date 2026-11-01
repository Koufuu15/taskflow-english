create table if not exists public.tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  memo text not null default '' check (char_length(memo) <= 500),
  due timestamptz,
  mode text not null default 'card' check (mode in ('card', 'list')),
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tasks_owner_updated_idx on public.tasks(user_id, updated_at desc);
alter table public.tasks enable row level security;
alter table public.tasks force row level security;

create policy "Users can read their own tasks" on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own tasks" on public.tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own tasks" on public.tasks
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own tasks" on public.tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.tasks to authenticated;
alter publication supabase_realtime add table public.tasks;
