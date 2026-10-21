do $$
begin
  update storage.buckets
  set
    public = false,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/webp']
  where id = 'product-images';

  if not found then
    raise exception 'The product-images Storage bucket does not exist.';
  end if;
end;
$$;
