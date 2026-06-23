// SRIntelligence — Azure Container Apps infrastructure
// Deploy with:
//   az deployment group create \
//     --resource-group srintelligence-rg \
//     --template-file infra/main.bicep \
//     --parameters infra/main.parameters.json

@description('Location for all resources')
param location string = resourceGroup().location

@description('Short environment tag: prod | staging')
@allowed(['prod', 'staging'])
param environment string = 'prod'

@description('Container image to deploy, e.g. srintelligence.azurecr.io/srintelligence:main-a1b2c3d')
param containerImage string

// ── Secrets (passed at deploy time, never stored in git) ────────────────────

@secure()
param anthropicApiKey string

@secure()
param snowflakeAccount string

@secure()
param snowflakeUsername string

@secure()
param snowflakePat string

@secure()
param snowflakePrivateKey string

@secure()
param snowflakeRole string

@secure()
param snowflakeWarehouse string

@secure()
param snowflakeDatabase string

@secure()
param snowflakeSchema string

@secure()
param snowflakeMlSchema string

@secure()
param snowflakeSemanticView string

@secure()
param cronSecret string

@secure()
param webhookSecret string

param notificationWebhookUrl string = ''
param smtpHost string = ''
param monitoringRole string = ''
param schedulerRole string = ''

// ── Variables ────────────────────────────────────────────────────────────────

var appName = 'srintelligence'
var tags = {
  application: appName
  environment: environment
}

// ── Container Registry ───────────────────────────────────────────────────────

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${appName}${environment}acr'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ── Log Analytics (required by Container Apps environment) ───────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${appName}-${environment}-logs'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ── Container Apps Environment ───────────────────────────────────────────────

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${appName}-${environment}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ── Container App ────────────────────────────────────────────────────────────

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${appName}-${environment}'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password',           value: acr.listCredentials().passwords[0].value }
        { name: 'anthropic-api-key',       value: anthropicApiKey }
        { name: 'snowflake-account',       value: snowflakeAccount }
        { name: 'snowflake-username',      value: snowflakeUsername }
        { name: 'snowflake-pat',           value: snowflakePat }
        { name: 'snowflake-private-key',   value: snowflakePrivateKey }
        { name: 'snowflake-role',          value: snowflakeRole }
        { name: 'snowflake-warehouse',     value: snowflakeWarehouse }
        { name: 'snowflake-database',      value: snowflakeDatabase }
        { name: 'snowflake-schema',        value: snowflakeSchema }
        { name: 'snowflake-ml-schema',     value: snowflakeMlSchema }
        { name: 'snowflake-semantic-view', value: snowflakeSemanticView }
        { name: 'cron-secret',             value: cronSecret }
        { name: 'webhook-secret',          value: webhookSecret }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          image: containerImage
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            { name: 'NODE_ENV',                    value: 'production' }
            { name: 'NEXT_TELEMETRY_DISABLED',     value: '1' }
            { name: 'ANTHROPIC_API_KEY',           secretRef: 'anthropic-api-key' }
            { name: 'SNOWFLAKE_ACCOUNT',           secretRef: 'snowflake-account' }
            { name: 'SNOWFLAKE_USERNAME',          secretRef: 'snowflake-username' }
            { name: 'SNOWFLAKE_PAT',               secretRef: 'snowflake-pat' }
            { name: 'SNOWFLAKE_PRIVATE_KEY',       secretRef: 'snowflake-private-key' }
            { name: 'SNOWFLAKE_ROLE',              secretRef: 'snowflake-role' }
            { name: 'SNOWFLAKE_WAREHOUSE',         secretRef: 'snowflake-warehouse' }
            { name: 'SNOWFLAKE_DATABASE',          secretRef: 'snowflake-database' }
            { name: 'SNOWFLAKE_SCHEMA',            secretRef: 'snowflake-schema' }
            { name: 'SNOWFLAKE_ML_SCHEMA',         secretRef: 'snowflake-ml-schema' }
            { name: 'SNOWFLAKE_SEMANTIC_VIEW',     secretRef: 'snowflake-semantic-view' }
            { name: 'CRON_SECRET',                 secretRef: 'cron-secret' }
            { name: 'WEBHOOK_SECRET',              secretRef: 'webhook-secret' }
            { name: 'NOTIFICATION_WEBHOOK_URL',    value: notificationWebhookUrl }
            { name: 'SMTP_HOST',                   value: smtpHost }
            { name: 'MONITORING_ROLE',             value: monitoringRole }
            { name: 'SCHEDULER_ROLE',              value: schedulerRole }
          ]
          probes: [
            {
              // TCP probe — works before Snowflake env vars are populated.
              // HTTP probes against /api/* would fail on cold start (no DB connection yet).
              type: 'Liveness'
              tcpSocket: {
                port: 3000
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Startup'
              tcpSocket: {
                port: 3000
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              failureThreshold: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────

output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output acrLoginServer string  = acr.properties.loginServer
output acrName string         = acr.name
