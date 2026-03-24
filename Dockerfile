FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including curl for healthchecks
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY README.md pyproject.toml ./

RUN pip install --no-cache-dir bcrypt==4.0.1 && \
    pip install --no-cache-dir -e ".[postgres,redis]"

COPY src/ ./src/

# Create storage directories
RUN mkdir -p storage archive_storage graph_storage

EXPOSE 8080

CMD ["uvicorn", "floww.api.server:app", "--host", "0.0.0.0", "--port", "8080"]
