create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text,
  roblox_username text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  robux integer not null check (robux >= 1000 and robux <= 50000 and mod(robux,1000)=0),
  method text not null check (method in ('Gamepass','Robux Plus')),
  amount numeric(12,2) not null check (amount > 0),
  roblox_username text not null,
  payer_name text,
  payer_document text,
  gamepass_url text,
  status text not null default 'PENDING' check (status in ('PENDING','PAID','PROCESSING','DELIVERED','CANCELLED','FAILED')),
  payment_transaction_id text unique,
  pix_copy_paste text,
  pix_qr_code text,
  delivery_note text,
  delivered_at timestamptz,
  delivered_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists roblox_username text;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.orders add column if not exists payer_name text;
alter table public.orders add column if not exists payer_document text;
alter table public.orders add column if not exists gamepass_url text;
alter table public.orders add column if not exists delivery_note text;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists delivered_by uuid references public.profiles(id);

create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status);

alter table public.profiles enable row level security;
alter table public.orders enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders for select using (auth.uid() = user_id);
drop policy if exists orders_select_pending_authenticated on public.orders;
create policy orders_select_pending_authenticated on public.orders for select to authenticated using (status = 'PENDING');
drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders for insert with check (auth.uid() = user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,email,username) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'username',split_part(new.email,'@',1))) on conflict(id) do update set email=excluded.email;
 return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders for each row execute procedure public.set_updated_at();

create table if not exists public.site_settings (id boolean primary key default true check (id), site_name text not null default 'Best Robux', logo_url text, updated_at timestamptz not null default now());
insert into public.site_settings(id,site_name,logo_url) values(true,'Best Robux',null) on conflict(id) do nothing;
alter table public.site_settings enable row level security;
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings for select using (true);
create or replace function public.update_site_identity(p_site_name text, p_logo_url text) returns public.site_settings language plpgsql security definer set search_path=public as $$ declare v public.site_settings; begin if auth.uid() is null or auth.uid() <> '7e60dfb5-7467-4131-8193-1e8e7e1f307a'::uuid then raise exception 'ONLY_SITE_LEADER'; end if; if p_site_name is null or char_length(trim(p_site_name)) < 2 or char_length(trim(p_site_name)) > 40 then raise exception 'INVALID_SITE_NAME'; end if; if p_logo_url is not null and char_length(p_logo_url) > 500 then raise exception 'INVALID_LOGO_URL'; end if; update public.site_settings set site_name=trim(p_site_name),logo_url=nullif(trim(coalesce(p_logo_url,'')),''),updated_at=now() where id=true returning * into v; return v; end; $$;
grant select on public.site_settings to anon, authenticated;
grant execute on function public.update_site_identity(text,text) to authenticated;
