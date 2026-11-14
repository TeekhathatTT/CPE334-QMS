-- Runs only when the PostgreSQL data volume is first initialized.
-- Creates the isolated database used by the automated test suite (TEST_DATABASE_URL).
CREATE DATABASE qms_test_db;
