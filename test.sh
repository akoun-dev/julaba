#!/bin/bash
cd /home/z/my-project
nohup bun run dev > /tmp/jlog 2>&1 &
echo "PID: $!"
sleep 25
echo "--- Server status ---"
curl -v http://127.0.0.1:3000/ 2>&1 | head -30
echo "--- HTML check ---"
curl -s http://127.0.0.1:3000/ | grep -c 'Julaba' || echo 'NO MATCH'
echo "--- Phone submit test ---"
curl -s -X POST http://127.0.0.1:3000/api/merchant/login -H 'Content-Type: application/json' -d '{"phone":"0701020304","pin":"1234"}' 2>&1 | head -20
