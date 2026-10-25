create table public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index admin_push_subscriptions_admin_user_id_idx
  on public.admin_push_subscriptions (admin_user_id);

alter table public.admin_push_subscriptions enable row level security;

create policy "Administrators manage their push subscriptions"
on public.admin_push_subscriptions for all
to authenticated
using (public.is_admin() and admin_user_id = auth.uid())
with check (public.is_admin() and admin_user_id = auth.uid());

grant select, insert, update, delete on public.admin_push_subscriptions to authenticated;
grant select, delete on public.admin_push_subscriptions to service_role;

create table public.admin_order_push_events (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_order_push_events enable row level security;
revoke all on public.admin_order_push_events from public, anon, authenticated;
grant select on public.admin_order_push_events to service_role;

create or replace function public.enqueue_admin_order_push_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_order_push_events (order_number)
  values (new.order_number);
  return new;
end;
$$;

revoke all on function public.enqueue_admin_order_push_event() from public, anon, authenticated;

create trigger orders_enqueue_admin_push_event
after insert on public.orders
for each row execute function public.enqueue_admin_order_push_event();
