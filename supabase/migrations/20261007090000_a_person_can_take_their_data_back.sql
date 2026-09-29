-- Leaving, and taking the collection with you.
--
-- What goes: the cars, the profile, the settings, the push subscriptions, and
-- the login itself. What stays: the catalogue entries. Those describe castings
-- that everybody browses and that other people own copies of -- deleting them
-- would take cars out of eleven other collections -- so the entries remain and
-- only the name on them goes, which the existing ON DELETE SET NULL on
-- created_by and updated_by already does.
--
-- The tesoro_users row is kept, emptied. It is the only record that the user ID
-- was ever issued, and without it the next person to sign up could be handed
-- the same one -- which would quietly attach a stranger to whatever still
-- carries it. auth_uid is cleared first for the same reason: that column
-- cascades from auth.users, so deleting the login with the link still in place
-- would take the row, and the ID, with it.
--
-- Nothing here is recoverable, which is why the app offers a CSV of the
-- collection before it offers this.

alter table public.tesoro_users
  add column if not exists deleted_at timestamptz;

comment on column public.tesoro_users.deleted_at is
  'When this person deleted their data. The row is kept, emptied, so the user ID is never reissued.';

create or replace function public.tesoro_delete_my_data()
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me   uuid := auth.uid();
  cars integer := 0;
  who  bigint;
begin
  if me is null then
    raise exception 'Sign in before deleting your data';
  end if;

  -- user_id is a uuid here, not the text it looks like elsewhere in this table.
  delete from public.tesoro_raw where user_id = me;
  get diagnostics cars = row_count;

  -- Emptied rather than removed, and unlinked before the login goes.
  update public.tesoro_users
     set first_name  = 'Deleted',
         last_name   = '',
         email_id    = 'deleted.' || sno || '@tesoro.invalid',
         phone       = null,
         dob         = null,
         gender      = null,
         avatar_url  = null,
         auth_uid    = null,
         is_approved = false,
         is_admin    = false,
         is_owner    = false,
         deleted_at  = now()
   where auth_uid = me
   returning sno into who;

  -- The login. Sessions, identities, settings and push subscriptions all
  -- cascade from here; the catalogue entries only lose the name on them.
  delete from auth.users where id = me;

  return json_build_object('cars', cars, 'profile', coalesce(who, 0));
end $function$;

comment on function public.tesoro_delete_my_data() is
  'Deletes the caller''s own cars, profile and login. Catalogue entries are kept and lose their author. The tesoro_users row survives, emptied, so the user ID is never reissued.';

grant execute on function public.tesoro_delete_my_data() to authenticated;
