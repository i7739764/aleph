#!/bin/bash

# Usage: ./gitpush.sh "your commit message"

if [ -z "$1" ]; then
  echo "❌ Error: Commit message required."
  echo "Usage: ./gitpush.sh \"your commit message\""
  exit 1
fi

git add .
git commit -m "$1"
git push
