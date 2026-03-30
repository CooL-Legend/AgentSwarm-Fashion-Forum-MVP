#!/bin/bash

set -euo pipefail

echo "Starting Go backend..."
cd backend
go run .
