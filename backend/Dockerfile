FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies explicitly (rather than `pip install .`) so the build
# doesn't depend on packaging/discovery config, and this layer caches unless the
# dependency list changes.
RUN pip install --no-cache-dir \
    "fastapi>=0.110" \
    "uvicorn[standard]>=0.29" \
    "sqlalchemy>=2.0" \
    "httpx>=0.27" \
    "pydantic>=2.6" \
    "pydantic-settings>=2.2" \
    "python-multipart>=0.0.9"

# Copy application source. Tests, venv, db, env are excluded via .dockerignore.
COPY app ./app

# The SQLite database lives on a mounted volume at /data (see docker-compose.yml)
# so it survives container rebuilds.
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
