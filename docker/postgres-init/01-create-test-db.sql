-- Runs once, when the Docker volume is first created.
-- A separate database keeps automated tests away from your development data.
CREATE DATABASE amp_test OWNER amp;
CREATE DATABASE amp_shadow OWNER amp;
