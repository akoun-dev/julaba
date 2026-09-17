#!/bin/bash
# Captures du module BO « Ventes marchands » (détail des ventes de la journée)
set -e
OUT=/home/z/my-project/download/captures-ventes
mkdir -p "$OUT"
URL=http://localhost:3000

agent-browser set viewport 1440 900
agent-browser open $URL
sleep 3
agent-browser snapshot -i -c | head -50
