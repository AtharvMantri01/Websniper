import requests
import json
import time

url = "http://localhost:8000/api/v1/run/youtube"
headers = {"Content-Type": "application/json"}
payload = {
    "url": "https://www.youtube.com/results?search_query=Vicky+Kaushal+movies",
    "inputs": {
        "input_1": "Movies"
    }
}

print(f"Testing API endpoint: {url}")
print(f"Payload: {json.dumps(payload, indent=2)}")
print("-" * 40)

start_time = time.time()
try:
    response = requests.post(url, json=payload, headers=headers)
    print(f"Status Code: {response.status_code}")
    print("Response JSON:")
    try:
        print(json.dumps(response.json(), indent=2))
    except ValueError:
        print(response.text.encode('utf-8', errors='replace').decode('utf-8'))
except requests.exceptions.RequestException as e:
    print(f"Connection Error: {e}")

print("-" * 40)
print(f"Time taken: {time.time() - start_time:.2f} seconds")
