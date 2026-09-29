-- Renaming a brand, a make, a model or a colour, everywhere it is spelled.
--
-- tesoro_rename_assortment already does this for one field, and the reason it
-- exists applies to the rest: a spelling lives on the cars and the catalogue
-- entries, nowhere else, so "Hot Wheels" and "Hotwheels" are two brands and
-- neither is correctable from the app. 27 cars and 24 entries had to be fixed
-- by hand yesterday.
--
-- One function for the four free-text fields, because they differ only in
-- which column is written. The field name is whitelisted rather than
-- interpolated blind: it reaches a format() that builds SQL, and the values
-- themselves are passed as parameters.
--
-- security definer, and admin-only inside: the catalogue is shared, and cars
-- belong to twelve different people, so no caller can reach the rows this
-- has to touch under their own RLS.

create or replace function public.tesoro_rename_field(_field text, _from text, _to text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cleaned text := trim(_to);
  old     text := trim(_from);
  raw_col text;
  cat_col text;
  moved   integer := 0;
  extra   integer := 0;
begin
  if not public.is_tesoro_admin(auth.uid()) then
    raise exception 'Only an admin can rename a %', _field;
  end if;
  if cleaned = '' or old = '' then
    raise exception 'Both the old and the new spelling are needed';
  end if;

  -- The whitelist. Anything else is refused rather than guessed at.
  case lower(_field)
    when 'brand'  then raw_col := 'Brand';  cat_col := 'brand';
    when 'make'   then raw_col := 'Make';   cat_col := 'make';
    when 'model'  then raw_col := 'Model';  cat_col := 'model';
    when 'colour' then raw_col := 'Colour'; cat_col := 'colour';
    when 'type'   then raw_col := 'Type';   cat_col := 'type';
    when 'series' then raw_col := 'Series'; cat_col := 'series';
    else raise exception 'There is nothing called % to rename', _field;
  end case;

  execute format(
    'update public.tesoro_raw set %I = $1 where lower(trim(%I)) = lower($2)',
    raw_col, raw_col
  ) using cleaned, old;
  get diagnostics moved = row_count;

  execute format(
    'update public.tesoro_car_catalog set %I = $1, updated_at = now() where lower(trim(%I)) = lower($2)',
    cat_col, cat_col
  ) using cleaned, old;
  get diagnostics extra = row_count;

  return moved + extra;
end $function$;

comment on function public.tesoro_rename_field(text, text, text) is
  'Renames one spelling of a brand, make, model, colour, type or series across every car and catalogue entry. Admin only. The companion to tesoro_rename_assortment.';

grant execute on function public.tesoro_rename_field(text, text, text) to authenticated;
