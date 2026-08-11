-- Rode uma vez no SQL Editor do Supabase para criar o bucket onde ficam as
-- fotos que o CLIENTE sobe ao pedir um modelo 3D customizado (Fase 4 do
-- ROADMAP.md). Bucket público: a Meshy precisa buscar a foto pela URL, sem
-- autenticação — mesmo raciocínio dos buckets "models"/"product-media".
insert into storage.buckets (id, name, public, file_size_limit)
values ('custom-model-photos', 'custom-model-photos', true, 10485760) -- 10MB em bytes
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
