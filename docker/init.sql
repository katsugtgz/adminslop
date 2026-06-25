-- Cluster-wide init (runs once, in the default DB).
-- Creates the non-superuser application role used by the app/tests so that
-- Row-Level Security is enforced (superusers and BYPASSRLS roles skip RLS).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user with login password 'app_password';
  end if;
end
$$;
