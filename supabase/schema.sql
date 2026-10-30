-- Skema database XMOC Bogor Raya untuk Supabase.
-- Jalankan di Supabase → SQL Editor, lalu jalankan seed.sql. Aman dijalankan ulang.

-- ============================================================
-- Tabel
-- ============================================================

do $$ begin
  create type public.app_role as enum ('member', 'admin', 'superadmin');
exception when duplicate_object then null; end $$;

-- Data member. Kolom dasar dikelola admin; kolom profil boleh diubah member pemiliknya.
create table if not exists public.members (
  key         text primary key,
  x_id        text unique,
  name        text not null,
  plate       text,
  area        text,
  note        text,
  grp         text not null default 'bogor' check (grp in ('bogor', 'gabungan')),
  city        text check (char_length(city) <= 60),
  car_variant text check (char_length(car_variant) <= 40),
  car_color   text check (char_length(car_color) <= 30),
  car_year    int  check (car_year between 2017 and 2100),
  bio         text check (char_length(bio) <= 280),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Kontak pribadi, hanya terlihat oleh member terverifikasi dan admin.
create table if not exists public.member_contacts (
  member_key text primary key references public.members (key) on delete cascade on update cascade,
  whatsapp   text check (char_length(whatsapp) <= 20),
  instagram  text check (char_length(instagram) <= 40),
  updated_at timestamptz not null default now()
);

-- Satu baris per pengguna login. member_key terisi setelah klaim disetujui admin.
create table if not exists public.accounts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  member_key text unique references public.members (key) on delete set null on update cascade,
  role       public.app_role not null default 'member',
  created_at timestamptz not null default now()
);

-- Peran yang diberikan lewat email, berlaku saat orang tersebut pertama kali login.
create table if not exists public.role_invites (
  email      text primary key,
  role       public.app_role not null,
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Permintaan pengguna untuk dihubungkan ke data member (X-ID) miliknya.
create table if not exists public.claims (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  member_key  text not null references public.members (key) on delete cascade on update cascade,
  message     text check (char_length(message) <= 280),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists claims_one_pending_per_user on public.claims (user_id) where status = 'pending';

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor       uuid default auth.uid(),
  actor_email text,
  action      text not null,
  target      text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_at on public.audit_log (created_at desc);

-- ============================================================
-- Fungsi bantu
-- ============================================================

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select coalesce((select role from accounts where user_id = auth.uid()), 'member'::app_role);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and my_role() in ('admin', 'superadmin');
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and my_role() = 'superadmin';
$$;

create or replace function public.my_member_key() returns text
language sql stable security definer set search_path = public as $$
  select member_key from accounts where user_id = auth.uid();
$$;

create or replace function public.log_action(p_action text, p_target text, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor, actor_email, action, target, detail)
  values (auth.uid(), (select email from accounts where user_id = auth.uid()), p_action, p_target, p_detail);
$$;
revoke execute on function public.log_action(text, text, jsonb) from public, anon, authenticated;

-- ============================================================
-- Trigger
-- ============================================================

-- Akun baru otomatis dibuat saat seseorang login pertama kali.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into accounts (user_id, email, role)
  values (new.id, new.email,
          coalesce((select role from role_invites where lower(email) = lower(new.email)), 'member'))
  on conflict (user_id) do nothing;
  delete from role_invites where lower(email) = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Pengguna yang sudah ada sebelum skema dipasang.
insert into public.accounts (user_id, email)
select id, email from auth.users on conflict (user_id) do nothing;

-- Member biasa hanya boleh mengubah kolom profil miliknya sendiri.
create or replace function public.members_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not is_admin() then
    if new.key is distinct from old.key or new.x_id is distinct from old.x_id
       or new.name is distinct from old.name or new.grp is distinct from old.grp
       or new.note is distinct from old.note then
      raise exception 'Hanya admin yang boleh mengubah X-ID, nama, chapter, dan keterangan';
    end if;
    if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
       and new.avatar_url not like '%/storage/v1/object/public/avatars/' || auth.uid() || '/%' then
      raise exception 'Foto profil harus diunggah lewat aplikasi';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists members_guard on public.members;
create trigger members_guard before insert or update on public.members
  for each row execute function public.members_guard();

create or replace function public.members_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  changes jsonb;
begin
  if auth.uid() is null then return null; end if; -- perubahan dari SQL Editor/seed tidak dicatat
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('dari', o.value, 'jadi', n.value)) into changes
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key not in ('updated_at', 'updated_by');
    if changes is null then return null; end if;
    perform log_action('ubah member', new.key, changes);
  elsif tg_op = 'INSERT' then
    perform log_action('tambah member', new.key, to_jsonb(new));
  else
    perform log_action('hapus member', old.key, to_jsonb(old));
  end if;
  return null;
end $$;

drop trigger if exists members_audit on public.members;
create trigger members_audit after insert or update or delete on public.members
  for each row execute function public.members_audit();

-- ============================================================
-- Fungsi untuk admin (dipanggil dari aplikasi lewat supabase.rpc)
-- ============================================================

create or replace function public.review_claim(p_claim bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  c claims;
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  select * into c from claims where id = p_claim and status = 'pending' for update;
  if not found then raise exception 'Klaim tidak ditemukan atau sudah diproses'; end if;

  if p_approve then
    if exists (select 1 from accounts where member_key = c.member_key and user_id <> c.user_id) then
      raise exception 'Member % sudah terhubung ke akun lain. Lepaskan dulu di tab Pengguna.', c.member_key;
    end if;
    update accounts set member_key = c.member_key where user_id = c.user_id;
  end if;

  update claims set status = case when p_approve then 'approved' else 'rejected' end,
                    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_claim;
  perform log_action(case when p_approve then 'setujui klaim' else 'tolak klaim' end, c.member_key,
                     jsonb_build_object('email', (select email from accounts where user_id = c.user_id)));
end $$;

create or replace function public.admin_link_account(p_user uuid, p_member_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Hanya admin'; end if;
  if p_member_key is not null and exists (select 1 from accounts where member_key = p_member_key and user_id <> p_user) then
    raise exception 'Member % sudah terhubung ke akun lain', p_member_key;
  end if;
  update accounts set member_key = p_member_key where user_id = p_user;
  if not found then raise exception 'Akun tidak ditemukan'; end if;
  perform log_action(case when p_member_key is null then 'lepas akun' else 'hubungkan akun' end, p_member_key,
                     jsonb_build_object('email', (select email from accounts where user_id = p_user)));
end $$;

create or replace function public.set_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_superadmin() then raise exception 'Hanya superadmin yang boleh mengatur peran'; end if;
  if p_role <> 'superadmin' and (select role from accounts where user_id = p_user) = 'superadmin'
     and (select count(*) from accounts where role = 'superadmin') <= 1 then
    raise exception 'Harus ada minimal satu superadmin';
  end if;
  update accounts set role = p_role where user_id = p_user;
  if not found then raise exception 'Akun tidak ditemukan'; end if;
  perform log_action('ubah peran', (select email from accounts where user_id = p_user), jsonb_build_object('peran', p_role));
end $$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.members         enable row level security;
alter table public.member_contacts enable row level security;
alter table public.accounts        enable row level security;
alter table public.role_invites    enable row level security;
alter table public.claims          enable row level security;
alter table public.audit_log       enable row level security;

drop policy if exists "members: semua bisa lihat" on public.members;
create policy "members: semua bisa lihat" on public.members for select using (true);
drop policy if exists "members: admin tambah" on public.members;
create policy "members: admin tambah" on public.members for insert to authenticated with check (is_admin());
drop policy if exists "members: admin atau pemilik ubah" on public.members;
create policy "members: admin atau pemilik ubah" on public.members for update to authenticated
  using (is_admin() or key = my_member_key()) with check (is_admin() or key = my_member_key());
drop policy if exists "members: admin hapus" on public.members;
create policy "members: admin hapus" on public.members for delete to authenticated using (is_admin());

drop policy if exists "contacts: member terverifikasi lihat" on public.member_contacts;
create policy "contacts: member terverifikasi lihat" on public.member_contacts for select to authenticated
  using (is_admin() or my_member_key() is not null);
drop policy if exists "contacts: admin atau pemilik tambah" on public.member_contacts;
create policy "contacts: admin atau pemilik tambah" on public.member_contacts for insert to authenticated
  with check (is_admin() or member_key = my_member_key());
drop policy if exists "contacts: admin atau pemilik ubah" on public.member_contacts;
create policy "contacts: admin atau pemilik ubah" on public.member_contacts for update to authenticated
  using (is_admin() or member_key = my_member_key()) with check (is_admin() or member_key = my_member_key());
drop policy if exists "contacts: admin hapus" on public.member_contacts;
create policy "contacts: admin hapus" on public.member_contacts for delete to authenticated using (is_admin());

-- Perubahan accounts hanya lewat fungsi review_claim / admin_link_account / set_role.
drop policy if exists "accounts: lihat milik sendiri atau admin" on public.accounts;
create policy "accounts: lihat milik sendiri atau admin" on public.accounts for select to authenticated
  using (user_id = auth.uid() or is_admin());

drop policy if exists "invites: superadmin kelola" on public.role_invites;
create policy "invites: superadmin kelola" on public.role_invites for all to authenticated
  using (is_superadmin()) with check (is_superadmin());

drop policy if exists "claims: lihat milik sendiri atau admin" on public.claims;
create policy "claims: lihat milik sendiri atau admin" on public.claims for select to authenticated
  using (user_id = auth.uid() or is_admin());
drop policy if exists "claims: ajukan untuk diri sendiri" on public.claims;
create policy "claims: ajukan untuk diri sendiri" on public.claims for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null and my_member_key() is null);
drop policy if exists "claims: batalkan yang masih pending" on public.claims;
create policy "claims: batalkan yang masih pending" on public.claims for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

drop policy if exists "audit: admin lihat" on public.audit_log;
create policy "audit: admin lihat" on public.audit_log for select to authenticated using (is_admin());

-- ============================================================
-- Storage untuk foto profil (maks 2 MB, gambar saja)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Setiap pengguna hanya boleh menulis ke folder <user_id>/ miliknya; admin boleh semua.
drop policy if exists "avatars: upload sendiri" on storage.objects;
create policy "avatars: upload sendiri" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "avatars: ubah sendiri" on storage.objects;
create policy "avatars: ubah sendiri" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "avatars: hapus sendiri" on storage.objects;
create policy "avatars: hapus sendiri" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ============================================================
-- Superadmin pertama
-- ============================================================
-- Jalankan baris berikut dengan email Anda (boleh sebelum atau sesudah login pertama):
--
--   insert into public.role_invites (email, role) values ('EMAIL_ANDA', 'superadmin') on conflict (email) do update set role = 'superadmin';
--   update public.accounts set role = 'superadmin' where lower(email) = lower('EMAIL_ANDA');
