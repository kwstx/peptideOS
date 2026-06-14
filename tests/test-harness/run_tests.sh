#!/bin/sh
echo "Waiting for services to be ready..."
python -c '
import socket, time
def wait_port(host, port):
    start = time.time()
    while True:
        try:
            with socket.create_connection((host, port), timeout=2):
                print(f"Connected to {host}:{port}")
                return
        except OSError:
            print(f"Waiting for {host}:{port}...")
            time.sleep(2)
        if time.time() - start > 120:
            print(f"Timeout waiting for {host}:{port}")
            exit(1)

wait_port("postgres", 5432)
wait_port("kafka", 9092)
wait_port("gateway", 8000)
wait_port("pathway", 8002)
wait_port("vector-search", 8003)
wait_port("nlp", 8004)
'

if [ $? -ne 0 ]; then
  echo "Error: Services did not become healthy in time."
  exit 1
fi

echo "All dependencies and microservices are healthy! Commencing validation suite..."
pytest -v test_integration.py
