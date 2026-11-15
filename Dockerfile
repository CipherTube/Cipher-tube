FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl android-tools-adb nodejs npm && rm -rf /var/lib/apt/lists/*
RUN npm install -g fern-api

COPY . /app

RUN pip install --no-cache-dir fastapi uvicorn pydantic requests pytest

EXPOSE 8001

CMD ["python", "simulators/dashboard_server.py"]
