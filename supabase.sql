-- 게스트북 웹 저장소 (Supabase → SQL Editor → New query 에 붙여 넣고 Run)
create table if not exists public.entries (
  no         integer primary key,
  ts         bigint  not null,
  name       text    default '',
  cols       integer not null,
  "rows"     integer not null,
  bits       text    not null,
  bg         text,
  created_at timestamptz default now()
);

create table if not exists public.settings (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz default now()
);

alter table public.entries  enable row level security;
alter table public.settings enable row level security;

-- 전시용: 주소를 아는 사람은 읽고 쓰고 지울 수 있어요 (사진 원본은 없고 점 데이터만 저장)
create policy "guestbook entries open" on public.entries  for all using (true) with check (true);
create policy "guestbook settings open" on public.settings for all using (true) with check (true);
