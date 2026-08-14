-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- 버킷을 Public 으로 만들면 "읽기"만 공개된다. anon 역할의 업로드는 여전히 막힌다.
-- 그래서 storage.objects 에 INSERT 정책을 따로 줘야 한다.

drop policy if exists anon_upload_receipts on storage.objects;
drop policy if exists anon_read_receipts   on storage.objects;

create policy anon_upload_receipts on storage.objects
  for insert to anon
  with check (bucket_id = 'receipts');

create policy anon_read_receipts on storage.objects
  for select to anon
  using (bucket_id = 'receipts');
