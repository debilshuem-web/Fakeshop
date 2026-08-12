FROM python:3.10-slim

WORKDIR /app

# Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Копируем весь проект
COPY . .

# Устанавливаем зависимости напрямую
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn[standard] \
    aiogram \
    python-dotenv \
    aiohttp \
    python-multipart

EXPOSE 8000

CMD ["python", "app.py"]
