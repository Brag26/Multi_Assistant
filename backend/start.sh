#!/bin/sh
# Runs on every container start (Render, Docker, anywhere this image runs).
# Applies any pending Alembic migrations against DATABASE_URL before the API
# comes up — this is what replaces needing Shell access to run
# `alembic upgrade head` manually. If the migration fails, the deploy fails
# loudly instead of the app silently running against a stale schema.
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
