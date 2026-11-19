-- 50_seed.sql — controlled seed for the disposable validation database (owner hattz_pg_admin).
--
-- Publication matrix:
--   Alice = published + snapshot public      -> EXPECT publicly visible
--   Bob   = published + snapshot unpublished -> EXPECT NOT visible
--   Carol = draft     + snapshot public      -> EXPECT NOT visible
--   Dave  = published + NO snapshot          -> EXPECT NOT visible
--
-- `theme.tokens` is a legitimate design-token key. It is accepted only because the SQL validator
-- uses `\y` (PostgreSQL ARE word boundary); `\b` is a backspace in PG and would wrongly reject it.
-- The seed is therefore itself a regression proof of the 0009 word-boundary fix.
\set ON_ERROR_STOP 1
\set valid_content '{"schemaVersion":1,"profile":{"displayName":"Alice","bio":"hi","avatarAssetId":"avatar_1"},"sections":[{"id":"sec1","type":"hero","visible":true,"order":1,"blocks":[{"id":"blk1","type":"text","visible":true,"order":1,"props":{"text":"Hello","nested":{"arr":[1,2,3],"ok":true}}}]}],"theme":{"primary":"#ffffff","palette":{"x":1},"tokens":{"radius":8}},"effects":{"glow":true},"seo":{"title":"Alice","description":"Profile"}}'

-- Idempotent reset of seeded tables in this disposable DB only.
truncate public.profile_public_snapshots, public.profile_publications, public.media_variants,
         public.media_assets, public.profile_slugs, public.profiles restart identity cascade;

insert into public.profiles (id, technical_id, display_name, status, is_official) values
 ('11111111-1111-1111-1111-111111111111', 'tech-alice', 'Alice Public', 'active', true),
 ('22222222-2222-2222-2222-222222222222', 'tech-bob', 'Bob Unpublished', 'active', false),
 ('33333333-3333-3333-3333-333333333333', 'tech-carol', 'Carol Draft', 'active', false),
 ('44444444-4444-4444-4444-444444444444', 'tech-dave', 'Dave NoSnapshot', 'active', false);

-- Slugs: Alice current + retired; Bob/Carol/Dave current.
insert into public.profile_slugs (profile_id, slug, is_current, retired_at) values
 ('11111111-1111-1111-1111-111111111111', 'alice-public', true, null),
 ('11111111-1111-1111-1111-111111111111', 'alice-old', false, now()),
 ('22222222-2222-2222-2222-222222222222', 'bob-unpublished', true, null),
 ('33333333-3333-3333-3333-333333333333', 'carol-draft', true, null),
 ('44444444-4444-4444-4444-444444444444', 'dave-nosnapshot', true, null);

-- Publications (inserted before snapshots; the snapshot trigger back-fills the flag).
insert into public.profile_publications (id, profile_id, version, state, published_at) values
 ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 'published', now()),
 ('a2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 1, 'published', now()),
 ('a3333333-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 1, 'draft', null),
 ('a4444444-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 1, 'published', now());

-- Media matrix: m1 public+active (with variant), m2 public+pending, m3 private+active, m4 public+active (no variants).
insert into public.media_assets (id, profile_id, kind, mime_type, size_bytes, status, is_public, width, height) values
 ('b1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'avatar', 'image/png', 100, 'active', true, 64, 64),
 ('b2222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'banner', 'image/png', 100, 'pending', true, 100, 50),
 ('b3333333-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'frame', 'image/png', 100, 'active', false, 10, 10),
 ('b4444444-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'badge', 'image/png', 100, 'active', true, 20, 20);

-- Variants: m1/m2/m3 have variants; m4 intentionally has none.
insert into public.media_variants (asset_id, variant, storage_path, mime_type, format, size_bytes, width, height) values
 ('b1111111-0000-0000-0000-000000000001', 'original', 'p/1/orig', 'image/png', 'png', 100, 64, 64),
 ('b2222222-0000-0000-0000-000000000002', 'original', 'p/2/orig', 'image/png', 'png', 100, 100, 50),
 ('b3333333-0000-0000-0000-000000000003', 'original', 'p/3/orig', 'image/png', 'png', 100, 10, 10);

-- Snapshots (content validated by trigger trg_validate_publishable_snapshot).
insert into public.profile_public_snapshots (id, publication_id, profile_id, version, visibility, seo_title, seo_description, og_image_asset_id, content) values
 ('c1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 'public', 'Alice', 'desc', 'b1111111-0000-0000-0000-000000000001', :'valid_content'::jsonb),
 ('c2222222-0000-0000-0000-000000000002', 'a2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 1, 'unpublished', 'Bob', 'desc', null, :'valid_content'::jsonb),
 ('c3333333-0000-0000-0000-000000000003', 'a3333333-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 1, 'public', 'Carol', 'desc', null, :'valid_content'::jsonb);

\echo === SEED COUNTS ===
select
 (select count(*) from public.profiles) as profiles,
 (select count(*) from public.profile_slugs) as slugs,
 (select count(*) from public.profile_publications) as publications,
 (select count(*) from public.media_assets) as assets,
 (select count(*) from public.media_variants) as variants,
 (select count(*) from public.profile_public_snapshots) as snapshots;

\echo === [HARD] derived flag after seed matches the predicate (expect Alice=true, others=false) ===
do $$
declare
  bad int;
begin
  select count(*) into bad
  from public.profile_publications pub
  where pub.is_publicly_visible is distinct from (
    (pub.state = 'published') and exists (
      select 1 from public.profile_public_snapshots s
      where s.publication_id = pub.id and s.visibility = 'public'));
  if bad <> 0 then
    raise exception 'seed: % publication(s) with a flag diverging from the predicate', bad;
  end if;
  if (select is_publicly_visible from public.profile_publications where id = 'a1111111-0000-0000-0000-000000000001') is not true then
    raise exception 'seed: Alice should be publicly visible';
  end if;
  if (select is_publicly_visible from public.profile_publications where id = 'a2222222-0000-0000-0000-000000000002') is not false then
    raise exception 'seed: Bob should NOT be publicly visible';
  end if;
  if (select is_publicly_visible from public.profile_publications where id = 'a3333333-0000-0000-0000-000000000003') is not false then
    raise exception 'seed: Carol should NOT be publicly visible';
  end if;
  if (select is_publicly_visible from public.profile_publications where id = 'a4444444-0000-0000-0000-000000000004') is not false then
    raise exception 'seed: Dave should NOT be publicly visible';
  end if;
  raise notice 'seed: derived flag matrix: OK';
end
$$;

\echo === SEED MATRIX ===
select p.display_name, pub.state, s.visibility, pub.is_publicly_visible,
       (pub.state = 'published' and s.visibility = 'public') as predicate
from public.profile_publications pub
join public.profiles p on p.id = pub.profile_id
left join public.profile_public_snapshots s on s.publication_id = pub.id
order by p.display_name;
