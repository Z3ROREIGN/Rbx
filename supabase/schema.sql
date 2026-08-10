create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text,
  roblox_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  robux integer not null check (robux >= 1000 and robux <= 50000),
  method text not null check (method in ('Gamepass','Robux Plus')),
  amount numeric(12,2) not null check (amount > 0),
  roblox_username text not null,
  status text not null default 'PENDING' check (status in ('PENDING','PAID','PROCESSING','DELIVERED','CANCELLED','FAILED')),
  payment_transaction_id text unique,
  pix_copy_paste text,
  pix_qr_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

alter table public.profiles enable row level security;
alter table public.orders enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "orders_select_own" on public.orders for select using (auth.uid() = user_id);
create policy "orders_insert_own" on public.orders for insert with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, username)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders for each row execute procedure public.set_updated_at();
