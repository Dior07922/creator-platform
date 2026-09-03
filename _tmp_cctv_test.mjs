const url1 = "https://api.cntv.cn/List/getHandDataList?id=TDAT1629790998629912&serviceId=tvcctv&n=10&cb=searcht";
const url2 = "https://api.cntv.cn/List/getHandDataList?id=TDAT1630318144629270&serviceId=tvcctv&n=10&cb=lbt";

async function test(label, url) {
  console.log("=== " + label + " ===");
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://tv.cctv.com/top/index.shtml",
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(15000),
    });
    console.log("HTTP status:", res.status);
    const text = await res.text();
    console.log("raw (first 600):", text.slice(0, 600));
    const m = text.match(/^[a-zA-Z_$][\w$]*\((.*)\);?\s*$/s);
    if (m) {
      const json = JSON.parse(m[1]);
      const items = json?.data?.itemList ?? [];
      console.log("count:", items.length);
      if (items.length > 0) {
        console.log("keys of first item:", Object.keys(items[0]));
        console.log("first title:", items[0].title);
        console.log("first url:", items[0].url);
        console.log("first 3 items title+url:");
        items.slice(0, 3).forEach((it, i) => console.log(`  ${i+1}. ${it.title} -> ${it.url}`));
      }
    }
  } catch (e) {
    console.log("error:", e.message);
  }
  console.log("");
}

await test("TDAT1629790998629912 (hotSearch)", url1);
await test("TDAT1630318144629270 (lbt)", url2);