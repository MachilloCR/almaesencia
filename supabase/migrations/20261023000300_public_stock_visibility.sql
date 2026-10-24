-- Keep products marked as agotado out of public product, category and image reads.
-- The image and Storage policies already use this helper.
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
      and products.availability_status in ('in_stock', 'on_order')
      and categories.is_active
  );
$$;

drop policy "Public can view active products" on public.products;
create policy "Public can view active products"
on public.products for select
to anon, authenticated
using (
  is_active
  and availability_status in ('in_stock', 'on_order')
  and exists (
    select 1
    from public.product_categories
    where product_categories.product_id = products.id
      and public.can_view_product_category(product_categories.product_id, product_categories.category_id)
  )
);

-- Publish only physical quantities of products that are actually offered and in stock.
-- No direct public SELECT on inventory is added.
create or replace function public.get_public_product_stock()
returns table (product_id uuid, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select products.id, inventory.quantity
  from public.products
  join public.inventory on inventory.product_id = products.id
  where products.is_active
    and products.availability_status = 'in_stock'
    and inventory.quantity > 0
    and exists (
      select 1
      from public.product_categories
      join public.categories on categories.id = product_categories.category_id
      where product_categories.product_id = products.id
        and categories.is_active
    );
$$;

revoke all on function public.get_public_product_stock() from public, anon, authenticated;
grant execute on function public.get_public_product_stock() to anon, authenticated;
