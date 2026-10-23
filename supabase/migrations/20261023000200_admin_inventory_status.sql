-- Additive administrative operations. Existing RPCs remain available until the
-- new application code is deployed.
create or replace function public.save_admin_product_details(
  p_product_id uuid,
  p_category_ids uuid[],
  p_name text,
  p_description text,
  p_price numeric
)
returns setof public.products
language plpgsql
set search_path = public
as $$
declare
  current_status public.product_availability_status;
  current_active boolean;
  saved_product public.products;
begin
  if not public.is_admin() then
    raise exception 'Se requiere autorización administrativa.' using errcode = '42501';
  end if;

  select products.availability_status, products.is_active
  into current_status, current_active
  from public.products
  where products.id = p_product_id
  for update;

  if not found then
    raise exception 'No se encontró el producto.' using errcode = 'P0002';
  end if;

  select * into saved_product
  from public.save_admin_product(
    p_product_id, p_category_ids, p_name, '', p_description, p_price,
    current_status, current_active
  );

  return next saved_product;
end;
$$;

revoke all on function public.save_admin_product_details(uuid, uuid[], text, text, numeric)
  from public, anon;
grant execute on function public.save_admin_product_details(uuid, uuid[], text, text, numeric)
  to authenticated;

create or replace function public.set_admin_product_inventory(
  p_product_id uuid,
  p_expected_quantity integer,
  p_quantity integer,
  p_availability_status public.product_availability_status
)
returns table (
  product_id uuid,
  quantity integer,
  updated_at timestamptz,
  availability_status public.product_availability_status,
  is_active boolean
)
language plpgsql
set search_path = public
as $$
declare
  current_quantity integer;
begin
  if not public.is_admin() then
    raise exception 'Se requiere autorización administrativa.' using errcode = '42501';
  end if;

  if p_expected_quantity is null or p_expected_quantity < 0 or p_expected_quantity > 1000000
    or p_quantity is null or p_quantity < 0 or p_quantity > 1000000 then
    raise exception 'La cantidad debe estar entre 0 y 1000000.' using errcode = '22023';
  end if;

  if p_availability_status is null
    or (p_quantity > 0 and p_availability_status <> 'in_stock')
    or (p_quantity = 0 and p_availability_status not in ('on_order', 'out_of_stock')) then
    raise exception 'La disponibilidad no coincide con la cantidad.' using errcode = '22023';
  end if;

  select inventory.quantity into current_quantity
  from public.inventory
  where inventory.product_id = p_product_id
  for update;

  if not found then
    raise exception 'No se encontró el inventario del producto.' using errcode = 'P0002';
  end if;

  if current_quantity <> p_expected_quantity then
    raise exception 'INVENTORY_STALE' using errcode = 'P0001';
  end if;

  update public.inventory
  set quantity = p_quantity, updated_by = auth.uid()
  where inventory.product_id = p_product_id;

  update public.products
  set availability_status = p_availability_status,
      is_active = (p_availability_status <> 'out_of_stock')
  where products.id = p_product_id;

  if not found then
    raise exception 'No se encontró el producto.' using errcode = 'P0002';
  end if;

  return query
  select inventory.product_id, inventory.quantity, inventory.updated_at,
         products.availability_status, products.is_active
  from public.inventory
  join public.products on products.id = inventory.product_id
  where inventory.product_id = p_product_id;
end;
$$;

revoke all on function public.set_admin_product_inventory(
  uuid, integer, integer, public.product_availability_status
) from public, anon;
grant execute on function public.set_admin_product_inventory(
  uuid, integer, integer, public.product_availability_status
) to authenticated;
