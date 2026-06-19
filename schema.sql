-- ============================================================
-- FLOWLAB SUPABASE SCHEMA (v2)
-- Run this entire script in Supabase SQL Editor (once, on a fresh project)
-- ============================================================

create table producers (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null unique,
  name text not null,
  tier text not null default 'free' check (tier in ('free', 'pro', 'studio')),
  created_at timestamptz default now()
);

create table artists (
  id uuid default gen_random_uuid() primary key,
  producer_id uuid references producers(id) on delete cascade not null,
  name text not null,
  genre text not null,
  avatar_path text, -- storage object path e.g. "{producer_id}/{artist_id}/avatar.png" — NOT a public URL (bucket is private)
  created_at timestamptz default now()
);

create table voice_profiles (
  id uuid default gen_random_uuid() primary key,
  artist_id uuid references artists(id) on delete cascade not null,
  sample_lyrics text not null,
  extracted_patterns jsonb,
  created_at timestamptz default now()
);

create table sessions (
  id uuid default gen_random_uuid() primary key,
  producer_id uuid references producers(id) on delete cascade not null,
  artist_id uuid references artists(id) on delete set null,
  input_lyrics text not null,
  source_genre text not null,
  target_genre text not null,
  output_lyrics text,
  session_notes text,
  tier_used text not null default 'free' check (tier_used in ('free', 'ai')),
  created_at timestamptz default now()
);

-- Tier → tier_used mapping (enforced in app.js):
--   producers.tier = 'free'            -> sessions.tier_used = 'free'
--   producers.tier = 'pro' or 'studio' -> sessions.tier_used = 'ai'

-- ============================================================
-- INDEXES (required — dashboard queries and RLS checks hit these)
-- ============================================================

create index idx_artists_producer on artists(producer_id);
create index idx_sessions_producer_created on sessions(producer_id, created_at desc);
create index idx_sessions_artist on sessions(artist_id);
create index idx_voice_profiles_artist on voice_profiles(artist_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table producers    enable row level security;
alter table artists      enable row level security;
alter table voice_profiles enable row level security;
alter table sessions     enable row level security;

create policy "Producer can view own profile"   on producers for select using (auth.uid() = id);
create policy "Producer can update own profile" on producers for update using (auth.uid() = id);
create policy "Producer can insert own profile" on producers for insert with check (auth.uid() = id);

create policy "Producer can view own artists"   on artists for select using (auth.uid() = producer_id);
create policy "Producer can insert own artists" on artists for insert with check (auth.uid() = producer_id);
create policy "Producer can update own artists" on artists for update using (auth.uid() = producer_id);
create policy "Producer can delete own artists" on artists for delete using (auth.uid() = producer_id);

create policy "Producer can view own artist voice profiles" on voice_profiles for select using (
  exists (select 1 from artists where artists.id = voice_profiles.artist_id and artists.producer_id = auth.uid())
);
create policy "Producer can insert voice profiles for own artists" on voice_profiles for insert with check (
  exists (select 1 from artists where artists.id = voice_profiles.artist_id and artists.producer_id = auth.uid())
);
create policy "Producer can update own artist voice profiles" on voice_profiles for update using (
  exists (select 1 from artists where artists.id = voice_profiles.artist_id and artists.producer_id = auth.uid())
);
create policy "Producer can delete own artist voice profiles" on voice_profiles for delete using (
  exists (select 1 from artists where artists.id = voice_profiles.artist_id and artists.producer_id = auth.uid())
);

create policy "Producer can view own sessions"   on sessions for select using (auth.uid() = producer_id);
create policy "Producer can insert own sessions" on sessions for insert with check (auth.uid() = producer_id);
create policy "Producer can update own sessions" on sessions for update using (auth.uid() = producer_id);
create policy "Producer can delete own sessions" on sessions for delete using (auth.uid() = producer_id);

-- ============================================================
-- STORAGE BUCKET
-- (stems bucket stores artist avatars — stem/beat files are zipped
-- client-side via JSZip and never persisted to storage)
-- ============================================================

insert into storage.buckets (id, name, public) values ('stems', 'stems', false);

create policy "Producer can upload stems" on storage.objects for insert with check (
  bucket_id = 'stems' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "Producer can view own stems" on storage.objects for select using (
  bucket_id = 'stems' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "Producer can update own stems" on storage.objects for update using (
  bucket_id = 'stems' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "Producer can delete own stems" on storage.objects for delete using (
  bucket_id = 'stems' and auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================================
-- AUTO-CREATE PRODUCER PROFILE ON SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.producers (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- DASHBOARD AGGREGATE — avoids N+1 per artist card.
-- security invoker: runs with the CALLER's RLS, cannot leak
-- another producer's data even if called with a different id.
-- ============================================================

create or replace function get_artist_stats(p_producer_id uuid)
returns table(artist_id uuid, session_count bigint, last_session_at timestamptz)
language sql security invoker as $$
  select artist_id, count(*), max(created_at)
  from sessions
  where producer_id = p_producer_id and artist_id is not null
  group by artist_id;
$$;

-- ============================================================
-- GRANTS (least-privilege — RLS is the real gate)
-- ============================================================

grant usage on schema public to authenticated;
grant select, insert, update, delete on producers, artists, voice_profiles, sessions to authenticated;
grant execute on function get_artist_stats(uuid) to authenticated;
