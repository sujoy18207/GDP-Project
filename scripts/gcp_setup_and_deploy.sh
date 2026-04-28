#!/usr/bin/env bash
set -euo pipefail

# gcp_setup_and_deploy.sh
# Convenience script to create Artifact Registry (if missing), enable APIs,
# and run Cloud Build to deploy backend + frontend to Cloud Run using
# cloudbuild.yaml in the repo root.
#
# Usage:
#   ./scripts/gcp_setup_and_deploy.sh PROJECT_ID [REGION]
# Example:
#   ./scripts/gcp_setup_and_deploy.sh my-gcp-project us-central1

PROJECT_ID=${1:-}
REGION=${2:-us-central1}

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: $0 PROJECT_ID [REGION]" >&2
  exit 2
fi

set -x

# Ensure gcloud is authenticated and configured
gcloud auth login --brief
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com

# Create Artifact Registry repo if it doesn't exist
AR_REPO=fairaudit
AR_LOCATION="$REGION"

if ! gcloud artifacts repositories list --location="$AR_LOCATION" --format='value(name)' | grep -q "^$AR_REPO$"; then
  echo "Creating Artifact Registry repo: $AR_REPO in $AR_LOCATION"
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$AR_LOCATION" \
    --description="FairAudit container images"
else
  echo "Artifact Registry repo $AR_REPO already exists in $AR_LOCATION"
fi

# Configure Docker authentication to push to Artifact Registry
gcloud auth configure-docker "${AR_LOCATION}-docker.pkg.dev" --quiet

# Submit Cloud Build (will build images, push them, and deploy Cloud Run services)
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION="$REGION",_AR_REPO="$AR_REPO"

echo "Deployment triggered. Monitor Cloud Build or Cloud Run console for progress."
