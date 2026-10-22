create or replace function public.set_order_confirmed_total(
  p_order_id uuid,
  p_confirmed_total numeric
)
returns table (
  confirmed_total numeric,
  total_paid numeric,
  payment_status public.payment_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  already_paid numeric(12, 2);
  next_status public.payment_status;
  last_payment_at timestamptz;
  previous_status public.payment_status;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if p_confirmed_total is null or p_confirmed_total <= 0 or p_confirmed_total <> round(p_confirmed_total, 2) then
    raise exception 'El total confirmado debe ser mayor que cero';
  end if;

  select orders.payment_status
  into previous_status
  from public.orders as orders
  where orders.id = p_order_id
  for update;

  if not found then
    raise exception 'No se encontró el pedido';
  end if;

  select coalesce(sum(order_payments.amount), 0), max(order_payments.received_at)
  into already_paid, last_payment_at
  from public.order_payments as order_payments
  where order_payments.order_id = p_order_id;

  if already_paid = 0 and previous_status <> 'pending' then
    raise exception 'El estado de pago existente no tiene movimientos registrados';
  end if;

  if already_paid > p_confirmed_total then
    raise exception 'El total confirmado no puede ser menor a los pagos registrados';
  end if;

  next_status := case
    when already_paid = 0 then 'pending'::public.payment_status
    when already_paid = p_confirmed_total then 'paid'::public.payment_status
    else 'partial'::public.payment_status
  end;

  update public.orders
  set confirmed_total = p_confirmed_total,
      payment_status = next_status,
      paid_at = case when next_status = 'paid' then last_payment_at else null end
  where orders.id = p_order_id;

  return query select p_confirmed_total, already_paid, next_status;
end;
$$;

revoke all on function public.set_order_confirmed_total(uuid, numeric) from public;
grant execute on function public.set_order_confirmed_total(uuid, numeric) to authenticated;
