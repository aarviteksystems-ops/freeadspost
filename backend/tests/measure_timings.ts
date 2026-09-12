async function measure() {
  const urls = [
    "http://localhost:5173/",
    "http://localhost:5173/ads",
    "http://localhost:5173/ad/2022-tesla-model-3-long-range-awd-delhi-ncr",
    "http://localhost:5173/category/vehicles",
    "http://localhost:5173/location/delhi",
    "http://localhost:5173/sitemap.xml",
    "http://localhost:5173/robots.txt",
    "http://localhost:5173/ad/non-existent-ad-slug",
  ];

  console.log("=== SERVER TIMINGS & STATUS CODES ===");
  for (const url of urls) {
    const start = performance.now();
    try {
      const res = await fetch(url, { redirect: "manual" });
      const duration = (performance.now() - start).toFixed(1);
      const text = await res.text();
      const bytes = Buffer.byteLength(text, "utf8");
      console.log(`${res.status} | ${duration.padStart(5, " ")}ms | ${(bytes / 1024).toFixed(1).padStart(6, " ")} KB | ${url}`);
    } catch (err: any) {
      console.log(`ERR | ${url}: ${err.message}`);
    }
  }
}

measure();
