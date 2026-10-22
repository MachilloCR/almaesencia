alter table public.orders
  add column confirmed_total numeric(12, 2)
  check (confirmed_total is null or confirmed_total > 0);

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method public.payment_method not null,
  note text,
  received_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_payments_order_id_received_at_idx
  on public.order_payments (order_id, received_at desc);

alter table public.order_payments enable row level security;

create policy "Administrators can read order payments"
on public.order_payments for select
to authenticated
using (public.is_admin());

grant select on public.order_payments to authenticated;

create or replace function public.record_order_payment(
  p_order_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method,
  p_note text default null
)
returns table (
  payment_id uuid,
  amount numeric,
  payment_method public.payment_method,
  note text,
  received_at timestamptz,
  total_paid numeric,
  payment_status public.payment_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  order_total numeric(12, 2);
  already_paid numeric(12, 2);
  new_total numeric(12, 2);
  new_payment public.order_payments;
  payment_time timestamptz := now();
  next_status public.payment_status;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'El monto del pago debe ser mayor que cero';
  end if;

  select orders.confirmed_total
  into order_total
  from public.orders
  where orders.id = p_order_id
  for update;

  if not found then
    raise exception 'No se encontró el pedido';
  end if;

  if order_total is null then
    raise exception 'Confirma el total del pedido antes de registrar pagos';
  end if;

  select coalesce(sum(order_payments.amount), 0)
  into already_paid
  from public.order_payments
  where order_payments.order_id = p_order_id;

  new_total := already_paid + p_amount;
  if new_total > order_total then
    raise exception 'El pago supera el saldo pendiente';
  end if;

  insert into public.order_payments (
    order_id, amount, payment_method, note, received_at, recorded_by
  )
  values (
    p_order_id, p_amount, p_payment_method, nullif(trim(p_note), ''), payment_time, auth.uid()
  )
  returning * into new_payment;

  next_status := case
    when new_total = order_total then 'paid'::public.payment_status
    else 'partial'::public.payment_status
  end;

  update public.orders
  set payment_status = next_status,
      payment_method = p_payment_method,
      payment_notes = nullif(trim(p_note), ''),
      paid_at = case when next_status = 'paid' then payment_time else null end
  where orders.id = p_order_id;

  return query select new_payment.id, new_payment.amount, new_payment.payment_method,
    new_payment.note, new_payment.received_at, new_total, next_status;
end;
$$;

revoke all on function public.record_order_payment(uuid, numeric, public.payment_method, text) from public;
grant execute on function public.record_order_payment(uuid, numeric, public.payment_method, text) to authenticated;

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

  select payment_status
  into previous_status
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'No se encontró el pedido';
  end if;

  select coalesce(sum(amount), 0), max(received_at)
  into already_paid, last_payment_at
  from public.order_payments
  where order_id = p_order_id;

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
  where id = p_order_id;

  return query select p_confirmed_total, already_paid, next_status;
end;
$$;

revoke all on function public.set_order_confirmed_total(uuid, numeric) from public;
grant execute on function public.set_order_confirmed_total(uuid, numeric) to authenticated;
