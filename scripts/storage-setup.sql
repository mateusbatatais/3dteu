-- Rode uma vez no SQL Editor do Supabase para criar o bucket onde os
-- arquivos STL são armazenados. Bucket público: os arquivos são só modelos
-- 3D para preview, sem dado sensível, e precisam ser lidos direto pelo
-- navegador do cliente sem autenticação.
insert into storage.buckets (id, name, public)
values ('models', 'models', true)
on conflict (id) do nothing;
