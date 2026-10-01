create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

create policy "Public can view active categories"
on public.categories for select
to anon, authenticated
using (is_active);

create policy "Public can view active products"
on public.products for select
to anon, authenticated
using (
  is_active
  and availability_status <> 'inactive'
  and exists (
    select 1 from public.categories
    where categories.id = products.category_id
      and categories.is_active
  )
);

create policy "Public can view images of active products"
on public.product_images for select
to anon, authenticated
using (
  exists (
    select 1 from public.products
    join public.categories on categories.id = products.category_id
    where products.id = product_images.product_id
      and products.is_active
      and products.availability_status <> 'inactive'
      and categories.is_active
  )
);

create policy "Administrators can manage categories"
on public.categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Administrators can manage products"
on public.products for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Administrators can manage product images"
on public.product_images for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Administrators can manage inventory"
on public.inventory for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Users can read their profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "Administrators can manage profiles"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Administrators can manage orders"
on public.orders for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Administrators can manage order items"
on public.order_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Administrators can manage order history"
on public.order_status_history for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products, public.product_images to anon, authenticated;
grant select, insert, update, delete on public.categories, public.products, public.product_images,
  public.inventory, public.profiles, public.orders, public.order_items, public.order_status_history
  to authenticated;

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

  select count(*)
  into invalid_item_count
  from jsonb_to_recordset(p_items) as requested_item (
    product_id uuid,
    quantity integer,
    options jsonb
  )
  left join public.products on products.id = requested_item.product_id
  left join public.categories on categories.id = products.category_id
  where requested_item.quantity is null
    or requested_item.quantity <= 0
    or products.id is null
    or not products.is_active
    or not categories.is_active
    or products.availability_status in ('out_of_stock', 'inactive');

  if invalid_item_count > 0 then
    raise exception 'La solicitud contiene productos no disponibles';
  end if;

  insert into public.orders (
    customer_name,
    customer_phone,
    delivery_notes
  )
  values (
    trim(p_customer_name),
    trim(p_customer_phone),
    nullif(trim(p_delivery_notes), '')
  )
  returning * into new_order;

  insert into public.order_items (
    order_id,
    product_id,
    product_name_snapshot,
    product_slug_snapshot,
    unit_price_snapshot,
    quantity,
    options_snapshot,
    availability_snapshot
  )
  select
    new_order.id,
    products.id,
    products.name,
    products.slug,
    products.price,
    requested_item.quantity,
    coalesce(requested_item.options, '{}'::jsonb),
    products.availability_status
  from jsonb_to_recordset(p_items) as requested_item (
    product_id uuid,
    quantity integer,
    options jsonb
  )
  join public.products on products.id = requested_item.product_id;

  update public.orders
  set
    estimated_total = (
      select coalesce(sum(unit_price_snapshot * quantity), 0)
      from public.order_items
      where order_id = new_order.id
    ),
    procurement_status = case
      when exists (
        select 1
        from public.order_items
        where order_id = new_order.id
          and availability_snapshot = 'on_order'
      ) then 'pending_supplier'::public.procurement_status
      else 'not_required'::public.procurement_status
    end
  where id = new_order.id
  returning * into new_order;

  return query select new_order.id, new_order.order_number;
end;
$$;

revoke all on function public.create_order_request(text, text, text, jsonb) from public;
grant execute on function public.create_order_request(text, text, text, jsonb) to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false)
on conflict (id) do nothing;

create policy "Public can read active product storage images"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.product_images
    join public.products on products.id = product_images.product_id
    join public.categories on categories.id = products.category_id
    where product_images.storage_path = storage.objects.name
      and products.is_active
      and products.availability_status <> 'inactive'
      and categories.is_active
  )
);

create policy "Administrators can manage product storage images"
on storage.objects for all
to authenticated
using (bucket_id = 'product-images' and public.is_admin())
with check (bucket_id = 'product-images' and public.is_admin());
