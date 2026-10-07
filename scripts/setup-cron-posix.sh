#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

echo "Generating Crontab entry for Stock Research Pipeline..."
echo "Directory: $DIR"

CRON_JOB="0 16 * * 1-5 cd $DIR && npx tsx scripts/cron-scheduler.ts >> $DIR/scans/cron.log 2>&1"

(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "Crontab entry installed successfully:"
echo "$CRON_JOB"
