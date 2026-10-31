-- ============================================================================
-- 002_rls — lock the tables down when running on Supabase
-- ============================================================================
--
-- WHY THIS EXISTS
--
-- On a plain PostgreSQL cluster this migration is a harmless no-op: nothing
-- but this API can reach the database, and Row Level Security with no policies
-- simply never gets consulted because the owning role bypasses it.
--
-- On Supabase it is essential. Supabase runs PostgREST over the `public`
-- schema and publishes it on the project's public URL. Any table created there
-- WITHOUT RLS enabled is readable — and, depending on grants, writable — by
-- anyone holding the project's anon key, which is by design a public value
-- shipped in browser bundles. Creating these four tables and walking away
-- would mean publishing the whole dataset, including user-submitted reports,
-- to the open internet.
--
-- HOW THIS BEHAVES
--
-- Enabling RLS with *no policies* denies every row to every role that is
-- subject to RLS — which is `anon` and `authenticated`, the roles PostgREST
-- uses. The API is unaffected: it connects over a direct Postgres connection
-- as the database owner, and a table's owner (along with any BYPASSRLS role)
-- is not subject to RLS. So the server keeps full access and the public REST
-- surface gets nothing.
--
-- "Deny by default, then add policies if a use case appears" is the correct
-- order. The reverse — open it up and remember to restrict later — is how
-- datasets end up indexed.
--
-- If a future version wanted to serve read-only sightings straight from
-- PostgREST, the change would be one explicit policy per table, e.g.
--
--   CREATE POLICY "public read" ON sightings FOR SELECT TO anon USING (true);
--
-- which is a deliberate, reviewable act rather than an accident of omission.
-- ============================================================================

ALTER TABLE sightings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE species     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_runs  ENABLE ROW LEVEL SECURITY;

-- Belt and braces: revoke the blanket grants Supabase's `public` schema hands
-- to the API roles. RLS alone is sufficient, but a table that is both
-- un-granted and RLS-protected cannot be reached even if a future migration
-- adds a permissive policy by mistake.
--
-- Guarded, because these roles only exist on Supabase — on a local cluster the
-- block is skipped rather than failing the migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON sightings, cities, species, dataset_meta, ingest_runs FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON sightings, cities, species, dataset_meta, ingest_runs FROM authenticated;
  END IF;
END
$$;
