from fastapi import FastAPI, Body
from pydantic import BaseModel
from typing import List, Dict, Any
import chromadb
from chromadb.config import Settings

app = FastAPI()
client = chromadb.PersistentClient(path="/chroma/chroma")  # or wherever you mounted the volume

class AddRequest(BaseModel):
    collection: str
    documents: List[str]
    metadatas: List[Dict[str, Any]]
    ids: List[str]

class QueryRequest(BaseModel):
    collection: str
    query_texts: List[str]
    n_results: int = 3

@app.post("/add")
def add_to_collection(req: AddRequest):
    collection = client.get_or_create_collection(req.collection)
    collection.add(documents=req.documents, metadatas=req.metadatas, ids=req.ids)
    return {"status": "ok"}

@app.post("/query")
def query_collection(req: QueryRequest):
    collection = client.get_or_create_collection(req.collection)
    results = collection.query(query_texts=req.query_texts, n_results=req.n_results)
    return results