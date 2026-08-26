-- MED (Mecanismo Especial de Devolução) foundation.
-- Additive migration: does not rewrite existing wallet balances or transactions.

create table if not exists public.wallet_med_cases (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  claimant_id uuid not null,
  amount numeric(20,2) not null check (amount > 0),
  status text not null default 'awaiting_justification' check (status in ('awaiting_justification','under_review','approved','rejected','refunded','cancelled')),
  reason text,
  justification text,
  evidence jsonb not null default '[]'::jsonb,
  blocked_amount numeric(20,2) not null default 0 check (blocked_amount >= 0),
  outstanding_amount numeric(20,2) not null default 0 check (outstanding_amount >= 0),
  decided_by uuid,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz
);

create unique index if not exists wallet_med_one_active_per_transaction
  on public.wallet_med_cases(transaction_id)
  where status in ('awaiting_justification','under_review');

create index if not exists wallet_med_claimant_idx on public.wallet_med_cases(claimant_id, created_at desc);
create index if not exists wallet_med_status_idx on public.wallet_med_cases(status, created_at desc);

alter table public.wallet_med_cases enable row level security;

-- Users can see only their own cases. Writes are intentionally function-controlled.
drop policy if exists wallet_med_select_own on public.wallet_med_cases;
create policy wallet_med_select_own on public.wallet_med_cases
  for select to authenticated
  using (claimant_id = auth.uid());

-- Admin access should be granted through existing application/admin functions,
-- not by exposing broad table writes to the client.
drop policy if exists wallet_med_admin_select on public.wallet_med_cases;
create policy wallet_med_admin_select on public.wallet_med_cases
  for select to authenticated
  using (public.is_owner(auth.uid()) or public.is_admin(auth.uid()));

revoke insert, update, delete on public.wallet_med_cases from anon, authenticated;
grant select on public.wallet_med_cases to authenticated;

create table if not exists public.wallet_med_events (
  id uuid primary key default gen_random_uuid(),
  med_id uuid not null references public.wallet_med_cases(id) on delete cascade,
  actor_id uuid,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_med_events_med_idx on public.wallet_med_events(med_id, created_at);
alter table public.wallet_med_events enable row level security;

drop policy if exists wallet_med_events_select_own on public.wallet_med_events;
create policy wallet_med_events_select_own on public.wallet_med_events
  for select to authenticated
  using (exists (select 1 from public.wallet_med_cases c where c.id = med_id and (c.claimant_id = auth.uid() or public.is_owner(auth.uid()) or public.is_admin(auth.uid()))));

revoke insert, update, delete on public.wallet_med_events from anon, authenticated;
grant select on public.wallet_med_events to authenticated;

create or replace function public.med_create_case(
  p_transaction_id uuid,
  p_amount numeric,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid amount'; end if;
  if coalesce(length(trim(p_reason)),0) < 10 then raise exception 'reason required'; end if;

  -- Idempotency: only one active MED can exist for a transaction.
  insert into public.wallet_med_cases(transaction_id, claimant_id, amount, reason, outstanding_amount)
  values (p_transaction_id, auth.uid(), p_amount, trim(p_reason), p_amount)
  on conflict (transaction_id) where status in ('awaiting_justification','under_review') do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.wallet_med_cases
    where transaction_id = p_transaction_id
      and status in ('awaiting_justification','under_review')
    limit 1;
    if v_id is null then raise exception 'MED cannot be opened for this transaction'; end if;
  else
    insert into public.wallet_med_events(med_id, actor_id, event_type, details)
    values (v_id, auth.uid(), 'created', jsonb_build_object('amount',p_amount));
  end if;
  return v_id;
end;
$$;

revoke all on function public.med_create_case(uuid,numeric,text) from public, anon;
grant execute on function public.med_create_case(uuid,numeric,text) to authenticated;

create or replace function public.med_submit_justification(
  p_med_id uuid,
  p_justification text,
  p_evidence jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(length(trim(p_justification)),0) < 20 then raise exception 'justification required'; end if;
  update public.wallet_med_cases
     set justification=trim(p_justification), evidence=coalesce(p_evidence,'[]'::jsonb), status='under_review', updated_at=now()
   where id=p_med_id and claimant_id=auth.uid() and status='awaiting_justification';
  if not found then raise exception 'MED not found or not editable'; end if;
  insert into public.wallet_med_events(med_id,actor_id,event_type,details)
  values(p_med_id,auth.uid(),'justification_submitted',jsonb_build_object('evidence_count',jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))));
end;
$$;

revoke all on function public.med_submit_justification(uuid,text,jsonb) from public, anon;
grant execute on function public.med_submit_justification(uuid,text,jsonb) to authenticated;

create or replace function public.med_admin_decide(
  p_med_id uuid,
  p_approve boolean,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not (public.is_owner(auth.uid()) or public.is_admin(auth.uid())) then raise exception 'not authorized'; end if;
  if coalesce(length(trim(p_reason)),0) < 5 then raise exception 'decision reason required'; end if;

  select status into v_status from public.wallet_med_cases where id=p_med_id for update;
  if v_status is null then raise exception 'MED not found'; end if;
  if v_status not in ('under_review','awaiting_justification') then raise exception 'MED already decided'; end if;

  update public.wallet_med_cases
     set status=case when p_approve then 'approved' else 'rejected' end,
         decided_by=auth.uid(), decision_reason=trim(p_reason), decided_at=now(), updated_at=now()
   where id=p_med_id;

  insert into public.wallet_med_events(med_id,actor_id,event_type,details)
  values(p_med_id,auth.uid(),case when p_approve then 'approved' else 'rejected' end,jsonb_build_object('reason',trim(p_reason)));
end;
$$;

revoke all on function public.med_admin_decide(uuid,boolean,text) from public, anon;
grant execute on function public.med_admin_decide(uuid,boolean,text) to authenticated;

-- Keep updated_at current without touching financial balances.
create or replace function public.wallet_med_touch_updated_at() returns trigger
language plpgsql
as $$ begin new.updated_at=now(); return new; end; $$;

drop trigger if exists wallet_med_touch_updated_at on public.wallet_med_cases;
create trigger wallet_med_touch_updated_at before update on public.wallet_med_cases
for each row execute function public.wallet_med_touch_updated_at();
