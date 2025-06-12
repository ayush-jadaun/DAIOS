import fetch from "node-fetch";

export class ChromaRestClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async add(collection, documents, metadatas, ids) {
    const res = await fetch(`${this.baseUrl}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, documents, metadatas, ids }),
    });
    return res.json();
  }

  async query(collection, query_texts, n_results = 3) {
    const res = await fetch(`${this.baseUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, query_texts, n_results }),
    });
    return res.json();
  }

  async delete(collection, ids = null, where = null, where_document = null) {
    const res = await fetch(`${this.baseUrl}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, ids, where, where_document }),
    });
    return res.json();
  }
}
