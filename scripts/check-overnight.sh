#!/bin/bash
# Run this when you wake up to see results

echo "=== OVERNIGHT BENCHMARK STATUS ==="
echo ""

# Check if process is still running
if ps aux | grep -v grep | grep "bun.*longmemeval" > /dev/null; then
  echo "STATUS: Still running..."
else
  echo "STATUS: Completed (or crashed)"
fi

echo ""

# Check for errors
ERRORS=$(grep -c "ERROR" /tmp/steno-overnight-benchmark.log 2>/dev/null || echo "0")
echo "Errors: $ERRORS"

# Check progress
INGESTED=$(grep -c "Ingested" /tmp/steno-overnight-benchmark.log 2>/dev/null || echo "0")
SEARCHED=$(grep -c "Searched" /tmp/steno-overnight-benchmark.log 2>/dev/null || echo "0")
echo "Questions ingested: $INGESTED"
echo "Questions searched: $SEARCHED"

echo ""

# Show results if complete
if grep -q "Accuracy" /tmp/steno-overnight-benchmark.log 2>/dev/null; then
  echo "=== RESULTS ==="
  grep -A30 "MEMORYBENCH RESULTS" /tmp/steno-overnight-benchmark.log | sed 's/\x1b\[[0-9;]*m//g'
else
  echo "No results yet. Check full log:"
  echo "  tail -50 /tmp/steno-overnight-benchmark.log"
fi
