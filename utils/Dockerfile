FROM python:3.10-slim

WORKDIR /app

COPY chroma_service.py /app/chroma_service.py

RUN pip install fastapi uvicorn chromadb pydantic

EXPOSE 8001

CMD ["uvicorn", "chroma_service:app", "--host", "0.0.0.0", "--port", "8001"]