do $$
begin
  if exists (
    select lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
    from public.categories
    group by lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
    having count(*) > 1
  ) then
    raise exception 'Hay categorías con nombres duplicados al ignorar mayúsculas y espacios. Resuélvelas antes de aplicar esta migración.';
  end if;
end;
$$;

create unique index categories_normalized_name_uidx
  on public.categories (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create table public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, category_id)
);

comment on column public.products.category_id is
  'Categoría principal conservada por compatibilidad; las asociaciones completas viven en product_categories.';

insert into public.product_categories (product_id, category_id)
select id, category_id
from public.products
on conflict do nothing;

create index product_categories_category_product_idx
  on public.product_categories (category_id, product_id);

alter table public.product_categories enable row level security;

create or replace function public.can_view_product_category(p_product_id uuid, p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.products
    join public.categories on categories.id = p_category_id
    where products.id = p_product_id
      and products.is_active
      and products.availability_status <> 'inactive'
      and categories.is_active
  );
$$;

revoke all on function public.can_view_product_category(uuid, uuid) from public;
grant execute on function public.can_view_product_category(uuid, uuid) to anon, authenticated;

create policy "Public can view categories of active products"
on public.product_categories for select
to anon, authenticated
using (public.can_view_product_category(product_id, category_id));

create policy "Administrators can manage product categories"
on public.product_categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.product_categories to anon, authenticated;
grant select, insert, update, delete on public.product_categories to authenticated;

drop policy "Public can view active products" on public.products;
create policy "Public can view active products"
on public.products for select
to anon, authenticated
using (
  is_active
  and availability_status <> 'inactive'
  and exists (
    select 1
    from public.product_categories
    where product_categories.product_id = products.id
      and public.can_view_product_category(product_categories.product_id, product_categories.category_id)
  )
);

drop policy "Public can view images of active products" on public.product_images;
create policy "Public can view images of active products"
on public.product_images for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products
    join public.product_categories on product_categories.product_id = products.id
    where products.id = product_images.product_id
      and public.can_view_product_category(product_categories.product_id, product_categories.category_id)
  )
);

drop policy "Public can read active product storage images" on storage.objects;
create policy "Public can read active product storage images"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.product_images
    join public.products on products.id = product_images.product_id
    join public.product_categories on product_categories.product_id = products.id
    where product_images.storage_path = storage.objects.name
      and public.can_view_product_category(product_categories.product_id, product_categories.category_id)
  )
);

create or replace function public.save_admin_product(
  p_product_id uuid,
  p_category_ids uuid[],
  p_name text,
  p_slug text,
  p_description text,
  p_price numeric,
  p_availability_status public.product_availability_status,
  p_is_active boolean
)
returns setof public.products
language plpgsql
set search_path = public
as $$
declare
  saved_product public.products;
  category_count integer;
begin
  if not public.is_admin() then
    raise exception 'Se requiere autorización administrativa.' using errcode = '42501';
  end if;

  if p_category_ids is null or cardinality(p_category_ids) = 0 then
    raise exception 'Selecciona al menos una categoría.' using errcode = '22023';
  end if;

  select count(distinct category_id)
  into category_count
  from unnest(p_category_ids) as requested_categories(category_id);

  if category_count <> cardinality(p_category_ids) then
    raise exception 'La selección contiene categorías duplicadas.' using errcode = '22023';
  end if;

  select count(*)
  into category_count
  from public.categories
  where id = any(p_category_ids);

  if category_count <> cardinality(p_category_ids) then
    raise exception 'Una o más categorías ya no existen.' using errcode = '22023';
  end if;

  if p_product_id is null then
    insert into public.products (
      category_id, name, slug, description, price, availability_status, is_active
    ) values (
      p_category_ids[1], p_name, p_slug, p_description, p_price, p_availability_status, p_is_active
    ) returning * into saved_product;
  else
    update public.products
    set category_id = p_category_ids[1],
        name = p_name,
        description = p_description,
        price = p_price,
        availability_status = p_availability_status,
        is_active = p_is_active
    where id = p_product_id
    returning * into saved_product;

    if not found then
      raise exception 'No se encontró el producto.' using errcode = 'P0002';
    end if;

    delete from public.product_categories where product_id = p_product_id;
  end if;

  insert into public.product_categories (product_id, category_id)
  select saved_product.id, requested_categories.category_id
  from unnest(p_category_ids) as requested_categories(category_id);

  return next saved_product;
end;
$$;

revoke all on function public.save_admin_product(uuid, uuid[], text, text, text, numeric, public.product_availability_status, boolean) from public, anon;
grant execute on function public.save_admin_product(uuid, uuid[], text, text, text, numeric, public.product_availability_status, boolean) to authenticated;

create or replace function public.create_order_request(
  p_customer_name text,
  p_customer_phone text,
  p_delivery_notes text,
  p_items jsonb
)
returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_order public.orders;
  invalid_item_count integer;
begin
  if char_length(trim(coalesce(p_customer_name, ''))) = 0 then
    raise exception 'El nombre es obligatorio';
  end if;
  if char_length(trim(coalesce(p_customer_phone, ''))) = 0 then
    raise exception 'El teléfono es obligatorio';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La solicitud debe incluir al menos un producto';
  end if;

  select count(*) into invalid_item_count
  from jsonb_to_recordset(p_items) as requested_item (product_id uuid, quantity integer, options jsonb)
  left join public.products on products.id = requested_item.product_id
  where requested_item.quantity is null
    or requested_item.quantity <= 0
    or products.id is null
    or not products.is_active
    or products.availability_status in ('out_of_stock', 'inactive')
    or not exists (
      select 1
      from public.product_categories
      join public.categories on categories.id = product_categories.category_id
      where product_categories.product_id = products.id
        and categories.is_active
    );
  if invalid_item_count > 0 then
    raise exception 'La solicitud contiene productos no disponibles';
  end if;

  insert into public.orders (customer_name, customer_phone, delivery_notes)
  values (trim(p_customer_name), trim(p_customer_phone), nullif(trim(p_delivery_notes), ''))
  returning * into new_order;

  insert into public.order_items (
    order_id, product_id, product_name_snapshot, product_slug_snapshot,
    unit_price_snapshot, quantity, options_snapshot, availability_snapshot
  )
  select new_order.id, products.id, products.name, products.slug, products.price,
    requested_item.quantity, coalesce(requested_item.options, '{}'::jsonb), products.availability_status
  from jsonb_to_recordset(p_items) as requested_item (product_id uuid, quantity integer, options jsonb)
  join public.products on products.id = requested_item.product_id;

  update public.orders
  set estimated_total = (
        select coalesce(sum(order_items.unit_price_snapshot * order_items.quantity), 0)
        from public.order_items where order_items.order_id = new_order.id
      ),
      procurement_status = case when exists (
        select 1 from public.order_items
        where order_items.order_id = new_order.id
          and order_items.availability_snapshot = 'on_order'
      ) then 'pending_supplier'::public.procurement_status
      else 'not_required'::public.procurement_status end
  where orders.id = new_order.id
  returning * into new_order;

  return query select new_order.id, new_order.order_number;
end;
$$;
