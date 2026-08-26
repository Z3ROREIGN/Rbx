-- MED workflow: additive, idempotent and RLS-protected.
-- The migration deliberately does not rewrite existing wallet balances.

create table if not exists public.med_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null default 'PIX' check (source_type in ('PIX','DEPOSIT','OTHER')),
  source_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'AWAITING_JUSTIFICATION' check (status in ('AWAITING_JUSTIFICATION','UNDER_REVIEW','APPROVED','REFUSED','REFUNDED','CLOSED')),
  reason text not null,
  justification text,
  evidence jsonb not null default '[]'::jsonb,
  reviewed_by uuid references auth.users(id),
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists med_cases_active_source_uidx on public.med_cases(source_type,source_id) where source_id is not null and status in ('AWAITING_JUSTIFICATION','UNDER_REVIEW');
create index if not exists med_cases_user_idx on public.med_cases(user_id,created_at desc);
create index if not exists med_cases_status_idx on public.med_cases(status,created_at desc);
create table if not exists public.med_events (
  id uuid primary key default gen_random_uuid(),
  med_id uuid not null references public.med_cases(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists med_events_med_idx on public.med_events(med_id,created_at);
alter table public.med_cases enable row level security;
alter table public.med_events enable row level security;
drop policy if exists med_cases_own_select on public.med_cases;
create policy med_cases_own_select on public.med_cases for select to authenticated using (auth.uid()=user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
drop policy if exists med_cases_own_update on public.med_cases;
create policy med_cases_own_update on public.med_cases for update to authenticated using (auth.uid()=user_id and status='AWAITING_JUSTIFICATION') with check (auth.uid()=user_id and status='AWAITING_JUSTIFICATION');
drop policy if exists med_events_select on public.med_events;
create policy med_events_select on public.med_events for select to authenticated using (exists(select 1 from public.med_cases m where m.id=med_id and (m.user_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true))));
create or replace function public.set_med_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists med_cases_updated_at on public.med_cases;
create trigger med_cases_updated_at before update on public.med_cases for each row execute function public.set_med_updated_at();
create or replace function public.is_med_admin() returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select p.is_admin from public.profiles p where p.id=auth.uid()),false); $$;
revoke all on function public.is_med_admin() from public,anon;
grant execute on function public.is_med_admin() to authenticated;
create or replace function public.create_med_case(p_user_id uuid,p_amount numeric,p_reason text,p_source_type text default 'PIX',p_source_id uuid default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_id uuid; begin if not public.is_med_admin() then raise exception 'ADMIN_REQUIRED'; end if; if p_user_id is null or p_amount <= 0 or char_length(trim(coalesce(p_reason,''))) < 10 then raise exception 'INVALID_MED'; end if; insert into public.med_cases(user_id,amount,reason,source_type,source_id) values(p_user_id,round(p_amount,2),trim(p_reason),coalesce(p_source_type,'PIX'),p_source_id) returning id into v_id; insert into public.med_events(med_id,actor_id,event_type,details) values(v_id,auth.uid(),'CREATED',jsonb_build_object('amount',round(p_amount,2),'source_type',coalesce(p_source_type,'PIX'),'source_id',p_source_id)); return v_id; end; $$;
revoke all on function public.create_med_case(uuid,numeric,text,text,uuid) from public,anon;
grant execute on function public.create_med_case(uuid,numeric,text,text,uuid) to authenticated;
create or replace function public.submit_med_justification(p_med_id uuid,p_justification text,p_evidence jsonb default '[]'::jsonb) returns void language plpgsql security invoker set search_path=public as $$ declare m public.med_cases%rowtype; begin select * into m from public.med_cases where id=p_med_id and user_id=auth.uid() for update; if not found then raise exception 'MED_NOT_FOUND'; end if; if m.status <> 'AWAITING_JUSTIFICATION' then raise exception 'MED_NOT_AWAITING_JUSTIFICATION'; end if; if char_length(trim(coalesce(p_justification,''))) < 10 then raise exception 'JUSTIFICATION_REQUIRED'; end if; update public.med_cases set justification=trim(p_justification), evidence=case when jsonb_typeof(p_evidence)='array' then p_evidence else '[]'::jsonb end, status='UNDER_REVIEW' where id=p_med_id; insert into public.med_events(med_id,actor_id,event_type,details) values(p_med_id,auth.uid(),'JUSTIFICATION_SUBMITTED',jsonb_build_object('evidence_count',jsonb_array_length(case when jsonb_typeof(p_evidence)='array' then p_evidence else '[]'::jsonb end))); end; $$;
revoke all on function public.submit_med_justification(uuid,text,jsonb) from anon;
grant execute on function public.submit_med_justification(uuid,text,jsonb) to authenticated;
create or replace function public.review_med_case(p_med_id uuid,p_decision text,p_reason text) returns jsonb language plpgsql security definer set search_path=public as $$ declare m public.med_cases%rowtype; a public.wallet_accounts%rowtype; v_balance numeric; v_new numeric; begin if not public.is_med_admin() then raise exception 'ADMIN_REQUIRED'; end if; if p_decision not in ('APPROVE','REFUSE') then raise exception 'INVALID_DECISION'; end if; if char_length(trim(coalesce(p_reason,''))) < 5 then raise exception 'REVIEW_REASON_REQUIRED'; end if; select * into m from public.med_cases where id=p_med_id for update; if not found then raise exception 'MED_NOT_FOUND'; end if; if m.status in ('APPROVED','REFUSED','REFUNDED','CLOSED') then return jsonb_build_object('id',m.id,'status',m.status,'idempotent',true); end if; if m.status <> 'UNDER_REVIEW' then raise exception 'MED_NOT_READY'; end if; if p_decision='REFUSE' then update public.med_cases set status='REFUSED',reviewed_by=auth.uid(),reviewed_at=now(),review_reason=trim(p_reason) where id=m.id; insert into public.med_events(med_id,actor_id,event_type,details) values(m.id,auth.uid(),'REFUSED',jsonb_build_object('reason',trim(p_reason))); return jsonb_build_object('id',m.id,'status','REFUSED','idempotent',false); end if; insert into public.wallet_accounts(user_id,balance) values(m.user_id,0) on conflict(user_id) do nothing; select * into a from public.wallet_accounts where user_id=m.user_id for update; v_balance=a.balance; if exists(select 1 from public.wallet_transactions where reference_id=m.id and type='MED_DEBIT') then update public.med_cases set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=coalesce(reviewed_at,now()),review_reason=trim(p_reason) where id=m.id; return jsonb_build_object('id',m.id,'status','APPROVED','balance',a.balance,'idempotent',true); end if; v_new=v_balance-m.amount; update public.wallet_accounts set balance=v_new,updated_at=now() where user_id=m.user_id; insert into public.wallet_transactions(user_id,type,amount,fee,reference_id,description) values(m.user_id,'MED_DEBIT',-m.amount,0,m.id,'Débito aprovado por MED'); update public.med_cases set status='APPROVED',reviewed_by=auth.uid(),reviewed_at=now(),review_reason=trim(p_reason) where id=m.id; insert into public.med_events(med_id,actor_id,event_type,details) values(m.id,auth.uid(),'APPROVED',jsonb_build_object('debited_amount',m.amount,'previous_balance',v_balance,'new_balance',v_new)); return jsonb_build_object('id',m.id,'status','APPROVED','previous_balance',v_balance,'balance',v_new,'idempotent',false); end; $$;
revoke all on function public.review_med_case(uuid,text,text) from public,anon;
grant execute on function public.review_med_case(uuid,text,text) to authenticated;
create or replace view public.wallet_available_balances as select wa.user_id,wa.balance,coalesce(sum(m.amount) filter(where m.status in ('AWAITING_JUSTIFICATION','UNDER_REVIEW')),0) as med_pending_amount,wa.balance-coalesce(sum(m.amount) filter(where m.status in ('AWAITING_JUSTIFICATION','UNDER_REVIEW')),0) as available_balance,wa.updated_at from public.wallet_accounts wa left join public.med_cases m on m.user_id=wa.user_id group by wa.user_id,wa.balance,wa.updated_at;
grant select on public.wallet_available_balances to authenticated;

create or replace function public.request_marketplace_withdrawal(p_amount numeric,pix text) returns uuid language plpgsql security definer set search_path=public as $$ declare uid uuid:=auth.uid(); aid numeric; pending numeric; available numeric; wid uuid; begin if uid is null then raise exception 'AUTH_REQUIRED'; end if; if p_amount<=0 or coalesce(trim(pix),'')='' then raise exception 'INVALID_WITHDRAWAL'; end if; select balance into aid from public.wallet_accounts where user_id=uid for update; if aid is null then raise exception 'WALLET_NOT_FOUND'; end if; select coalesce(sum(amount),0) into pending from public.med_cases where user_id=uid and status in ('AWAITING_JUSTIFICATION','UNDER_REVIEW'); available:=aid-pending; if available < p_amount+2 then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE'; end if; insert into wallet_withdrawals(user_id,amount,fee,pix_key) values(uid,p_amount,2,pix) returning id into wid; update wallet_accounts set balance=balance-p_amount-2,updated_at=now() where user_id=uid; insert into wallet_transactions(user_id,type,amount,fee,reference_id,description) values(uid,'WITHDRAWAL',-p_amount,2,wid,'Solicitação de saque'); return wid; end; $$;
revoke all on function public.request_marketplace_withdrawal(numeric,text) from public,anon;
grant execute on function public.request_marketplace_withdrawal(numeric,text) to authenticated;
