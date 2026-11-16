-- Push Arena 계정 표. Supabase 대시보드 → SQL Editor 에 붙여 넣고 Run.
-- 게임 서버만 service_role 키로 읽고 쓴다. 브라우저용 anon 키로는 아무것도 못 보게 RLS를 켜고 정책은 만들지 않는다.
create table if not exists public.accounts (
  key text primary key,                 -- 소문자 아이디
  data jsonb not null,                  -- { name, salt, hash, tokens, save, rank }
  updated_at timestamptz not null default now()
);
alter table public.accounts enable row level security;
-- 경쟁전 순위표를 볼 때 쓸 색인
create index if not exists accounts_rp on public.accounts (((data->'rank'->>'rp')::int) desc);
