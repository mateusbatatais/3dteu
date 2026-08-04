-- Rode uma vez no SQL Editor do Supabase para criar o bucket onde os
-- arquivos STL são armazenados. Bucket público: os arquivos são só modelos
-- 3D para preview, sem dado sensível, e precisam ser lidos direto pelo
-- navegador do cliente sem autenticação.
--
-- file_size_limit aqui é só o teto DESTE bucket — ele nunca pode passar do
-- "Global file size limit" do projeto (Storage > Configuration no painel do
-- Supabase). No plano gratuito o teto absoluto é 50MB; se o global do
-- projeto estiver menor que isso, precisa subir ele lá também.
insert into storage.buckets (id, name, public, file_size_limit)
values ('models', 'models', true, 52428800) -- 50MB em bytes
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
