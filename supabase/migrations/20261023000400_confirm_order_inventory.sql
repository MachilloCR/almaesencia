-- Keep confirmation and the physical inventory deduction in one transaction.
-- Requests containing any on-order item do not deduct any inventory in this phase.
create or replace function public.apply_order_confirmation_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_count integer;
  on_order_count integer;
  unsupported_count integer;
  requested record;
  available_quantity integer;
  current_status public.product_availability_status;
  current_active boolean;
  current_name text;
begin
  if not public.is_admin() then
    raise exception 'Se requiere autorización administrativa.' using errcode = '42501';
  end if;

  if new.order_status = old.order_status then
    return new;
  end if;

  if old.order_status in ('cancelled', 'completed') then
    raise exception 'Un pedido cancelado o completado no puede reabrirse.' using errcode = 'P0001';
  end if;

  if old.order_status = 'confirmed' and new.order_status = 'pending_review' then
    raise exception 'Un pedido confirmado no puede volver a pendiente de revisión.' using errcode = 'P0001';
  end if;

  if old.order_status = 'pending_review' and new.order_status = 'completed' then
    raise exception 'Confirma el pedido antes de completarlo.' using errcode = 'P0001';
  end if;

  if new.order_status = 'confirmed' then
    if old.order_status <> 'pending_review' or old.confirmed_at is not null then
      raise exception 'Este pedido ya fue confirmado anteriormente; revisa su inventario manualmente.' using errcode = 'P0001';
    end if;

    select count(*),
           count(*) filter (where availability_snapshot = 'on_order'),
           count(*) filter (where availability_snapshot not in ('in_stock', 'on_order'))
    into item_count, on_order_count, unsupported_count
    from public.order_items
    where order_id = old.id;

    if item_count = 0 or unsupported_count > 0 then
      raise exception 'La solicitud no tiene artículos válidos para confirmar.' using errcode = 'P0001';
    end if;

    if on_order_count > 0 then
      return new;
    end if;

    -- A fixed product order avoids competing confirmations locking rows in
    -- different sequences. The administrative stock operation also locks the
    -- inventory row before changing the product status.
    for requested in
      select product_id, sum(quantity) as quantity, min(product_name_snapshot) as name
      from public.order_items
      where order_id = old.id
      group by product_id
      order by product_id nulls first
    loop
      if requested.product_id is null then
        raise exception 'El producto "%" ya no existe; revisa la solicitud antes de confirmar.', requested.name using errcode = 'P0001';
      end if;

      select inventory.quantity into available_quantity
      from public.inventory
      where inventory.product_id = requested.product_id
      for update;

      if not found then
        raise exception 'El producto "%" no tiene inventario registrado.', requested.name using errcode = 'P0001';
      end if;

      select products.availability_status, products.is_active, products.name
      into current_status, current_active, current_name
      from public.products
      where products.id = requested.product_id
      for update;

      if not found or not current_active or current_status <> 'in_stock' then
        raise exception 'El producto "%" ya no está disponible en stock.', requested.name using errcode = 'P0001';
      end if;

      if available_quantity < requested.quantity then
        raise exception 'Existencias insuficientes de "%": hay % y se solicitaron %.',
          current_name, available_quantity, requested.quantity using errcode = 'P0001';
      end if;

      update public.inventory
      set quantity = available_quantity - requested.quantity,
          updated_by = auth.uid()
      where inventory.product_id = requested.product_id;

      if available_quantity = requested.quantity then
        update public.products
        set availability_status = 'on_order', is_active = true
        where products.id = requested.product_id;
      end if;
    end loop;
  end if;

  -- Cancellation never restores units automatically. The owner adjusts stock
  -- manually if the physical units are available again.
  return new;
end;
$$;

revoke all on function public.apply_order_confirmation_inventory() from public, anon, authenticated;

create trigger orders_apply_confirmation_inventory
before update of order_status on public.orders
for each row execute function public.apply_order_confirmation_inventory();
