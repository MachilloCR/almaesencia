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
  left join public.categories on categories.id = products.category_id
  where requested_item.quantity is null or requested_item.quantity <= 0 or products.id is null
    or not products.is_active or not categories.is_active
    or products.availability_status in ('out_of_stock', 'inactive');

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
      from public.order_items
      where order_items.order_id = new_order.id
    ),
    procurement_status = case when exists (
      select 1 from public.order_items
      where order_items.order_id = new_order.id
        and order_items.availability_snapshot = 'on_order'
    ) then 'pending_supplier'::public.procurement_status else 'not_required'::public.procurement_status end
  where orders.id = new_order.id
  returning * into new_order;

  return query select new_order.id, new_order.order_number;
end;
$$;
