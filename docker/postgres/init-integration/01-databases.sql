-- auth_db is created from POSTGRES_DB. Add course + analytics DBs for integration E2E.
-- Owner matches POSTGRES_USER in docker-compose.integration.yml (lms_it).
CREATE DATABASE course_db OWNER lms_it;
CREATE DATABASE analytics_db OWNER lms_it;
