# Liveness check for every tutorial URL in the advisor catalog.
# Run: python3 scratchpad/verify_catalog_links.py
import concurrent.futures
import json
import subprocess
import urllib.request

node = subprocess.run(
    ["node", "-e", "console.log(JSON.stringify(require('./backend/advisor/catalog').ADVISOR_CATALOG))"],
    capture_output=True, text=True, check=True,
)
catalog = json.loads(node.stdout)
links = [(e["id"], t["url"]) for e in catalog for t in e.get("tutorials", [])]
print(f"checking {len(links)} urls...")

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) projectfolio-link-check"}

def probe(item):
    entry_id, url = item
    try:
        request = urllib.request.Request(url, headers=HEADERS, method="GET")
        with urllib.request.urlopen(request, timeout=15) as response:
            return entry_id, url, response.status
    except urllib.error.HTTPError as error:
        return entry_id, url, error.code
    except Exception as error:
        return entry_id, url, str(error)[:60]

with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    results = list(pool.map(probe, links))

dead = [r for r in results if not (isinstance(r[2], int) and r[2] < 400)]
for entry_id, url, status in dead:
    print(f"DEAD [{status}] {entry_id}: {url}")
print(f"\n{len(links) - len(dead)} alive, {len(dead)} dead")
