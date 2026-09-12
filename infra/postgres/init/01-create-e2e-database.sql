-- A separate database for the browser end-to-end suite.
--
-- Those tests drive the real product through a real API, so they write real
-- rows. Pointing them at the development database means every run leaves
-- fixture data behind, and the seeded demo data a reviewer is meant to see
-- gets buried under "E2E create m1x8..." within a day.
--
-- Created at init time because the Postgres image runs these once, before
-- anything can connect.
CREATE DATABASE opsflow_e2e OWNER opsflow;
