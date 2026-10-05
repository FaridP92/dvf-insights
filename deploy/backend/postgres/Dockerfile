# Postgres 17 + pg_cron (les migrations 0006 et 0008 planifient des jobs avec cron.schedule).
FROM postgres:17-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-17-cron \
 && rm -rf /var/lib/apt/lists/*
