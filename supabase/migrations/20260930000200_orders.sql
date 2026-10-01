do $$
begin
  create type public.order_status as enum (
    'pending_review',
    'confirmed',
    'cancelled',
    'completed'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.procurement_status as enum (
    'not_required',
    'pending_supplier',
    'ordered',
    'received'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.fulfillment_status as enum (
    'pending',
    'ready',
    'delivered'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.payment_status as enum (
    'pending',
    'partial',
    'paid'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.payment_method as enum (
    'cash',
    'sinpe_movil',
    'bank_transfer',
    'other'
  );
exception
  when duplicate_object then null;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default timezone('utc', now())
);

create sequence public.order_number_sequence start with 1 increment by 1;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null check (char_length(trim(customer_name)) > 0),
  customer_phone text not null check (char_length(trim(customer_phone)) > 0),
  delivery_notes text,
  estimated_total numeric(12, 2) not null default 0 check (estimated_total >= 0),
  currency varchar(3) not null default 'CRC' check (currency ~ '^[A-Z]{3}$'),
  order_status public.order_status not null default 'pending_review',
  procurement_status public.procurement_status not null default 'not_required',
  fulfillment_status public.fulfillment_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  payment_method public.payment_method,
  payment_notes text,
  admin_notes text,
  requested_at timestamptz not null default timezone('utc', now()),
  confirmed_at timestamptz,
  delivered_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint orders_completed_only_when_delivered_and_paid check (
    order_status <> 'completed'
    or (fulfillment_status = 'delivered' and payment_status = 'paid')
  ),
  constraint orders_paid_requires_payment_method check (
    payment_status <> 'paid' or payment_method is not null
  )
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null check (char_length(trim(product_name_snapshot)) > 0),
  product_slug_snapshot text,
  unit_price_snapshot numeric(12, 2) not null check (unit_price_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  options_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(options_snapshot) = 'object'),
  availability_snapshot public.product_availability_status not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status_type text not null check (status_type in ('order', 'procurement', 'fulfillment', 'payment')),
  previous_value text,
  next_value text not null,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.assign_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null or char_length(trim(new.order_number)) = 0 then
    new.order_number := 'AE-' || lpad(nextval('public.order_number_sequence')::text, 6, '0');
  end if;

  return new;
end;
$$;

create or replace function public.set_order_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());

  if new.order_status = 'confirmed' and old.order_status is distinct from 'confirmed' then
    new.confirmed_at = coalesce(new.confirmed_at, timezone('utc', now()));
  end if;

  if new.fulfillment_status = 'delivered' and old.fulfillment_status is distinct from 'delivered' then
    new.delivered_at = coalesce(new.delivered_at, timezone('utc', now()));
  end if;

  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    new.paid_at = coalesce(new.paid_at, timezone('utc', now()));
  end if;

  if new.order_status = 'completed' and old.order_status is distinct from 'completed' then
    new.completed_at = coalesce(new.completed_at, timezone('utc', now()));
  end if;

  return new;
end;
$$;

create or replace function public.record_order_status_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, status_type, next_value, changed_by)
    values (new.id, 'order', new.order_status::text, auth.uid());
    return new;
  end if;

  if new.order_status is distinct from old.order_status then
    insert into public.order_status_history (order_id, status_type, previous_value, next_value, changed_by)
    values (new.id, 'order', old.order_status::text, new.order_status::text, auth.uid());
  end if;

  if new.procurement_status is distinct from old.procurement_status then
    insert into public.order_status_history (order_id, status_type, previous_value, next_value, changed_by)
    values (new.id, 'procurement', old.procurement_status::text, new.procurement_status::text, auth.uid());
  end if;

  if new.fulfillment_status is distinct from old.fulfillment_status then
    insert into public.order_status_history (order_id, status_type, previous_value, next_value, changed_by)
    values (new.id, 'fulfillment', old.fulfillment_status::text, new.fulfillment_status::text, auth.uid());
  end if;

  if new.payment_status is distinct from old.payment_status then
    insert into public.order_status_history (order_id, status_type, previous_value, next_value, changed_by)
    values (new.id, 'payment', old.payment_status::text, new.payment_status::text, auth.uid());
  end if;

  return new;
end;
$$;

create trigger orders_assign_number
before insert on public.orders
for each row execute function public.assign_order_number();

create trigger orders_set_timestamps
before update on public.orders
for each row execute function public.set_order_timestamps();

create trigger orders_record_initial_status
after insert on public.orders
for each row execute function public.record_order_status_changes();

create trigger orders_record_status_changes
after update on public.orders
for each row execute function public.record_order_status_changes();

create index orders_requested_at_idx on public.orders (requested_at desc);
create index orders_workflow_status_idx
  on public.orders (order_status, procurement_status, fulfillment_status, payment_status);
create index orders_customer_phone_idx on public.orders (customer_phone);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_status_history_order_id_created_at_idx
  on public.order_status_history (order_id, created_at desc);
