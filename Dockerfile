# ========================================
# Dockerfile для FAKESHOP Mini App
# Деплой на Render.com
# ========================================

FROM python:3.11-slim

# Устанавливаем рабочую директорию
WORKDIR /app

# Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Копируем requirements.txt и устанавливаем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь проект
COPY . .

# Создаем директорию для статики (если её нет)
RUN mkdir -p frontend

# Открываем порт
EXPOSE 8000

# Запускаем приложение
CMD ["python", "app.py"]
