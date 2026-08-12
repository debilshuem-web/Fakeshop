FROM python:3.10-slim

WORKDIR /app

COPY . .

RUN pip install fastapi uvicorn[standard] python-dotenv

EXPOSE 8000

CMD ["python", "app.py"]
