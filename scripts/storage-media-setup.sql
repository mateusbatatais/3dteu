-- Rode uma vez no SQL Editor do Supabase para criar o bucket onde ficam as
-- fotos/gifs de produto (galeria + imagem de Open Graph). Bucket público:
-- são fotos de divulgação, sem dado sensível, lidas direto pelo navegador
-- sem autenticação — mesmo raciocínio do bucket "models" (storage-setup.sql).
insert into storage.buckets (id, name, public, file_size_limit)
values ('product-media', 'product-media', true, 10485760) -- 10MB em bytes
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
