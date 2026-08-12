FROM python:3.10-slim

WORKDIR /app

# Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Копируем весь проект
COPY . .

# Устанавливаем зависимости с фиксированной версией aiogram 2.x
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn[standard] \
    aiogram==2.25.1 \
    python-dotenv \
    aiohttp \
    python-multipart \
    jinja2

EXPOSE 8000

CMD ["python", "app.py"]
