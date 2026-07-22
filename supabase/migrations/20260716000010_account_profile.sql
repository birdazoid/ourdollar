-- OurDollar — account-level profile (name + avatar).
--
-- Identity used to live per-household on household_members, so a user re-entered
-- their name/avatar for every household. Now the ACCOUNT owns the profile and
-- member rows mirror it for account-holders (copied on create/join, synced on
-- edit). Non-account members (fun-money-only, not-yet-registered invitees) keep
-- their own name/avatar as before.

alter table public.accounts
  add column if not exists name text,
  add column if not exists avatar text;

-- Backfill each account's profile from its existing member row (prefer the admin
-- row, else the earliest). No-op for accounts with no member rows yet.
update public.accounts a
set name = coalesce(a.name, m.name),
    avatar = coalesce(a.avatar, m.avatar)
from (
  select distinct on (account_id) account_id, name, avatar
  from public.household_members
  where account_id is not null
  order by account_id, is_admin desc, created_at asc
) m
where m.account_id = a.id;

-- Accepting an invite now stamps the accepter's OWN account name/avatar onto the
-- claimed member row, so a joiner shows up as their profile rather than the
-- placeholder label the inviter typed.
create or replace function public.accept_invite(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_avatar text;
  v_updated integer;
begin
  select lower(trim(email)) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return false;
  end if;
  select name, avatar into v_name, v_avatar from public.accounts where id = auth.uid();

  update public.household_members hm
     set account_id     = auth.uid(),
         has_account    = true,
         invite_pending = false,
         name           = coalesce(v_name, hm.name),
         avatar         = coalesce(v_avatar, hm.avatar)
   where hm.id = p_member_id
     and hm.account_id is null
     and hm.invite_email is not null
     and lower(trim(hm.invite_email)) = v_email;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;
