// Add this to your serperSearch.js to debug the API call

export async function serperWebSearch(query) {
  const apiKey = process.env.SERPER_API_KEY;

  console.log("=== SERPER DEBUG ===");
  console.log("API Key exists:", !!apiKey);
  console.log("API Key length:", apiKey?.length || 0);
  console.log("Query:", query);

  if (!apiKey) {
    throw new Error("SERPER_API_KEY environment variable is not set");
  }

  const url = "https://google.serper.dev/search";
  const headers = {
    "X-API-KEY": apiKey,
    "Content-Type": "application/json",
  };

  const body = {
    q: query,
    num: 5,
  };

  console.log("Request URL:", url);
  console.log("Request headers:", { ...headers, "X-API-KEY": "[REDACTED]" });
  console.log("Request body:", body);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    });

    console.log("Response status:", response.status);
    console.log(
      "Response headers:",
      Object.fromEntries(response.headers.entries())
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log("Error response body:", errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("Success! Data keys:", Object.keys(data));

  
    if (data.organic && data.organic.length > 0) {
      let results = `Search Results for "${query}":\n\n`;
      data.organic.slice(0, 5).forEach((result, index) => {
        results += `${index + 1}. ${result.title}\n`;
        results += `   ${result.snippet}\n`;
        results += `   Source: ${result.link}\n\n`;
      });
      return results;
    } else {
      return `No search results found for "${query}"`;
    }
  } catch (error) {
    console.error("Serper API Error:", error);
    throw error;
  }
}
