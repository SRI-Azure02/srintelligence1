#!/usr/bin/env bash
# infra/bootstrap.sh
#
# Run ONCE before your first CI deploy to create the resource group and ACR.
# After this script completes, every subsequent deploy runs via GitHub Actions.
#
# Usage:
#   chmod +x infra/bootstrap.sh
#   ./infra/bootstrap.sh
#
# Prerequisites: Azure CLI installed and logged in (az login)

set -euo pipefail

# ── Edit these three values ──────────────────────────────────────────────────
RESOURCE_GROUP="srintelligence-rg"
LOCATION="eastus"
ACR_NAME="srintelligence"          # must be globally unique, lowercase, 5–50 chars
# ────────────────────────────────────────────────────────────────────────────

echo "==> Creating resource group: $RESOURCE_GROUP"
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"

echo "==> Creating Container Registry: $ACR_NAME"
az acr create \
  --name "$ACR_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --sku Basic \
  --admin-enabled true

echo ""
echo "==> Bootstrap complete. Add these as GitHub Secrets:"
echo ""
echo "  AZURE_RESOURCE_GROUP   = $RESOURCE_GROUP"
echo "  ACR_NAME               = $ACR_NAME"
echo "  ACR_LOGIN_SERVER       = $(az acr show --name $ACR_NAME --query loginServer -o tsv)"
echo ""
echo "==> Create the GitHub Actions service principal (paste the JSON as AZURE_CREDENTIALS):"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
az ad sp create-for-rbac \
  --name "srintelligence-gh-actions" \
  --role contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
  --sdk-auth
echo ""
echo "==> Also grant the service principal AcrPush on the registry:"
SP_APP_ID=$(az ad sp list --display-name srintelligence-gh-actions --query "[0].appId" -o tsv)
ACR_ID=$(az acr show --name $ACR_NAME --query id -o tsv)
az role assignment create \
  --assignee "$SP_APP_ID" \
  --role AcrPush \
  --scope "$ACR_ID"
echo ""
echo "==> Done. Now push to main or develop to trigger your first full deploy."
