create extension if not exists "pgcrypto";

do $$
begin
  create type public.product_availability_status as enum (
    'in_stock',
    'on_order',
    'out_of_stock',
    'inactive'
  );
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  slug text not null unique check (slug = lower(slug)),
  description text,
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (char_length(trim(name)) > 0),
  slug text not null unique check (slug = lower(slug)),
  description text,
  price numeric(12, 2) not null check (price >= 0),
  currency varchar(3) not null default 'CRC' check (currency ~ '^[A-Z]{3}$'),
  availability_status public.product_availability_status not null default 'in_stock',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null check (char_length(trim(alt_text)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.inventory (
  product_id uuid primary key references public.products(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.create_inventory_for_product()
returns trigger
language plpgsql
as $$
begin
  insert into public.inventory (product_id)
  values (new.id)
  on conflict (product_id) do nothing;

  return new;
end;
$$;

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger inventory_set_updated_at
before update on public.inventory
for each row execute function public.set_updated_at();

create trigger products_create_inventory
after insert on public.products
for each row execute function public.create_inventory_for_product();

create index products_category_id_idx on public.products (category_id);
create index products_public_catalog_idx
  on public.products (category_id, availability_status)
  where is_active and availability_status <> 'inactive';
create index product_images_product_id_sort_order_idx
  on public.product_images (product_id, sort_order);
