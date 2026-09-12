import { getPublicAds } from "../../app/services/api";

async function testRedirect() {
  const data = await getPublicAds({ limit: 1 });
  const firstAd = data.data?.ads?.[0];
  if (!firstAd) {
    console.log("No ad found");
    return;
  }
  console.log("Testing redirect for Ad ID:", firstAd.ad_id, "Slug:", firstAd.slug);

  const testUrl = `http://localhost:5173/ad/${firstAd.ad_id}`;
  const redirectRes = await fetch(testUrl, { redirect: "manual" });
  console.log("Status:", redirectRes.status);
  console.log("Location Header:", redirectRes.headers.get("location"));
}

testRedirect();
