-- Create a product and its initial physical stock in one transaction.
-- The existing product trigger creates the inventory row at zero first.
create or replace function public.create_admin_product_with_initial_stock(
  p_category_ids uuid[],
  p_name text,
  p_slug text,
  p_description text,
  p_price numeric,
  p_availability_status public.product_availability_status,
  p_is_active boolean,
  p_initial_quantity integer
)
returns setof public.products
language plpgsql
set search_path = public
as $$
declare
  saved_product public.products;
begin
  if not public.is_admin() then
    raise exception 'Se requiere autorización administrativa.' using errcode = '42501';
  end if;

  if p_initial_quantity is null or p_initial_quantity < 0 or p_initial_quantity > 1000000 then
    raise exception 'La cantidad inicial debe estar entre 0 y 1000000.' using errcode = '22023';
  end if;

  if (p_initial_quantity > 0 and p_availability_status <> 'in_stock')
    or (p_initial_quantity = 0 and p_availability_status = 'in_stock') then
    raise exception 'La disponibilidad no coincide con la cantidad inicial.' using errcode = '22023';
  end if;

  select * into saved_product
  from public.save_admin_product(
    null, p_category_ids, p_name, p_slug, p_description, p_price,
    p_availability_status, p_is_active
  );

  update public.inventory
  set quantity = p_initial_quantity, updated_by = auth.uid()
  where product_id = saved_product.id;

  if not found then
    raise exception 'No se encontró el inventario del producto.' using errcode = 'P0002';
  end if;

  return next saved_product;
end;
$$;

revoke all on function public.create_admin_product_with_initial_stock(
  uuid[], text, text, text, numeric, public.product_availability_status,
  boolean, integer
) from public, anon;
grant execute on function public.create_admin_product_with_initial_stock(
  uuid[], text, text, text, numeric, public.product_availability_status,
  boolean, integer
) to authenticated;
