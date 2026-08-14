-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run.
-- 인증을 구현하지 않으므로 anon 역할에 전체 권한을 준다. 데모 데이터만 들어간다는 전제다.

create table if not exists receipts (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  date           text,
  merchant       text,
  amount         integer,
  payment_method text,
  category       text,
  note           text,
  image_path     text
);

-- 6단계(데이터 측정)용. GA로는 장당 파싱 소요 시간을 잴 수 없어 따로 남긴다.
create table if not exists parse_metrics (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  file_count  integer,
  elapsed_ms  integer
);

alter table receipts      enable row level security;
alter table parse_metrics enable row level security;

drop policy if exists anon_all on receipts;
drop policy if exists anon_all on parse_metrics;

create policy anon_all on receipts      for all to anon using (true) with check (true);
create policy anon_all on parse_metrics for all to anon using (true) with check (true);
