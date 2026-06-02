import urllib.request, json

# Test login
req = urllib.request.Request(
    'http://localhost:5173/api/users/login',
    data=json.dumps({"username": "admin", "password": "admin123"}).encode(),
    headers={"Content-Type": "application/json"},
    method='POST'
)
try:
    resp = urllib.request.urlopen(req)
    print(f"Login Status: {resp.status}")
    data = json.loads(resp.read())
    print(f"Login Response: {json.dumps(data, indent=2, ensure_ascii=False)[:200]}")
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, 'read'):
        print(e.read().decode()[:300])

print("\n--- Testing /api/users/me ---")

# Test /api/users/me (should be 401 since no session)
req2 = urllib.request.Request('http://localhost:5173/api/users/me')
try:
    resp2 = urllib.request.urlopen(req2)
    print(f"Me Status: {resp2.status}")
    print(resp2.read().decode()[:200])
except Exception as e:
    print(f"Me Error (expected 401): {e}")
