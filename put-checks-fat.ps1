<#
.SYNOPSIS
    Auto-generated STANDALONE deployment script for put-checks

.DESCRIPTION
    This script recreates the complete project structure and files.
    ALL FILE CONTENTS ARE EMBEDDED WITHIN THIS SCRIPT.
    No external dependencies required.

    Generated on: 2025-08-16T13:01:12.987Z
    Source: /Users/brunobuger/workspace/citi/put/put-checks
    Total Files: 133

.NOTES
    Run this script in an empty directory where you want the project created.
    Requires PowerShell 5.0 or higher.
    This is a completely self-contained script with all file contents embedded.
#>

$ErrorActionPreference = 'Stop'

# === CONFIGURATION ===
$ProjectName = 'put-checks'
$ExpectedTotalFiles = 133
$ExpectedTotalDirectories = 56
$PSMajor = $PSVersionTable.PSVersion.Major
if ($PSMajor -ge 7) { $EncodingChoice = 'utf8BOM' } else { $EncodingChoice = 'utf8' }

# Auto-elevate if on Windows and not running as admin
try {
  if ($IsWindows) {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
      Write-Host '[i] Not running as Administrator. Attempting to relaunch with elevation...' -ForegroundColor Yellow
      $psi = New-Object System.Diagnostics.ProcessStartInfo 'powershell'
      $psi.Arguments = '-ExecutionPolicy Bypass -File "' + $MyInvocation.MyCommand.Definition + '"'
      $psi.Verb = 'runas'
      [Diagnostics.Process]::Start($psi) | Out-Null
      exit
    }
  }
} catch {
  Write-Host '[w] Elevation step skipped or failed: ' + $_.Exception.Message -ForegroundColor Yellow
}

# Set execution policy for this process only
try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force } catch {}

# === INVENTORY (as comments) ===
<#
Directories (56):
  - public
  - src
  - src/components
  - src/components/common
  - src/components/common/FilterBar
  - src/components/common/ScopeBar
  - src/components/home
  - src/components/layout
  - src/components/layout/ChecksLayout
  - src/components/layout/LayoutProvider
  - src/components/reports
  - src/components/scheduling
  - src/components/shared
  - src/components/shared/ErrorBoundary
  - src/components/shared/States
  - src/components/studio
  - src/data
  - src/pages
  - src/pages/ActivityPage
  - src/pages/AllChecksPage
  - src/pages/CSIOverviewPage
  - src/pages/CSIsDirectoryPage
  - src/pages/CheckDetailsPage
  - src/pages/ChecksStudioPage
  - src/pages/ChecksTemplatesPage
  - src/pages/CreateCheckPage
  - src/pages/DashboardPage
  - src/pages/HomePage
  - src/pages/Reports
  - src/pages/ReportsPage
  - src/pages/SchedulesPage
  - src/pages/StudioRunsPage
  - src/pages/StudioTestsPage
  - src/services
  - src/services/api
  - src/services/mocks
  - src/services/mocks/handlers
  - src/services/mocks/mockData
  - src/store
  - src/store/slices
  - src/test
  - src/theme
  - src/types
  - src/types/checks
  - src/types/common
  - src/types/csi
  - src/types/dashboard
  - src/types/reports
  - src/types/studio
  - src/types/tags
  - src/utils
  - src/utils/constants
  - src/utils/navigation
  - src/utils/studio
  - src/utils/studio/codegen
  - src/utils/studio/ir

Files (133):
  - package.json
  - public/index.html
  - public/mockServiceWorker.js
  - src/App.tsx
  - src/bootstrap.tsx
  - src/ChecksModule.tsx
  - src/components/common/FilterBar/CSISelect.tsx
  - src/components/common/FilterBar/FilterBar.tsx
  - src/components/common/FilterBar/index.ts
  - src/components/common/FilterBar/TagSelect.tsx
  - src/components/common/ScopeBar/ScopeBar.tsx
  - src/components/home/ActivityFeed.tsx
  - src/components/home/AttentionPanel.tsx
  - src/components/home/CommandPalette.tsx
  - src/components/home/GlobalSearch.tsx
  - src/components/home/KPIBar.tsx
  - src/components/home/PinnedCSIs.tsx
  - src/components/home/ReportsSnapshot.tsx
  - src/components/home/SectionBox.tsx
  - src/components/home/TriageDrawer.tsx
  - src/components/home/UpcomingSchedules.tsx
  - src/components/layout/ChecksLayout/ChecksLayout.a11y.test.tsx
  - src/components/layout/ChecksLayout/ChecksLayout.tsx
  - src/components/layout/ChecksLayout/HelpDialog.tsx
  - src/components/layout/ChecksLayout/index.ts
  - src/components/layout/ChecksLayout/Notifications.tsx
  - src/components/layout/ChecksLayout/SkipLink.tsx
  - src/components/layout/LayoutProvider/index.ts
  - src/components/layout/LayoutProvider/LayoutProvider.tsx
  - src/components/reports/RecipientsEditor.tsx
  - src/components/reports/ReportSectionsEditor.tsx
  - src/components/reports/RuleBuilder.tsx
  - src/components/reports/ScheduleEditor.tsx
  - src/components/scheduling/ScheduleDialog.tsx
  - src/components/scheduling/UpcomingExecutions.tsx
  - src/components/shared/ErrorBoundary/ErrorBoundary.tsx
  - src/components/shared/ErrorBoundary/index.ts
  - src/components/shared/States/EmptyState.tsx
  - src/components/shared/States/ErrorState.tsx
  - src/components/shared/States/LoadingState.tsx
  - src/components/studio/CodeTab.tsx
  - src/components/studio/OnboardingCoach.tsx
  - src/components/studio/SecretInput.tsx
  - src/data/mockCSIData.ts
  - src/index.tsx
  - src/main-simple.tsx
  - src/main.tsx
  - src/pages/ActivityPage/ActivityPage.tsx
  - src/pages/ActivityPage/index.ts
  - src/pages/AllChecksPage/AllChecksPage.tsx
  - src/pages/AllChecksPage/FiltersRail.tsx
  - src/pages/AllChecksPage/index.ts
  - src/pages/CheckDetailsPage/CheckDetailsPage.tsx
  - src/pages/CheckDetailsPage/index.ts
  - src/pages/ChecksStudioPage/ChecksStudioPage.tsx
  - src/pages/ChecksStudioPage/index.ts
  - src/pages/ChecksTemplatesPage/ChecksTemplatesPage.tsx
  - src/pages/ChecksTemplatesPage/index.ts
  - src/pages/CreateCheckPage/CreateCheckPage.tsx
  - src/pages/CreateCheckPage/index.ts
  - src/pages/CSIOverviewPage/CSIOverviewPage.tsx
  - src/pages/CSIOverviewPage/index.ts
  - src/pages/CSIsDirectoryPage/CSIsDirectoryPage.tsx
  - src/pages/CSIsDirectoryPage/index.ts
  - src/pages/DashboardPage/DashboardPage.tsx
  - src/pages/DashboardPage/index.ts
  - src/pages/HomePage/HomePage.tsx
  - src/pages/HomePage/index.ts
  - src/pages/Reports/index.ts
  - src/pages/Reports/ReportBuilder.tsx
  - src/pages/Reports/ReportDetailsPage.tsx
  - src/pages/Reports/ReportsHome.tsx
  - src/pages/ReportsPage/index.ts
  - src/pages/ReportsPage/ReportsPage.tsx
  - src/pages/SchedulesPage/index.ts
  - src/pages/SchedulesPage/SchedulesPage.tsx
  - src/pages/StudioRunsPage/index.ts
  - src/pages/StudioRunsPage/StudioRunsPage.tsx
  - src/pages/StudioTestsPage/index.ts
  - src/pages/StudioTestsPage/StudioTestsPage.tsx
  - src/services/api/apiClient.ts
  - src/services/api/checksApi.ts
  - src/services/api/csiApi.ts
  - src/services/api/dashboardApi.ts
  - src/services/api/reportsApi.ts
  - src/services/api/studioApi.ts
  - src/services/api/templatesApi.ts
  - src/services/mocks/browser.ts
  - src/services/mocks/handlers/checksHandlers.ts
  - src/services/mocks/handlers/csiHandlers.ts
  - src/services/mocks/handlers/dashboardHandlers.ts
  - src/services/mocks/handlers/index.ts
  - src/services/mocks/handlers/reportsHandlers.ts
  - src/services/mocks/handlers/secretsHandlers.ts
  - src/services/mocks/handlers/studioHandlers.ts
  - src/services/mocks/handlers/tagsHandlers.ts
  - src/services/mocks/handlers/templatesHandlers.ts
  - src/services/mocks/mockData/checksData.ts
  - src/services/mocks/mockData/csiData.ts
  - src/services/mocks/mockData/reportsData.ts
  - src/services/mocks/mockData/studioData.ts
  - src/services/mocks/mockData/templatesData.ts
  - src/services/mocks/server.ts
  - src/store/index.ts
  - src/store/slices/checksSlice.test.ts
  - src/store/slices/checksSlice.ts
  - src/store/slices/csiSlice.ts
  - src/store/slices/dashboardSlice.ts
  - src/store/slices/reportsSlice.ts
  - src/store/slices/studioSlice.ts
  - src/store/slices/uiSlice.ts
  - src/test/setup.ts
  - src/theme/index.ts
  - src/types/checks/checkTypes.ts
  - src/types/common/commonTypes.ts
  - src/types/csi/csiTypes.ts
  - src/types/dashboard/dashboardTypes.ts
  - src/types/reports/reportTypes.ts
  - src/types/studio/studioTypes.ts
  - src/types/tags/tagTypes.ts
  - src/utils/constants/appConfig.ts
  - src/utils/constants/navigationConfig.ts
  - src/utils/navigation/navigationSetup.ts
  - src/utils/studio/codegen/pythonGenerator.ts
  - src/utils/studio/ir/parseSteps.ts
  - src/utils/tagUtils.ts
  - src/vite-env.d.ts
  - tsconfig.json
  - tsconfig.node.json
  - vite.config.ts
  - vitest.config.ts
  - webpack.config.cjs
  - webpack.config.js
#>

# === EMBEDDED FILE CONTENTS SECTION ===
$Files = @()

# File 1: package.json
$Files += [pscustomobject]@{
  RelativePath = 'package.json'
  SizeBytes    = 2789
  Sha256       = 'f1c47bdb94575497b860ff9ba4196c070eb844281cde938497749fab70d6acf0'
  Content      = @'
{
  "name": "put-checks-module",
  "version": "1.0.0",
  "description": "PUT Checks Module - Micro-frontend for operational health monitoring",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "webpack serve --config webpack.config.js",
    "start": "webpack serve --config webpack.config.js",
    "build": "NODE_ENV=production webpack --config webpack.config.js",
    "dev:standalone": "vite --port 5173",
    "build:standalone": "vite build",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "cypress open",
    "test:coverage": "vitest --coverage",
    "msw:init": "msw init public --save",
    "preview": "vite preview"
  },
  "dependencies": {
    "@emotion/react": "^11.11.0",
    "@emotion/styled": "^11.11.0",
    "@hookform/resolvers": "^3.3.0",
    "@mui/icons-material": "^5.15.0",
    "@mui/material": "^5.15.0",
    "@put/core-components": "file:../put-core-components",
    "@reduxjs/toolkit": "^2.0.0",
    "@tanstack/react-query": "^5.0.0",
    "axios": "^1.6.0",
    "date-fns": "^3.0.0",
    "jwt-decode": "^4.0.0",
    "msw": "^2.0.0",
    "process": "^0.11.10",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.48.0",
    "react-redux": "^9.0.0",
    "react-router-dom": "^6.21.0",
    "yup": "^1.4.0"
  },
  "devDependencies": {
    "@cypress/react18": "^2.0.0",
    "@module-federation/enhanced": "^0.1.0",
    "@pmmmwh/react-refresh-webpack-plugin": "^0.6.1",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@vitejs/plugin-react": "^4.2.0",
    "@vitest/ui": "^1.0.0",
    "babel-loader": "^9.1.0",
    "buffer": "^6.0.3",
    "css-loader": "^6.8.0",
    "cypress": "^13.0.0",
    "eslint": "^8.0.0",
    "eslint-plugin-react": "^7.33.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "html-webpack-plugin": "^5.6.0",
    "jsdom": "^23.0.0",
    "stream-browserify": "^3.0.0",
    "style-loader": "^3.3.0",
    "ts-loader": "^9.5.0",
    "typescript": "^5.2.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0",
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.0",
    "webpack-dev-server": "^4.15.0"
  },
  "keywords": [
    "put",
    "checks",
    "micro-frontend",
    "module-federation",
    "health-monitoring",
    "citibank"
  ],
  "author": "PUT Platform Team",
  "license": "MIT",
  "msw": {
    "workerDirectory": [
      "public"
    ]
  }
}

'@
}

# File 2: public/index.html
$Files += [pscustomobject]@{
  RelativePath = 'public/index.html'
  SizeBytes    = 2644
  Sha256       = '9e42e6ad10defc62539ae51f87a65f3cb801ba40b67a8b3d8a0c566323b4ba03'
  Content      = @'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PUT Checks Modules</title>
    
    <!-- Material Icons -->
    <link 
      rel="stylesheet" 
      href="https://fonts.googleapis.com/icon?family=Material+Icons" 
    />
    
    <!-- Inter Font -->
    <link 
      rel="preconnect" 
      href="https://fonts.googleapis.com"
    />
    <link 
      rel="preconnect" 
      href="https://fonts.gstatic.com" 
      crossorigin
    />
    <link 
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" 
      rel="stylesheet"
    />
    
    <style>
      body {
        margin: 0;
        padding: 0;
        font-family: 'Inter', 'Helvetica Neue', 'Arial', -apple-system, BlinkMacSystemFont, sans-serif;
        background: #eff5f7;
        color: #1A2332;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      
      #root {
        min-height: 100vh;
      }
      
      /* Loading spinner styles */
      .loading-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background-color: #eff5f7;
      }
      
      .loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #e0e0e0;
        border-left-color: #2359de;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      
      /* PlatformSidebar Layout CSS */
      .module-content {
        margin-left: 280px;    /* Account for PlatformSidebar expanded width (280px) */
        padding: 24px 48px 24px 24px; /* More right padding for better alignment */
        transition: margin-left 300ms ease;
        min-height: 100vh;
      }

      .module-content.sidebar-collapsed {
        margin-left: 64px;     /* PlatformSidebar collapsed width (64px) */
        padding: 24px 64px 24px 24px;
      }

      @media (max-width: 1024px) {
        .module-content {
          margin-left: 0;
          padding: 24px;
        }
        
        .module-content.sidebar-collapsed {
          margin-left: 0;
        }
      }
    </style>
  </head>
  <body>
    <div id="root">
      <div class="loading-container">
        <div class="loading-spinner"></div>
      </div>
    </div>
    <!-- Webpack will inject scripts via HtmlWebpackPlugin -->
  </body>
</html>
'@
}

# File 3: public/mockServiceWorker.js
$Files += [pscustomobject]@{
  RelativePath = 'public/mockServiceWorker.js'
  SizeBytes    = 8928
  Sha256       = '4d931d4d4337d10c1d5bceadb435d2b8eb212360006db84dab54d6622a5e32e0'
  Content      = @'
/* eslint-disable */
/* tslint:disable */

/**
 * Mock Service Worker.
 * @see https://github.com/mswjs/msw
 * - Please do NOT modify this file.
 */

const PACKAGE_VERSION = '2.10.5'
const INTEGRITY_CHECKSUM = 'f5825c521429caf22a4dd13b66e243af'
const IS_MOCKED_RESPONSE = Symbol('isMockedResponse')
const activeClientIds = new Set()

addEventListener('install', function () {
  self.skipWaiting()
})

addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim())
})

addEventListener('message', async function (event) {
  const clientId = Reflect.get(event.source || {}, 'id')

  if (!clientId || !self.clients) {
    return
  }

  const client = await self.clients.get(clientId)

  if (!client) {
    return
  }

  const allClients = await self.clients.matchAll({
    type: 'window',
  })

  switch (event.data) {
    case 'KEEPALIVE_REQUEST': {
      sendToClient(client, {
        type: 'KEEPALIVE_RESPONSE',
      })
      break
    }

    case 'INTEGRITY_CHECK_REQUEST': {
      sendToClient(client, {
        type: 'INTEGRITY_CHECK_RESPONSE',
        payload: {
          packageVersion: PACKAGE_VERSION,
          checksum: INTEGRITY_CHECKSUM,
        },
      })
      break
    }

    case 'MOCK_ACTIVATE': {
      activeClientIds.add(clientId)

      sendToClient(client, {
        type: 'MOCKING_ENABLED',
        payload: {
          client: {
            id: client.id,
            frameType: client.frameType,
          },
        },
      })
      break
    }

    case 'MOCK_DEACTIVATE': {
      activeClientIds.delete(clientId)
      break
    }

    case 'CLIENT_CLOSED': {
      activeClientIds.delete(clientId)

      const remainingClients = allClients.filter((client) => {
        return client.id !== clientId
      })

      // Unregister itself when there are no more clients
      if (remainingClients.length === 0) {
        self.registration.unregister()
      }

      break
    }
  }
})

addEventListener('fetch', function (event) {
  // Bypass navigation requests.
  if (event.request.mode === 'navigate') {
    return
  }

  // Opening the DevTools triggers the "only-if-cached" request
  // that cannot be handled by the worker. Bypass such requests.
  if (
    event.request.cache === 'only-if-cached' &&
    event.request.mode !== 'same-origin'
  ) {
    return
  }

  // Bypass all requests when there are no active clients.
  // Prevents the self-unregistered worked from handling requests
  // after it's been deleted (still remains active until the next reload).
  if (activeClientIds.size === 0) {
    return
  }

  const requestId = crypto.randomUUID()
  event.respondWith(handleRequest(event, requestId))
})

/**
 * @param {FetchEvent} event
 * @param {string} requestId
 */
async function handleRequest(event, requestId) {
  const client = await resolveMainClient(event)
  const requestCloneForEvents = event.request.clone()
  const response = await getResponse(event, client, requestId)

  // Send back the response clone for the "response:*" life-cycle events.
  // Ensure MSW is active and ready to handle the message, otherwise
  // this message will pend indefinitely.
  if (client && activeClientIds.has(client.id)) {
    const serializedRequest = await serializeRequest(requestCloneForEvents)

    // Clone the response so both the client and the library could consume it.
    const responseClone = response.clone()

    sendToClient(
      client,
      {
        type: 'RESPONSE',
        payload: {
          isMockedResponse: IS_MOCKED_RESPONSE in response,
          request: {
            id: requestId,
            ...serializedRequest,
          },
          response: {
            type: responseClone.type,
            status: responseClone.status,
            statusText: responseClone.statusText,
            headers: Object.fromEntries(responseClone.headers.entries()),
            body: responseClone.body,
          },
        },
      },
      responseClone.body ? [serializedRequest.body, responseClone.body] : [],
    )
  }

  return response
}

/**
 * Resolve the main client for the given event.
 * Client that issues a request doesn't necessarily equal the client
 * that registered the worker. It's with the latter the worker should
 * communicate with during the response resolving phase.
 * @param {FetchEvent} event
 * @returns {Promise<Client | undefined>}
 */
async function resolveMainClient(event) {
  const client = await self.clients.get(event.clientId)

  if (activeClientIds.has(event.clientId)) {
    return client
  }

  if (client?.frameType === 'top-level') {
    return client
  }

  const allClients = await self.clients.matchAll({
    type: 'window',
  })

  return allClients
    .filter((client) => {
      // Get only those clients that are currently visible.
      return client.visibilityState === 'visible'
    })
    .find((client) => {
      // Find the client ID that's recorded in the
      // set of clients that have registered the worker.
      return activeClientIds.has(client.id)
    })
}

/**
 * @param {FetchEvent} event
 * @param {Client | undefined} client
 * @param {string} requestId
 * @returns {Promise<Response>}
 */
async function getResponse(event, client, requestId) {
  // Clone the request because it might've been already used
  // (i.e. its body has been read and sent to the client).
  const requestClone = event.request.clone()

  function passthrough() {
    // Cast the request headers to a new Headers instance
    // so the headers can be manipulated with.
    const headers = new Headers(requestClone.headers)

    // Remove the "accept" header value that marked this request as passthrough.
    // This prevents request alteration and also keeps it compliant with the
    // user-defined CORS policies.
    const acceptHeader = headers.get('accept')
    if (acceptHeader) {
      const values = acceptHeader.split(',').map((value) => value.trim())
      const filteredValues = values.filter(
        (value) => value !== 'msw/passthrough',
      )

      if (filteredValues.length > 0) {
        headers.set('accept', filteredValues.join(', '))
      } else {
        headers.delete('accept')
      }
    }

    return fetch(requestClone, { headers })
  }

  // Bypass mocking when the client is not active.
  if (!client) {
    return passthrough()
  }

  // Bypass initial page load requests (i.e. static assets).
  // The absence of the immediate/parent client in the map of the active clients
  // means that MSW hasn't dispatched the "MOCK_ACTIVATE" event yet
  // and is not ready to handle requests.
  if (!activeClientIds.has(client.id)) {
    return passthrough()
  }

  // Notify the client that a request has been intercepted.
  const serializedRequest = await serializeRequest(event.request)
  const clientMessage = await sendToClient(
    client,
    {
      type: 'REQUEST',
      payload: {
        id: requestId,
        ...serializedRequest,
      },
    },
    [serializedRequest.body],
  )

  switch (clientMessage.type) {
    case 'MOCK_RESPONSE': {
      return respondWithMock(clientMessage.data)
    }

    case 'PASSTHROUGH': {
      return passthrough()
    }
  }

  return passthrough()
}

/**
 * @param {Client} client
 * @param {any} message
 * @param {Array<Transferable>} transferrables
 * @returns {Promise<any>}
 */
function sendToClient(client, message, transferrables = []) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()

    channel.port1.onmessage = (event) => {
      if (event.data && event.data.error) {
        return reject(event.data.error)
      }

      resolve(event.data)
    }

    client.postMessage(message, [
      channel.port2,
      ...transferrables.filter(Boolean),
    ])
  })
}

/**
 * @param {Response} response
 * @returns {Response}
 */
function respondWithMock(response) {
  // Setting response status code to 0 is a no-op.
  // However, when responding with a "Response.error()", the produced Response
  // instance will have status code set to 0. Since it's not possible to create
  // a Response instance with status code 0, handle that use-case separately.
  if (response.status === 0) {
    return Response.error()
  }

  const mockedResponse = new Response(response.body, response)

  Reflect.defineProperty(mockedResponse, IS_MOCKED_RESPONSE, {
    value: true,
    enumerable: true,
  })

  return mockedResponse
}

/**
 * @param {Request} request
 */
async function serializeRequest(request) {
  return {
    url: request.url,
    mode: request.mode,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    cache: request.cache,
    credentials: request.credentials,
    destination: request.destination,
    integrity: request.integrity,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    body: await request.arrayBuffer(),
    keepalive: request.keepalive,
  }
}

'@
}

# File 4: src/App.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/App.tsx'
  SizeBytes    = 6192
  Sha256       = 'ce94193cb587bf04e93ee2f49f21a550e87115c3fd5d49bd38027c7601224c0c'
  Content      = @'
import React, { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { LayoutProvider } from '@components/layout/LayoutProvider';
import { ChecksLayout } from '@components/layout/ChecksLayout';
import { ErrorBoundary } from '@components/shared/ErrorBoundary';

// Lazy load pages for better performance and code splitting
const HomePage = React.lazy(() => import('@pages/HomePage'));
const AllChecksPage = React.lazy(() => import('@pages/AllChecksPage'));
const CreateCheckPage = React.lazy(
  () => import('./pages/CreateCheckPage/CreateCheckPage')
);
const CheckDetailsPage = React.lazy(() => import('@pages/CheckDetailsPage'));
const EditCheckPage = React.lazy(() => import('@pages/CreateCheckPage')); // reuse create page in edit mode
const ChecksStudioPage = React.lazy(() => import('@pages/ChecksStudioPage'));
const ReportsPage = React.lazy(() => import('@pages/ReportsPage'));
const ReportsHome = React.lazy(() => import('./pages/Reports/ReportsHome'));
const ReportBuilder = React.lazy(() => import('./pages/Reports/ReportBuilder'));
const ReportDetailsPage = React.lazy(() => import('./pages/Reports/ReportDetailsPage'));
// CSIs directory and overview removed
const StudioRunsPage = React.lazy(() => import('@pages/StudioRunsPage'));
const StudioTestsPage = React.lazy(() => import('@pages/StudioTestsPage'));
// Removed Scheduled and Analytics pages
const ActivityPage = React.lazy(() => import('@pages/ActivityPage'));
const SchedulesPage = React.lazy(() => import('@pages/SchedulesPage'));

// Loading fallback component
const PageLoadingFallback: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '400px',
      gap: 2,
    }}
  >
    <CircularProgress size={40} />
    <Typography variant="body2" color="text.secondary">
      Loading page...
    </Typography>
  </Box>
);

// Module-level error boundary fallback
const ModuleErrorFallback: React.FC<{ error?: Error }> = ({ error }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '50vh',
      p: 4,
      textAlign: 'center',
    }}
  >
    <Typography variant="h5" gutterBottom color="error">
      Checks Module Error
    </Typography>
    <Typography variant="body1" color="text.secondary" paragraph>
      The Checks module encountered an error and cannot be displayed.
    </Typography>
    {error && process.env.NODE_ENV === 'development' && (
      <Box
        component="pre"
        sx={{
          backgroundColor: '#f5f5f5',
          p: 2,
          borderRadius: 1,
          fontSize: '0.8rem',
          maxWidth: '100%',
          overflow: 'auto',
          mt: 2,
        }}
      >
        {error.message}
        {error.stack}
      </Box>
    )}
  </Box>
);

const ModuleShell: React.FC = () => (
  <ErrorBoundary fallback={<ModuleErrorFallback />}>
    <LayoutProvider>
      <ChecksLayout>
        <Suspense fallback={<PageLoadingFallback />}>
          <Outlet />
        </Suspense>
      </ChecksLayout>
    </LayoutProvider>
  </ErrorBoundary>
);

const App: React.FC = () => {
  return (
    <Routes>
      {/* Host mount: explicit /checks base */}
      <Route path="/checks/*" element={<ModuleShell />}>
        <Route index element={<HomePage />} />
        <Route path="all" element={<AllChecksPage />} />
        <Route path="create" element={<CreateCheckPage />} />
        <Route path="details/:id" element={<CheckDetailsPage />} />
        <Route path="edit/:id" element={<EditCheckPage />} />
        <Route path="studio" element={<ChecksStudioPage />} />
        <Route path="studio/tests" element={<StudioTestsPage />} />
        <Route path="studio/runs" element={<StudioRunsPage />} />
        <Route path="studio/:id" element={<ChecksStudioPage />} />
        <Route path="reports" element={<ReportsHome />} />
        <Route path="reports/new" element={<ReportBuilder />} />
        <Route path="reports/:id" element={<ReportDetailsPage />} />
        <Route path="reports/:id/edit" element={<ReportBuilder />} />
        <Route path="csis" element={<Navigate to="." replace />} />
        <Route path="csis/:csiId" element={<Navigate to="." replace />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="schedules" element={<SchedulesPage />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>

      {/* Layout route captures current base (e.g., /checks/* in host, or /* in standalone) */}
      <Route path="/*" element={<ModuleShell />}>
        {/* Home */}
        <Route index element={<HomePage />} />

        {/* Check Management */}
        <Route path="all" element={<AllChecksPage />} />
        <Route path="create" element={<CreateCheckPage />} />
        <Route path="details/:id" element={<CheckDetailsPage />} />
        <Route path="edit/:id" element={<EditCheckPage />} />

        {/* Checks Studio */}
        <Route path="studio" element={<ChecksStudioPage />} />
        <Route path="studio/tests" element={<StudioTestsPage />} />
        <Route path="studio/runs" element={<StudioRunsPage />} />
        <Route path="studio/:id" element={<ChecksStudioPage />} />

        {/* Reports */}
        <Route path="reports" element={<ReportsHome />} />
        <Route path="reports/new" element={<ReportBuilder />} />
        <Route path="reports/:id" element={<ReportDetailsPage />} />
        <Route path="reports/:id/edit" element={<ReportBuilder />} />

        {/* CSIs */}
        <Route path="csis" element={<Navigate to="." replace />} />
        <Route path="csis/:csiId" element={<Navigate to="." replace />} />

        {/* Activity & Schedules */}
        <Route path="activity" element={<ActivityPage />} />
        <Route path="schedules" element={<SchedulesPage />} />

        {/* Catch all - redirect to module home */}
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
};

export default App;
'@
}

# File 5: src/bootstrap.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/bootstrap.tsx'
  SizeBytes    = 2602
  Sha256       = '905bba2d5b7bfe48f3fa4b9cb8d47fa23126df5f0b44496ae902e73265fbc066'
  Content      = @'
import React from 'react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Lazy import to avoid eager shared consumption of shared singletons
const LazyApp = React.lazy(() => import('./App'));
import { store } from '@store/index';
import { theme } from './theme';

// MSW initialization is handled in main.tsx for Vite mode
// For Module Federation mode, the host should handle MSW initialization

// Mark platform shell integration
if (typeof window !== 'undefined') {
  (window as any).__CHECKS_MODULE__ = true;
}

// Initialize React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

interface BootstrapProps {
  routingStrategy?: 'browser' | 'memory';
  initialEntries?: string[];
  basename?: string;
}

const Bootstrap: React.FC<BootstrapProps> = ({ 
  routingStrategy = 'browser',
  initialEntries = ['/checks'],
  basename = ''
}) => {
  const RouterComponent = routingStrategy === 'memory' 
    ? ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={initialEntries}>
          {children}
        </MemoryRouter>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <BrowserRouter basename={basename}>
          {children}
        </BrowserRouter>
      );

  return (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <React.Suspense fallback={null}>
            <RouterComponent>
              <LazyApp />
            </RouterComponent>
          </React.Suspense>
        </ThemeProvider>
      </Provider>
    </QueryClientProvider>
  );
};

// MSW initialization is handled in main.tsx for Vite mode
// For Module Federation mode, the host should handle MSW initialization

// For Module Federation - expose the component
if (typeof window !== 'undefined') {
  // Mark as Module Federation powered
  (window as any).__CHECKS_MODULE_FEDERATION__ = true;
  
  // Expose for host applications
  (window as any).ChecksModule = Bootstrap;
}

// Note: Standalone rendering is handled by main.tsx for Vite development
// This bootstrap file focuses on providing the component for Module Federation

export default Bootstrap;
'@
}

# File 6: src/ChecksModule.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/ChecksModule.tsx'
  SizeBytes    = 2558
  Sha256       = '4fb0d700e706598b652670a80a590cb9ee2a0a76acc1e88bd377588f5b52059f'
  Content      = @'
import React from 'react';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, Box, CircularProgress } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { store } from '@store/index';
import { theme } from './theme';
import App from './App';

// Use the Vite app's route configuration to ensure identical routes

// Initialize React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

// Loading component (kept for potential future suspense boundaries)
const LoadingFallback: React.FC = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px', width: '100%' }}>
    <CircularProgress />
  </Box>
);

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Checks Module Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <h2>Something went wrong in the Checks module</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </Box>
      );
    }

    return this.props.children;
  }
}

interface ChecksModuleProps {
  basename?: string;
  isStandalone?: boolean;
  onNavigate?: (path: string) => void;
}

/**
 * Main Module Component for Module Federation
 * This component is exposed to the host application
 */
const ChecksModule: React.FC<ChecksModuleProps> = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
          </ThemeProvider>
        </Provider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

// Export for Module Federation
export default ChecksModule;

// Also export as named export for flexibility
export { ChecksModule };



'@
}

# File 7: src/components/common/FilterBar/CSISelect.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/common/FilterBar/CSISelect.tsx'
  SizeBytes    = 1994
  Sha256       = 'eac5efb2b23760c56f3aa73cecbdd668e7db46ab53f94721d3eb622554928772'
  Content      = @'
import React from 'react';
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
} from '@mui/material';
import {
  Domain,
} from '@mui/icons-material';
import { CSI } from '../../../types/csi/csiTypes';
import { getCSIById } from '../../../data/mockCSIData';

interface CSISelectProps {
  csis: CSI[];
  selectedCSI: string | null;
  onCSIChange: (csiId: string | null) => void;
  loading?: boolean;
}

const CSISelect: React.FC<CSISelectProps> = ({
  csis,
  selectedCSI,
  onCSIChange,
  loading = false
}) => {
  const selectedCSIData = selectedCSI ? getCSIById(selectedCSI) : null;

  const handleCSIChange = (_event: any, newValue: CSI | null) => {
    onCSIChange(newValue?.id || null);
  };

  return (
    <Autocomplete
      options={csis}
      getOptionLabel={(option) => `${option.id} - ${option.name}`}
      value={selectedCSIData}
      onChange={handleCSIChange}
      loading={loading}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Select CSI System"
          placeholder="Search by CSI ID or name..."
          required={false}
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <Domain sx={{ color: 'text.secondary', mr: 1 }} />
            ),
          }}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {option.id} - {option.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.businessUnit}
              </Typography>
            </Box>
          </Box>
        </li>
      )}
      noOptionsText="No CSI systems found"
      isOptionEqualToValue={(option, value) => option.id === value.id}
    />
  );
};

export default CSISelect;
'@
}

# File 8: src/components/common/FilterBar/FilterBar.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/common/FilterBar/FilterBar.tsx'
  SizeBytes    = 4020
  Sha256       = '367873f02ed6aba0b1fea37562e26f87d74cd968b430d75c612e3bee447b444f'
  Content      = @'
import React, { useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Stack,
  IconButton,
  Tooltip,
  LinearProgress,
  Alert,
  Button,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Refresh,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { 
  fetchCSIs, 
  setSelectedCSI,
  fetchTags,
  setSelectedTags
} from '@store/slices/csiSlice';
import CSISelect from './CSISelect';
import TagSelect from './TagSelect';

interface FilterBarProps {
  onFiltersChange?: (filters: { csiId: string | null; tags: string[] }) => void;
  className?: string;
  showTagFilter?: boolean;
}

const FilterBar: React.FC<FilterBarProps> = ({ 
  onFiltersChange,
  className,
  showTagFilter = true
}) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  
  const { 
    data: csis, 
    loading,
    error,
    selectedCSI,
    tags: {
      selected: selectedTags,
      available: availableTags,
      loading: tagsLoading
    }
  } = useAppSelector(state => state.csi);

  useEffect(() => {
    // Load initial data
    dispatch(fetchCSIs());
    if (showTagFilter) {
      dispatch(fetchTags());
    }
  }, [dispatch, showTagFilter]);

  useEffect(() => {
    // Notify parent of filter changes
    if (onFiltersChange) {
      onFiltersChange({
        csiId: selectedCSI,
        tags: selectedTags
      });
    }
  }, [selectedCSI, selectedTags, onFiltersChange]);

  const handleCSIChange = useCallback((csiId: string | null) => {
    dispatch(setSelectedCSI(csiId));
    // Refresh tags when CSI changes to show relevant tags
    if (showTagFilter && csiId) {
      dispatch(fetchTags({ csiId }));
    }
  }, [dispatch, showTagFilter]);

  const handleTagsChange = useCallback((tags: string[]) => {
    dispatch(setSelectedTags(tags));
  }, [dispatch]);

  const handleRefresh = useCallback(() => {
    dispatch(fetchCSIs());
    if (showTagFilter) {
      dispatch(fetchTags(selectedCSI ? { csiId: selectedCSI } : undefined));
    }
  }, [dispatch, showTagFilter, selectedCSI]);

  const isLoading = loading === 'loading' || tagsLoading;

  if (error) {
    return (
      <Alert 
        severity="error" 
        action={
          <Button color="inherit" size="small" onClick={handleRefresh}>
            Retry
          </Button>
        }
        sx={{ mb: 3 }}
      >
        Failed to load filter data: {error}
      </Alert>
    );
  }

  return (
    <Paper 
      className={className}
      sx={{ 
        p: 2, 
        mb: 3,
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.02)} 0%, ${alpha(theme.palette.primary.main, 0.01)} 100%)`,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
        borderRadius: 2,
        position: 'relative'
      }}
    >
      {isLoading && (
        <LinearProgress 
          sx={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            borderRadius: '8px 8px 0 0' 
          }} 
        />
      )}
      
      {/* Primary Filters Row */}
      <Stack direction="row" spacing={2} alignItems="center">
        <Box sx={{ flex: 3, minWidth: '300px' }}>
          <CSISelect
            csis={csis}
            selectedCSI={selectedCSI}
            onCSIChange={handleCSIChange}
            loading={loading === 'loading'}
          />
        </Box>

        {showTagFilter && (
          <Box sx={{ flex: 3, minWidth: '300px' }}>
            <TagSelect
              tags={availableTags}
              selectedTags={selectedTags}
              onTagsChange={handleTagsChange}
              loading={tagsLoading}
              disabled={!selectedCSI}
            />
          </Box>
        )}

        <Tooltip title="Refresh Data">
          <span>
            <IconButton onClick={handleRefresh} disabled={isLoading}>
              <Refresh />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Paper>
  );
};

export default FilterBar;
'@
}

# File 9: src/components/common/FilterBar/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/components/common/FilterBar/index.ts'
  SizeBytes    = 157
  Sha256       = 'bc3551b10118cd3171f0935bafe57806ddb3971cb073d88daf22294f3dc84aae'
  Content      = @'
export { default as FilterBar } from './FilterBar';
export { default as CSISelect } from './CSISelect';  
export { default as TagSelect } from './TagSelect';
'@
}

# File 10: src/components/common/FilterBar/TagSelect.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/common/FilterBar/TagSelect.tsx'
  SizeBytes    = 3674
  Sha256       = '5b3481e1a5de5eb7f56c30b8792a5f8c95aecb269356c076b66888fc2647c083'
  Content      = @'
import React from 'react';
import {
  Autocomplete,
  TextField,
  Chip,
  Box,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import {
  LocalOffer,
  Close,
} from '@mui/icons-material';

interface TagSelectProps {
  tags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
}

const TagSelect: React.FC<TagSelectProps> = ({
  tags,
  selectedTags,
  onTagsChange,
  loading = false,
  disabled = false,
  placeholder = 'Add tags...',
  label = 'Filter by Tags',
}) => {
  const theme = useTheme();

  const handleTagChange = (_event: any, newTags: string[]) => {
    onTagsChange(newTags);
  };

  return (
    <Autocomplete
      multiple
      options={Array.isArray(tags) ? tags : []}
      value={Array.isArray(selectedTags) ? selectedTags : []}
      onChange={handleTagChange}
      loading={loading}
      disabled={disabled}
      disableCloseOnSelect
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={disabled ? "Select CSI first..." : placeholder}
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <>
                <LocalOffer sx={{ color: 'text.secondary', mr: 1, fontSize: '1.1rem' }} />
                {params.InputProps.startAdornment}
              </>
            ),
          }}
        />
      )}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option}
            label={option}
            size="small"
            deleteIcon={<Close />}
            sx={{
              backgroundColor: alpha(theme.palette.secondary.main, 0.1),
              border: `1px solid ${alpha(theme.palette.secondary.main, 0.2)}`,
              color: theme.palette.secondary.dark,
              fontWeight: 500,
              '& .MuiChip-deleteIcon': {
                color: theme.palette.secondary.main,
                '&:hover': {
                  color: theme.palette.secondary.dark,
                }
              }
            }}
          />
        ))
      }
      renderOption={(props, option, { selected }) => (
        <li {...props} key={option}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              width: '100%',
              py: 0.5,
              px: 0.5,
              borderRadius: 1,
              backgroundColor: selected 
                ? alpha(theme.palette.secondary.main, 0.08)
                : 'transparent',
              '&:hover': {
                backgroundColor: alpha(theme.palette.secondary.main, 0.12),
              }
            }}
          >
            <LocalOffer 
              sx={{ 
                color: selected ? theme.palette.secondary.main : 'text.secondary',
                fontSize: '1rem'
              }} 
            />
            <Typography
              variant="body2"
              sx={{
                color: selected ? theme.palette.secondary.main : 'text.primary',
                fontWeight: selected ? 500 : 400,
              }}
            >
              {option}
            </Typography>
          </Box>
        </li>
      )}
      noOptionsText={disabled ? "Select a CSI first to see available tags" : "No tags found"}
      filterSelectedOptions
      getOptionLabel={(option) => option}
      isOptionEqualToValue={(option, value) => option === value}
      ChipProps={{
        size: "small"
      }}
    />
  );
};

export default TagSelect;
'@
}

# File 11: src/components/common/ScopeBar/ScopeBar.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/common/ScopeBar/ScopeBar.tsx'
  SizeBytes    = 5082
  Sha256       = '75f34812abaf8b2584608239dbb3eec5ab35f4a6bb6efae31c6083d86950a6d5'
  Content      = @'
import React, { useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
  Button,
} from '@mui/material';
import { FilterAlt, ClearAll, Refresh } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchCSIs, fetchTags, setSelectedCSI, setSelectedTags, setTagFilterMode, clearFilters } from '@store/slices/csiSlice';
import CSISelect from '@components/common/FilterBar/CSISelect';
import TagSelect from '@components/common/FilterBar/TagSelect';

/**
 * Global scope bar shown across Checks pages.
 * Visual-first skeleton that reuses existing CSISelect/TagSelect.
 */
const ScopeBar: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const {
    data: csis,
    loading,
    selectedCSI,
    tags: { available: availableTags, selected: selectedTags, loading: tagsLoading, filterMode },
  } = useAppSelector((s) => s.csi);

  useEffect(() => {
    dispatch(fetchCSIs());
    dispatch(fetchTags(selectedCSI ? { csiId: selectedCSI } : undefined));
  }, [dispatch, selectedCSI]);

  const handleCSIChange = useCallback(
    (csiId: string | null) => {
      dispatch(setSelectedCSI(csiId));
      dispatch(fetchTags(csiId ? { csiId } : undefined));
    },
    [dispatch]
  );

  const handleTagsChange = useCallback(
    (tags: string[]) => {
      dispatch(setSelectedTags(tags));
    },
    [dispatch]
  );

  const handleModeChange = (_: any, next: 'AND' | 'OR' | null) => {
    if (next) dispatch(setTagFilterMode(next));
  };

  const handleClear = () => {
    dispatch(clearFilters());
  };

  const handleRefresh = () => {
    dispatch(fetchCSIs());
    dispatch(fetchTags(selectedCSI ? { csiId: selectedCSI } : undefined));
  };

  const isBusy = loading === 'loading' || tagsLoading;

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        p: 1.5,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.03)} 0%, ${alpha(theme.palette.primary.main, 0.015)} 100%)`,
        borderRadius: 2,
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 260, flex: 2 }}>
          <FilterAlt sx={{ color: 'text.secondary' }} />
          <Typography variant="subtitle2" color="text.secondary">
            Scope
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Refresh CSI and tags">
            <span>
              <IconButton size="small" onClick={handleRefresh} disabled={isBusy}>
                <Refresh fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Clear scope">
            <span>
              <IconButton size="small" onClick={handleClear} disabled={isBusy}>
                <ClearAll fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Box sx={{ flex: 4, minWidth: 280 }}>
          <CSISelect
            csis={csis}
            selectedCSI={selectedCSI}
            onCSIChange={handleCSIChange}
            loading={loading === 'loading'}
          />
        </Box>

        <Box sx={{ flex: 6, minWidth: 320 }}>
          <TagSelect
            tags={availableTags}
            selectedTags={selectedTags}
            onTagsChange={handleTagsChange}
            loading={tagsLoading}
            disabled={false}
          />
        </Box>

        <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            Tag mode
          </Typography>
          <ToggleButtonGroup
            size="small"
            value={filterMode}
            exclusive
            onChange={handleModeChange}
            aria-label="Tag filter mode"
          >
            <ToggleButton value="AND" aria-label="AND">
              AND
            </ToggleButton>
            <ToggleButton value="OR" aria-label="OR">
              OR
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Tooltip title="Coming soon">
            <span>
              <Button variant="outlined" size="small" disabled>
                Save
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Coming soon">
            <span>
              <Button variant="outlined" size="small" disabled>
                Share
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Scope applies across pages.
      </Typography>
    </Paper>
  );
};

export default ScopeBar;



'@
}

# File 12: src/components/home/ActivityFeed.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/home/ActivityFeed.tsx'
  SizeBytes    = 2878
  Sha256       = 'ea52e17db45c77106bc4c6412ad5452a3a4a84c26c308758f59c94a288e6628d'
  Content      = @'
import React from 'react';
import { Box, Chip, List, ListItem, ListItemText, Stack, Typography, useTheme, Skeleton, alpha, Alert, Button } from '@mui/material';
import SectionBox from './SectionBox';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchActivity } from '@/store/slices/dashboardSlice';

interface ActivityFeedProps { maxHeight?: number | string }

const ActivityFeed: React.FC<ActivityFeedProps> = ({ maxHeight }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.dashboard.activity);

  return (
    <SectionBox title="Activity (24h)" accentColor={theme.palette.primary.main} maxHeight={maxHeight}>
      {loading === 'loading' ? (
        <Stack spacing={1.25}>
          {[...Array(6)].map((_, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Skeleton variant="rounded" width={60} height={24} />
              <Skeleton variant="text" width="60%" />
            </Box>
          ))}
        </Stack>
      ) : loading === 'failed' ? (
        <Alert role="alert" severity="error" action={<Button color="inherit" size="small" onClick={() => dispatch(fetchActivity({ scope: 'ALL', hours: 24 }))}>Retry</Button>}>
          {error || 'Failed to load activity'}
        </Alert>
      ) : data.length === 0 ? (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">No recent activity</Typography>
          <Button size="small" variant="outlined" onClick={() => dispatch(fetchActivity({ scope: 'ALL', hours: 24 }))}>Refresh Now</Button>
        </Stack>
      ) : (
        <List dense disablePadding>
          {data.slice(0, 12).map((e) => (
            <ListItem
              key={e.id}
              sx={{
                px: 0,
                borderRadius: 1,
                transition: 'background-color 120ms ease, transform 120ms ease',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
              }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label={e.type} variant="outlined" />
                    <Typography variant="body2">{e.title}</Typography>
                  </Stack>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary" aria-label={`${e.description || ''} ${e.csiName || ''} at ${new Date(e.timestamp).toLocaleString()}`}>
                    {e.description} • {e.csiName || ''} • {new Date(e.timestamp).toLocaleString()}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </SectionBox>
  );
};

export default ActivityFeed;



'@
}

# File 13: src/components/home/AttentionPanel.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/home/AttentionPanel.tsx'
  SizeBytes    = 5679
  Sha256       = '4c3881161465db972541d787cccd6c4e2e19f0d54350789d9fdd948c862cf493'
  Content      = @'
import React, { useState } from 'react';
import { Button, Chip, IconButton, List, ListItem, ListItemText, ListItemIcon, Skeleton, Stack, Typography, alpha, useTheme, Tooltip, Alert, Snackbar } from '@mui/material';
import { Error, Warning, AssignmentInd, CheckCircle } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { acknowledgeCheck, assignCheck, fetchAttention, optimisticallyRemoveAttentionItem, restoreAttentionItem } from '@/store/slices/dashboardSlice';
import type { AttentionItem } from '@/types/dashboard/dashboardTypes';
import { useNavigate } from 'react-router-dom';
import TriageDrawer from './TriageDrawer';
import SectionBox from './SectionBox';

const Row: React.FC<{ item: AttentionItem; onAck: () => void; onAssign: () => void; onOpen: () => void }> = ({ item, onAck, onAssign, onOpen }) => {
  const theme = useTheme();
  const isFail = item.status === 'FAILING';
  const color = isFail ? theme.palette.error.main : theme.palette.warning.main;
  const icon = isFail ? <Error sx={{ color }} /> : <Warning sx={{ color }} />;
  return (
    <ListItem
      disablePadding
      sx={{
        p: 1.5,
        borderRadius: 1,
        '&:hover': { bgcolor: alpha(color, 0.04) },
        borderLeft: `3px solid ${alpha(color, 0.6)}`,
      }}
      onClick={onOpen}
    >
      <ListItemIcon sx={{ minWidth: 36 }}>{icon}</ListItemIcon>
      <ListItemText
        primary={
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" fontWeight={600}>
              {item.name}
            </Typography>
            <Chip size="small" label={item.csiName} variant="outlined" />
          </Stack>
        }
        secondary={
          <Typography variant="caption" color="text.secondary">
            {item.reason || 'Issue detected'} • since {new Date(item.since).toLocaleTimeString()}
          </Typography>
        }
      />
      <Stack direction="row" spacing={1}>
        <Tooltip title="Acknowledge">
          <IconButton size="small" onClick={onAck}>
            <CheckCircle />
          </IconButton>
        </Tooltip>
        <Tooltip title="Assign">
          <IconButton size="small" onClick={onAssign}>
            <AssignmentInd />
          </IconButton>
        </Tooltip>
      </Stack>
    </ListItem>
  );
};

interface AttentionPanelProps { maxHeight?: number | string }

const AttentionPanel: React.FC<AttentionPanelProps> = ({ maxHeight }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.dashboard.attention);
  const [triageId, setTriageId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(() => ({ open: false, message: '', severity: 'success' }));
  const theme = useTheme();

  if (loading === 'loading') {
    return (
      <SectionBox title="Needs Attention" accentColor={theme.palette.error.main} maxHeight={maxHeight}>
        <Stack spacing={1.5}>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={56} />
          ))}
        </Stack>
      </SectionBox>
    );
  }

  return (
    <SectionBox
      title="Needs Attention"
      accentColor={theme.palette.error.main}
      action={<Button size="small" onClick={() => navigate('/checks/all')}>View all</Button>}
      maxHeight={maxHeight}
    >
      {loading === 'failed' ? (
        <Alert severity="error" role="alert" onClose={() => dispatch(fetchAttention({ limit: 20 }))}>{error || 'Failed to load attention items'}</Alert>
      ) : data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          All clear. No failing or degrading checks.
        </Typography>
      ) : (
        <List disablePadding>
          {data.slice(0, 10).map((item) => (
            <Row
              key={item.id}
              item={item}
              onAck={async () => {
                // Optimistic remove with simple rollback after 4s if needed
                dispatch(optimisticallyRemoveAttentionItem(item.id));
                setToast({ open: true, message: 'Acknowledged (Undo)', severity: 'success' });
                const timer = setTimeout(() => {}, 4000);
                try {
                  await dispatch(acknowledgeCheck(item.id)).unwrap();
                  clearTimeout(timer);
                } catch {
                  clearTimeout(timer);
                  dispatch(restoreAttentionItem(item));
                  setToast({ open: true, message: 'Failed to acknowledge', severity: 'error' });
                }
              }}
              onAssign={async () => {
                try {
                  await dispatch(assignCheck({ id: item.id, userId: 'current.user@citi.com' })).unwrap();
                  setToast({ open: true, message: 'Assigned', severity: 'success' });
                } catch {
                  setToast({ open: true, message: 'Failed to assign', severity: 'error' });
                }
              }}
              onOpen={() => setTriageId(item.id)}
            />
          ))}
        </List>
      )}
      <TriageDrawer open={!!triageId} checkId={triageId} onClose={() => setTriageId(null)} />
      <Snackbar open={toast.open} autoHideDuration={2000} onClose={() => setToast((t) => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))}>{toast.message}</Alert>
      </Snackbar>
    </SectionBox>
  );
};

export default AttentionPanel;



'@
}

# File 14: src/components/home/CommandPalette.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/home/CommandPalette.tsx'
  SizeBytes    = 2469
  Sha256       = '28c0f2127d044348f5b1a168338655d487b0d6299873c7769f1df01eb222daf1'
  Content      = @'
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Dialog, List, ListItemButton, ListItemText, Paper, TextField } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { searchAll } from '@/store/slices/dashboardSlice';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { title: 'Home', path: '/checks' },
  { title: 'All Checks', path: '/checks/all' },
  { title: 'Reports', path: '/checks/reports' },
  { title: 'Studio', path: '/checks/studio' },
];

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data, loading } = useAppSelector((s) => s.dashboard.search);
  const results = Array.isArray(data) ? data : [];
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      if (q.trim().length >= 2) dispatch(searchAll({ query: q }));
    }, 150);
    return () => clearTimeout(id);
  }, [dispatch, q, open]);

  const staticMatches = useMemo(() => {
    const term = q.toLowerCase();
    return NAV_ITEMS.filter((i) => i.title.toLowerCase().includes(term));
  }, [q]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Paper sx={{ p: 2 }}>
        <TextField
          fullWidth
          autoFocus
          placeholder="Type a command or search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Box sx={{ mt: 1, maxHeight: 360, overflow: 'auto' }}>
          <List dense>
            {staticMatches.map((i) => (
              <ListItemButton key={i.path} onClick={() => { navigate(i.path); onClose(); }}>
                <ListItemText primary={i.title} />
              </ListItemButton>
            ))}
            {q.trim().length >= 2 && (
              <>
                {loading === 'loading' && <Box p={2}>Searching…</Box>}
                {results.slice(0, 8).map((r) => (
                  <ListItemButton key={`${r.type}-${r.id}`} onClick={() => { navigate(r.path); onClose(); }}>
                    <ListItemText primary={r.title} secondary={r.subtitle} />
                  </ListItemButton>
                ))}
              </>
            )}
          </List>
        </Box>
      </Paper>
    </Dialog>
  );
};

export default CommandPalette;



'@
}

# File 15: src/components/home/GlobalSearch.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/home/GlobalSearch.tsx'
  SizeBytes    = 10617
  Sha256       = 'ccdf4690a67b968e03f88894d13475393ee52e41131efbe30ac66e7e5fb245c2'
  Content      = @'
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, Divider, List, ListItemButton, ListItemText, Popper, Paper, TextField, InputAdornment, Stack, alpha, useTheme, Button, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, Tooltip, Snackbar, Alert } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearSearchContext, searchAll, setSearchContext, setSearchFilters, clearSearchFilters, pinCsi } from '@/store/slices/dashboardSlice';
import { Search } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { csiApi } from '@/services/api/csiApi';

const GlobalSearch: React.FC = () => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const navigate = useNavigate();
  const { data, loading } = useAppSelector((s) => s.dashboard.search);
  const context = useAppSelector((s) => s.dashboard.searchContext);
  const pinned = useAppSelector((s) => s.dashboard.pinnedCsiIds);
  const results = Array.isArray(data) ? data : [];
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [csiResults, setCsiResults] = useState<any[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftEnv, setDraftEnv] = useState<string | null>(null);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftMode, setDraftMode] = useState<'AND' | 'OR'>('AND');
  const [pinToastOpen, setPinToastOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(async () => {
      const q = query.trim();
      if (q.toLowerCase().startsWith('csi:')) {
        const val = q.split(':')[1]?.trim();
        if (val) dispatch(setSearchContext({ csiId: val }));
        return;
      }
      if (!context.csiId) {
        if (q.length >= 2) setCsiResults(await csiApi.searchCsis(q, 10));
        else setCsiResults([]);
      } else {
        if (q.length >= 2) dispatch(searchAll({ query: q, context }));
      }
    }, 200);
    return () => clearTimeout(id);
  }, [dispatch, query, context]);

  const open = useMemo(() => {
    if (!anchorEl) return false;
    if (!context.csiId) return query.trim().length >= 2; // need 2 chars for CSI suggestions
    // With context set, open as soon as field is focused to show Change CSI + sections
    return true;
  }, [anchorEl, query, context.csiId]);

  return (
    <Box>
      <TextField
        inputRef={inputRef}
        placeholder={context.csiId ? 'Search or jump to…' : 'Select a CSI to search…'}
        fullWidth
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={(e) => setAnchorEl(e.currentTarget)}
        onBlur={() => setTimeout(() => setAnchorEl(null), 200)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search />
            </InputAdornment>
          ),
          endAdornment: context.csiId ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title="Current CSI context">
                <Chip size="small" label={`CSI: ${context.csiId}`} onDelete={() => dispatch(clearSearchContext())} />
              </Tooltip>
              {context.environment && (
                <Tooltip title="Environment filter">
                  <Chip size="small" label={`Env: ${context.environment}`} onDelete={() => dispatch(setSearchFilters({ environment: null }))} />
                </Tooltip>
              )}
              {context.tags && context.tags.length > 0 && (
                <Tooltip title={`Tags: ${context.tags.join(', ')}`}>
                  <Chip size="small" label={`Tags: ${context.tags.length}`} onDelete={() => dispatch(setSearchFilters({ tags: [] }))} />
                </Tooltip>
              )}
              <Button
                size="small"
                disabled={pinned.includes(context.csiId)}
                onMouseDown={() => {
                  if (context.csiId) {
                    dispatch(pinCsi(context.csiId));
                    setPinToastOpen(true);
                  }
                }}
              >
                {pinned.includes(context.csiId) ? 'Pinned' : 'Pin'}
              </Button>
              <Button size="small" onMouseDown={() => {
                setDraftEnv(context.environment || null);
                setDraftTags(context.tags || []);
                setDraftMode(context.tagMode || 'AND');
                setFiltersOpen(true);
              }}>Filters</Button>
            </Stack>
          ) : undefined,
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            background: alpha(theme.palette.primary.main, 0.03),
          }
        }}
      />
      <Popper open={open} anchorEl={anchorEl} placement="bottom-start" sx={{ zIndex: 1300, width: anchorEl?.clientWidth }}>
        <Paper variant="outlined">
          {!context.csiId ? (
            <>
              {query.trim().length < 2 ? (
                <Box p={2}>Type at least 2 characters to find a CSI</Box>
              ) : csiResults.length === 0 ? (
                <Box p={2}>No CSI matches</Box>
              ) : (
                <List dense disablePadding>
                  {csiResults.map((csi) => (
                    <ListItemButton
                      key={csi.id}
                      onMouseDown={() => {
                        dispatch(setSearchContext({ csiId: csi.id }));
                        setQuery('');
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                    >
                      <ListItemText primary={csi.name} secondary={csi.id} />
                    </ListItemButton>
                  ))}
                </List>
              )}
              <Divider />
              <Box p={2} pt={1} color="text.secondary">Choose a CSI to search Checks and Reports.</Box>
            </>
          ) : (
            <>
              <List dense disablePadding>
                <ListItemButton onMouseDown={() => dispatch(clearSearchContext())}>
                  <ListItemText primary="Change CSI" secondary={`Current: ${context.csiId}`} />
                </ListItemButton>
              </List>
              <Divider />
              {query.trim().length >= 2 ? (
                <>
                  {loading === 'loading' ? (
                    <Box p={2}>Searching…</Box>
                  ) : (
                    <>
                      <List dense disablePadding>
                        {results
                          .filter((r) => r.type === 'CHECK')
                          .slice(0, 5)
                          .map((r) => (
                            <ListItemButton key={`${r.type}-${r.id}`} onMouseDown={() => navigate(r.path)}>
                              <ListItemText primary={r.title} secondary={r.subtitle} />
                            </ListItemButton>
                          ))}
                      </List>
                      <Divider />
                      <List dense disablePadding>
                        {results
                          .filter((r) => r.type === 'REPORT')
                          .slice(0, 5)
                          .map((r) => (
                            <ListItemButton key={`${r.type}-${r.id}`} onMouseDown={() => navigate(r.path)}>
                              <ListItemText primary={r.title} />
                            </ListItemButton>
                          ))}
                      </List>
                    </>
                  )}
                </>
              ) : (
                <Box p={2} color="text.secondary">Type to search Checks and Reports</Box>
              )}
              <Divider />
              <List dense disablePadding>
                <ListItemButton onMouseDown={() => navigate('/checks/create')}>
                  <ListItemText primary="Create Check" secondary="Quick action" />
                </ListItemButton>
              </List>
            </>
          )}
        </Paper>
      </Popper>
      <Snackbar open={pinToastOpen} autoHideDuration={2000} onClose={() => setPinToastOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setPinToastOpen(false)}>Pinned to My CSIs</Alert>
      </Snackbar>
      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Filters</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <Autocomplete
              options={[ 'Production', 'Staging', 'Development', 'UAT' ]}
              value={draftEnv}
              onChange={(_, v) => setDraftEnv(v)}
              renderInput={(params) => <TextField {...params} label="Environment (optional)" placeholder="Select environment" />}
              clearOnEscape
            />
            <Autocomplete
              multiple
              freeSolo
              options={[ 'team:platform-engineering', 'lob:capital-markets', 'priority:critical', 'application:trading-api' ]}
              value={draftTags}
              onChange={(_, v) => setDraftTags(v)}
              renderInput={(params) => <TextField {...params} label="Tags (optional)" placeholder="Add tags" />} 
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="AND" color={draftMode === 'AND' ? 'primary' : 'default'} onClick={() => setDraftMode('AND')} />
              <Chip label="OR" color={draftMode === 'OR' ? 'primary' : 'default'} onClick={() => setDraftMode('OR')} />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDraftEnv(null); setDraftTags([]); setDraftMode('AND'); dispatch(clearSearchFilters()); }}>Clear</Button>
          <Button onClick={() => setFiltersOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => {
            dispatch(setSearchFilters({ environment: draftEnv, tags: draftTags, tagMode: draftMode }));
            setFiltersOpen(false);
            const q = query.trim();
            if (context.csiId && q.length >= 2) {
              const latest = { ...context, environment: draftEnv, tags: draftTags, tagMode: draftMode } as any;
              dispatch(searchAll({ query: q, context: latest }));
            }
          }}>Apply</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GlobalSearch;



'@
}

# File 16: src/components/home/KPIBar.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/home/KPIBar.tsx'
  SizeBytes    = 4482
  Sha256       = 'add22de4bf321118febbe674b75d3c4f857e147d2977032bfd39a4bd0cdb283e'
  Content      = @'
import React from 'react';
import { Box, Chip, Grid, Stack, Typography, alpha, useTheme, Skeleton, Alert, Button } from '@mui/material';
import type { DashboardSummary } from '../../types/dashboard/dashboardTypes';
import { CheckCircle, Error, Warning, VolumeOff, HealthAndSafety } from '@mui/icons-material';
import SectionBox from './SectionBox';

interface KPIBarProps {
  summary: DashboardSummary | null | undefined;
  loading?: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string | null;
}

const KPIBar: React.FC<KPIBarProps> = ({ summary, loading, error }) => {
  const theme = useTheme();
  const statusColor =
    summary?.overallStatus === 'CRITICAL'
      ? theme.palette.error.main
      : summary?.overallStatus === 'WARNING'
      ? theme.palette.warning.main
      : summary?.overallStatus === 'HEALTHY'
      ? theme.palette.success.main
      : theme.palette.text.secondary;

  const total = (summary?.counts?.passing || 0) + (summary?.counts?.warning || 0) + (summary?.counts?.failing || 0) + (summary?.counts?.muted || 0);
  const pct = (n: number) => (total > 0 ? n / total : 0);

  return (
    <SectionBox
      title="Overall Status"
      icon={<HealthAndSafety />}
      accentColor={statusColor}
    >
      {loading === 'failed' ? (
        <Alert role="alert" severity="error">
          {error || 'Failed to load summary'}
        </Alert>
      ) : !summary ? (
        <Stack spacing={2}>
          <Skeleton variant="text" width={140} height={28} />
          <Skeleton variant="rounded" height={16} />
          <Stack direction="row" spacing={1}>
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} variant="rounded" width={120} height={28} />
            ))}
          </Stack>
        </Stack>
      ) : (
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={2}>
            <Stack spacing={0.5} alignItems="center">
              <Chip
                label={summary.overallStatus}
                sx={{
                  width: 'fit-content',
                  fontWeight: 800,
                  fontSize: '24px',
                  bgcolor: alpha(statusColor, 0.12),
                  color: statusColor,
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Updated {summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleTimeString() : '—'}
              </Typography>
            </Stack>
          </Grid>
          <Grid item xs={12} md={10}>
            {/* Distribution bar */}
            <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', border: `1px solid ${alpha(statusColor, 0.2)}` }}>
              <Box sx={{ flex: pct(summary.counts.passing), bgcolor: theme.palette.success.main, minWidth: summary.counts.passing ? 8 : 0 }} />
              <Box sx={{ flex: pct(summary.counts.warning), bgcolor: theme.palette.warning.main, minWidth: summary.counts.warning ? 8 : 0 }} />
              <Box sx={{ flex: pct(summary.counts.failing), bgcolor: theme.palette.error.main, minWidth: summary.counts.failing ? 8 : 0 }} />
              <Box sx={{ flex: pct(summary.counts.muted), bgcolor: theme.palette.grey[400], minWidth: summary.counts.muted ? 8 : 0 }} />
            </Box>

            {/* KPI chips */}
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1.25 }}>
              <Chip
                icon={<CheckCircle />}
                label={`Passing: ${summary.counts.passing}`}
                sx={{ bgcolor: alpha(theme.palette.success.main, 0.1), color: theme.palette.success.main }}
              />
              <Chip
                icon={<Warning />}
                label={`Degraded: ${summary.counts.warning}`}
                sx={{ bgcolor: alpha(theme.palette.warning.main, 0.1), color: theme.palette.warning.main }}
              />
              <Chip
                icon={<Error />}
                label={`Failing: ${summary.counts.failing}`}
                sx={{ bgcolor: alpha(theme.palette.error.main, 0.1), color: theme.palette.error.main }}
              />
              <Chip
                icon={<VolumeOff />}
                label={`Muted: ${summary.counts.muted}`}
                sx={{ bgcolor: alpha(theme.palette.grey[500], 0.1), color: theme.palette.text.secondary }}
              />
            </Stack>
          </Grid>
        </Grid>
      )}
    </SectionBox>
  );
};

export default KPIBar;



'@
}

# File 17: src/components/home/PinnedCSIs.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/home/PinnedCSIs.tsx'
  SizeBytes    = 6237
  Sha256       = '3acdd2cfa101821bd4008d8f860cfd3bedc84adfd22e2730d5046f5b4f922014'
  Content      = @'
import React, { useEffect, useState } from 'react';
import { Box, Card, CardActionArea, CardContent, Grid, Stack, Typography, alpha, useTheme, Skeleton, Button, Snackbar, Alert } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import { unpinCsi, setSearchContext } from '@/store/slices/dashboardSlice';
import apiClient from '@/services/api/apiClient';
import SectionBox from './SectionBox';

interface HealthSummary {
  csiId: string;
  totalChecks: number;
  passingChecks: number;
  failingChecks: number;
  warningChecks: number;
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

const StatusBadge: React.FC<{ status: HealthSummary['overallStatus'] }> = ({ status }) => {
  const theme = useTheme();
  const color = status === 'CRITICAL' ? theme.palette.error.main : status === 'WARNING' ? theme.palette.warning.main : theme.palette.success.main;
  return (
    <Box sx={{ fontSize: 12, fontWeight: 700, color, bgcolor: alpha(color, 0.08), px: 1, py: 0.25, borderRadius: 1, width: 'fit-content' }}>{status}</Box>
  );
};

const PinnedCSIs: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const pinned = useAppSelector((s) => s.dashboard.pinnedCsiIds);
  const [health, setHealth] = useState<Record<string, HealthSummary>>({});
  const [unpinToastOpen, setUnpinToastOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const entries = await Promise.all(
        pinned.map(async (id) => {
          try {
            const data = await apiClient.get<HealthSummary>(`/csi/${id}/health`);
            return [id, data] as const;
          } catch {
            return [id, undefined] as const;
          }
        })
      );
      if (!cancelled) {
        const map: Record<string, HealthSummary> = {};
        entries.forEach(([id, hs]) => {
          if (hs) map[id] = hs;
        });
        setHealth(map);
      }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pinned]);

  return (
    <SectionBox title="My CSIs" accentColor={theme.palette.info.main}>
      {pinned.length === 0 ? (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" color="text.secondary">
            You have no pinned CSIs. Select a CSI in search and click Pin to add it here.
          </Typography>
        </Stack>
      ) : (
      <Grid container spacing={2}>
        {pinned.map((id) => {
          const hs = health[id];
          const isLoading = !hs;
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={id}>
              <Card variant="outlined" sx={{ transition: 'transform 150ms ease, box-shadow 200ms ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 20px rgba(0,0,0,0.08)' } }}>
                <CardActionArea onClick={() => window.dispatchEvent(new Event('focus'))}>
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" fontWeight={700}>{id}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {!isLoading && hs && <StatusBadge status={hs.overallStatus} />}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            role="button"
                            onClick={(e) => { e.stopPropagation(); dispatch(unpinCsi(id)); setUnpinToastOpen(true); }}
                            sx={{ cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: theme.palette.text.primary } }}
                            aria-label={`Unpin ${id}`}
                          >
                            Unpin
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            role="button"
                            onClick={(e) => { e.stopPropagation(); dispatch(setSearchContext({ csiId: id })); }}
                            sx={{ cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: theme.palette.text.primary } }}
                            aria-label={`Set ${id} as context`}
                          >
                            Set context
                          </Typography>
                        </Stack>
                      </Stack>
                      {isLoading ? (
                        <Stack spacing={0.75}>
                          <Skeleton variant="text" width="60%" />
                          <Skeleton variant="text" width="80%" />
                        </Stack>
                      ) : (
                        <Stack direction="row" spacing={2}>
                          <Typography variant="caption" color="text.secondary">Passing: <Box component="span" sx={{ color: theme.palette.success.main, fontWeight: 700 }}>{hs?.passingChecks ?? '—'}</Box></Typography>
                          <Typography variant="caption" color="text.secondary">Warn: <Box component="span" sx={{ color: theme.palette.warning.main, fontWeight: 700 }}>{hs?.warningChecks ?? '—'}</Box></Typography>
                          <Typography variant="caption" color="text.secondary">Fail: <Box component="span" sx={{ color: theme.palette.error.main, fontWeight: 700 }}>{hs?.failingChecks ?? '—'}</Box></Typography>
                        </Stack>
                      )}
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>
      )}
      <Snackbar open={unpinToastOpen} autoHideDuration={2000} onClose={() => setUnpinToastOpen(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="info" onClose={() => setUnpinToastOpen(false)}>Removed from My CSIs</Alert>
      </Snackbar>
    </SectionBox>
  );
};

export default PinnedCSIs;



'@
}

# File 18: src/components/home/ReportsSnapshot.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/home/ReportsSnapshot.tsx'
  SizeBytes    = 2629
  Sha256       = '3d36710c9539ff1512fbdce9700b3162782eddd4f453847f2848107cfc246d51'
  Content      = @'
import React from 'react';
import { Button, List, ListItem, ListItemText, Stack, Typography, useTheme, Skeleton, alpha, Alert } from '@mui/material';
import SectionBox from './SectionBox';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchReportsSnapshot } from '@/store/slices/dashboardSlice';
import { useNavigate } from 'react-router-dom';

interface ReportsSnapshotProps { maxHeight?: number | string }

const ReportsSnapshot: React.FC<ReportsSnapshotProps> = ({ maxHeight }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.dashboard.reports);

  return (
      <SectionBox
      title="Reports"
      accentColor={theme.palette.success.main}
      action={<Button size="small" onClick={() => navigate('/checks/reports')}>View all</Button>}
      maxHeight={maxHeight}
    >
      {loading === 'loading' ? (
        <Stack spacing={1.25}>
          {[...Array(4)].map((_, i) => (
            <Stack key={i} direction="row" spacing={1.5} alignItems="center">
              <Skeleton variant="text" width="50%" />
            </Stack>
          ))}
        </Stack>
      ) : loading === 'failed' ? (
        <Alert role="alert" severity="error" onClose={() => dispatch(fetchReportsSnapshot({ limit: 5 }))}>{error || 'Failed to load reports'}</Alert>
      ) : data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No reports yet</Typography>
      ) : (
        <List dense disablePadding>
          {data.slice(0, 5).map((r) => (
            <ListItem
              key={r.id}
              sx={{ px: 0, borderRadius: 1, transition: 'background-color 120ms ease', '&:hover': { bgcolor: alpha(theme.palette.success.main, 0.04) } }}
              onClick={() => navigate(`/checks/reports/${r.id}`)}
              role="button"
              aria-label={`Open report ${r.name}`}
            >
              <ListItemText
                primary={<Typography variant="body2">{r.name}</Typography>}
                secondary={
                  <Typography variant="caption" color="text.secondary" aria-label={`Next ${r.nextScheduledAt ? new Date(r.nextScheduledAt).toLocaleString() : 'not scheduled'}; Last ${r.lastStatus || 'unknown'}`}>
                    Next: {r.nextScheduledAt ? new Date(r.nextScheduledAt).toLocaleString() : '—'} • Last: {r.lastStatus || '—'}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </SectionBox>
  );
};

export default ReportsSnapshot;



'@
}

# File 19: src/components/home/SectionBox.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/home/SectionBox.tsx'
  SizeBytes    = 2678
  Sha256       = '2aa71ec92891487e058388bfcf0aeb1249ce799c7b4e99470134f032e18998ec'
  Content      = @'
import React, { useId } from 'react';
import { Box, Paper, Stack, Typography, alpha, useTheme } from '@mui/material';

interface SectionBoxProps {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  accentColor?: string;
  maxHeight?: number | string;
  children: React.ReactNode;
}

const SectionBox: React.FC<SectionBoxProps> = ({ title, icon, action, accentColor, maxHeight, children }) => {
  const theme = useTheme();
  const color = accentColor || theme.palette.primary.main;
  const headerId = useId();

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 0,
        borderRadius: 2,
        borderColor: alpha(color, 0.25),
        backgroundColor: theme.palette.background.paper,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: maxHeight ? maxHeight : 'auto',
        transition: 'background-color 150ms ease, box-shadow 200ms ease, border-color 150ms ease',
        '&:hover': {
          borderColor: alpha(color, 0.35),
          boxShadow: '0 6px 16px rgba(0,0,0,0.06)',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          px: 2,
          py: 1.5,
          backgroundColor: theme.palette.background.paper,
          borderBottom: `1px solid ${alpha(color, 0.12)}`,
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: alpha(color, 0.9),
          },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            {icon && <Box sx={{ color }}>{icon}</Box>}
            <Typography id={headerId} variant="h6" fontWeight={700}>
              {title}
            </Typography>
          </Stack>
          {action && <Box>{action}</Box>}
        </Stack>
      </Box>

      {/* Content */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          overflowY: maxHeight ? 'auto' : 'visible',
          '&::-webkit-scrollbar': { width: 8 },
          '&::-webkit-scrollbar-track': { background: alpha(theme.palette.grey[400], 0.2), borderRadius: 8 },
          '&::-webkit-scrollbar-thumb': { background: alpha(color, 0.4), borderRadius: 8 },
          '&::-webkit-scrollbar-thumb:hover': { background: alpha(color, 0.6) },
        }}
        role="region"
        aria-labelledby={headerId}
      >
        {children}
      </Box>
    </Paper>
  );
};

export default SectionBox;



'@
}

# File 20: src/components/home/TriageDrawer.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/home/TriageDrawer.tsx'
  SizeBytes    = 2962
  Sha256       = '398bf1ec393b706966e04aa0ae91cc34996009ad24bd363d2acd3427d1f99096'
  Content      = @'
import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, Divider, Drawer, Stack, Typography, useTheme } from '@mui/material';
import { checksApi } from '@/services/api/checksApi';

interface TriageDrawerProps {
  open: boolean;
  checkId: string | null;
  onClose: () => void;
}

const TriageDrawer: React.FC<TriageDrawerProps> = ({ open, checkId, onClose }) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !checkId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [d, h] = await Promise.all([
          checksApi.getCheckById(checkId),
          checksApi.getCheckExecutions(checkId, 5),
        ]);
        if (!cancelled) {
          setDetails(d);
          setHistory(Array.isArray(h?.data) ? h.data : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, checkId]);

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 480 } }}>
      <Box sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={700}>Triage</Typography>
          <Button size="small" onClick={onClose}>Close</Button>
        </Stack>
        <Divider sx={{ my: 2 }} />

        {loading ? (
          <Typography variant="body2" color="text.secondary">Loading…</Typography>
        ) : !details ? (
          <Typography variant="body2" color="text.secondary">No data</Typography>
        ) : (
          <Stack spacing={2}>
            <Stack>
              <Typography variant="subtitle2" fontWeight={700}>{details.name}</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={details.status} color={
                  details.status === 'FAILING' ? 'error' : details.status === 'WARNING' ? 'warning' : 'success'
                } />
                <Chip size="small" label={details.csiName} variant="outlined" />
              </Stack>
            </Stack>

            <Box>
              <Typography variant="subtitle2" gutterBottom>Recent executions</Typography>
              <Stack spacing={1}>
                {history.map((e) => (
                  <Stack key={e.id} direction="row" justifyContent="space-between">
                    <Typography variant="body2">{e.status}</Typography>
                    <Typography variant="caption" color="text.secondary">{new Date(e.endTime || e.startTime).toLocaleString()}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

export default TriageDrawer;



'@
}

# File 21: src/components/home/UpcomingSchedules.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/home/UpcomingSchedules.tsx'
  SizeBytes    = 2428
  Sha256       = '41094600ad318817cfc2a93d908531325365ed795b2233dbf4205ce1bf7afd25'
  Content      = @'
import React from 'react';
import { Box, List, ListItem, ListItemText, Typography, useTheme, Skeleton, Stack, alpha, Alert, Button } from '@mui/material';
import SectionBox from './SectionBox';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchUpcomingSchedules } from '@/store/slices/dashboardSlice';

interface UpcomingSchedulesProps { maxHeight?: number | string }

const UpcomingSchedules: React.FC<UpcomingSchedulesProps> = ({ maxHeight }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.dashboard.upcoming);
  const items = Array.isArray(data) ? data : [];

  return (
    <SectionBox title="Upcoming" accentColor={theme.palette.info.main} maxHeight={maxHeight}>
      {loading === 'loading' ? (
        <Stack spacing={1.25}>
          {[...Array(6)].map((_, i) => (
            <Stack key={i} direction="row" spacing={1.5} alignItems="center">
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="30%" />
            </Stack>
          ))}
        </Stack>
      ) : loading === 'failed' ? (
        <Alert role="alert" severity="error" action={<Button color="inherit" size="small" onClick={() => dispatch(fetchUpcomingSchedules({ limit: 10 }))}>Retry</Button>}>
          {error || 'Failed to load upcoming schedules'}
        </Alert>
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No upcoming schedules</Typography>
      ) : (
        <List dense disablePadding>
          {items.slice(0, 8).map((x: any) => (
            <ListItem
              key={`${x.checkId}-${x.nextExecution}`}
              sx={{ px: 0, borderRadius: 1, transition: 'background-color 120ms ease', '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.04) } }}
            >
              <ListItemText
                primary={<Typography variant="body2">{x.checkName}</Typography>}
                secondary={
                  <Typography variant="caption" color="text.secondary" aria-label={`${x.csiName} scheduled at ${new Date(x.nextExecution).toLocaleString()}`}>
                    {x.csiName} • {new Date(x.nextExecution).toLocaleString()}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </SectionBox>
  );
};

export default UpcomingSchedules;



'@
}

# File 22: src/components/layout/ChecksLayout/ChecksLayout.a11y.test.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/layout/ChecksLayout/ChecksLayout.a11y.test.tsx'
  SizeBytes    = 1061
  Sha256       = '6314499983eb46ff6924f4f8ce4b6d296835e961f1f5d805d25157ea1e9a0f8f'
  Content      = @'
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from '@/theme';
import { MemoryRouter } from 'react-router-dom';
import { ChecksLayout } from './ChecksLayout';
import { LayoutProvider } from '@/components/layout/LayoutProvider';

describe('ChecksLayout accessibility', () => {
  it('renders skip link and main landmark', async () => {
    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <MemoryRouter initialEntries={['/']}> 
            <LayoutProvider>
              <ChecksLayout>
                <div>content</div>
              </ChecksLayout>
            </LayoutProvider>
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    );
    // Skip link present
    expect(screen.getByText(/Skip to main content/i)).toBeInTheDocument();
  });
});



'@
}

# File 23: src/components/layout/ChecksLayout/ChecksLayout.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/layout/ChecksLayout/ChecksLayout.tsx'
  SizeBytes    = 5345
  Sha256       = '818b53ae3670cb2c74aa2c7307e7f1cb24b61f8554d0f25e66a21279823e6524'
  Content      = @'
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Stack, TextField, useTheme, useMediaQuery } from '@mui/material';
import CommandPalette from '@/components/home/CommandPalette';
import HelpDialog from './HelpDialog';
import { useLocation, useNavigate } from 'react-router-dom';
import { PlatformSidebar } from '@put/core-components';
import { useLayout } from '../LayoutProvider';
import { registerChecksNavigation, getCurrentPageId } from '../../../utils/navigation/navigationSetup';
import GlobalSearch from '@/components/home/GlobalSearch';
import SkipLink from './SkipLink';
import Notifications from './Notifications';

interface ChecksLayoutProps {
  children: React.ReactNode;
}

export const ChecksLayout: React.FC<ChecksLayoutProps> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const navigate = useNavigate();
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  
  const { deploymentMode } = useLayout();

  // Register navigation on component mount
  useEffect(() => {
    registerChecksNavigation();
  }, []);

  // Update current page when location changes
  useEffect(() => {
    const pageId = getCurrentPageId(location.pathname);
    setCurrentPage(pageId);
  }, [location.pathname]);

  const handlePageChange = (pageId: string, path: string) => {
    setCurrentPage(pageId);
    navigate(path);
  };

  const handleToggleCollapse = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
  };

  // In federated mode, we might not show the sidebar depending on host configuration
  const shouldShowSidebar = deploymentMode === 'standalone' || !isMobile;
  const sidebarSpace = shouldShowSidebar ? (sidebarCollapsed ? 100 : 320) : 0;
  // Match vertical rhythm used by SidebarHeader: larger top padding when expanded
  const contentPaddingTop = 0; // px

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setPaletteOpen((v) => !v);
    }
    if (e.key === '?') {
      e.preventDefault();
      setHelpOpen(true);
    }
    // Quick nav shortcuts
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      navigate('/checks/create');
    }
    if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // simple Go home
      e.preventDefault();
      navigate('/checks');
    }
    // Reduced motion preference: no-op shortcut but show how we'd adapt animations if needed
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const showGlobalSearch = useMemo(() => {
    const p = location.pathname;
    if (p === '/' || p === '/checks') return true; // Home (standalone and host base)
    if (p === '/checks/all') return true; // Checks catalog
    if (p === '/checks/reports') return true; // Reports catalog
    if (p === '/checks/studio') return true; // Studio landing
    if (p.startsWith('/checks/studio/tests')) return true; // Studio Tests
    if (p.startsWith('/checks/studio/runs')) return true; // Studio Runs
    return false;
  }, [location.pathname]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <SkipLink targetId="checks-main" />
      {shouldShowSidebar && (
        <PlatformSidebar
          key={`checks-sidebar-${currentPage}`}
          currentModule="checks"
          currentPage={currentPage}
          onPageChange={handlePageChange}
          isCollapsed={isMobile ? false : sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      )}
      
        <Box
        component="main"
        sx={{
          flexGrow: 1,
          backgroundColor: theme.palette.background.default,
          minHeight: '100vh',
          // Reserve space for the sidebar without causing overflow
          marginLeft: isMobile ? 0 : `${sidebarSpace}px`,
          width: isMobile ? '100%' : `calc(100% - ${sidebarSpace}px)`,
          // Avoid extra offset; host shell provides its own top spacing
          marginTop: 0,
          padding: shouldShowSidebar 
            ? `${contentPaddingTop}px 48px 24px 24px`
            : `${contentPaddingTop}px 24px 24px 24px`,
          transition: 'margin-left 300ms ease',
          '@media (max-width: 1024px)': {
            marginLeft: 0,
            width: '100%',
            padding: '24px',
          },
        }}
      >
          <Box component="div" id="checks-main" tabIndex={-1} sx={{ position: 'absolute', top: 0 }} />
          {showGlobalSearch && (
            <Stack spacing={2} sx={{ mb: 2 }}>
              <GlobalSearch />
            </Stack>
          )}
        {children}
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
          <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
          <Notifications />
      </Box>
    </Box>
  );
};
'@
}

# File 24: src/components/layout/ChecksLayout/HelpDialog.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/layout/ChecksLayout/HelpDialog.tsx'
  SizeBytes    = 2291
  Sha256       = '102d9cfdcac3c5023fb1db2894f61c419d902ef615d9ac2f101228511fe8f756'
  Content      = @'
import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem, ListItemText, Typography } from '@mui/material';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const HelpDialog: React.FC<HelpDialogProps> = ({ open, onClose }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="checks-help-title">
      <DialogTitle id="checks-help-title">Shortcuts & Tips</DialogTitle>
      <DialogContent dividers>
        <List dense>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>Cmd/Ctrl + K</strong> — Open Command Palette</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>?</strong> — Open this Help</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>Cmd/Ctrl + N</strong> — Create a new Check</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>G</strong> — Go to Home</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>Esc</strong> — Close dialogs/overlays</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>Search</strong>: Type to find CSIs, then search Checks/Reports within a CSI.</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2"><strong>Reports builder</strong>: ⌘S to save draft, ⌘⏎ to generate preview, <code>/</code> to focus check search.</Typography>} />
          </ListItem>
          <ListItem>
            <ListItemText primary={<Typography variant="body2">Dev toggles (localStorage): <code>__msw_debug_slow</code> (ms), <code>__msw_debug_fail</code> (code), <code>__msw_debug_empty</code> (1)</Typography>} />
          </ListItem>
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} autoFocus>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default HelpDialog;



'@
}

# File 25: src/components/layout/ChecksLayout/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/components/layout/ChecksLayout/index.ts'
  SizeBytes    = 46
  Sha256       = '110c7993b0dd63a40a11b4aa9dd681f3d3d0eacdf32d98a63cf18f4189b23ff6'
  Content      = @'
export { ChecksLayout } from './ChecksLayout';
'@
}

# File 26: src/components/layout/ChecksLayout/Notifications.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/layout/ChecksLayout/Notifications.tsx'
  SizeBytes    = 1006
  Sha256       = 'fe9ad87d1968fca138c459b9bd6e7a9ea9d9f7853bbc6822fd90522c79ad7d0f'
  Content      = @'
import React from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import { removeNotification } from '@/store/slices/uiSlice';

const Notifications: React.FC = () => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((s) => s.ui.notifications);
  const newest = notifications[0];
  const [open, setOpen] = React.useState(Boolean(newest));
  React.useEffect(() => setOpen(Boolean(newest)), [newest?.id]);

  if (!newest) return null;

  const handleClose = () => setOpen(false);
  const handleExited = () => dispatch(removeNotification(newest.id));

  return (
    <Snackbar
      open={open}
      autoHideDuration={3500}
      onClose={handleClose}
      TransitionProps={{ onExited: handleExited as any }}
    >
      <Alert severity={newest.type} onClose={handleClose}>
        {newest.title ? `${newest.title}: ` : ''}{newest.message}
      </Alert>
    </Snackbar>
  );
};

export default Notifications;



'@
}

# File 27: src/components/layout/ChecksLayout/SkipLink.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/layout/ChecksLayout/SkipLink.tsx'
  SizeBytes    = 760
  Sha256       = '1c177720a4f9700a5287a3e55b15745020e99de8e0976b80d9fd9fb66da80fab'
  Content      = @'
import React from 'react';

const styles: React.CSSProperties = {
  position: 'absolute',
  top: -40,
  left: 16,
  background: '#fff',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #E5E7EB',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  color: '#111827',
  textDecoration: 'none',
};

interface SkipLinkProps {
  targetId: string;
}

const SkipLink: React.FC<SkipLinkProps> = ({ targetId }) => {
  return (
    <a
      href={`#${targetId}`}
      style={styles}
      onFocus={(e) => {
        // Reveal when focused
        (e.currentTarget.style as any).top = '8px';
      }}
      onBlur={(e) => {
        (e.currentTarget.style as any).top = '-40px';
      }}
    >
      Skip to main content
    </a>
  );
};

export default SkipLink;



'@
}

# File 28: src/components/layout/LayoutProvider/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/components/layout/LayoutProvider/index.ts'
  SizeBytes    = 61
  Sha256       = 'ffe405eaf61b12730cfd6e9a5d06af8b1175222812eea50526372c363b4d735e'
  Content      = @'
export { LayoutProvider, useLayout } from './LayoutProvider';
'@
}

# File 29: src/components/layout/LayoutProvider/LayoutProvider.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/layout/LayoutProvider/LayoutProvider.tsx'
  SizeBytes    = 3245
  Sha256       = '6d6d13b800411a328f5e26c7be3c1825e2b43be2cd5610f919774ede883033e5'
  Content      = @'
import React, { createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@store/index';
import { setDeploymentMode, setCurrentPage } from '@store/slices/uiSlice';
import { DeploymentMode } from '@/types/common/commonTypes';

interface LayoutContextType {
  deploymentMode: DeploymentMode;
  sidebarCollapsed: boolean;
  currentPath: string;
  currentPage: string;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const useLayout = (): LayoutContextType => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};

interface LayoutProviderProps {
  children: React.ReactNode;
}

export const LayoutProvider: React.FC<LayoutProviderProps> = ({ children }) => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { deploymentMode, sidebarCollapsed, currentPage } = useAppSelector(state => state.ui);

  useEffect(() => {
    // Detect deployment mode based on environment or indicators
    const detectDeploymentMode = (): DeploymentMode => {
      // Check for Module Federation indicators
      const isModuleFederation = 
        // Check if we're running on a different port than the typical host
        window.location.port === '3000' || 
        // Check if we're in an iframe (host integration)
        window.parent !== window ||
        // Check for MF specific globals
        !!(window as any).__webpack_require__ ||
        // Check if we're not on the default Vite dev port
        (window.location.port !== '5173' && window.location.hostname === 'localhost');
      
      return isModuleFederation ? 'federated' : 'standalone';
    };

    const mode = detectDeploymentMode();
    dispatch(setDeploymentMode(mode));

    if (process.env.NODE_ENV === 'development') {
      console.log(`🏗️ Layout Provider: Deployment mode detected as "${mode}"`);
      console.log('Environment info:', {
        port: window.location.port,
        hostname: window.location.hostname,
        isInIframe: window.parent !== window,
        hasModuleFederation: !!(window as any).__webpack_require__,
      });
    }
  }, [dispatch]);

  useEffect(() => {
    // Update current page based on route
    const getCurrentPageFromPath = (path: string): string => {
      if (path === '/checks' || path === '/') return 'dashboard';
      if (path.startsWith('/checks/all')) return 'all-checks';
      if (path.startsWith('/checks/create')) return 'create-check';
      if (path.startsWith('/checks/studio')) return 'checks-studio';
      if (path.startsWith('/checks/reports')) return 'reports';
      return 'dashboard';
    };

    const newPage = getCurrentPageFromPath(location.pathname);
    if (newPage !== currentPage) {
      dispatch(setCurrentPage(newPage));
    }
  }, [location.pathname, currentPage, dispatch]);

  const contextValue: LayoutContextType = {
    deploymentMode,
    sidebarCollapsed,
    currentPath: location.pathname,
    currentPage,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      {children}
    </LayoutContext.Provider>
  );
};
'@
}

# File 30: src/components/reports/RecipientsEditor.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/reports/RecipientsEditor.tsx'
  SizeBytes    = 3136
  Sha256       = '28c139014d3d1c1ffab57f265eb62b5155e9e3383273e3d1746e658d2da5426e'
  Content      = @'
import React, { useMemo, useState } from 'react';
import { Autocomplete, Chip, Stack, TextField, Typography, Button } from '@mui/material';
import reportsApi from '@/services/api/reportsApi';

interface RecipientsEditorProps {
  value: string[];
  onChange: (recipients: string[]) => void;
  reportId?: string | null;
}

const COMMON_RECIPIENTS = [
  'platform-team@citi.com',
  'ops@citi.com',
  'executives@citi.com',
  'sre@citi.com',
];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RecipientsEditor: React.FC<RecipientsEditorProps> = ({ value, onChange, reportId }) => {
  const [input, setInput] = useState<string>('');
  const suggestions = useMemo(() => COMMON_RECIPIENTS.filter((e) => !value?.includes(e)), [value]);
  const [sending, setSending] = useState(false);

  const add = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed || !emailRegex.test(trimmed) || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput('');
  };

  const remove = (email: string) => onChange((value || []).filter((e) => e !== email));

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    // Prevent global shortcuts from firing while typing in recipients
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(input);
    }
    if (e.key === 'Backspace' && !input && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const onKeyUp: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    // Block bubbling to avoid app-level hotkeys (like '/')
    e.stopPropagation();
  };

  const sendTest = async () => {
    if (!reportId) return;
    try {
      setSending(true);
      await reportsApi.sendTest(reportId, value[0]);
    } finally { setSending(false); }
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Recipients</Typography>
      <Autocomplete
        freeSolo
        options={suggestions || []}
        inputValue={input}
        onInputChange={(_, v) => setInput(v)}
        onChange={(_, v) => { if (typeof v === 'string') add(v); }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Add recipient"
            placeholder="name@citi.com"
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onKeyPress={(e) => e.stopPropagation()}
            onFocus={(e) => e.stopPropagation()}
            helperText={!input || emailRegex.test(input) ? 'Enter to add, comma to separate' : 'Invalid email format'}
            error={Boolean(input) && !emailRegex.test(input)}
            inputProps={{ ...params.inputProps, 'aria-label': 'Add recipient email' }}
          />
        )}
      />
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ rowGap: 1 }}>
        {value.map((e) => (
          <Chip key={e} label={e} onDelete={() => remove(e)} aria-label={`recipient ${e}`} />
        ))}
      </Stack>
      {/* Send test button removed from this component; actions moved to builder toolbar */}
    </Stack>
  );
};

export default RecipientsEditor;


'@
}

# File 31: src/components/reports/ReportSectionsEditor.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/reports/ReportSectionsEditor.tsx'
  SizeBytes    = 4498
  Sha256       = '447872fc2d69ce97d0735f7df8ed12ba5e06a835f09fa0275dcbb77943921d7c'
  Content      = @'
import React from 'react';
import { Box, Paper, Stack, TextField, Typography, Button, Chip } from '@mui/material';
import { Search } from '@mui/icons-material';
import type { ReportSection, ManualReportSection } from '@/types/reports/reportTypes';

interface Props {
  sections: ReportSection[];
  onChange: (next: ReportSection[]) => void;
  search: string;
  onSearch: (q: string) => void;
  searchResults: Array<{ id: string; name: string; csiName: string }>;
  onAddCheckToSection: (sectionIndex: number, checkId: string) => void;
}

const ReportSectionsEditor: React.FC<Props> = ({ sections, onChange, search, onSearch, searchResults, onAddCheckToSection }) => {
  return (
    <Box>
      <Stack spacing={1}>
        {sections.length === 0 && (
          <Typography variant="caption" color="text.secondary">No sections yet.</Typography>
        )}
        {sections.map((s, idx) => (
          <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <TextField size="small" label="Title" value={s.title} onChange={(e) => {
                  const updated = [...sections];
                  updated[idx] = { ...updated[idx], title: e.target.value };
                  onChange(updated);
                }} sx={{ minWidth: 240 }} />
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => {
                    if (idx > 0) {
                      const updated = [...sections];
                      const [moved] = updated.splice(idx, 1);
                      updated.splice(idx - 1, 0, moved);
                      onChange(updated);
                    }
                  }}>Up</Button>
                  <Button size="small" onClick={() => {
                    if (idx < sections.length - 1) {
                      const updated = [...sections];
                      const [moved] = updated.splice(idx, 1);
                      updated.splice(idx + 1, 0, moved);
                      onChange(updated);
                    }
                  }}>Down</Button>
                  <Button size="small" color="error" onClick={() => onChange(sections.filter((x) => x.id !== s.id))}>Remove</Button>
                </Stack>
              </Stack>
              {s.kind === 'manual' && (
                <Stack spacing={1}>
                  <TextField size="small" placeholder="Search checks to add" value={search} onChange={(e) => onSearch(e.target.value)} InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1 }} /> }} />
                  {searchResults.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 1 }}>
                      {searchResults.map((r) => (
                        <Stack key={r.id} direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="body2">{r.name}</Typography>
                          <Button size="small" onClick={() => onAddCheckToSection(idx, r.id)}>Add</Button>
                        </Stack>
                      ))}
                    </Paper>
                  )}
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {((s as ManualReportSection).checkIds || []).map((id: string) => (
                      <Chip
                        key={id}
                        size="small"
                        label={id}
                        onDelete={() => {
                          const updated: ReportSection[] = [...sections];
                          if (updated[idx].kind === 'manual') {
                            const manual = updated[idx] as ManualReportSection;
                            updated[idx] = {
                              ...manual,
                              checkIds: (manual.checkIds || []).filter((checkId: string) => checkId !== id),
                            };
                            onChange(updated);
                          }
                        }}
                      />
                    ))}
                  </Stack>
                </Stack>
              )}
              {s.kind === 'rule' && (
                <Typography variant="caption" color="text.secondary">Rule-based configuration handled elsewhere</Typography>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
};

export default ReportSectionsEditor;



'@
}

# File 32: src/components/reports/RuleBuilder.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/reports/RuleBuilder.tsx'
  SizeBytes    = 8414
  Sha256       = '8d8abfaf1079550fa9502f9aae11de9b5d9ed1f3fb4f2a64e107c1fd1b714371'
  Content      = @'
import React, { useEffect, useRef, useState } from 'react';
import { Box, Stack, TextField, Typography, MenuItem, FormControl, InputLabel, Select, Chip, Autocomplete, CircularProgress } from '@mui/material';
import TagSelect from '@/components/common/FilterBar/TagSelect';
import { csiApi } from '@/services/api/csiApi';
import apiClient from '@/services/api/apiClient';

interface RuleBuilderProps {
  value: any;
  onChange: (next: any) => void;
  availableTags?: string[];
}

const RuleBuilder: React.FC<RuleBuilderProps> = ({ value, onChange, availableTags = [] }) => {
  // --- CSI IDs (re-implemented) ---
  const [csiInput, setCsiInput] = useState<string>('');
  const [csiOptions, setCsiOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [csiSelected, setCsiSelected] = useState<Array<{ id: string; name: string }>>([]);
  const [csiLoading, setCsiLoading] = useState<boolean>(false);
  const searchTimer = useRef<number | undefined>(undefined);

  const [allTags, setAllTags] = useState<string[]>(availableTags);
  const [tagsLoading, setTagsLoading] = useState(false);

  // Keep selected list in sync with external value.csiIds and hydrate names
  useEffect(() => {
    const selectedIds: string[] = Array.isArray(value?.csiIds) ? value.csiIds : [];
    if (selectedIds.length === 0) { setCsiSelected([]); return; }
    const existingMap = new Map(csiOptions.map(o => [o.id, o.name] as const));
    const nextSelected: Array<{ id: string; name: string }> = selectedIds.map(id => ({ id, name: existingMap.get(id) || '' }));
    setCsiSelected(nextSelected);
    // hydrate missing names
    const missing = nextSelected.filter(s => !s.name).map(s => s.id);
    if (missing.length > 0) {
      setCsiLoading(true);
      Promise.all(missing.map(async (id) => {
        try { const d: any = await csiApi.getCsiById(id); return { id: d.id, name: d.name }; } catch { return { id, name: id }; }
      })).then(details => {
        // merge into options and selected
        const mergedOptions = new Map<string, string>();
        csiOptions.forEach(o => mergedOptions.set(o.id, o.name));
        details.forEach(d => mergedOptions.set(d.id, d.name));
        setCsiOptions(Array.from(mergedOptions.entries()).map(([id, name]) => ({ id, name })));
        setCsiSelected(selectedIds.map(id => ({ id, name: mergedOptions.get(id) || id })));
      }).finally(() => setCsiLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.csiIds]);

  // Search when typing (debounced)
  useEffect(() => {
    if (!csiInput || csiInput.length < 2) return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      setCsiLoading(true);
      try {
        const items = await csiApi.searchCsis(csiInput, 10);
        const list = items.map((i: any) => ({ id: i.id, name: i.name }));
        // merge with selected to ensure chips remain labeled
        const merged = new Map<string, string>();
        list.forEach(i => merged.set(i.id, i.name));
        csiSelected.forEach(s => merged.set(s.id, s.name || merged.get(s.id) || ''));
        setCsiOptions(Array.from(merged.entries()).map(([id, name]) => ({ id, name })));
      } finally { setCsiLoading(false); }
    }, 250);
    return () => { if (searchTimer.current) window.clearTimeout(searchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csiInput]);

  useEffect(() => {
    let active = true;
    setTagsLoading(true);
    apiClient.get('/tags')
      .then((res: any) => {
        const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.data) ? res.data.data : []);
        if (active) setAllTags(list && Array.isArray(list) ? list : availableTags);
      })
      .catch(() => setAllTags(availableTags))
      .finally(() => { if (active) setTagsLoading(false); });
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Box>
      <Stack spacing={1.5}>
        <Autocomplete
          multiple
          options={csiOptions}
          getOptionLabel={(opt) => `${opt.id}${opt.name ? ` - ${opt.name}` : ''}`}
          isOptionEqualToValue={(opt, val) => opt.id === val.id}
          filterOptions={(options) => options}
          filterSelectedOptions
          loading={csiLoading}
          value={csiSelected}
          onChange={(_, newVals) => {
            const next = (newVals || []).map(v => ({ id: v.id, name: v.name || (csiOptions.find(o => o.id === v.id)?.name) || '' }));
            setCsiSelected(next);
            onChange({ ...value, csiIds: next.map(n => n.id) });
          }}
          inputValue={csiInput}
          onInputChange={(_, newInput) => setCsiInput(newInput)}
          noOptionsText={csiInput && csiInput.length >= 2 ? 'No CSI matches' : 'Type ID or name (min 2 chars)'}
          loadingText="Searching…"
          renderInput={(params) => (
            <TextField {...params} size="small" label="CSI" placeholder="Search by CSI ID or name" InputProps={{ ...params.InputProps, endAdornment: (<>
              {csiLoading ? <CircularProgress color="inherit" size={16} /> : null}
              {params.InputProps.endAdornment}
            </>) }} />
          )}
        />

        <TagSelect tags={allTags} selectedTags={value?.tags || []} onTagsChange={(tags) => onChange({ ...value, tags })} loading={tagsLoading} placeholder="Type to filter by tag" label="Tags" />
         <FormControl size="small">
          <InputLabel>Types</InputLabel>
          <Select multiple value={value?.types || []} label="Types" onChange={(e) => onChange({ ...value, types: e.target.value })} renderValue={(selected) => (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {(selected as string[]).map((s) => (<Chip key={s} size="small" label={s} />))}
            </Box>
          )}>
            {['HTTP','TCP','SPLUNK','GRAFANA','ITRS','APPDYNAMICS','UI_TEST'].map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>
         <FormControl size="small">
          <InputLabel>Status</InputLabel>
          <Select multiple value={value?.status || []} label="Status" onChange={(e) => onChange({ ...value, status: e.target.value })} renderValue={(selected) => (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {(selected as string[]).map((s) => (<Chip key={s} size="small" label={s} />))}
            </Box>
          )}>
            {['PASSING','WARNING','FAILING','PENDING','UNKNOWN'].map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack direction="row" spacing={1}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Sort</InputLabel>
            <Select value={value?.sort || ''} label="Sort" onChange={(e) => onChange({ ...value, sort: e.target.value })}>
              <MenuItem value="">None</MenuItem>
              <MenuItem value="failing-first">Failing first</MenuItem>
              <MenuItem value="recently-failed">Recently failed</MenuItem>
              <MenuItem value="alphabetical">Alphabetical</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Timeframe</InputLabel>
            <Select value={value?.timeframe || ''} label="Timeframe" onChange={(e) => onChange({ ...value, timeframe: e.target.value })}>
              <MenuItem value="">Any time</MenuItem>
              <MenuItem value="5m">Last 5 minutes</MenuItem>
              <MenuItem value="15m">Last 15 minutes</MenuItem>
              <MenuItem value="1h">Last hour</MenuItem>
              <MenuItem value="24h">Last 24 hours</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" type="number" label="Limit" value={value?.limit ?? 10} onChange={(e) => onChange({ ...value, limit: Math.max(0, Number(e.target.value) || 0) })} sx={{ maxWidth: 120 }} />
        </Stack>
         <Typography variant="caption" color="text.secondary">Live match count appears in Preview after save/preview. Use tags, CSI IDs, types and status to refine.</Typography>
      </Stack>
    </Box>
  );
};

export default RuleBuilder;



'@
}

# File 33: src/components/reports/ScheduleEditor.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/reports/ScheduleEditor.tsx'
  SizeBytes    = 7237
  Sha256       = 'ea646e54cf60d825faa1628983292866f1ae58ad1f1a8385a6dde2185fe89bf8'
  Content      = @'
import React, { useMemo, useState } from 'react';
import { Alert, Box, FormControl, FormLabel, Radio, RadioGroup, Stack, TextField, Typography, FormControlLabel, Chip, Switch } from '@mui/material';

interface ScheduleEditorProps {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  cron?: string;
  time?: string; // HH:mm (local)
  timezone?: string;
  daysOfWeek?: number[]; // 1-7 (Mon-Sun)
  daysOfMonth?: number[]; // 1-31
  onChange: (next: Partial<ScheduleEditorProps>) => void;
}

const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ enabled, frequency, cron, time, timezone, daysOfWeek = [], daysOfMonth = [], onChange }) => {
  const [cronText, setCronText] = useState(cron || '');
  const [timeText, setTimeText] = useState(time || '18:00');
  const [tzText, setTzText] = useState(timezone || 'EST');
  const [dow, setDow] = useState<number[]>(Array.isArray(daysOfWeek) ? daysOfWeek : []);
  const [dom, setDom] = useState<number[]>(Array.isArray(daysOfMonth) ? daysOfMonth : []);

  const isCronValid = useMemo(() => {
    if (!cronText.trim()) return false;
    const parts = cronText.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  }, [cronText]);

  const nextRunLabel = useMemo(() => {
    try {
      const now = new Date();
      const parseTime = (t?: string) => {
        if (!t) return { h: now.getHours(), m: now.getMinutes() };
        const [hh, mm] = t.split(':').map(n => parseInt(n || '0', 10));
        return { h: isNaN(hh) ? 0 : hh, m: isNaN(mm) ? 0 : mm };
      };
      if (!enabled) return 'Disabled';
      if (frequency === 'hourly') {
        const d = new Date(now.getTime());
        d.setHours(now.getHours() + 1, 0, 0, 0);
        return d.toLocaleString();
      }
      if (frequency === 'daily') {
        const { h, m } = parseTime(timeText);
        const d = new Date(now.getTime());
        d.setHours(h, m, 0, 0);
        if (d <= now) d.setDate(d.getDate() + 1);
        return d.toLocaleString();
      }
      if (frequency === 'weekly') {
        const { h, m } = parseTime(timeText);
        const selected = dow.length ? dow : [1];
        let best: Date | null = null;
        for (const day of selected) {
          const d = new Date(now.getTime());
          // day: 1=Mon .. 7=Sun
          const jsDay = day === 7 ? 0 : day; // JS: 0=Sun..6=Sat
          const delta = (jsDay - d.getDay() + 7) % 7;
          d.setDate(d.getDate() + delta);
          d.setHours(h, m, 0, 0);
          if (d <= now) d.setDate(d.getDate() + 7);
          if (!best || d < best) best = d;
        }
        return (best || now).toLocaleString();
      }
      if (frequency === 'monthly') {
        const { h, m } = parseTime(timeText);
        const selected = dom.length ? dom : [1];
        let best: Date | null = null;
        for (const day of selected) {
          const d = new Date(now.getFullYear(), now.getMonth(), day, h, m, 0, 0);
          if (isNaN(d.getTime())) continue;
          if (d <= now) d.setMonth(d.getMonth() + 1);
          if (!best || d < best) best = d;
        }
        return (best || now).toLocaleString();
      }
      if (frequency === 'custom') {
        return isCronValid ? 'Custom cron' : 'Invalid cron';
      }
      return '';
    } catch {
      return '';
    }
  }, [enabled, frequency, timeText, dow, dom, isCronValid]);

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Schedule</Typography>
      <Alert severity={enabled ? 'success' : 'warning'} sx={{ py: 0 }}>
        {enabled ? 'Scheduling enabled' : 'Scheduling disabled'}
      </Alert>
      <FormControlLabel control={<Switch checked={enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />} label={enabled ? 'Enabled' : 'Disabled'} />
      <FormControl component="fieldset">
        <FormLabel component="legend">Frequency</FormLabel>
        <RadioGroup row value={frequency} onChange={(e) => onChange({ frequency: e.target.value as any })}>
          <FormControlLabel value="hourly" control={<Radio />} label="Hourly" />
          <FormControlLabel value="daily" control={<Radio />} label="Daily" />
          <FormControlLabel value="weekly" control={<Radio />} label="Weekly" />
          <FormControlLabel value="monthly" control={<Radio />} label="Monthly" />
          <FormControlLabel value="custom" control={<Radio />} label="Custom" />
        </RadioGroup>
      </FormControl>

      {frequency === 'custom' ? (
        <Box>
          <TextField fullWidth label="Cron expression" value={cronText} onChange={(e) => { setCronText(e.target.value); onChange({ cron: e.target.value }); }} placeholder="0 0 18 * * *" error={cronText !== '' && !isCronValid} helperText={cronText && !isCronValid ? 'Invalid cron format' : 'Examples: 0 */5 * * * * (every 5 min), 0 0 18 * * * (6 PM daily)'} />
          <Alert severity="info" sx={{ mt: 1 }}>Examples: 0 */5 * * * * (every 5 min), 0 0 18 * * * (6 PM daily)</Alert>
        </Box>
      ) : frequency !== 'hourly' ? (
        <TextField label="Time (HH:mm)" value={timeText} onChange={(e) => { setTimeText(e.target.value); onChange({ time: e.target.value }); }} helperText="24h format" />
      ) : null}

      {/* Weekly day-of-week selection */}
      {frequency === 'weekly' && (
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">Select days of week</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {[{k:1,l:'Mon'},{k:2,l:'Tue'},{k:3,l:'Wed'},{k:4,l:'Thu'},{k:5,l:'Fri'},{k:6,l:'Sat'},{k:7,l:'Sun'}].map((d) => (
              <Chip key={d.k} label={d.l} color={dow.includes(d.k) ? 'primary' : 'default'} variant={dow.includes(d.k) ? 'filled' : 'outlined'} onClick={() => {
                const next = dow.includes(d.k) ? dow.filter(x => x !== d.k) : [...dow, d.k].sort((a,b)=>a-b);
                setDow(next);
                onChange({ daysOfWeek: next });
              }} />
            ))}
          </Stack>
        </Stack>
      )}

      {/* Monthly day-of-month selection */}
      {frequency === 'monthly' && (
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">Select days of month</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5 }}>
            {Array.from({ length: 31 }).map((_, idx) => {
              const day = idx + 1;
              const selected = dom.includes(day);
              return (
                <Chip key={day} label={day} size="small" color={selected ? 'primary' : 'default'} variant={selected ? 'filled' : 'outlined'} onClick={() => {
                  const next = selected ? dom.filter(x => x !== day) : [...dom, day].sort((a,b)=>a-b);
                  setDom(next);
                  onChange({ daysOfMonth: next });
                }} />
              );
            })}
          </Box>
        </Stack>
      )}

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">Next run:</Typography>
        <Chip label={nextRunLabel || '—'} size="small" />
      </Stack>
    </Stack>
  );
};

export default ScheduleEditor;


'@
}

# File 34: src/components/scheduling/ScheduleDialog.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/scheduling/ScheduleDialog.tsx'
  SizeBytes    = 10045
  Sha256       = '9cf036a07b8af79ce66f93bb8e3ee185a674e9d485badcb3c46e6734d25cf60a'
  Content      = @'
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Stack,
  Box,
  Alert,
  Chip,
  Switch,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Schedule,
  Info,
  PlayArrow,
  Pause,
} from '@mui/icons-material';
import { CheckEntity } from '../../types/checks/checkTypes';
import { useAppDispatch } from '@store/index';
import { updateCheckSchedule } from '@store/slices/checksSlice';

interface ScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  check: CheckEntity | null;
}

const FREQUENCY_OPTIONS = [
  { value: 'EVERY_MINUTE', label: 'Every minute', description: 'High frequency monitoring' },
  { value: 'EVERY_5_MINUTES', label: 'Every 5 minutes', description: 'Standard monitoring' },
  { value: 'EVERY_15_MINUTES', label: 'Every 15 minutes', description: 'Regular checks' },
  { value: 'EVERY_30_MINUTES', label: 'Every 30 minutes', description: 'Moderate monitoring' },
  { value: 'HOURLY', label: 'Every hour', description: 'Periodic checks' },
  { value: 'EVERY_6_HOURS', label: 'Every 6 hours', description: 'Low frequency' },
  { value: 'DAILY', label: 'Daily at midnight', description: 'Daily maintenance' },
  { value: 'CUSTOM', label: 'Custom cron expression', description: 'Advanced scheduling' },
];

const ScheduleDialog: React.FC<ScheduleDialogProps> = ({ open, onClose, check }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState('EVERY_5_MINUTES');
  const [cronExpression, setCronExpression] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (check?.schedule) {
      setEnabled(check.schedule.enabled);
      setFrequency(check.schedule.frequency || 'EVERY_5_MINUTES');
      setCronExpression(check.schedule.cron || '');
    }
  }, [check]);

  const handleSave = async () => {
    if (!check) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const scheduleData = {
        enabled,
        frequency: frequency !== 'CUSTOM' ? frequency : undefined,
        cron: frequency === 'CUSTOM' ? cronExpression : undefined,
      };
      
      await dispatch(updateCheckSchedule({ id: check.id, schedule: scheduleData })).unwrap();
      onClose();
    } catch (err) {
      setError('Failed to update schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getNextExecutionPreview = (): string => {
    if (!enabled) return 'Check is disabled';
    
    const now = new Date();
    let nextExecution: Date;
    
    switch (frequency) {
      case 'EVERY_MINUTE':
        nextExecution = new Date(now.getTime() + 60 * 1000);
        break;
      case 'EVERY_5_MINUTES':
        nextExecution = new Date(now.getTime() + 5 * 60 * 1000);
        break;
      case 'EVERY_15_MINUTES':
        nextExecution = new Date(now.getTime() + 15 * 60 * 1000);
        break;
      case 'EVERY_30_MINUTES':
        nextExecution = new Date(now.getTime() + 30 * 60 * 1000);
        break;
      case 'HOURLY':
        nextExecution = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case 'EVERY_6_HOURS':
        nextExecution = new Date(now.getTime() + 6 * 60 * 60 * 1000);
        break;
      case 'DAILY':
        nextExecution = new Date(now);
        nextExecution.setDate(nextExecution.getDate() + 1);
        nextExecution.setHours(0, 0, 0, 0);
        break;
      case 'CUSTOM':
        return cronExpression ? `Custom: ${cronExpression}` : 'Custom expression required';
      default:
        nextExecution = new Date(now.getTime() + 5 * 60 * 1000);
    }
    
    return `Next run: ${nextExecution.toLocaleString()}`;
  };

  const validateCronExpression = (expression: string): boolean => {
    if (!expression.trim()) return false;
    // Basic validation - should have 5 or 6 parts
    const parts = expression.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  };

  if (!check) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle id="schedule-dialog-title">
        <Stack direction="row" alignItems="center" spacing={2}>
          <Schedule color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Schedule Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {check.name}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      
      <DialogContent aria-labelledby="schedule-dialog-title">
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Enable/Disable Toggle */}
          <Box 
            sx={{ 
              p: 2, 
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.02)
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  Schedule Status
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {enabled ? 'Check will run automatically' : 'Check is paused'}
                </Typography>
              </Box>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Chip
                  icon={enabled ? <PlayArrow /> : <Pause />}
                  label={enabled ? 'Enabled' : 'Disabled'}
                  color={enabled ? 'success' : 'default'}
                />
                <Switch
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  color="primary"
                />
              </Stack>
            </Stack>
          </Box>

          {/* Frequency Selection */}
          <FormControl component="fieldset" disabled={!enabled}>
            <FormLabel component="legend" sx={{ mb: 2, fontWeight: 600 }}>
              Execution Frequency
            </FormLabel>
            <RadioGroup
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <Stack spacing={2}>
                {FREQUENCY_OPTIONS.map((option) => (
                  <FormControlLabel
                    key={option.value}
                    value={option.value}
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {option.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Box>
                    }
                    sx={{
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: 1,
                      p: 1.5,
                      m: 0,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.04)
                      }
                    }}
                  />
                ))}
              </Stack>
            </RadioGroup>
          </FormControl>

          {/* Custom Cron Expression */}
          {frequency === 'CUSTOM' && enabled && (
            <Box>
              <TextField
                fullWidth
                label="Cron Expression"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 */5 * * * *"
                helperText="Format: second minute hour day month year (optional)"
                error={cronExpression !== '' && !validateCronExpression(cronExpression)}
              />
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Examples:</strong>
                  <br />• <code>0 */5 * * * *</code> - Every 5 minutes
                  <br />• <code>0 0 9 * * MON-FRI</code> - 9 AM on weekdays
                  <br />• <code>0 30 14 * * *</code> - Daily at 2:30 PM
                </Typography>
              </Alert>
            </Box>
          )}

          {/* Preview */}
          <Box
            sx={{
              p: 2,
              bgcolor: alpha(theme.palette.info.main, 0.05),
              border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
              borderRadius: 2
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} mb={1}>
              <Info color="info" fontSize="small" />
              <Typography variant="subtitle2" color="info.main" fontWeight={600}>
                Schedule Preview
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {getNextExecutionPreview()}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error">
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} disabled={loading} autoFocus>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || (frequency === 'CUSTOM' && !validateCronExpression(cronExpression))}
        >
          {loading ? 'Saving...' : 'Save Schedule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ScheduleDialog;
'@
}

# File 35: src/components/scheduling/UpcomingExecutions.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/scheduling/UpcomingExecutions.tsx'
  SizeBytes    = 8005
  Sha256       = '09f5a0c279b03de1bbb7affcd777023de81dee0813f3ad39e27e5eace6ef8009'
  Content      = @'
import React, { useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Button,
  Stack,
  useTheme,
  alpha,
  Divider,
  Skeleton,
} from '@mui/material';
import { Schedule, Refresh } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchUpcomingExecutions } from '@store/slices/checksSlice';
import { useNavigate } from 'react-router-dom';

interface UpcomingExecutionsProps {
  maxItems?: number;
  showActions?: boolean;
}

const UpcomingExecutions: React.FC<UpcomingExecutionsProps> = ({ 
  maxItems = 10,
  showActions = true 
}) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  const { upcomingExecutions, loading } = useAppSelector(state => state.checks);
  const executions = Array.isArray(upcomingExecutions) ? upcomingExecutions : [];
  
  useEffect(() => {
    dispatch(fetchUpcomingExecutions(maxItems));
  }, [dispatch, maxItems]);

  const handleRefresh = () => {
    dispatch(fetchUpcomingExecutions(maxItems));
  };

  const getTimeUntilExecution = (nextExecution: string): { text: string; color: string } => {
    const now = new Date();
    const execution = new Date(nextExecution);
    const diffMs = execution.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 0) {
      return { text: 'Overdue', color: theme.palette.error.main };
    } else if (diffMinutes < 5) {
      return { text: `${diffMinutes}m`, color: theme.palette.warning.main };
    } else if (diffMinutes < 60) {
      return { text: `${diffMinutes}m`, color: theme.palette.info.main };
    } else {
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      return { 
        text: hours > 0 ? `${hours}h ${mins > 0 ? mins + 'm' : ''}` : `${mins}m`,
        color: theme.palette.text.secondary 
      };
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'critical': return theme.palette.error.main;
      case 'high': return theme.palette.warning.main;
      case 'medium': return theme.palette.info.main;
      case 'low': return theme.palette.success.main;
      default: return theme.palette.text.secondary;
    }
  };

  if (loading === 'loading') {
    return (
      <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} mb={2}>
            Upcoming Executions
          </Typography>
          <Stack spacing={2}>
            {[...Array(5)].map((_, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Skeleton variant="circular" width={24} height={24} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="40%" />
                </Box>
                <Skeleton variant="rectangular" width={60} height={24} />
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight={600}>
            Upcoming Executions
          </Typography>
          {showActions && (
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Refresh />}
                onClick={handleRefresh}
              >
                Refresh
              </Button>
            </Stack>
          )}
        </Stack>

        {executions.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Schedule sx={{ fontSize: 48, color: theme.palette.text.secondary, mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No upcoming executions scheduled
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {executions.slice(0, maxItems).map((execution, index) => {
              const timeInfo = getTimeUntilExecution(execution.nextExecution);
              // Find priority from check data (would need to be included in API response)
              const priority = 'medium'; // Default priority
              
              return (
                <React.Fragment key={execution.checkId}>
                  <ListItem
                    disablePadding
                    sx={{
                      py: 2,
                      cursor: 'pointer',
                      borderRadius: 1,
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.04)
                      }
                    }}
                    onClick={() => navigate(`/checks/${execution.checkId}`)}
                  >
                    <ListItemIcon>
                      <Schedule sx={{ color: timeInfo.color }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="subtitle2" fontWeight={600}>
                            {execution.checkName}
                          </Typography>
                          <Chip 
                            label={priority} 
                            size="small" 
                            sx={{ 
                              bgcolor: alpha(getPriorityColor(priority), 0.1),
                              color: getPriorityColor(priority),
                              height: 20,
                              fontSize: '0.75rem'
                            }} 
                          />
                        </Stack>
                      }
                      secondary={
                        <Stack direction="row" alignItems="center" spacing={2} mt={0.5}>
                          <Typography variant="caption" color="text.secondary">
                            {execution.csiName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            •
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(execution.nextExecution).toLocaleString()}
                          </Typography>
                        </Stack>
                      }
                    />
                    <Box sx={{ textAlign: 'right' }}>
                      <Chip
                        label={timeInfo.text}
                        size="small"
                        sx={{
                          bgcolor: alpha(timeInfo.color, 0.1),
                          color: timeInfo.color,
                          fontWeight: 600
                        }}
                      />
                    </Box>
                  </ListItem>
                  {index < Math.min(executions.length, maxItems) - 1 && (
                    <Divider variant="inset" component="li" />
                  )}
                </React.Fragment>
              );
            })}
          </List>
        )}

        {executions.length > maxItems && showActions && (
          <Box sx={{ textAlign: 'center', mt: 2, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => navigate('/checks')}
            >
              View All ({executions.length} total)
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default UpcomingExecutions;
'@
}

# File 36: src/components/shared/ErrorBoundary/ErrorBoundary.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/shared/ErrorBoundary/ErrorBoundary.tsx'
  SizeBytes    = 5295
  Sha256       = '974cc2ba849019f79b821a14e5962fca27542e85ee564d7a643356ec8e1b8de0'
  Content      = @'
import { Component, ErrorInfo, ReactNode } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  Collapse,
} from '@mui/material';
import { ErrorOutline, ExpandMore, ExpandLess, Refresh } from '@mui/icons-material';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showDetails: boolean;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    showDetails: false,
    errorId: '',
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate a unique error ID for tracking
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return { 
      hasError: true, 
      error, 
      showDetails: false,
      errorId,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.group('🚨 Error Boundary Caught Error');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();
    
    this.setState({ errorInfo });
    
    // Call the optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: sendErrorToService(error, errorInfo, this.state.errorId);
    }
  }

  private handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      showDetails: false,
      errorId: '',
    });
  };

  private toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box sx={{ p: 3, maxWidth: 600, mx: 'auto', mt: 4 }}>
          <Paper 
            sx={{ 
              p: 4, 
              textAlign: 'center',
              border: '1px solid',
              borderColor: 'error.light',
            }}
          >
            <ErrorOutline 
              sx={{ 
                fontSize: 64, 
                color: 'error.main', 
                mb: 2 
              }} 
            />
            
            <Typography variant="h5" gutterBottom>
              Something went wrong
            </Typography>
            
            <Typography variant="body1" color="text.secondary" paragraph>
              An unexpected error occurred in the Checks module. The error has been logged and our team has been notified.
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Error ID: <code>{this.state.errorId}</code>
            </Typography>
            
            <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button 
                variant="contained" 
                startIcon={<Refresh />}
                onClick={this.handleRetry}
              >
                Try Again
              </Button>
              
              <Button
                variant="outlined"
                startIcon={this.state.showDetails ? <ExpandLess /> : <ExpandMore />}
                onClick={this.toggleDetails}
              >
                {this.state.showDetails ? 'Hide' : 'Show'} Details
              </Button>
            </Box>

            <Collapse in={this.state.showDetails} sx={{ mt: 3 }}>
              <Alert severity="error" sx={{ textAlign: 'left' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Error Details:
                </Typography>
                
                <Box component="pre" sx={{ 
                  whiteSpace: 'pre-wrap', 
                  fontSize: '0.75rem',
                  maxHeight: '300px',
                  overflow: 'auto',
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  p: 1,
                  borderRadius: 1,
                  mt: 1,
                }}>
                  <strong>Message:</strong> {this.state.error?.message}
                  {'\n\n'}
                  <strong>Stack:</strong>
                  {'\n'}
                  {this.state.error?.stack}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      {'\n\n'}
                      <strong>Component Stack:</strong>
                      {'\n'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </Box>
              </Alert>
            </Collapse>

            {process.env.NODE_ENV === 'development' && (
              <Typography variant="caption" display="block" sx={{ mt: 2, color: 'warning.main' }}>
                Development Mode: This error boundary provides additional debugging information.
              </Typography>
            )}
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}
'@
}

# File 37: src/components/shared/ErrorBoundary/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/components/shared/ErrorBoundary/index.ts'
  SizeBytes    = 48
  Sha256       = 'a4a7e77c9f3871ec39a6b73cc9d06aefe045e0e42f5b4428322ff41cfeaeb5c0'
  Content      = @'
export { ErrorBoundary } from './ErrorBoundary';
'@
}

# File 38: src/components/shared/States/EmptyState.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/shared/States/EmptyState.tsx'
  SizeBytes    = 867
  Sha256       = '0d56f34f11a1cbb6772cb9f33bfc0909ece00ad85347f4ec24278cc0dd78a4ca'
  Content      = @'
import React from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Nothing here yet',
  description = 'Try adjusting filters or create a new item to get started.',
  actionLabel,
  onAction,
}) => {
  return (
    <Box sx={{ textAlign: 'center', py: 6 }}>
      <Stack spacing={1} alignItems="center">
        <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{description}</Typography>
        {actionLabel && (
          <Button variant="contained" size="small" onClick={onAction}>{actionLabel}</Button>
        )}
      </Stack>
    </Box>
  );
};

export default EmptyState;



'@
}

# File 39: src/components/shared/States/ErrorState.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/shared/States/ErrorState.tsx'
  SizeBytes    = 465
  Sha256       = 'b0bf183ead24b2f2ff59bc01917c4fa8abf631eaf9979bfb235ab6d39c86d43d'
  Content      = @'
import React from 'react';
import { Alert, Button, Stack } from '@mui/material';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({ message = 'Something went wrong.', onRetry }) => {
  return (
    <Alert severity="error" action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Retry</Button> : undefined}>
      {message}
    </Alert>
  );
};

export default ErrorState;



'@
}

# File 40: src/components/shared/States/LoadingState.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/shared/States/LoadingState.tsx'
  SizeBytes    = 554
  Sha256       = 'f32409d9e221d65125d2e6de55a639f07be4803c8c19850231bbf02ab600935e'
  Content      = @'
import React from 'react';
import { Box, LinearProgress, Stack, Typography } from '@mui/material';

interface LoadingStateProps {
  label?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({ label = 'Loading…' }) => {
  return (
    <Box sx={{ py: 3 }}>
      <Stack spacing={1} alignItems="center">
        <LinearProgress sx={{ width: '100%', maxWidth: 480, height: 6, borderRadius: 3 }} />
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Stack>
    </Box>
  );
};

export default LoadingState;



'@
}

# File 41: src/components/studio/CodeTab.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/studio/CodeTab.tsx'
  SizeBytes    = 2134
  Sha256       = 'a52f2dfbc0a98b56b786ceb3c61fa71db98bdbac7096cdce0b22f286d74083c3'
  Content      = @'
import React from 'react';
import { Box, Paper, Stack, Typography, IconButton, Tooltip, Switch, FormControlLabel } from '@mui/material';
import { ContentCopy, Refresh } from '@mui/icons-material';

interface CodeTabProps {
  code: string;
  autoSync: boolean;
  onToggleAutoSync: (value: boolean) => void;
  onRegen?: () => void;
}

const CodeTab: React.FC<CodeTabProps> = ({ code, autoSync, onToggleAutoSync, onRegen }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {}
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Generated Python (Playwright)</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControlLabel
            control={<Switch size="small" checked={autoSync} onChange={(e) => onToggleAutoSync(e.target.checked)} />}
            label={<Typography variant="caption">Auto-sync</Typography>}
          />
          <Tooltip title="Regenerate from Steps">
            <span>
              <IconButton size="small" onClick={onRegen} disabled={autoSync === false}>
                <Refresh fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Copy code">
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.900', color: 'grey.100', fontFamily: 'monospace', fontSize: '0.8rem', overflow: 'auto', maxHeight: 360 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre', overflowX: 'auto' }}>{code}</pre>
      </Paper>
      {!autoSync && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Manual mode: edits in the code editor are not supported in this prototype. Toggle Auto-sync to regenerate.
        </Typography>
      )}
    </Box>
  );
};

export default CodeTab;



'@
}

# File 42: src/components/studio/OnboardingCoach.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/studio/OnboardingCoach.tsx'
  SizeBytes    = 1672
  Sha256       = '84942a54c5a0171643145859b7563a3a694c41ef3c1e7108bf1ff3add1f352bf'
  Content      = @'
import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography, Button, Fade } from '@mui/material';

interface OnboardingCoachProps {
  step: number;
  onNext: () => void;
  onDismiss: () => void;
}

const MESSAGES = [
  {
    title: 'Write your steps',
    body: 'Start by describing your flow in simple lines. Use actions like "Go to", "Click", "Type".',
  },
  {
    title: 'Validate & fix',
    body: 'We validate your steps in real time and highlight issues to fix before running.',
  },
  {
    title: 'Run & observe',
    body: 'Click Run to execute. Watch logs, inspect generated code, and view proof in tabs.',
  },
];

const OnboardingCoach: React.FC<OnboardingCoachProps> = ({ step, onNext, onDismiss }) => {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Imperative focus on change
    anchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [step]);
  const msg = MESSAGES[step] || MESSAGES[0];
  return (
    <Fade in timeout={400}>
      <Paper elevation={0} variant="outlined" sx={{ p: 2, borderStyle: 'dashed', bgcolor: 'background.paper' }}>
        <Box ref={anchorRef}>
          <Typography variant="subtitle1" fontWeight={700}>{msg.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{msg.body}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
            <Button variant="contained" size="small" onClick={onNext}>Next</Button>
            <Button size="small" onClick={onDismiss}>Dismiss</Button>
          </Box>
        </Box>
      </Paper>
    </Fade>
  );
};

export default OnboardingCoach;



'@
}

# File 43: src/components/studio/SecretInput.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/components/studio/SecretInput.tsx'
  SizeBytes    = 4782
  Sha256       = '6a942305fd925b483441bc3edf3227a0ec378a5208cfd5413f27a0b0b712f7fe'
  Content      = @'
import React, { useEffect, useState } from 'react';
import { Box, TextField, MenuItem, Stack, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment } from '@mui/material';
import apiClient from '@/services/api/apiClient';

type Scope = 'project' | 'org' | 'user';

interface SecretMeta { id: string; label: string; scope: Scope; last4?: string; createdAt: string }

interface SecretInputProps {
  label: string;
  value?: { id: string } | null;
  onChange: (ref: { id: string } | null) => void;
}

const SecretInput: React.FC<SecretInputProps> = ({ label, value, onChange }) => {
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newScope, setNewScope] = useState<Scope>('project');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    (async () => {
      // Load from API
      const res = await apiClient.get('secrets');
      const apiSecrets: SecretMeta[] = (res as any).data ?? [];

      // Merge with locally persisted secrets for persistence across reloads
      let persisted: SecretMeta[] = [];
      try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem('checks:secrets') : null;
        if (raw) persisted = JSON.parse(raw);
      } catch {
        // ignore parse errors
      }
      const all = [...apiSecrets];
      const seen = new Set(all.map((s) => s.id));
      for (const s of persisted) {
        if (!seen.has(s.id)) {
          all.push(s);
          seen.add(s.id);
        }
      }
      setSecrets(all);
    })();
  }, []);

  const handleCreate = async () => {
    const res = (await apiClient.post('secrets', { label: newLabel, scope: newScope, value: newValue })) as any;
    const created = res as SecretMeta & { value?: string };
    const meta: SecretMeta = { id: created.id, label: created.label, scope: created.scope, last4: created.last4, createdAt: created.createdAt };
    setSecrets((prev) => {
      const next = [...prev, meta];
      try {
        if (typeof window !== 'undefined') {
          const raw = window.localStorage.getItem('checks:secrets');
          const persisted: SecretMeta[] = raw ? JSON.parse(raw) : [];
          const merged = [...persisted, meta].filter((s, idx, arr) => arr.findIndex((x) => x.id === s.id) === idx);
          window.localStorage.setItem('checks:secrets', JSON.stringify(merged));
        }
      } catch {
        // ignore persistence errors
      }
      return next;
    });
    onChange({ id: created.id });
    setOpen(false);
    setNewLabel('');
    setNewScope('project');
    setNewValue('');
  };

  return (
    <Box>
      <TextField
        select
        fullWidth
        size="small"
        label={label}
        value={value?.id ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__create__') {
            setOpen(true);
            return;
          }
          onChange(val ? { id: val } : null);
        }}
        SelectProps={{ displayEmpty: true }}
      >
        <MenuItem value="">
          <em>None</em>
        </MenuItem>
        {secrets.map((s) => (
          <MenuItem key={s.id} value={s.id}>{s.label} {s.last4 ? `(••••${s.last4})` : ''} • {s.scope}</MenuItem>
        ))}
        <MenuItem value="__create__">+ Create new secret…</MenuItem>
      </TextField>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Secret</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} fullWidth />
            <TextField select label="Scope" value={newScope} onChange={(e) => setNewScope(e.target.value as Scope)} fullWidth>
              <MenuItem value="project">Project</MenuItem>
              <MenuItem value="org">Org</MenuItem>
              <MenuItem value="user">User</MenuItem>
            </TextField>
            <TextField
              label="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              type="password"
              fullWidth
              InputProps={{ endAdornment: <InputAdornment position="end">•••</InputAdornment> }}
              helperText="Shown only once. Will be masked afterwards."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newLabel || !newValue}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SecretInput;



'@
}

# File 44: src/data/mockCSIData.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/data/mockCSIData.ts'
  SizeBytes    = 10150
  Sha256       = '0888e5c7e457c2afe45dabce0b1fa803ea958676f33536071ee7d134c92d5e71'
  Content      = @'
import { CSI, CSIMetrics, CSIHealthSummary } from '../types/csi/csiTypes';

// Mock CSI data representing Citi's systems
export const mockCSIs: CSI[] = [
  {
    id: '172087',
    name: 'Production Tools',
    description: 'Automated systems for managing production workloads and deployments',
    businessUnit: 'Technology Infrastructure',
    criticality: 'CRITICAL',
    owner: 'platform-automation@citi.com',
    tags: ['application:automation-platform', 'team:devops', 'lob:technology-infrastructure', 'priority:critical', 'type:infrastructure'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2025-01-07T10:30:00Z'
  },
  {
    id: '168942',
    name: 'Core Banking Platform',
    description: 'Primary banking services and transaction processing systems',
    businessUnit: 'Consumer Banking',
    criticality: 'CRITICAL',
    owner: 'core-banking@citi.com',
    tags: ['application:core-banking', 'team:core-systems', 'lob:enterprise-banking', 'priority:critical', 'type:api', 'component:database'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2023-08-20T00:00:00Z',
    updatedAt: '2025-01-07T10:25:00Z'
  },
  {
    id: '174523',
    name: 'Trading Platform Services',
    description: 'Electronic trading systems and market data processing',
    businessUnit: 'Markets & Securities',
    criticality: 'CRITICAL',
    owner: 'trading-platform@citi.com',
    tags: ['application:trading-platform', 'team:platform-engineering', 'lob:capital-markets', 'priority:critical', 'type:api', 'component:market-data', 'compliance:sox'],
    environment: 'Production',
    status: 'DEGRADED',
    createdAt: '2023-11-10T00:00:00Z',
    updatedAt: '2025-01-07T10:20:00Z'
  },
  {
    id: '169834',
    name: 'Payment Gateway Infrastructure',
    description: 'Payment processing and gateway services for all channels',
    businessUnit: 'Payments',
    criticality: 'CRITICAL',
    owner: 'payments-infra@citi.com',
    tags: ['application:payment-gateway', 'team:payments-team', 'lob:transaction-services', 'priority:critical', 'type:api', 'customer:external'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2025-01-07T10:35:00Z'
  },
  {
    id: '171205',
    name: 'Risk Management Systems',
    description: 'Credit risk, market risk, and operational risk management platforms',
    businessUnit: 'Risk Management',
    criticality: 'HIGH',
    owner: 'risk-systems@citi.com',
    tags: ['application:risk-management', 'team:risk-analytics', 'lob:risk-compliance', 'type:monitoring', 'compliance:regulatory', 'priority:high'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-03-15T00:00:00Z',
    updatedAt: '2025-01-07T10:15:00Z'
  },
  {
    id: '170456',
    name: 'Customer Digital Platform',
    description: 'Online and mobile banking platforms for customer interactions',
    businessUnit: 'Digital Banking',
    criticality: 'HIGH',
    owner: 'digital-platform@citi.com',
    tags: ['application:online-banking', 'team:customer-experience', 'lob:retail-banking', 'type:ui', 'platform:mobile', 'platform:web', 'customer:external'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-01-30T00:00:00Z',
    updatedAt: '2025-01-07T10:40:00Z'
  },
  {
    id: '173681',
    name: 'Data Analytics Platform',
    description: 'Business intelligence and analytics processing systems',
    businessUnit: 'Data & Analytics',
    criticality: 'MEDIUM',
    owner: 'analytics-platform@citi.com',
    tags: ['application:bi-platform', 'team:data-analytics', 'lob:enterprise-data', 'type:analytics', 'component:reporting', 'priority:medium'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-04-10T00:00:00Z',
    updatedAt: '2025-01-07T10:10:00Z'
  },
  {
    id: '167823',
    name: 'Infrastructure Services',
    description: 'Core infrastructure including network, storage, and compute services',
    businessUnit: 'Infrastructure',
    criticality: 'HIGH',
    owner: 'infrastructure@citi.com',
    tags: ['application:infrastructure-services', 'team:infrastructure', 'lob:technology-infrastructure', 'type:infrastructure', 'component:network', 'component:storage', 'priority:high'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2023-06-01T00:00:00Z',
    updatedAt: '2025-01-07T10:45:00Z'
  },
  {
    id: '175209',
    name: 'Compliance Monitoring Systems',
    description: 'Regulatory compliance and monitoring applications',
    businessUnit: 'Compliance',
    criticality: 'HIGH',
    owner: 'compliance-systems@citi.com',
    tags: ['application:compliance-monitor', 'team:compliance-ops', 'lob:risk-compliance', 'type:monitoring', 'compliance:regulatory', 'audit:required', 'priority:high'],
    environment: 'Production',
    status: 'MAINTENANCE',
    createdAt: '2024-05-20T00:00:00Z',
    updatedAt: '2025-01-07T10:00:00Z'
  },
  {
    id: '172954',
    name: 'Security Operations Platform',
    description: 'Cybersecurity monitoring and incident response systems',
    businessUnit: 'Cybersecurity',
    criticality: 'CRITICAL',
    owner: 'security-ops@citi.com',
    tags: ['application:security-ops', 'team:cybersecurity', 'lob:enterprise-security', 'type:siem', 'priority:critical', 'component:incident-response', 'compliance:sox'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-06-15T00:00:00Z',
    updatedAt: '2025-01-07T10:50:00Z'
  }
];

// Mock CSI metrics data
export const mockCSIMetrics: Record<string, CSIMetrics> = {
  '172087': {
    csiId: '172087',
    totalChecks: 12,
    passingChecks: 10,
    failingChecks: 1,
    warningChecks: 1,
    overallHealth: 85.5,
    lastUpdated: '2025-01-07T10:30:00Z',
    criticalAlertsCount: 1,
    avgResponseTime: 156,
    uptime: 99.2,
    totalExecutions: 288,
    successRate: 94.8
  },
  '168942': {
    csiId: '168942',
    totalChecks: 18,
    passingChecks: 16,
    failingChecks: 0,
    warningChecks: 2,
    overallHealth: 92.3,
    lastUpdated: '2025-01-07T10:25:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 89,
    uptime: 99.9,
    totalExecutions: 432,
    successRate: 98.1
  },
  '174523': {
    csiId: '174523',
    totalChecks: 8,
    passingChecks: 5,
    failingChecks: 2,
    warningChecks: 1,
    overallHealth: 71.2,
    lastUpdated: '2025-01-07T10:20:00Z',
    criticalAlertsCount: 2,
    avgResponseTime: 234,
    uptime: 97.8,
    totalExecutions: 192,
    successRate: 89.3
  },
  '169834': {
    csiId: '169834',
    totalChecks: 15,
    passingChecks: 14,
    failingChecks: 0,
    warningChecks: 1,
    overallHealth: 96.1,
    lastUpdated: '2025-01-07T10:35:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 112,
    uptime: 99.95,
    totalExecutions: 360,
    successRate: 99.2
  },
  '171205': {
    csiId: '171205',
    totalChecks: 10,
    passingChecks: 9,
    failingChecks: 0,
    warningChecks: 1,
    overallHealth: 94.7,
    lastUpdated: '2025-01-07T10:15:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 145,
    uptime: 99.7,
    totalExecutions: 240,
    successRate: 97.5
  },
  '170456': {
    csiId: '170456',
    totalChecks: 14,
    passingChecks: 12,
    failingChecks: 1,
    warningChecks: 1,
    overallHealth: 88.9,
    lastUpdated: '2025-01-07T10:40:00Z',
    criticalAlertsCount: 1,
    avgResponseTime: 178,
    uptime: 99.1,
    totalExecutions: 336,
    successRate: 95.2
  },
  '173681': {
    csiId: '173681',
    totalChecks: 6,
    passingChecks: 6,
    failingChecks: 0,
    warningChecks: 0,
    overallHealth: 100.0,
    lastUpdated: '2025-01-07T10:10:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 98,
    uptime: 99.8,
    totalExecutions: 144,
    successRate: 100.0
  },
  '167823': {
    csiId: '167823',
    totalChecks: 22,
    passingChecks: 20,
    failingChecks: 1,
    warningChecks: 1,
    overallHealth: 93.2,
    lastUpdated: '2025-01-07T10:45:00Z',
    criticalAlertsCount: 1,
    avgResponseTime: 123,
    uptime: 99.5,
    totalExecutions: 528,
    successRate: 96.8
  },
  '175209': {
    csiId: '175209',
    totalChecks: 7,
    passingChecks: 5,
    failingChecks: 0,
    warningChecks: 2,
    overallHealth: 82.1,
    lastUpdated: '2025-01-07T10:00:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 167,
    uptime: 98.9,
    totalExecutions: 168,
    successRate: 92.9
  },
  '172954': {
    csiId: '172954',
    totalChecks: 16,
    passingChecks: 15,
    failingChecks: 0,
    warningChecks: 1,
    overallHealth: 97.3,
    lastUpdated: '2025-01-07T10:50:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 87,
    uptime: 99.9,
    totalExecutions: 384,
    successRate: 98.7
  }
};

// Generate CSI health summaries
export const mockCSIHealthSummaries: CSIHealthSummary[] = mockCSIs.map(csi => ({
  csi,
  metrics: mockCSIMetrics[csi.id],
  recentIncidents: csi.status === 'DEGRADED' ? 2 : csi.status === 'DOWN' ? 3 : Math.floor(Math.random() * 2),
  maintenanceWindows: csi.status === 'MAINTENANCE' ? 1 : 0,
  lastHealthCheck: mockCSIMetrics[csi.id]?.lastUpdated || new Date().toISOString()
}));

// Business unit groupings for filtering
export const businessUnits = [
  'Technology Infrastructure',
  'Consumer Banking', 
  'Markets & Securities',
  'Payments',
  'Risk Management',
  'Digital Banking',
  'Data & Analytics',
  'Infrastructure',
  'Compliance',
  'Cybersecurity'
];

// Helper functions
export const getCSIById = (id: string): CSI | undefined => {
  return mockCSIs.find(csi => csi.id === id);
};

export const getCSIMetrics = (csiId: string): CSIMetrics | undefined => {
  return mockCSIMetrics[csiId];
};

export const getCSIsByBusinessUnit = (businessUnit: string): CSI[] => {
  return mockCSIs.filter(csi => csi.businessUnit === businessUnit);
};

export const getCSIsByCriticality = (criticality: CSI['criticality']): CSI[] => {
  return mockCSIs.filter(csi => csi.criticality === criticality);
};

export const getCriticalCSIs = (): CSI[] => {
  return mockCSIs.filter(csi => csi.criticality === 'CRITICAL');
};
'@
}

# File 45: src/index.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/index.tsx'
  SizeBytes    = 2350
  Sha256       = 'da7b200d2ba1ea146f35eef9693c959a3a529da1442f52a5803aede8f80a2e27'
  Content      = @'
// Module Federation entry point for remote dev server standalone preview
async function bootstrap() {
  // Ensure default share scope is initialized before consuming shared modules
  try {
    const initSharing = (globalThis as any).__webpack_init_sharing__;
    if (typeof initSharing === 'function') {
      await initSharing('default');
    }
  } catch {}

  // Start MSW in webpack MF standalone preview
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { worker } = await import('@services/mocks/browser');
      await worker.start({
        serviceWorker: { url: '/mockServiceWorker.js' },
        onUnhandledRequest: 'bypass',
      });
      // Ensure SW takes control on first run (reload once)
      try {
        const RELOAD_FLAG = '__msw_first_run__';
        const hasReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
        if (navigator.serviceWorker && !navigator.serviceWorker.controller && !hasReloaded) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
          return;
        }
      } catch {}
      // Additionally, wait until the service worker is actually controlling the page
      try {
        if (navigator.serviceWorker && !navigator.serviceWorker.controller) {
          await new Promise<void>((resolve) => {
            const onCtrl = () => resolve();
            navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true } as any);
          });
        }
      } catch {}
    } catch (e) {
      console.warn('⚠️ MSW failed to start (webpack MF standalone)', e);
    }
  }

  const [ReactNS, ReactDomNS, RouterNS, ModuleNS] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('react-router-dom'),
    import('./ChecksModule'),
  ]);

  const React = ReactNS.default as typeof import('react');
  const { createRoot } = ReactDomNS as any;
  const { BrowserRouter } = RouterNS as any;
  const ChecksModule = ModuleNS.default as any;

  const container = document.getElementById('root');
  if (!container) return;

  const root = createRoot(container);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(
        BrowserRouter,
        { basename: '/' },
        React.createElement(ChecksModule, null)
      )
    )
  );
}

bootstrap();
'@
}

# File 46: src/main-simple.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/main-simple.tsx'
  SizeBytes    = 1617
  Sha256       = '139cffa41c0c0e5c71503a51e5d64f240b10e393e3488c96b0a777540ca1164b'
  Content      = @'
import React from 'react';
import { createRoot } from 'react-dom/client';

console.log('🚀 Starting MF dev application (webpack)...');

const container = document.getElementById('root');
console.log('📦 Root element found:', !!container);

async function start() {
  if (!container) {
    console.error('❌ Root element not found!');
    return;
  }

  // Start MSW in standalone MF dev so /api requests are mocked
  try {
    const { worker } = await import('@services/mocks/browser');
    await worker.start({
      serviceWorker: { url: '/mockServiceWorker.js' },
      onUnhandledRequest: 'bypass',
    });
    console.log('✅ MSW ready (webpack dev)');
    try {
      const RELOAD_FLAG = '__msw_first_run__';
      const hasReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
      if (navigator.serviceWorker && !navigator.serviceWorker.controller && !hasReloaded) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        return;
      }
    } catch {}
  } catch (e) {
    console.warn('⚠️ MSW failed to start (webpack dev)', e);
  }

  // Initialize default share scope before consuming shared singletons
  try {
    const initSharing = (globalThis as any).__webpack_init_sharing__;
    if (typeof initSharing === 'function') {
      await initSharing('default');
    }
  } catch {}

  const { default: Bootstrap } = await import('./bootstrap');
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Bootstrap routingStrategy="browser" />
    </React.StrictMode>
  );
  console.log('✅ Bootstrap rendered (MF dev)');
}

start();
'@
}

# File 47: src/main.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/main.tsx'
  SizeBytes    = 2039
  Sha256       = '4c60937adf61a1ac95de720d63f5d02c4f2ef14ec57c7ce8576a29f90dfbc808'
  Content      = @'
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
// Lazy import to avoid eager shared consumption during bootstrap
const loadBootstrap = () => import('./bootstrap');
import { APP_CONFIG } from '@utils/constants/appConfig';

console.log('🚀 Main.tsx loaded');

// Entry point for standalone Vite development
const container = document.getElementById('root');
console.log('📦 Root container found:', !!container);

async function startApp() {
  if (!container) {
    console.error('❌ No root element found in HTML');
    return;
  }

  // Start MSW in development if enabled
  if (import.meta.env.DEV && APP_CONFIG.enableMSW) {
    try {
      console.log('🛠️ Starting MSW...');
      const { worker } = await import('@services/mocks/browser');
      await worker.start({
        serviceWorker: { url: '/mockServiceWorker.js' },
        onUnhandledRequest: 'warn',
      });
      console.log('✅ MSW ready');
    } catch (e) {
      console.warn('⚠️ MSW failed to start; falling back to network', e);
    }
  }

  try {
    // Initialize default share scope before consuming shared singletons
    try {
      const initSharing = (globalThis as any).__webpack_init_sharing__;
      if (typeof initSharing === 'function') {
        await initSharing('default');
      }
    } catch {}

    let root: Root;
    if (!(window as any).__REACT_ROOT__) {
      console.log('🔧 Creating React root...');
      root = createRoot(container);
      (window as any).__REACT_ROOT__ = root;
    } else {
      console.log('♻️ Reusing existing React root (HMR)...');
      root = (window as any).__REACT_ROOT__;
    }
    console.log('🎨 Rendering Bootstrap component...');
    const { default: Bootstrap } = await loadBootstrap();
    root.render(
      <React.StrictMode>
        <Bootstrap routingStrategy="browser" />
      </React.StrictMode>
    );
    console.log('✅ Bootstrap app rendered');
  } catch (error) {
    console.error('❌ Failed to render React app:', error);
  }
}

startApp();
'@
}

# File 48: src/pages/ActivityPage/ActivityPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/ActivityPage/ActivityPage.tsx'
  SizeBytes    = 816
  Sha256       = 'c8210458121037f50edadec7e1595a9b35e569e6d058c59d1c2675d079c96a04'
  Content      = @'
import React from 'react';
import { Box, Typography, Paper, Stack, Skeleton, Divider } from '@mui/material';

const ActivityPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Activity</Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Stream</Typography>
        <Stack spacing={1} sx={{ mb: 2 }}>
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={32} />
          ))}
        </Stack>
        <Divider />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          Facets are visual-only for now
        </Typography>
      </Paper>
    </Box>
  );
};

export default ActivityPage;



'@
}

# File 49: src/pages/ActivityPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/ActivityPage/index.ts'
  SizeBytes    = 44
  Sha256       = 'b040dc67567de59c651bd300193d42d9e67cab45f0afb3d8827722b7ceded0bb'
  Content      = @'
export { default } from './ActivityPage';



'@
}

# File 50: src/pages/AllChecksPage/AllChecksPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/AllChecksPage/AllChecksPage.tsx'
  SizeBytes    = 26536
  Sha256       = '00813643797a601da6f6bc6151f74be82bda61c4386921fe105de5d0d01dec35'
  Content      = @'
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Grid,
  TextField,
  InputAdornment,
  Chip,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Stack,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  useTheme,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  CircularProgress,
  Checkbox,
  Toolbar,
} from '@mui/material';
import {
  Search,
  FilterList,
  Add,
  MoreVert,
  CheckCircle,
  Error,
  Warning,
  Schedule,
  PlayArrow,
  Pause,
  Delete,
  Edit,
  Visibility,
  Api,
  Storage,
  AutoGraph,
  Security,
  BugReport,
  Science,
  Refresh,
  Checklist,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchChecks, executeCheck, deleteCheck, pauseCheck, resumeCheck } from '@store/slices/checksSlice';
import { addNotification } from '@/store/slices/uiSlice';
import EmptyState from '@/components/shared/States/EmptyState';
import ErrorState from '@/components/shared/States/ErrorState';
import LoadingState from '@/components/shared/States/LoadingState';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { checksApi } from '@/services/api/checksApi';
// Visual skeleton: scope is now shown globally in ScopeBar; this page gets a left FiltersRail
import FiltersRail from './FiltersRail';
import ScheduleDialog from '@components/scheduling/ScheduleDialog';

const AllChecksPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  const { data: checks, loading, error, executingChecks, schedulingChecks } = useAppSelector(state => state.checks);
  const { selectedCSI, tags: { selected: selectedTags, filterMode } } = useAppSelector(state => state.csi);
  const searchContext = useAppSelector(state => state.dashboard.searchContext);
  const location = useLocation();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [persisted, setPersisted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    dispatch(fetchChecks({ page: 1, limit: 100 }));
  }, [dispatch]);

  // Return focus to trigger after closing schedule dialog
  useEffect(() => {
    if (!scheduleDialogOpen && lastFocusRef.current) {
      lastFocusRef.current.focus();
      lastFocusRef.current = null;
    }
  }, [scheduleDialogOpen]);

  // Note: toast handled via notifications when creating a check

  // Persist table preferences (e.g., rowsPerPage)
  useEffect(() => {
    if (!persisted) {
      try {
        const raw = localStorage.getItem('checks:catalog:prefs');
        if (raw) {
          const prefs = JSON.parse(raw);
          if (prefs?.rowsPerPage) setRowsPerPage(prefs.rowsPerPage);
          if (prefs?.searchQuery !== undefined) setSearchQuery(prefs.searchQuery);
          if (prefs?.statusFilter !== undefined) setStatusFilter(prefs.statusFilter);
          if (prefs?.typeFilter !== undefined) setTypeFilter(prefs.typeFilter);
        }
      } catch {}
      setPersisted(true);
    }
  }, [persisted]);

  useEffect(() => {
    try {
      localStorage.setItem('checks:catalog:prefs', JSON.stringify({ rowsPerPage, searchQuery, statusFilter, typeFilter }));
    } catch {}
  }, [rowsPerPage, searchQuery, statusFilter, typeFilter]);

  // Filter and search logic
  const filteredChecks = useMemo(() => {
    let result = checks || [];
    
    // Apply CSI filter from global search context
    if (searchContext.csiId) {
      result = result.filter(check => check.csiId === searchContext.csiId);
    }
    
    // Apply environment filter from global search context
    if (searchContext.environment) {
      result = result.filter(check => check.environment === searchContext.environment);
    }
    
    // Apply tag filter from global search context
    if (searchContext.tags && searchContext.tags.length > 0) {
      result = result.filter(check => {
        const has = (t: string) => check.tags.includes(t);
        return searchContext.tagMode === 'AND' ? searchContext.tags.every(has) : searchContext.tags.some(has);
      });
    }
    
    // Apply local tag filter (if still needed)
    if (selectedTags && selectedTags.length > 0) {
      result = result.filter(check => {
        const has = (t: string) => check.tags.includes(t);
        return filterMode === 'AND' ? selectedTags.every(has) : selectedTags.some(has);
      });
    }
    
    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(check => 
        check.name.toLowerCase().includes(query) ||
        check.description?.toLowerCase().includes(query) ||
        check.csiName.toLowerCase().includes(query) ||
        check.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    // Apply status filter
    if (statusFilter) {
      result = result.filter(check => check.status === statusFilter);
    }
    
    // Apply type filter
    if (typeFilter) {
      result = result.filter(check => check.type === typeFilter);
    }
    
    return result;
  }, [checks, searchContext.csiId, searchContext.environment, searchContext.tags, searchContext.tagMode, selectedCSI, selectedTags, filterMode, searchQuery, statusFilter, typeFilter]);

  // Pagination
  const paginatedChecks = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return filteredChecks.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredChecks, page, rowsPerPage]);

  const allVisibleSelected = paginatedChecks.length > 0 && paginatedChecks.every((c) => selectedIds.includes(c.id));
  const someVisibleSelected = paginatedChecks.some((c) => selectedIds.includes(c.id));

  const toggleSelectAllVisible = (checked: boolean) => {
    if (checked) {
      const ids = Array.from(new Set([...selectedIds, ...paginatedChecks.map((c) => c.id)]));
      setSelectedIds(ids);
    } else {
      const visibleIds = new Set(paginatedChecks.map((c) => c.id));
      setSelectedIds(selectedIds.filter((id) => !visibleIds.has(id)));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const resetSelection = () => setSelectedIds([]);

  const handleBulkExecute = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkBusy(true);
      await checksApi.executeMultipleChecks(selectedIds);
      setSnackbar({ open: true, message: `Executed ${selectedIds.length} checks`, severity: 'success' });
      resetSelection();
      dispatch(fetchChecks({ page: 1, limit: 100 }));
    } catch {
      setSnackbar({ open: true, message: 'Bulk execute failed', severity: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkBusy(true);
      const res = await checksApi.deleteMultipleChecks(selectedIds);
      setSnackbar({ open: true, message: `Deleted ${res.succeeded.length} checks${res.failed.length ? `, failed ${res.failed.length}` : ''}` as any, severity: res.failed.length ? 'error' : 'success' });
      resetSelection();
      dispatch(fetchChecks({ page: 1, limit: 100 }));
    } catch {
      setSnackbar({ open: true, message: 'Bulk delete failed', severity: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkPause = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkBusy(true);
      await Promise.all(selectedIds.map((id) => dispatch(pauseCheck(id)).unwrap().catch(() => null)));
      setSnackbar({ open: true, message: `Paused ${selectedIds.length} checks`, severity: 'success' });
      resetSelection();
    } catch {
      setSnackbar({ open: true, message: 'Bulk pause encountered errors', severity: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkResume = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkBusy(true);
      await Promise.all(selectedIds.map((id) => dispatch(resumeCheck(id)).unwrap().catch(() => null)));
      setSnackbar({ open: true, message: `Resumed ${selectedIds.length} checks`, severity: 'success' });
      resetSelection();
    } catch {
      setSnackbar({ open: true, message: 'Bulk resume encountered errors', severity: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, checkId: string) => {
    setAnchorEl(event.currentTarget);
    setSelectedCheck(checkId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedCheck(null);
  };

  const handleExecuteCheck = async (checkId: string) => {
    try {
      await dispatch(executeCheck(checkId)).unwrap();
      dispatch(addNotification({ type: 'success', title: 'Execution', message: 'Check executed successfully' }));
    } catch (error) {
      dispatch(addNotification({ type: 'error', title: 'Execution', message: 'Failed to execute check' }));
    }
    handleMenuClose();
  };

  const handleDeleteCheck = async () => {
    if (!selectedCheck) return;
    
    try {
      await dispatch(deleteCheck(selectedCheck)).unwrap();
      dispatch(addNotification({ type: 'success', title: 'Delete', message: 'Check deleted successfully' }));
    } catch (error) {
      dispatch(addNotification({ type: 'error', title: 'Delete', message: 'Failed to delete check' }));
    }
    
    setDeleteDialogOpen(false);
    handleMenuClose();
  };

  const handlePauseCheck = async (checkId: string) => {
    try {
      await dispatch(pauseCheck(checkId)).unwrap();
      dispatch(addNotification({ type: 'success', title: 'Schedule', message: 'Check paused successfully' }));
    } catch (error) {
      dispatch(addNotification({ type: 'error', title: 'Schedule', message: 'Failed to pause check' }));
    }
    handleMenuClose();
  };

  const handleResumeCheck = async (checkId: string) => {
    try {
      await dispatch(resumeCheck(checkId)).unwrap();
      dispatch(addNotification({ type: 'success', title: 'Schedule', message: 'Check resumed successfully' }));
    } catch (error) {
      dispatch(addNotification({ type: 'error', title: 'Schedule', message: 'Failed to resume check' }));
    }
    handleMenuClose();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASSING': return <CheckCircle sx={{ color: theme.palette.success.main }} />;
      case 'FAILING': return <Error sx={{ color: theme.palette.error.main }} />;
      case 'WARNING': return <Warning sx={{ color: theme.palette.warning.main }} />;
      case 'PENDING': return <Schedule sx={{ color: theme.palette.info.main }} />;
      default: return <Schedule sx={{ color: theme.palette.grey[500] }} />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'HTTP': return <Api />;
      case 'TCP': return <Storage />;
      case 'SPLUNK': return <AutoGraph />;
      case 'GRAFANA': return <AutoGraph />;
      case 'ITRS': return <Security />;
      case 'APPDYNAMICS': return <BugReport />;
      case 'UI_TEST': return <Science />;
      default: return <Api />;
    }
  };

  const getStatusChip = (status: string) => {
    const configs = {
      PASSING: { color: 'success' as const, label: 'Passing' },
      FAILING: { color: 'error' as const, label: 'Failing' },
      WARNING: { color: 'warning' as const, label: 'Warning' },
      PENDING: { color: 'info' as const, label: 'Pending' },
      UNKNOWN: { color: 'default' as const, label: 'Unknown' },
    };
    const config = configs[status as keyof typeof configs] || configs.UNKNOWN;
    return <Chip label={config.label} color={config.color} size="small" />;
  };

  if (error) {
    return (
      <ErrorState message={`Error loading checks: ${error}`} onRetry={() => dispatch(fetchChecks({ page: 1, limit: 100 }))} />
    );
  }

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checklist sx={{ fontSize: 32, color: 'primary.main' }} />
            All Checks
          </Typography>
          <Typography variant="body2" color="text.secondary">
            View and manage all health checks across your systems
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate('/checks/create')}
            size="large"
          >
            Create Check
          </Button>
        </Stack>
      </Stack>

      {/* Global search context indicator */}
      {(searchContext.csiId || searchContext.environment || searchContext.tags.length > 0) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Global filters active:</Typography>
            {searchContext.csiId && <Chip label={`CSI: ${searchContext.csiId}`} size="small" />}
            {searchContext.environment && <Chip label={`Env: ${searchContext.environment}`} size="small" />}
            {searchContext.tags.length > 0 && <Chip label={`Tags: ${searchContext.tags.length}`} size="small" />}
          </Stack>
        </Alert>
      )}

      {/* Search and quick controls */}
      <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, mb: 3 }}>
        <CardContent>
          <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Search checks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label="Status"
                >
                  <MenuItem value="">All Status</MenuItem>
                  <MenuItem value="PASSING">Passing</MenuItem>
                  <MenuItem value="FAILING">Failing</MenuItem>
                  <MenuItem value="WARNING">Warning</MenuItem>
                  <MenuItem value="PENDING">Pending</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  label="Type"
                >
                  <MenuItem value="">All Types</MenuItem>
                  <MenuItem value="HTTP">HTTP</MenuItem>
                  <MenuItem value="TCP">TCP</MenuItem>
                  <MenuItem value="SPLUNK">Splunk</MenuItem>
                  <MenuItem value="GRAFANA">Grafana</MenuItem>
                  <MenuItem value="ITRS">ITRS</MenuItem>
                  <MenuItem value="APPDYNAMICS">AppDynamics</MenuItem>
                  <MenuItem value="UI_TEST">UI Test</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  startIcon={<FilterList />}
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                    setTypeFilter('');
                  }}
                >
                  Clear Filters
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Bulk actions toolbar */}
      {selectedIds.length > 0 && (
        <Paper elevation={0} sx={{ mb: 2, border: `1px solid ${theme.palette.divider}` }}>
          <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">{selectedIds.length} selected</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={handleBulkExecute} disabled={bulkBusy}>Execute</Button>
              <Button size="small" variant="outlined" onClick={handleBulkPause} disabled={bulkBusy}>Pause</Button>
              <Button size="small" variant="outlined" onClick={handleBulkResume} disabled={bulkBusy}>Resume</Button>
              <Button size="small" color="error" variant="contained" onClick={handleBulkDelete} disabled={bulkBusy}>Delete</Button>
              <Button size="small" onClick={resetSelection} disabled={bulkBusy}>Clear</Button>
            </Stack>
          </Toolbar>
        </Paper>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={3} lg={3}>
          <FiltersRail />
        </Grid>
        <Grid item xs={12} md={9} lg={9}>
          {/* Results Summary */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Showing {paginatedChecks.length} of {filteredChecks.length} checks
            {searchContext.csiId && ` (CSI: ${searchContext.csiId})`}
            {searchContext.environment && ` (Env: ${searchContext.environment})`}
            {searchContext.tags.length > 0 && ` (${searchContext.tags.length} global tag filters)`}
            {selectedCSI && ' (Local CSI scope active)'}
            {selectedTags.length > 0 && ` (${selectedTags.length} local tag filters)`}
          </Typography>

          {/* Checks Table */}
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
        {loading === 'loading' && <LinearProgress />}
        
        <TableContainer>
          <Table size="small">
            <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={!allVisibleSelected && someVisibleSelected}
                      checked={allVisibleSelected}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      inputProps={{ 'aria-label': 'select all visible checks' }}
                    />
                  </TableCell>
                <TableCell>Check Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Last Execution</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading === 'loading' ? null : paginatedChecks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <EmptyState title="No checks match the current filters" description="Try clearing filters or create a new check." actionLabel="Create Check" onAction={() => navigate('/checks/create')} />
                  </TableCell>
                </TableRow>
              )}
              {paginatedChecks.map((check) => (
                <TableRow key={check.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedIds.includes(check.id)}
                      onChange={() => toggleRow(check.id)}
                      inputProps={{ 'aria-label': `select ${check.name}` }}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack>
                      <Typography
                        component={RouterLink}
                        to={`/checks/details/${check.id}`}
                        variant="subtitle2"
                        fontWeight={600}
                        sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {check.name}
                      </Typography>
                      {check.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                          {check.description}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      {getTypeIcon(check.type)}
                      <Typography variant="body2">{check.type}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {getStatusChip(check.status)}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    <Typography variant="body2">
                      {check.lastExecution 
                        ? new Date(check.lastExecution).toLocaleString()
                        : 'Never'
                      }
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="small"
                        onClick={() => handleExecuteCheck(check.id)}
                        title="Execute Now"
                        disabled={executingChecks.includes(check.id)}
                      >
                        {executingChecks.includes(check.id) ? (
                          <CircularProgress size={16} />
                        ) : (
                          <PlayArrow />
                        )}
                      </IconButton>
                      {/* Stop/Start schedule icon hidden per request */}
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, check.id)}
                      >
                        <MoreVert />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

            <TablePagination
              component="div"
              count={filteredChecks.length}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </Card>
        </Grid>
      </Grid>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          if (selectedCheck) navigate(`/checks/edit/${selectedCheck}`);
          handleMenuClose();
        }}>
          <Edit sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={(e) => {
          lastFocusRef.current = (e.currentTarget as HTMLElement) || (document.activeElement as HTMLElement | null);
          setScheduleDialogOpen(true);
          setAnchorEl(null);
        }}>
          <Schedule sx={{ mr: 1 }} />
          Manage Schedule
        </MenuItem>
        <MenuItem onClick={() => {
          setDeleteDialogOpen(true);
          handleMenuClose();
        }}>
          <Delete sx={{ mr: 1, color: 'error.main' }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Check</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this check? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteCheck} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Schedule Dialog */}
      <ScheduleDialog
        open={scheduleDialogOpen}
        onClose={() => {
          setScheduleDialogOpen(false);
          setSelectedCheck(null);
        }}
        check={selectedCheck ? checks?.find(c => c.id === selectedCheck) || null : null}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AllChecksPage;
'@
}

# File 51: src/pages/AllChecksPage/FiltersRail.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/AllChecksPage/FiltersRail.tsx'
  SizeBytes    = 3965
  Sha256       = '97674d95f11f258b9948bed4b263c6538b8cad336d049dc6814d46c9f9e7dfd5'
  Content      = @'
import React, { useEffect } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Divider,
  Chip,
  Skeleton,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import { setSelectedTags, setTagFilterMode, fetchTags } from '@/store/slices/csiSlice';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { Search } from '@mui/icons-material';

/**
 * Visual skeleton rail for faceted filters (status, type, tags summary).
 * Non-functional for now; for layout validation only.
 */
const FiltersRail: React.FC = () => {
  const dispatch = useAppDispatch();
  const { tags } = useAppSelector((s) => s.csi);

  useEffect(() => {
    dispatch(fetchTags());
  }, [dispatch]);

  return (
    <Paper sx={{ p: 2, border: (t) => `1px solid ${t.palette.divider}` }}>
      <Stack spacing={2}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Filters
        </Typography>
        <Divider />

        <Box>
          <Typography variant="caption" color="text.secondary">
            Tag Filter Mode
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {(['AND', 'OR'] as const).map((mode) => (
              <Chip
                key={mode}
                label={mode}
                size="small"
                variant={tags.filterMode === mode ? 'filled' : 'outlined'}
                onClick={() => dispatch(setTagFilterMode(mode))}
              />
            ))}
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Typography variant="caption" color="text.secondary">
            Selected Tags
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {tags.selected.map((tag) => (
              <Chip key={tag} label={tag} size="small" onDelete={() => dispatch(setSelectedTags(tags.selected.filter((t) => t !== tag)))} />
            ))}
            {tags.selected.length === 0 && (
              <Typography variant="caption" color="text.secondary">None</Typography>
            )}
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Typography variant="caption" color="text.secondary">
            Available Tags
          </Typography>
          <TextField
            placeholder="Search tags"
            size="small"
            fullWidth
            sx={{ mt: 1 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            onChange={(e) => {
              const q = e.target.value.toLowerCase();
              const filtered = (tags as any).available.filter((t: string) => t.toLowerCase().includes(q));
              // Store filtered list transiently on state object for render (prototype-only)
              (tags as any).filtered = filtered;
            }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', maxHeight: 220, overflowY: 'auto' }}>
            {tags.loading ? (
              [...Array(6)].map((_, i) => <Skeleton variant="rounded" height={20} width={120} key={i} />)
            ) : (
              ((tags as any).filtered || tags.available).slice(0, 30).map((tag: string) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant={tags.selected.includes(tag) ? 'filled' : 'outlined'}
                  onClick={() => {
                    const selected = tags.selected.includes(tag)
                      ? tags.selected.filter((t) => t !== tag)
                      : [...tags.selected, tag];
                    dispatch(setSelectedTags(selected));
                  }}
                />
              ))
            )}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
};

export default FiltersRail;










'@
}

# File 52: src/pages/AllChecksPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/AllChecksPage/index.ts'
  SizeBytes    = 42
  Sha256       = '7fcb7c7961d01724b15d7a19e2cb7a7de4b5479f21bc5f9b927836c771a6f4d9'
  Content      = @'
export { default } from './AllChecksPage';
'@
}

# File 53: src/pages/CheckDetailsPage/CheckDetailsPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/CheckDetailsPage/CheckDetailsPage.tsx'
  SizeBytes    = 18312
  Sha256       = '461e57fb33f6847a84f845838308785040f3aa6472a3eff618524783e7882b41'
  Content      = @'
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardHeader,
  CardContent,
  Stack,
  Chip,
  Divider,
  Button,
  Skeleton,
  ChipProps,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  IconButton,
  Grid,
  Snackbar,
  Alert,
} from '@mui/material';
import { PlayArrow, Schedule, Edit, OpenInNew, RemoveRedEye } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchCheckById, executeCheck } from '@/store/slices/checksSlice';
import { checksApi } from '@/services/api/checksApi';
import type { ExecutionResult } from '@/types/checks/checkTypes';
import ScheduleDialog from '@components/scheduling/ScheduleDialog';

const CheckDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [history, setHistory] = useState<ExecutionResult[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [viewRunOpen, setViewRunOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<ExecutionResult | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const { data: checks, loading, error, executingChecks, executionResults } = useAppSelector((s) => s.checks);
  const check = useMemo(() => checks.find((c) => c.id === id), [checks, id]);
  const isExecuting = !!(id && executingChecks.includes(id));
  const lastExec = id ? executionResults[id] : undefined;

  useEffect(() => {
    if (!id) return;
    // Ensure check is loaded
    if (!check) {
      dispatch(fetchCheckById(id));
    }
  }, [id, check, dispatch]);

  useEffect(() => {
    if (!id) return;
    // Load execution history locally (prototype)
    let cancelled = false;
    (async () => {
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        const res = await checksApi.getCheckExecutions(id, 15);
        if (!cancelled) setHistory(res.data || []);
      } catch (e: any) {
        if (!cancelled) setHistoryError(e?.message || 'Failed to load history');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const statusChipColor: ChipProps['color'] = useMemo(() => {
    switch (check?.status) {
      case 'PASSING': return 'success';
      case 'WARNING': return 'warning';
      case 'FAILING': return 'error';
      case 'PENDING': return 'default';
      default: return 'default';
    }
  }, [check?.status]);

  const onExecute = async () => {
    if (!id) return;
    try {
      await dispatch(executeCheck(id)).unwrap();
      const result = executionResults[id];
      setSnack({ open: true, message: result ? `Executed: ${result.status} in ${Math.round(result.duration)} ms` : 'Execution completed', severity: 'success' });
    } catch {
      setSnack({ open: true, message: 'Execution failed', severity: 'error' });
    }
  };

  return (
    <Box>
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack spacing={0.5}>
              <Typography variant="h4">Check Details</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                {check ? <Chip label={check.status} color={statusChipColor} size="small" /> : <Skeleton width={80} />}
                {check && <Chip label={`Type: ${check.type}`} size="small" />}
                {check && <Chip label={`CSI: ${check.csiName}`} size="small" />}
              </Stack>
              {check && check.tags && check.tags.length > 0 && (
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1, rowGap: 0.5 }}>
                  {check.tags.slice(0, 10).map((t) => (
                    <Chip key={t} label={t} size="small" />
                  ))}
                </Stack>
              )}
              <Stack direction="row" spacing={2}>
                <Typography variant="caption" color="text.secondary">Last run: {lastExec ? new Date(lastExec.endTime).toLocaleString() : '—'}</Typography>
                <Typography variant="caption" color="text.secondary">Avg duration: {history && history.length ? `${Math.round(history.reduce((a,c)=>a+(c.duration||0),0)/(history.length))/1} ms` : '—'}</Typography>
              </Stack>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<Schedule />} onClick={() => setScheduleOpen(true)}>
                Manage Schedule
              </Button>
              <Button variant="contained" color="success" startIcon={<PlayArrow />} onClick={onExecute} disabled={!id || isExecuting}>
                {isExecuting ? 'Executing…' : 'Execute Now'}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardHeader title="Overview" />
              <CardContent>
                {!check || loading === 'loading' ? (
                  <Skeleton variant="rounded" height={140} />
                ) : (
                  <>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Last Execution</Typography>
                        {lastExec ? (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Status: {lastExec.status}</Typography>
                            <Typography variant="body2">Duration: {Math.round(lastExec.duration)} ms</Typography>
                            <Typography variant="body2">Ended: {new Date(lastExec.endTime).toLocaleString()}</Typography>
                            {lastExec.error && <Typography variant="body2" color="error.main">Error: {lastExec.error}</Typography>}
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary">No recent execution</Typography>
                        )}
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Configuration Snapshot</Typography>
                        {check.type === 'HTTP' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Method: {check.configuration?.method || 'GET'}</Typography>
                            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>URL: {check.configuration?.url || '—'}</Typography>
                            <Typography variant="body2">Expected Status: {check.configuration?.expectedStatus ?? '—'}</Typography>
                            {check.configuration?.timeout && <Typography variant="body2">Timeout: {check.configuration.timeout} ms</Typography>}
                          </Stack>
                        )}
                        {check.type === 'TCP' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Host: {check.configuration?.host || '—'}</Typography>
                            <Typography variant="body2">Port: {check.configuration?.port ?? '—'}</Typography>
                          </Stack>
                        )}
                        {check.type === 'SPLUNK' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Time Range: {check.configuration?.timeRange || 'last 15m'}</Typography>
                            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>Query: {check.configuration?.query || '—'}</Typography>
                            {check.configuration?.threshold && <Typography variant="body2">Threshold: {check.configuration.threshold.operator} {String(check.configuration.threshold.value)}</Typography>}
                          </Stack>
                        )}
                        {check.type === 'GRAFANA' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Datasource: {check.configuration?.datasource || '—'}</Typography>
                            <Typography variant="body2">Window: {check.configuration?.duration || '—'}</Typography>
                          </Stack>
                        )}
                        {check.type === 'ITRS' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Gateway: {check.configuration?.gateway || '—'}</Typography>
                            <Typography variant="body2">Sampler: {check.configuration?.sampler || '—'}</Typography>
                            <Typography variant="body2">Data Item: {check.configuration?.dataitem || '—'}</Typography>
                            {check.configuration?.expectedValue && <Typography variant="body2">Expected: {check.configuration.expectedValue}</Typography>}
                          </Stack>
                        )}
                        {check.type === 'APPDYNAMICS' && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Application: {check.configuration?.application || '—'}</Typography>
                            <Typography variant="body2">Health Rule: {check.configuration?.healthRule || '—'}</Typography>
                            {check.configuration?.tier && <Typography variant="body2">Tier: {check.configuration.tier}</Typography>}
                          </Stack>
                        )}
                        {check.type === 'UI_TEST' && check.configuration?.uiTest && (
                          <Stack spacing={0.5}>
                            <Typography variant="body2">Studio Test: {check.configuration.uiTest.testId}</Typography>
                            {check.configuration.uiTest.variables && (
                              <Typography variant="body2" color="text.secondary">Vars: {Object.keys(check.configuration.uiTest.variables).length}</Typography>
                            )}
                            {check.configuration.uiTest.overrides?.browser && (
                              <Typography variant="body2">Browser: {check.configuration.uiTest.overrides.browser}</Typography>
                            )}
                            {check.configuration.uiTest.overrides?.viewport && (
                              <Typography variant="body2">Viewport: {check.configuration.uiTest.overrides.viewport.width}×{check.configuration.uiTest.overrides.viewport.height}</Typography>
                            )}
                          </Stack>
                        )}
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Schedule</Typography>
                        <Typography variant="body2">Enabled: {check.schedule.enabled ? 'Yes' : 'No'}</Typography>
                        {'frequency' in (check.schedule || {}) && (
                          <Typography variant="body2">Frequency: {check.schedule.frequency}</Typography>
                        )}
                        {'cron' in (check.schedule || {}) && check.schedule.cron && (
                          <Typography variant="body2">Cron: {check.schedule.cron}</Typography>
                        )}
                        <Typography variant="body2">Next: {check.nextExecution ? new Date(check.nextExecution).toLocaleString() : '—'}</Typography>
                      </Box>
                    </Stack>
                  </>
                )}
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardHeader title="Recent Runs" />
              <CardContent>
                {historyLoading && (
                  [...Array(5)].map((_, i) => (
                    <Skeleton key={i} variant="rounded" height={36} sx={{ mb: 1 }} />
                  ))
                )}
                {historyError && (
                  <Typography variant="body2" color="error.main">{historyError}</Typography>
                )}
                {history && history.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Ended</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Duration</TableCell>
                          <TableCell>Summary</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {history.map((h) => (
                          <TableRow key={h.id} hover>
                            <TableCell>{new Date(h.endTime).toLocaleString()}</TableCell>
                            <TableCell>{h.status}</TableCell>
                            <TableCell>{Math.round(h.duration)} ms</TableCell>
                            <TableCell>{h.output}</TableCell>
                            <TableCell align="right">
                              <Button size="small" onClick={() => { setSelectedRun(h); setViewRunOpen(true); }}>View output</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (!historyLoading && !historyError) ? (
                  <Typography variant="body2" color="text.secondary">No runs yet. Execute to generate a baseline.</Typography>
                ) : null}
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card variant="outlined" sx={{ position: 'sticky', top: 88 }}>
            <CardHeader title="Live Output" />
            <CardContent>
              {isExecuting ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    maxHeight: 420,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    bgcolor: '#0B0F14',
                    color: '#E5E7EB',
                    borderColor: '#1F2937',
                  }}
                >
                  Starting...
                </Paper>
              ) : lastExec ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    maxHeight: 420,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    bgcolor: '#0B0F14',
                    color: '#E5E7EB',
                    borderColor: '#1F2937',
                  }}
                >
                  {lastExec.output || 'No output.'}
                </Paper>
              ) : (
                <Typography variant="body2" color="text.secondary">No recent output.</Typography>
              )}
              {lastExec && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" onClick={async () => { try { await navigator.clipboard.writeText(lastExec.output || ''); setSnack({ open: true, message: 'Output copied', severity: 'success' }); } catch {} }}>Copy output</Button>
                  <Button size="small" onClick={() => { const w = window.open('', '_blank'); if (w) w.document.write(`<pre style='white-space:pre-wrap;font-family:ui-sans-serif,system-ui,Arial,sans-serif;padding:16px;'>${(lastExec.output || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`); }}>Open in window</Button>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={viewRunOpen} onClose={() => setViewRunOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Execution Output</DialogTitle>
        <DialogContent dividers>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              maxHeight: 520,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              bgcolor: '#0B0F14',
              color: '#E5E7EB',
              borderColor: '#1F2937',
            }}
          >
            {selectedRun?.output || 'No output'}
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewRunOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} check={check || null} />
      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} sx={{ width: '100%' }} variant="filled">
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CheckDetailsPage;
'@
}

# File 54: src/pages/CheckDetailsPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/CheckDetailsPage/index.ts'
  SizeBytes    = 45
  Sha256       = 'a4e29bc087156e9a8a7d7baaa36caf409c9f1577e0ff6456183f052243c1752f'
  Content      = @'
export { default } from './CheckDetailsPage';
'@
}

# File 55: src/pages/ChecksStudioPage/ChecksStudioPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/ChecksStudioPage/ChecksStudioPage.tsx'
  SizeBytes    = 51591
  Sha256       = '423acd8ac391a760ecbdabc01e903f2c66bc396129742ef9b35a7602bebef8af'
  Content      = @'
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  IconButton,
  TextField,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  Stack,
  LinearProgress,
  Alert,
  AlertTitle,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Tooltip,
  Badge,
  useTheme,
  alpha,
  CircularProgress,
  GlobalStyles,
  Snackbar,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Skeleton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Pause,
  Add,
  Delete,
  Edit,
  Science,
  VideoLibrary,
  Code,
  CheckCircle,
  Error,
  Warning,
  Timer,
  Visibility,
  VisibilityOff,
  Save,
  Share,
  Download,
  Upload,
  Settings,
  BugReport,
  Speed,
  Memory,
  WebAsset,
  Mouse,
  Keyboard,
  TouchApp,
  CameraAlt,
  Schedule,
  AutoMode,
  ListAlt,
  PlaylistAdd,
  Clear,
  Refresh,
  ExpandMore,
  KeyboardArrowUp,
  KeyboardArrowDown,
  HelpOutline,
} from '@mui/icons-material';
import CodeTab from '@/components/studio/CodeTab';
import OnboardingCoach from '@/components/studio/OnboardingCoach';
import { useDispatch } from 'react-redux';
import { useAppSelector } from '@/store';
import { setAutoSyncCode, setGeneratedCode, setTestIR, setExecutionLogs, setAllStepResults, setExecuting, setCurrentStep as setCurrentStepAction, setVideoUrl as setVideoUrlAction, clearLogs, updateConfiguration } from '@store/slices/studioSlice';
import { buildDefaultTestIR } from '@/utils/studio/ir/parseSteps';
import { generatePythonFromIR } from '@/utils/studio/codegen/pythonGenerator';
import studioApi from '@/services/api/studioApi';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SecretInput from '@/components/studio/SecretInput';

type Scenario = {
  id: string;
  name: string;
  description: string;
  csiId: string;
  steps: string[];
  status: 'draft' | 'active' | 'archived' | string;
  createdAt?: string;
  updatedAt?: string;
  configuration?: any;
};

const ChecksStudioPage: React.FC = () => {
  const theme = useTheme();
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [scenariosLoading, setScenariosLoading] = useState<boolean>(true);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const isRunning = useAppSelector((s: any) => s.studio.isExecuting);
  const currentStep = Math.max(0, useAppSelector((s: any) => s.studio.currentStep));
  const [testSteps, setTestSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState('');
  const [showNewScenarioDialog, setShowNewScenarioDialog] = useState(false);
  const reduxLogs = useAppSelector((s: any) => s.studio.executionLogs);
  const executionLogs = useMemo(() => (reduxLogs || []).map((l: any) => ({
    timestamp: new Date(l.timestamp).toLocaleTimeString(),
    message: l.message,
    type: l.level === 'error' ? 'error' : 'info',
  })), [reduxLogs]);
  const showVideoPlayer = !!useAppSelector((s: any) => s.studio.videoUrl);
  const videoUrl = useAppSelector((s: any) => s.studio.videoUrl);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stepResultsArr = useAppSelector((s: any) => s.studio.stepResults) as Array<{ stepIndex: number; status: 'pending' | 'running' | 'pass' | 'fail' }>;
  const stepResultsMap = useMemo(() => {
    const map: Record<number, 'passed' | 'failed' | 'pending'> = {};
    (stepResultsArr || []).forEach((r) => {
      map[r.stepIndex] = r.status === 'pass' ? 'passed' : r.status === 'fail' ? 'failed' : 'pending';
    });
    return map;
  }, [stepResultsArr]);
  const [isSaving, setIsSaving] = useState(false);
  const [autosave, setAutosave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveSnack, setSaveSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [helpOpen, setHelpOpen] = useState(false);
  // Removed legacy interval-based simulator in favor of API polling
  const [validation,
    setValidation] = useState<{ results: Array<{ stepIndex: number; isValid: boolean; suggestion: string | null }>; isValid: boolean; loading: boolean; error?: string }>
    ({ results: [], isValid: true, loading: false });
  const config = useAppSelector((s: any) => s.studio.testConfiguration);
  const [variablesList, setVariablesList] = useState<Array<{ id: string; name: string; type: 'plain' | 'secret'; value?: string; secretId?: string }>>([]);
  const [rightTab, setRightTab] = useState(0);
  const [coachStep, setCoachStep] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('studio:coachStep');
      return saved ? Number(saved) : 0;
    } catch { return 0; }
  });
  const [forceCoach, setForceCoach] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);

  // Subtle auto-advance for onboarding
  useEffect(() => {
    if (!forceCoach && coachStep === 0 && testSteps.length > 0) setCoachStep(1);
  }, [forceCoach, coachStep, testSteps.length]);
  useEffect(() => {
    if (coachStep === 1 && isRunning) setCoachStep(2);
  }, [coachStep, isRunning]);
  useEffect(() => {
    if (coachStep === 2 && !isRunning && (stepResultsArr || []).length > 0) setCoachStep(99);
  }, [coachStep, isRunning, stepResultsArr]);
  const [newScenarioForm, setNewScenarioForm] = useState({
    name: '',
    environment: 'Development',
    csiId: '',
    description: ''
  });
  
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const selectedScenarioData = scenarios?.find(s => s.id === selectedScenario) || null;
  const dispatch = useDispatch();
  const { generatedCode, autoSyncCode } = useAppSelector((s: any) => s.studio);
  
  // Calculate metrics (simple derived)
  const totalScenarios = scenarios?.length || 0;
  const passedScenarios = 0;
  const failedScenarios = 0;
  const successRate = totalScenarios ? Math.round((passedScenarios / totalScenarios) * 100) : 0;

  // Load scenarios from API (MSW-backed)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setScenariosLoading(true);
      setScenariosError(null);
      try {
        const res = (await studioApi.listTests()) as any;
        if (!mounted) return;
        const list = res.data || res;
        setScenarios(list);
        const urlId = params.id;
        const query = new URLSearchParams(location.search);
        const autorun = query.get('autorun') === '1';
        let chosen = list?.[0];
        if (urlId) {
          const byId = list?.find((t: any) => t.id === urlId);
          if (byId) chosen = byId;
        }
        if (chosen) {
          setSelectedScenario(chosen.id);
          setTestSteps(chosen.steps || []);
          if (autorun) {
            // Delay a moment to allow state to settle
            setTimeout(() => handleRunTest(), 300);
          }
        }
      } catch (e: any) {
        if (!mounted) return;
        setScenariosError(e?.message || 'Failed to load scenarios');
      } finally {
        if (mounted) setScenariosLoading(false);
      }
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadScenarios = useCallback(async () => {
    setScenariosLoading(true);
    setScenariosError(null);
    try {
      const res = (await studioApi.listTests()) as any;
      const list = res.data || res;
      setScenarios(list);
    } catch (e: any) {
      setScenariosError(e?.message || 'Failed to load scenarios');
    } finally {
      setScenariosLoading(false);
    }
  }, []);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentExecutionIdRef = useRef<string | null>(null);
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const handleRunTest = useCallback(async () => {
    if (!validation.isValid || testSteps.length === 0 || !selectedScenarioData?.id) return;
    try {
      dispatch(setExecuting(true));
      dispatch(setCurrentStepAction(0));
      dispatch(setVideoUrlAction(null as any));
      dispatch(clearLogs());
      dispatch(setExecutionLogs([{ timestamp: new Date().toISOString(), level: 'info', message: 'Starting UI test execution' } as any]));
      const start = await studioApi.executeTest(selectedScenarioData.id);
      currentExecutionIdRef.current = start.executionId;
      // start polling
      stopPolling();
      pollingRef.current = setInterval(async () => {
        try {
          const exec = (await studioApi.getExecution(currentExecutionIdRef.current as string)) as any;
          if (Array.isArray(exec.stepResults)) {
            dispatch(setAllStepResults(exec.stepResults.map((r: any) => ({ stepIndex: r.stepIndex, status: r.status }))));
          }
          const runningIndex = exec.stepResults?.findIndex((r: any) => r.status === 'running') ?? -1;
          const passedCount = exec.stepResults?.filter((r: any) => r.status === 'pass').length ?? 0;
          dispatch(setCurrentStepAction(runningIndex >= 0 ? runningIndex : Math.max(0, passedCount - 1)));
          // logs
          if (Array.isArray(exec.logs)) {
            dispatch(setExecutionLogs(exec.logs as any));
          }
          if (exec.videoUrl) {
            dispatch(setVideoUrlAction(exec.videoUrl));
          }
          if (exec.status === 'completed' || exec.status === 'failed' || exec.status === 'timeout') {
            dispatch(setExecuting(false));
            stopPolling();
          }
        } catch (e) {
          // stop on polling error
          dispatch(setExecuting(false));
          stopPolling();
        }
      }, 700);
    } catch (e: any) {
      dispatch(setExecuting(false));
      dispatch(setExecutionLogs([{ timestamp: new Date().toISOString(), level: 'error', message: e?.message || 'Failed to start execution' } as any]));
    }
  }, [validation.isValid, testSteps.length, selectedScenarioData, stopPolling, dispatch]);

  // Generate Python code when steps change (autoSync)
  useEffect(() => {
    if (!autoSyncCode) return;
    // Guard: avoid regenerating during scenario switch before steps settle
    const timeout = setTimeout(() => {
      const ir = buildDefaultTestIR(selectedScenarioData?.name || 'Untitled Test', testSteps);
      ir.variables = variablesList.map((v) => (
        v.type === 'plain'
          ? { name: v.name, value: { kind: 'plain', value: v.value || '' } }
          : v.secretId
          ? { name: v.name, value: { kind: 'secret', ref: { id: v.secretId, label: v.name, scope: 'project', createdAt: new Date().toISOString() } } }
          : { name: v.name, value: { kind: 'plain', value: '' } }
      )) as any;
      dispatch(setTestIR(ir));
      dispatch(setGeneratedCode(generatePythonFromIR(ir)));
    }, 50);
    return () => clearTimeout(timeout);
  }, [testSteps, autoSyncCode, selectedScenarioData?.name, variablesList, dispatch]);

  // Hydrate steps from localStorage (once)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('studio:steps');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every((s: any) => typeof s === 'string')) {
          // Avoid redundant state updates
          if (JSON.stringify(parsed) !== JSON.stringify(testSteps)) {
            setTestSteps(parsed as string[]);
          }
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist steps to localStorage
  useEffect(() => {
    localStorage.setItem('studio:steps', JSON.stringify(testSteps));
  }, [testSteps]);
  useEffect(() => {
    try { localStorage.setItem('studio:coachStep', String(coachStep)); } catch {}
  }, [coachStep]);

  // Debounced validation on steps change
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        setValidation((v) => ({ ...v, loading: true, error: undefined }));
        const res = await studioApi.validateSteps(testSteps);
        if (!cancelled) setValidation({ results: res.results, isValid: res.isValid, loading: false });
      } catch (err: any) {
        if (!cancelled) setValidation({ results: [], isValid: false, loading: false, error: err?.message || 'Validation failed' });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [testSteps]);

  const handleScenarioSelect = (scenarioId: string) => {
    stopPolling();
    dispatch(setExecuting(false));
    setSelectedScenario(scenarioId);
    const scenario = scenarios?.find(s => s.id === scenarioId);
    if (scenario) {
      setTestSteps(scenario.steps || []);
      dispatch(setVideoUrlAction(null as any));
      dispatch(setCurrentStepAction(0));
      dispatch(setAllStepResults([] as any));
      dispatch(clearLogs());
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle sx={{ fontSize: 14 }} />;
      case 'running':
        return <CircularProgress size={14} />;
      case 'failed':
        return <Error sx={{ fontSize: 14 }} />;
      default:
        return <Schedule sx={{ fontSize: 14 }} />;
    }
  };

  const handleStepClick = (stepIndex: number) => {
    if (showVideoPlayer && !isRunning) {
      // Simulate jumping to step timestamp in video
      const t = stepIndex * 10;
      setVideoCurrentTime(t);
      try { videoRef.current && (videoRef.current.currentTime = t); } catch {}
      dispatch(setCurrentStepAction(stepIndex));
    }
  };

  const handleCreateNewScenario = async () => {
    try {
      const ir = buildDefaultTestIR(newScenarioForm.name || 'Untitled Test', []);
      const created = await studioApi.createTest({ ...ir, name: newScenarioForm.name, csiId: newScenarioForm.csiId, meta: { ...ir.meta, description: newScenarioForm.description }, environment: newScenarioForm.environment });
      setSaveSnack({ open: true, message: 'Scenario created', severity: 'success' });
      setShowNewScenarioDialog(false);
      setNewScenarioForm({ name: '', environment: 'Development', csiId: '', description: '' });
      // reload and select new scenario if id present
      await reloadScenarios();
      if ((created as any).id) {
        setSelectedScenario((created as any).id);
        setTestSteps((created as any).steps || []);
      }
    } catch (e: any) {
      setSaveSnack({ open: true, message: e?.message || 'Failed to create scenario', severity: 'error' });
    }
  };

  const addTestStep = () => {
    if (newStep.trim()) {
      // Stop any ongoing polling before mutating steps
      stopPolling();
      dispatch(setExecuting(false));
      setTestSteps(prev => [...prev, newStep]);
      setNewStep('');
    }
  };

  const removeTestStep = (index: number) => {
    stopPolling();
    dispatch(setExecuting(false));
    setTestSteps(prev => prev.filter((_, i) => i !== index));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'info';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box>
      {/* Enhanced Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Avatar sx={{ bgcolor: 'success.main', width: 48, height: 48 }}>
                <Science sx={{ fontSize: 28 }} />
              </Avatar>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  Checks Studio
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Scope-aware UI tests. Your current CSI/tag scope is applied across the module.
                </Typography>
              </Box>
            </Box>
          </Box>
          <Stack direction="row" spacing={2}>
            {/* New Scenario moved to Studio Tests page (+) */}
            
            <Button
              variant="text"
              size="small"
              onClick={() => setTemplatesOpen(true)}
            >
              Templates
            </Button>
            <Tooltip title="Show guide">
              <IconButton
                size="small"
                onClick={() => {
                  setForceCoach(true);
                  setCoachStep(0);
                  try { localStorage.removeItem('studio:coachStep'); } catch {}
                }}
                aria-label="Show guide"
              >
                <HelpOutline />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* Removed status banner per request */}
      </Box>

      {/* Two-Panel Interface (Proof as a tab in the middle panel) */}
      <Grid container spacing={3} sx={{ minHeight: '600px' }}>
        {/* Left Panel - Test Scenarios & Steps */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<ListAlt sx={{ color: 'primary.main' }} />}
              title="Steps"
              subheader="Your testing checklist"
            />
            <CardContent sx={{ flex: 1, overflow: 'auto', p: 0 }}>
              {/* Current Test Summary */}
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                {scenariosLoading ? (
                  <Typography variant="body2" color="text.secondary">Loading test…</Typography>
                ) : selectedScenarioData ? (
                  <Stack spacing={0.5}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{selectedScenarioData.name}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={selectedScenarioData.status || 'draft'} size="small" color={getStatusColor(selectedScenarioData.status || '') as any} icon={getStatusIcon(selectedScenarioData.status || '')} sx={{ fontSize: 11 }} />
                        <Button size="small" variant="text" onClick={() => { window.location.href = '/checks/studio/tests'; }}>Change…</Button>
                      </Stack>
                    </Stack>
                    {selectedScenarioData.description && (
                      <Typography variant="caption" color="text.secondary">{selectedScenarioData.description}</Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">Updated: {new Date(selectedScenarioData.updatedAt || selectedScenarioData.createdAt || Date.now()).toLocaleString()}</Typography>
                  </Stack>
                ) : (
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2">No test selected.</Typography>
                    <Button size="small" variant="contained" onClick={() => { window.location.href = '/checks/studio/tests'; }}>Open Tests</Button>
                  </Stack>
                )}
              </Box>

              {/* Test Steps */}
              <Box sx={{ p: 2 }}>
                {/* Onboarding coach - Step 0 */}
                {/* Lightweight onboarding to guide the flow */}
                {/* Persisted via localStorage */}
                {coachStep === 0 && (
                  <OnboardingCoach step={0} onNext={() => setCoachStep(1)} onDismiss={() => setCoachStep(99)} />
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Test Steps ({testSteps.length})
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button size="small" variant="outlined" onClick={() => setVariablesOpen(true)}>Variables</Button>
                    <Badge badgeContent={isRunning ? `${currentStep + 1}/${testSteps.length}` : null} color="primary">
                      <PlaylistAdd sx={{ color: 'text.secondary' }} />
                    </Badge>
                  </Stack>
                </Box>

                 {testSteps.length === 0 && !scenariosLoading && (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="body2" fontWeight={600}>Add your first step</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Examples: Go to "https://example.com" <br />• Click "Sign On" <br />• Type "&lt;var USERNAME&gt;" in the "User ID" field <br />• Wait for "Welcome" (use tokens: &lt;var NAME&gt;, &lt;secret SECRET_ID&gt;)
                    </Typography>
                  </Paper>
                )}
                  {scenariosLoading && (
                    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                      <Typography variant="body2">Loading scenarios…</Typography>
                    </Paper>
                  )}
                  {scenariosError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      <AlertTitle>Failed to load scenarios</AlertTitle>
                      {scenariosError}
                    </Alert>
                  )}

                <List dense>
                  {testSteps.map((step, index) => {
                    const stepResult = stepResultsMap[index];
                    const isCurrentStep = index === currentStep;
                    const isPastStep = index < currentStep;
                    const isClickable = showVideoPlayer && !isRunning;
                    const validationEntry = validation.results.find((r) => r.stepIndex === index);
                    const isInvalid = validationEntry ? !validationEntry.isValid : false;
                    
                    return (
                      <ListItem
                        key={index}
                        sx={{
                          border: '1px solid',
                          borderColor: isInvalid ? 'error.main' : isCurrentStep && isRunning ? 'primary.main' : 
                                       stepResult === 'passed' ? 'success.main' :
                                       stepResult === 'failed' ? 'error.main' : 'divider',
                          borderRadius: 1,
                          mb: 1,
                          bgcolor: isCurrentStep && isRunning ? alpha(theme.palette.primary.main, 0.08) : 
                                   stepResult === 'passed' ? alpha(theme.palette.success.main, 0.05) :
                                   stepResult === 'failed' ? alpha(theme.palette.error.main, 0.05) : isInvalid ? alpha(theme.palette.error.main, 0.03) : 'transparent',
                          transition: 'all 0.3s ease',
                          cursor: isClickable ? 'pointer' : 'default',
                          '&:hover': isClickable ? {
                            bgcolor: alpha(theme.palette.primary.main, 0.05),
                            boxShadow: 1
                          } : {}
                        }}
                        onClick={() => isClickable && handleStepClick(index)}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
                          <Avatar sx={{ 
                            width: 28, 
                            height: 28, 
                            fontSize: 12,
                            bgcolor: stepResult === 'passed' ? 'success.main' :
                                     stepResult === 'failed' ? 'error.main' :
                                     isCurrentStep && isRunning ? 'primary.main' : 'grey.300',
                            color: 'white'
                          }}>
                            {stepResult === 'passed' ? <CheckCircle sx={{ fontSize: 16 }} /> : 
                             stepResult === 'failed' ? <Error sx={{ fontSize: 16 }} /> :
                             isCurrentStep && isRunning ? <CircularProgress size={16} sx={{ color: 'white' }} /> :
                             index + 1}
                          </Avatar>
                        </Box>
                        <ListItemText 
                          sx={{ pr: 12 }}
                          primary={
                            <TextField
                              variant="standard"
                              fullWidth
                              value={step}
                              onChange={(e) => {
                                const next = [...testSteps];
                                next[index] = e.target.value;
                                setTestSteps(next);
                              }}
                              onBlur={() => {
                                // Optional: trigger validation/save on blur
                              }}
                              InputProps={{
                                disableUnderline: false,
                                sx: {
                                  fontSize: '0.875rem',
                                  fontWeight: isCurrentStep && isRunning ? 600 : 400,
                                  color: stepResult === 'passed' ? 'success.main' :
                                         stepResult === 'failed' ? 'error.main' : isInvalid ? 'error.main' :
                                         isCurrentStep ? 'primary.main' : 'text.primary',
                                }
                              }}
                            />
                          }
                          secondary={isInvalid ? (validationEntry?.suggestion || 'Invalid step') : isClickable ? 'Click to jump to this step in video' : undefined}
                          secondaryTypographyProps={{
                            variant: 'caption',
                            sx: { color: 'text.secondary' }
                          }}
                        />
                        <ListItemSecondaryAction>
                          <Tooltip title="Move up">
                            <span>
                              <IconButton size="small" disabled={index === 0} onClick={(e) => {
                                e.stopPropagation();
                                const next = [...testSteps];
                                const [moved] = next.splice(index, 1);
                                next.splice(index - 1, 0, moved);
                                setTestSteps(next);
                              }}>
                                <KeyboardArrowUp fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Move down">
                            <span>
                              <IconButton size="small" disabled={index === testSteps.length - 1} onClick={(e) => {
                                e.stopPropagation();
                                const next = [...testSteps];
                                const [moved] = next.splice(index, 1);
                                next.splice(index + 1, 0, moved);
                                setTestSteps(next);
                              }}>
                                <KeyboardArrowDown fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Remove step">
                            <span>
                              <IconButton 
                                size="small" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeTestStep(index);
                                }}
                                disabled={isRunning}
                              >
                                <Delete sx={{ fontSize: 16 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      </ListItem>
                    );
                  })}
                </List>

                {/* Add Step */}
                <Box sx={{ mt: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Add new test step..."
                    value={newStep}
                    onChange={(e) => setNewStep(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addTestStep()}
                    InputProps={{
                      endAdornment: (
                        <IconButton size="small" onClick={addTestStep} disabled={!newStep.trim()}>
                          <Add />
                        </IconButton>
                      )
                    }}
                  />
                  {!validation.isValid && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                      {validation.results.filter((r) => !r.isValid).length} invalid step(s). Fix before running.
                    </Typography>
                  )}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Middle Panel - Control Tower (Run, Logs, Code, Proof) */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<Settings sx={{ color: 'warning.main' }} />}
              title="Control Tower"
              subheader="Test execution & monitoring"
              action={
                <Stack direction="row" spacing={1}>
                  <Tooltip title="Reload scenarios">
                    <span>
                      <IconButton size="small" onClick={reloadScenarios} disabled={scenariosLoading} aria-label="Reload scenarios">
                        <Refresh />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              }
            />
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
              {/* Control Buttons */}
              <Box sx={{ mb: 3 }}>
                {coachStep === 1 && (
                  <OnboardingCoach step={1} onNext={() => setCoachStep(2)} onDismiss={() => setCoachStep(99)} />)
                }
                <Stack direction="row" spacing={2} justifyContent="center">
                   {null}
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={isRunning ? <Stop /> : <PlayArrow />}
                      onClick={() => {
                        if (isRunning) {
                          dispatch(setExecuting(false));
                          stopPolling();
                        } else {
                          handleRunTest();
                        }
                      }}
                    color={isRunning ? "error" : "success"}
                     disabled={testSteps.length === 0 || !validation.isValid || !selectedScenarioData?.id}
                    sx={{ minWidth: 120 }}
                  >
                    {isRunning ? 'Stop' : 'Run Test'}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Save />}
                    disabled={isRunning || isSaving}
                    onClick={async () => {
                      try {
                        setIsSaving(true);
                        const ir = buildDefaultTestIR(selectedScenarioData?.name || 'Untitled Test', testSteps);
                        await studioApi.createTest({ ...ir, name: ir.meta.name, csiId: selectedScenarioData?.csiId || 'CSI-00000' });
                        setSaveSnack({ open: true, message: 'Scenario saved', severity: 'success' });
                      } catch (e: any) {
                        setSaveSnack({ open: true, message: e?.message || 'Failed to save', severity: 'error' });
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  >
                    Save
                  </Button>
                </Stack>

                {/* Progress */}
                {isRunning && (
                  <Box sx={{ mt: 2 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={(currentStep / testSteps.length) * 100}
                      sx={{ 
                        height: 8,
                        borderRadius: 4,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 4,
                        }
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                      Step {currentStep + 1} of {testSteps.length}
                    </Typography>
                  </Box>
                )}
              </Box>

              <Divider sx={{ mb: 2 }} />

              <Tabs value={rightTab} onChange={(_, v) => setRightTab(v)} sx={{ mb: 1 }}>
                <Tab label="Logs" />
                <Tab label="Code" />
                <Tab label="Proof" />
              </Tabs>

              {/* Execution Logs */}
              <Box sx={{ flex: 1, display: rightTab === 0 ? 'block' : 'none' }}>
                {coachStep === 2 && (
                  <OnboardingCoach step={2} onNext={() => setCoachStep(99)} onDismiss={() => setCoachStep(99)} />
                )}
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Code sx={{ fontSize: 18 }} />
                  Live Execution Logs
                </Typography>
                
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    height: 480, 
                    overflow: 'auto', 
                    bgcolor: 'grey.900',
                    color: 'white',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    p: 1
                  }}
                >
                  {validation.loading && (
                    <Box sx={{ mb: 0.5, color: 'info.light' }}>Validating steps…</Box>
                  )}
                  {validation.error && (
                    <Box sx={{ mb: 0.5, color: 'error.light' }}>Validation error: {validation.error}</Box>
                  )}
                   {executionLogs.map((log: { timestamp: string; message: string; type: 'info' | 'error' | 'success' }, index: number) => (
                    <Box key={index} sx={{ mb: 0.5, display: 'flex', gap: 1 }}>
                      <Typography 
                        component="span" 
                        sx={{ 
                          color: 'grey.400',
                          minWidth: 60,
                          fontFamily: 'monospace',
                          fontSize: 'inherit'
                        }}
                      >
                        {log.timestamp}
                      </Typography>
                      <Typography 
                        component="span"
                        sx={{ 
                          color: log.type === 'success' ? 'success.light' : 
                                 log.type === 'error' ? 'error.light' : 'white',
                          fontFamily: 'monospace',
                          fontSize: 'inherit'
                        }}
                      >
                        {log.message}
                      </Typography>
                    </Box>
                  ))}
                  {isRunning && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.light' }}>
                      <CircularProgress size={12} sx={{ color: 'primary.light' }} />
                      <Typography sx={{ fontFamily: 'monospace', fontSize: 'inherit' }}>
                        Executing...
                      </Typography>
                    </Box>
                  )}
                  {executionLogs.length === 0 && !isRunning && !validation.loading && (
                    <Box sx={{ color: 'grey.400' }}>No logs yet. Run the test to see live output.</Box>
                  )}
                </Paper>
              </Box>

              {/* Code Tab */}
               <Box sx={{ mt: 2, display: rightTab === 1 ? 'block' : 'none' }}>
                <CodeTab
                  code={generatedCode}
                  autoSync={autoSyncCode}
                  onToggleAutoSync={(v) => dispatch(setAutoSyncCode(v))}
                  onRegen={() => {
                    const ir = buildDefaultTestIR(selectedScenarioData?.name || 'Untitled Test', testSteps);
                     ir.variables = variablesList.map((v) => (
                       v.type === 'plain'
                         ? { name: v.name, value: { kind: 'plain', value: v.value || '' } }
                         : v.secretId
                         ? { name: v.name, value: { kind: 'secret', ref: { id: v.secretId, label: v.name, scope: 'project', createdAt: new Date().toISOString() } } }
                         : { name: v.name, value: { kind: 'plain', value: '' } }
                     )) as any;
                    dispatch(setTestIR(ir));
                    dispatch(setGeneratedCode(generatePythonFromIR(ir)));
                  }}
                />
              </Box>

              {/* Proof Tab */}
              <Box sx={{ mt: 2, display: rightTab === 2 ? 'block' : 'none' }}>
                <Paper 
                  variant="outlined" 
                  sx={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.900', color: 'white', position: 'relative', overflow: 'hidden' }}
                >
                  {isRunning && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.light' }}>
                      <CircularProgress size={16} sx={{ color: 'primary.light' }} />
                      <Typography variant="body2">Recording…</Typography>
                    </Box>
                  )}
                  {!isRunning && showVideoPlayer ? (
                    <video 
                      ref={videoRef}
                      src={videoUrl || '/assets/videos/sample-ui-test.mp4'} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      controls 
                      preload="metadata"
                      onTimeUpdate={(e) => setVideoCurrentTime((e.target as HTMLVideoElement).currentTime)}
                    />
                  ) : null}
                  {!isRunning && !showVideoPlayer && (
                    <Typography variant="body2" color="grey.300">Visual proof will appear after run</Typography>
                  )}
                </Paper>
              </Box>

              {/* Variables inline panel removed in favor of Variables dialog */}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Panel removed: Proof is integrated as a tab */}
      </Grid>

      {/* Enhanced New Scenario Dialog */}
      <Dialog open={showNewScenarioDialog} onClose={() => setShowNewScenarioDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: 'primary.main' }}>
            <Science />
          </Avatar>
          <Box>
            <Typography variant="h6">Create New UI Test Scenario</Typography>
            <Typography variant="body2" color="text.secondary">
              Build no-code browser automation with plain English commands
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Scenario Name"
                  value={newScenarioForm.name}
                  onChange={(e) => setNewScenarioForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Trading Platform Login Validation"
                  required
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Environment</InputLabel>
                  <Select 
                    value={newScenarioForm.environment}
                    onChange={(e) => setNewScenarioForm(prev => ({ ...prev, environment: e.target.value }))}
                    label="Environment"
                  >
                    <MenuItem value="Development">Development</MenuItem>
                    <MenuItem value="Staging">Staging</MenuItem>
                    <MenuItem value="UAT">UAT</MenuItem>
                    <MenuItem value="Production">Production</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="CSI ID"
                  value={newScenarioForm.csiId}
                  onChange={(e) => setNewScenarioForm(prev => ({ ...prev, csiId: e.target.value }))}
                  placeholder="123456"
                  required
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Description"
                  value={newScenarioForm.description}
                  onChange={(e) => setNewScenarioForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this scenario validates and its business purpose"
                />
              </Grid>
              
              <Grid item xs={12}>
                <Alert severity="info">
                  <AlertTitle>Next Steps</AlertTitle>
                  After creating the scenario, you'll be able to add test steps using plain English commands like:
                  <br />• "Go to https://example.com"
                  <br />• "Click the Login button"
                  <br />• "Wait for Welcome message to appear"
                </Alert>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewScenarioDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleCreateNewScenario}
            disabled={!newScenarioForm.name || !newScenarioForm.csiId}
            startIcon={<Save />}
          >
            Create Scenario
          </Button>
        </DialogActions>
      </Dialog>

      {/* Global CSS for animations - Using MUI's GlobalStyles */}
      <GlobalStyles
        styles={{
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.5 },
          },
        }}
      />

      <Snackbar
        open={saveSnack.open}
        autoHideDuration={2500}
        onClose={() => setSaveSnack((s) => ({ ...s, open: false }))}
        message={saveSnack.message}
      />

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Keyboard Shortcuts</DialogTitle>
        <DialogContent>
          <Stack spacing={1} mt={1}>
            <Typography variant="body2">Cmd/Ctrl+S — Save draft locally</Typography>
            <Typography variant="body2">R — Run test</Typography>
            <Typography variant="body2">. — Stop run</Typography>
            <Typography variant="body2">? — Open this help</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Variables Dialog */}
      <Dialog open={variablesOpen} onClose={() => setVariablesOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Variables</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Configure variables referenced in your steps using &lt;var NAME&gt; or &lt;secret SECRET_ID&gt;.
          </Typography>
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 180 }}>Name</TableCell>
                  <TableCell sx={{ width: 140 }}>Type</TableCell>
                  <TableCell>Value / Secret</TableCell>
                  <TableCell align="right" sx={{ width: 80 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {variablesList.map((v, i) => (
                  <TableRow key={v.id} hover>
                    <TableCell>
                      <TextField size="small" value={v.name} onChange={(e) => {
                        const next = [...variablesList];
                        next[i] = { ...v, name: e.target.value.toUpperCase() };
                        setVariablesList(next);
                      }} placeholder="USERNAME" fullWidth />
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" fullWidth>
                        <Select value={v.type} onChange={(e) => {
                          const next = [...variablesList];
                          next[i] = { ...v, type: e.target.value as 'plain' | 'secret' };
                          setVariablesList(next);
                        }}>
                          <MenuItem value="plain">Plain</MenuItem>
                          <MenuItem value="secret">Secret</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      {v.type === 'plain' ? (
                        <TextField size="small" value={v.value || ''} onChange={(e) => {
                          const next = [...variablesList];
                          next[i] = { ...v, value: e.target.value };
                          setVariablesList(next);
                        }} placeholder="value" fullWidth />
                      ) : (
                        <SecretInput label="Select secret" value={v.secretId ? { id: v.secretId } : null} onChange={(ref) => {
                          const next = [...variablesList];
                          next[i] = { ...v, secretId: ref?.id };
                          setVariablesList(next);
                        }} />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => {
                        const next = variablesList.filter((_, idx) => idx !== i);
                        setVariablesList(next);
                      }}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4}>
                    <Button size="small" startIcon={<Add />} onClick={() => setVariablesList((prev) => [...prev, { id: `var_${Date.now()}`, name: '', type: 'plain', value: '' }])}>Add variable</Button>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>Use in steps as: &lt;var NAME&gt; or &lt;secret SECRET_ID&gt;</Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVariablesOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => {
            // Persist variables to localStorage and refresh codegen immediately
            try { localStorage.setItem('studio:variables', JSON.stringify(variablesList)); } catch {}
            const ir = buildDefaultTestIR(selectedScenarioData?.name || 'Untitled Test', testSteps);
            ir.variables = variablesList.map((v) => (
              v.type === 'plain'
                ? { name: v.name, value: { kind: 'plain', value: v.value || '' } }
                : v.secretId
                ? { name: v.name, value: { kind: 'secret', ref: { id: v.secretId, label: v.name, scope: 'project', createdAt: new Date().toISOString() } } }
                : { name: v.name, value: { kind: 'plain', value: '' } }
            )) as any;
            dispatch(setTestIR(ir));
            dispatch(setGeneratedCode(generatePythonFromIR(ir)));
            setVariablesOpen(false);
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Templates Dialog */}
      <Dialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Quick Start Templates</DialogTitle>
        <DialogContent>
          <Stack spacing={1} mt={1}>
            <Button
              variant="outlined"
              onClick={() => {
                setTestSteps([
                  'Go to "https://online.citi.com"',
                  'Click "Sign On"',
                  'Type "<var USERNAME>" in the "User ID" field',
                  'Type "<secret sec_abc123>" in the "Password" field',
                  'Click "Continue"',
                  'Wait for "Welcome"',
                ]);
                setTemplatesOpen(false);
              }}
            >Login flow</Button>
            <Button
              variant="outlined"
              onClick={() => {
                setTestSteps([
                  'Go to "https://example.com"',
                  'Wait for "Dashboard"',
                  'Check url contains "dashboard"',
                ]);
                setTemplatesOpen(false);
              }}
            >Content check</Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplatesOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChecksStudioPage;
'@
}

# File 56: src/pages/ChecksStudioPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/ChecksStudioPage/index.ts'
  SizeBytes    = 45
  Sha256       = 'cb492f77daa3f09edfbb461bc3e12cdd154c1f44c9009e54eaeb7522e7cac426'
  Content      = @'
export { default } from './ChecksStudioPage';
'@
}

# File 57: src/pages/ChecksTemplatesPage/ChecksTemplatesPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/ChecksTemplatesPage/ChecksTemplatesPage.tsx'
  SizeBytes    = 6198
  Sha256       = 'e15d111ec904b7e30e54febf27a2cb0b74c026b06deb72dc9da446a62d85ea40'
  Content      = @'
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Grid, Card, CardContent, Typography, Chip, Stack, TextField, InputAdornment, MenuItem, Button, Skeleton, Dialog, DialogTitle, DialogContent, DialogActions, Paper } from '@mui/material';
import { Api, Storage, AutoGraph, Security, BugReport, Science, Search } from '@mui/icons-material';
import templatesApi from '@/services/api/templatesApi';
import { useNavigate } from 'react-router-dom';

const TYPE_ICON: Record<string, any> = { HTTP: Api, TCP: Storage, SPLUNK: AutoGraph, GRAFANA: AutoGraph, ITRS: Security, APPDYNAMICS: BugReport, UI_TEST: Science };

const ChecksTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [preview, setPreview] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await templatesApi.list({ q: query || undefined, type: type || undefined });
      const data = (res as any).data || res || [];
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('templates:filters');
      if (raw) {
        const f = JSON.parse(raw);
        if (f.query) setQuery(f.query);
        if (f.type) setType(f.type);
      }
    } catch {}
    load();
  }, []);

  useEffect(() => {
    try { localStorage.setItem('templates:filters', JSON.stringify({ query, type })); } catch {}
  }, [query, type]);

  const onApply = async (tpl: any) => {
    // Prefill create wizard via localStorage draft and redirect
    try {
      const draftRaw = localStorage.getItem('checks:create:draft');
      const draft = draftRaw ? JSON.parse(draftRaw) : {};
      const merged = { ...draft, checkType: tpl.type, ...tpl.defaults, __fromTemplate: tpl.title };
      localStorage.setItem('checks:create:draft', JSON.stringify(merged));
    } catch {}
    navigate('/checks/create');
  };

  const onPreview = (tpl: any) => setPreview(tpl);

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ flex: 1 }}>Templates</Typography>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates"
          size="small"
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 260 }}
        />
        <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">All</MenuItem>
          {Object.keys(TYPE_ICON).map((t) => (
            <MenuItem key={t} value={t}>{t}</MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" onClick={load}>Search</Button>
      </Stack>

      <Grid container spacing={2}>
        {loading ? (
          [...Array(6)].map((_, i) => (
            <Grid key={i} item xs={12} md={6} lg={4}>
              <Skeleton variant="rounded" height={140} />
            </Grid>
          ))
        ) : items.length === 0 ? (
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary">No templates found.</Typography>
          </Grid>
        ) : (
          items.map((tpl: any) => {
            const Icon = TYPE_ICON[tpl.type] || Api;
            return (
              <Grid key={tpl.id} item xs={12} md={6} lg={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Icon />
                        <Typography variant="subtitle1" fontWeight={600}>{tpl.title}</Typography>
                        <Chip size="small" label={tpl.type} sx={{ ml: 'auto' }} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">{tpl.description}</Typography>
                      <Stack direction="row" spacing={1}>
                        {tpl.tags?.slice(0, 3).map((t: string) => (
                          <Chip key={t} label={t} size="small" variant="outlined" />
                        ))}
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="contained" onClick={() => onApply(tpl)}>Use template</Button>
                        <Button size="small" variant="outlined" onClick={() => onPreview(tpl)}>Preview</Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })
        )}
      </Grid>

      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="md" fullWidth>
        <DialogTitle>{preview?.title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">{preview?.description}</Typography>
            <Stack direction="row" spacing={1}>
              <Chip label={preview?.type} size="small" />
              {preview?.tags?.map((t: string) => <Chip key={t} label={t} size="small" variant="outlined" />)}
            </Stack>
            <Typography variant="subtitle2">Defaults</Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(preview?.defaults, null, 2)}</pre>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Close</Button>
          <Button variant="contained" onClick={() => { if (preview) onApply(preview); }}>Use template</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChecksTemplatesPage;



'@
}

# File 58: src/pages/ChecksTemplatesPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/ChecksTemplatesPage/index.ts'
  SizeBytes    = 51
  Sha256       = 'cb197a63e064d493f30d9993c970978522bcfbc73a62d4ca518fd4b1dba5f93a'
  Content      = @'
export { default } from './ChecksTemplatesPage';



'@
}

# File 59: src/pages/CreateCheckPage/CreateCheckPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/CreateCheckPage/CreateCheckPage.tsx'
  SizeBytes    = 68939
  Sha256       = 'dbb0a2381ee495f5f1838b9ea3c0bb11c814e16eadc57822aa8f34495bdc10dd'
  Content      = @'
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  FormLabel,
  Button,
  Stepper,
  Step,
  StepLabel,
  Grid,
  Chip,
  Autocomplete,
  Switch,
  Slider,
  Alert,
  AlertTitle,
  Divider,
  Paper,
  Avatar,
  Stack,
  useTheme,
  alpha,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Tooltip,
  Snackbar,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import {
  Add as AddIcon,
  Save as SaveIcon,
  
  NavigateNext as NextIcon,
  NavigateBefore as BackIcon,
  Api,
  Storage,
  AutoGraph,
  Security,
  BugReport,
  Science,
  Delete,
  DragIndicator,
  PlaylistAdd,
  CheckCircle,
  Warning,
  Info,
  Edit,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchCSIs } from '@store/slices/csiSlice';
import { createCheck } from '@store/slices/checksSlice';
import { addNotification } from '@/store/slices/uiSlice';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchCheckById } from '@/store/slices/checksSlice';
import { checksApi } from '@/services/api/checksApi';
import SecretInput from '@/components/studio/SecretInput';
import ScheduleEditor from '@/components/reports/ScheduleEditor';

const checkTypes = [
  { 
    value: 'HTTP', 
    label: 'HTTP/HTTPS Check', 
    description: 'Monitor HTTP/HTTPS endpoints for availability and response validation',
    icon: Api,
    color: 'primary'
  },
  { 
    value: 'TCP', 
    label: 'TCP Port Check', 
    description: 'Verify TCP port connectivity and basic network health',
    icon: Storage,
    color: 'secondary'
  },
  { 
    value: 'SPLUNK', 
    label: 'Splunk Query', 
    description: 'Execute complex Splunk searches for log-based validation',
    icon: AutoGraph,
    color: 'success'
  },
  { 
    value: 'GRAFANA', 
    label: 'Grafana Metrics', 
    description: 'Monitor Grafana dashboards and metric thresholds',
    icon: AutoGraph,
    color: 'info'
  },
  { 
    value: 'ITRS', 
    label: 'ITRS Geneos', 
    description: 'Check ITRS sampler status and infrastructure monitoring',
    icon: Security,
    color: 'warning'
  },
  { 
    value: 'APPDYNAMICS', 
    label: 'AppDynamics APM', 
    description: 'Validate AppDynamics health rules and performance metrics',
    icon: BugReport,
    color: 'error'
  },
  { 
    value: 'UI_TEST', 
    label: 'UI Test (Checks Studio)', 
    description: 'No-code browser automation with plain English commands',
    icon: Science,
    color: 'secondary'
  },
];

const environments = ['Development', 'Staging', 'Production', 'UAT'];
const frequencies = [
  { value: '5m', label: 'Every 5 minutes' },
  { value: '15m', label: 'Every 15 minutes' },
  { value: '30m', label: 'Every 30 minutes' },
  { value: '1h', label: 'Hourly' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: '24h', label: 'Daily' },
  { value: '1w', label: 'Weekly' },
  { value: '1mo', label: 'Monthly' },
  { value: 'custom', label: 'Custom (cron…)'},
];

const notificationChannels = [
  { value: 'email', label: 'Email' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'webhook', label: 'Webhook' },
];

const steps = ['Basic Information', 'Check Configuration', 'Scheduling & Alerts', 'Review'];

const CreateCheckPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: csiEntities, loading: csiLoading } = useAppSelector(state => state.csi);
  const { data: checksData } = useAppSelector(state => state.checks);
  const { id: editId } = useParams<{ id?: string }>();
  
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    // Basic Information
    name: '',
    description: '',
    checkType: '',
    csiId: '',
    environment: '',
    tags: [] as string[],
    
    // HTTP Configuration
    endpoint: '',
    method: 'GET',
    expectedStatus: 200,
    timeout: 30,
    retries: 3,
    validateSSL: true,
    followRedirects: true,
    headers: {} as Record<string, string>,
    
    // TCP Configuration
    host: '',
    port: 80,
    
    // Splunk Configuration
    splunkQuery: '',
    splunkIndex: '',
    timeRange: '15m',
    expectedCount: 0,
    countOperator: '>',
    
    // Grafana Configuration
    grafanaDashboard: '',
    grafanaPanel: '',
    metric: '',
    threshold: 0,
    thresholdOperator: '<',
    
    // ITRS Configuration
    itrsSampler: '',
    itrsExpectedStatus: 'OK',
    
    // AppDynamics Configuration
    appDynamicsApp: '',
    healthRule: '',
    
    // UI Test Configuration
    testSteps: [] as string[],
    browserType: 'chrome',
    screenSize: '1920x1080',
    
    // Scheduling & Alerts
    frequency: '5m',
    enabled: true,
    alertOnFailure: true,
    alertThreshold: 3,
    notificationChannels: [] as string[],
  });

  const [tagInput, setTagInput] = useState('');
  const [newStepInput, setNewStepInput] = useState('');
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');
  const saveTimeoutRef = useRef<number | null>(null);
  const [saveHint, setSaveHint] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [autosaveEnabled, setAutosaveEnabled] = useState<boolean>(true);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [availableUITests, setAvailableUITests] = useState<Array<{ id: string; name: string }>>([]);
  const [schedule, setSchedule] = useState<{ enabled: boolean; frequency: 'hourly'|'daily'|'weekly'|'monthly'|'custom'; time?: string; cron?: string; timezone?: string; daysOfWeek?: number[]; daysOfMonth?: number[] }>({ enabled: true, frequency: 'hourly', time: '09:00', cron: '', timezone: 'EST', daysOfWeek: [], daysOfMonth: [] });

  useEffect(() => {
    dispatch(fetchCSIs());
  }, [dispatch]);

  useEffect(() => {
    // Load Studio tests for selection if UI_TEST selected
    (async () => {
      try {
        if (formData.checkType === 'UI_TEST') {
          const studio = (await import('@/services/api/studioApi')).default;
          const res = (await studio.listTests({})) as any;
          const data = res?.data || res || [];
          setAvailableUITests(data.map((t: any) => ({ id: t.id, name: t.name })));
        }
      } catch {}
    })();
  }, [formData.checkType]);

  // When a UI test is selected, seed required variables if metadata available
  useEffect(() => {
    (async () => {
      try {
        if (formData.checkType === 'UI_TEST' && (formData as any).uiTestId) {
          const studio = (await import('@/services/api/studioApi')).default;
          const test = await studio.getTest((formData as any).uiTestId);
          const vars = (test as any).variables as Array<{ name: string; type: string; required?: boolean } | undefined>;
          if (Array.isArray(vars) && vars.length > 0) {
            setFormData((prev) => {
              const existing = (prev as any).uiVariables || {};
              const next = { ...existing } as Record<string, any>;
              for (const v of vars) {
                if (!v || !v.name) continue;
                const key = v.name.toUpperCase();
                if (next[key]) continue;
                if (v.type === 'secret') next[key] = { kind: 'secret', secretId: '' };
                else if (v.type === 'number') next[key] = { kind: 'number', value: '' };
                else if (v.type === 'boolean') next[key] = { kind: 'boolean', value: false };
                else next[key] = { kind: 'plain', value: '' };
              }
              return { ...prev, uiVariables: next } as any;
            });
          }
        }
      } catch {}
    })();
  }, [(formData as any).uiTestId, formData.checkType]);

  // Smart defaults: prefill env/tag from typical usage
  useEffect(() => {
    if (!formData.environment) {
      setFormData((p) => ({ ...p, environment: 'Production' }));
    }
  // one-time init
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave draft to localStorage
  useEffect(() => {
    if (!autosaveEnabled) return;
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    setSaveHint('saving');
    saveTimeoutRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem('checks:create:draft', JSON.stringify(formData));
        setSaveHint('saved');
        setTimeout(() => setSaveHint('idle'), 1200);
      } catch {}
    }, 400);
    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, [formData, autosaveEnabled]);

  // Hydrate from draft (first mount)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('checks:create:draft');
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && typeof draft === 'object') {
          setFormData((p) => ({ ...p, ...draft }));
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If editing, hydrate from existing check
  useEffect(() => {
    (async () => {
      if (!editId) return;
      try {
        const existing = checksData?.find((c) => c.id === editId);
        const check = existing || await dispatch(fetchCheckById(editId)).unwrap();
        if (!check) return;
        setFormData((p) => ({
          ...p,
          name: check.name || '',
          description: check.description || '',
          checkType: check.type || '',
          csiId: check.csiId || '',
          environment: (check as any).environment || p.environment,
          tags: check.tags || [],
          ...(check.type === 'HTTP' ? {
            endpoint: (check.configuration as any)?.url || (check.configuration as any)?.endpoint || '',
            method: (check.configuration as any)?.method || 'GET',
            expectedStatus: (check.configuration as any)?.expectedStatus || 200,
            timeout: Math.round(((check.configuration as any)?.timeout || 30000) / 1000),
            headers: (check.configuration as any)?.headers || {},
          } : {}),
          ...(check.type === 'TCP' ? {
            host: (check.configuration as any)?.host || '',
            port: (check.configuration as any)?.port || 80,
          } : {}),
          ...(check.type === 'SPLUNK' ? {
            splunkQuery: (check.configuration as any)?.query || '',
            timeRange: (check.configuration as any)?.timeRange || '15m',
            expectedCount: (check.configuration as any)?.expectedCount || 0,
            countOperator: (check.configuration as any)?.countOperator || '>',
            splunkIndex: (check.configuration as any)?.index || '',
          } : {}),
          ...(check.type === 'GRAFANA' ? {
            grafanaDashboard: (check.configuration as any)?.dashboard || (check.configuration as any)?.grafanaDashboard || '',
            grafanaPanel: (check.configuration as any)?.panel || (check.configuration as any)?.grafanaPanel || '',
            metric: (check.configuration as any)?.metric || '',
            threshold: (check.configuration as any)?.threshold || 0,
            thresholdOperator: (check.configuration as any)?.thresholdOperator || '>'
          } : {}),
          ...(check.type === 'ITRS' ? {
            itrsSampler: (check.configuration as any)?.sampler || (check.configuration as any)?.gateway || '',
            itrsExpectedStatus: (check.configuration as any)?.expectedStatus || 'OK',
          } : {}),
          ...(check.type === 'APPDYNAMICS' ? {
            appDynamicsApp: (check.configuration as any)?.application || '',
            healthRule: (check.configuration as any)?.healthRule || '',
          } : {}),
          ...(check.type === 'UI_TEST' ? {
            uiTestId: (check.configuration as any)?.uiTest?.testId || '',
            uiVariables: (check.configuration as any)?.uiTest?.variables || {},
            timeout: Math.round((((check.configuration as any)?.uiTest?.overrides || {})?.timeout || 30000) / 1000),
          } : {}),
          enabled: check.schedule?.enabled ?? true,
          frequency: (check.schedule as any)?.frequency || '5m',
          ...(check.schedule && (check.schedule as any).cron ? { cron: (check.schedule as any).cron } : {}),
        }));
      } catch {}
    })();
  }, [editId, checksData, dispatch]);

  // Notify if prefilled from template
  useEffect(() => {
    try {
      const raw = localStorage.getItem('checks:create:draft');
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft && draft.__fromTemplate && !snackbar.open) {
        setSnackbar({ open: true, message: `Prefilled from template: ${draft.__fromTemplate}` as any, severity: 'success' });
        delete draft.__fromTemplate;
        localStorage.setItem('checks:create:draft', JSON.stringify(draft));
      }
    } catch {}
  }, []);

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleInputChange = (field: string) => (event: any) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleAddTestStep = () => {
    if (newStepInput.trim()) {
      setFormData(prev => ({
        ...prev,
        testSteps: [...prev.testSteps, newStepInput.trim()]
      }));
      setNewStepInput('');
    }
  };

  const handleRemoveTestStep = (index: number) => {
    setFormData(prev => ({
      ...prev,
      testSteps: prev.testSteps.filter((_, i) => i !== index)
    }));
  };

  const handleAddHeader = () => {
    if (headerKey.trim() && headerValue.trim()) {
      setFormData(prev => ({
        ...prev,
        headers: { ...prev.headers, [headerKey.trim()]: headerValue.trim() }
      }));
      setHeaderKey('');
      setHeaderValue('');
    }
  };

  const handleRemoveHeader = (key: string) => {
    setFormData(prev => {
      const newHeaders = { ...prev.headers };
      delete newHeaders[key];
      return { ...prev, headers: newHeaders };
    });
  };

  const handleCreateCheck = async () => {
    try {
      // Transform form data to match API requirements
      const checkData = {
        name: formData.name,
        description: formData.description,
        type: formData.checkType,
        csiId: formData.csiId,
        environment: formData.environment,
        tags: formData.tags,
        configuration: getConfigurationForCheckType(),
        schedule: {
          enabled: schedule.enabled,
          frequency: schedule.frequency,
          ...(schedule.time ? { time: schedule.time } : {}),
          ...(schedule.cron ? { cron: schedule.cron } : {}),
          ...(schedule.daysOfWeek && schedule.daysOfWeek.length ? { daysOfWeek: schedule.daysOfWeek } : {}),
          ...(schedule.daysOfMonth && schedule.daysOfMonth.length ? { daysOfMonth: schedule.daysOfMonth } : {}),
          timezone: schedule.timezone,
        },
        alerting: {
          enabled: formData.alertOnFailure,
          threshold: formData.alertThreshold,
          channels: formData.notificationChannels,
        },
      };

      await dispatch(createCheck(checkData as any)).unwrap();
      try { localStorage.removeItem('checks:create:draft'); } catch {}
      dispatch(addNotification({ type: 'success', title: 'Create', message: 'Check created successfully' }));
      navigate('/checks/all');
    } catch (error) {
      console.error('Failed to create check:', error);
      setSnackbar({ open: true, message: 'Failed to create check', severity: 'error' });
    }
  };

  const getConfigurationForCheckType = () => {
    switch (formData.checkType) {
      case 'HTTP':
        return {
          endpoint: formData.endpoint,
          method: formData.method,
          expectedStatus: formData.expectedStatus,
          timeout: formData.timeout,
          retries: formData.retries,
          validateSSL: formData.validateSSL,
          followRedirects: formData.followRedirects,
          headers: formData.headers,
        };
      case 'TCP':
        return {
          host: formData.host,
          port: formData.port,
          timeout: formData.timeout,
        };
      case 'SPLUNK':
        return {
          query: formData.splunkQuery,
          index: formData.splunkIndex,
          timeRange: formData.timeRange,
          expectedCount: formData.expectedCount,
          countOperator: formData.countOperator,
        };
      case 'GRAFANA':
        return {
          dashboard: formData.grafanaDashboard,
          panel: formData.grafanaPanel,
          metric: formData.metric,
          threshold: formData.threshold,
          thresholdOperator: formData.thresholdOperator,
        };
      case 'ITRS':
        return {
          sampler: formData.itrsSampler,
          expectedStatus: formData.itrsExpectedStatus,
        };
      case 'APPDYNAMICS':
        return {
          application: formData.appDynamicsApp,
          healthRule: formData.healthRule,
        };
      case 'UI_TEST':
        return {
          uiTest: {
            testId: (formData as any).uiTestId || '',
            variables: (formData as any).uiVariables || {},
            overrides: {
              ...(formData.timeout ? { timeout: formData.timeout * 1000 } : {}),
            },
          },
        };
      default:
        return {};
    }
  };

  const getSelectedCheckType = () => checkTypes.find(type => type.value === formData.checkType);

  // Validation helpers
  const step0Valid = useMemo(() => {
    return Boolean(formData.checkType && formData.name.trim() && formData.csiId);
  }, [formData.checkType, formData.name, formData.csiId]);

  const step1Valid = useMemo(() => {
    switch (formData.checkType) {
      case 'HTTP':
        return Boolean(formData.endpoint && /^https?:\/\//i.test(formData.endpoint));
      case 'TCP':
        return Boolean(formData.host && Number(formData.port) > 0);
      case 'SPLUNK':
        return Boolean(formData.splunkQuery && formData.timeRange);
      case 'GRAFANA':
        return Boolean(formData.grafanaDashboard && formData.grafanaPanel && formData.metric);
      case 'ITRS':
        return Boolean(formData.itrsSampler && formData.itrsExpectedStatus);
      case 'APPDYNAMICS':
        return Boolean(formData.appDynamicsApp && formData.healthRule);
      case 'UI_TEST':
        return Boolean((formData as any).uiTestId && typeof (formData as any).uiTestId === 'string');
      default:
        return false;
    }
  }, [formData]);

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Grid container spacing={3}>
            {formData.checkType && (
              <>
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                    Basic Information
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Check Name"
                    value={formData.name}
                    onChange={handleInputChange('name')}
                    placeholder={`e.g., ${getSelectedCheckType()?.label} for Trading Platform`}
                    required
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Description"
                    value={formData.description}
                    onChange={handleInputChange('description')}
                    placeholder="Describe what this check monitors and its business purpose"
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <Autocomplete
                    options={csiEntities || []}
                    loading={csiLoading === 'loading'}
                    getOptionLabel={(option) => `${option.id} - ${option.name}`}
                    value={csiEntities?.find(csi => csi.id === formData.csiId) || null}
                    onChange={(_, newValue) => setFormData(prev => ({ ...prev, csiId: newValue?.id || '' }))}
                    renderInput={(params) => (
                      <TextField {...params} label="CSI Entity" required />
                    )}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth required>
                    <InputLabel>Environment</InputLabel>
                    <Select
                      value={formData.environment}
                      label="Environment"
                      onChange={handleInputChange('environment')}
                    >
                      {environments.map((env) => (
                        <MenuItem key={env} value={env}>
                          {env}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <Box>
                    <TextField
                      fullWidth
                      label="Add Tags"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="Type tag and press Add"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      InputProps={{
                        endAdornment: (
                          <Button size="small" onClick={handleAddTag} disabled={!tagInput.trim()}>
                            Add
                          </Button>
                        ),
                      }}
                    />
                    <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {formData.tags.map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          onDelete={() => handleRemoveTag(tag)}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Box>
                </Grid>
              </>
            )}
            {/* Header with check type selection */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Choose Check Type
              </Typography>
              <Grid container spacing={2}>
                {checkTypes.map((type) => {
                  const IconComponent = type.icon;
                  const isSelected = formData.checkType === type.value;
                  return (
                    <Grid item xs={12} sm={6} md={4} key={type.value}>
                      <Card 
                        variant={isSelected ? 'outlined' : 'elevation'}
                        sx={{ 
                          cursor: 'pointer',
                          border: isSelected ? 2 : 1,
                          borderColor: isSelected ? `${type.color}.main` : 'divider',
                          '&:hover': { 
                            boxShadow: 3,
                            borderColor: `${type.color}.main`,
                          },
                          height: '100%'
                        }}
                        onClick={() => setFormData(prev => ({ ...prev, checkType: type.value }))}
                      >
                        <CardContent sx={{ textAlign: 'center', p: 3 }}>
                          <Avatar 
                            sx={{ 
                              bgcolor: `${type.color}.main`, 
                              width: 56, 
                              height: 56, 
                              mx: 'auto', 
                              mb: 2 
                            }}
                          >
                            <IconComponent sx={{ fontSize: 32 }} />
                          </Avatar>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                            {type.label}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {type.description}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Grid>

            
          </Grid>
        );

      case 1:
        const selectedType = getSelectedCheckType();
        return (
          <Grid container spacing={3}>
            {/* Check Type banner removed per request */}

            {/* HTTP Configuration */}
            {formData.checkType === 'HTTP' && (
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Endpoint URL"
                    value={formData.endpoint}
                    onChange={handleInputChange('endpoint')}
                    placeholder="https://api.example.com/health"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <FormLabel component="legend">HTTP Method</FormLabel>
                    <RadioGroup
                      row
                      value={formData.method}
                      onChange={handleInputChange('method')}
                    >
                      <FormControlLabel value="GET" control={<Radio />} label="GET" />
                      <FormControlLabel value="POST" control={<Radio />} label="POST" />
                      <FormControlLabel value="PUT" control={<Radio />} label="PUT" />
                      <FormControlLabel value="HEAD" control={<Radio />} label="HEAD" />
                    </RadioGroup>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Expected Status Code"
                    value={formData.expectedStatus}
                    onChange={handleInputChange('expectedStatus')}
                    InputProps={{ inputProps: { min: 100, max: 599 } }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography gutterBottom>Timeout (seconds)</Typography>
                  <Slider
                    value={formData.timeout}
                    onChange={(_, value) => setFormData(prev => ({ ...prev, timeout: value as number }))}
                    valueLabelDisplay="auto"
                    step={5}
                    marks
                    min={5}
                    max={120}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Retry Attempts"
                    value={formData.retries}
                    onChange={handleInputChange('retries')}
                    InputProps={{ inputProps: { min: 0, max: 10 } }}
                  />
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>HTTP Headers</Typography>
                  <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <TextField
                      label="Header Name"
                      value={headerKey}
                      onChange={(e) => setHeaderKey(e.target.value)}
                      placeholder="Content-Type"
                    />
                    <TextField
                      label="Header Value"
                      value={headerValue}
                      onChange={(e) => setHeaderValue(e.target.value)}
                      placeholder="application/json"
                    />
                    <Button 
                      variant="outlined" 
                      onClick={handleAddHeader}
                      disabled={!headerKey.trim() || !headerValue.trim()}
                    >
                      Add
                    </Button>
                  </Box>
                  <Stack spacing={1}>
                    {Object.entries(formData.headers).map(([key, value]) => (
                      <Chip
                        key={key}
                        label={`${key}: ${value}`}
                        onDelete={() => handleRemoveHeader(key)}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Grid>

                <Grid item xs={12}>
                  <Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.validateSSL}
                          onChange={handleInputChange('validateSSL')}
                          color="primary"
                        />
                      }
                      label="Validate SSL Certificate"
                    />
                  </Box>
                  <Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.followRedirects}
                          onChange={handleInputChange('followRedirects')}
                          color="primary"
                        />
                      }
                      label="Follow HTTP Redirects"
                    />
                  </Box>
                </Grid>
              </>
            )}

            {/* TCP Configuration */}
            {formData.checkType === 'TCP' && (
              <>
                <Grid item xs={12} md={8}>
                  <TextField
                    fullWidth
                    label="Host/IP Address"
                    value={formData.host}
                    onChange={handleInputChange('host')}
                    placeholder="127.0.0.1 or hostname.example.com"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Port"
                    value={formData.port}
                    onChange={handleInputChange('port')}
                    InputProps={{ inputProps: { min: 1, max: 65535 } }}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <Typography gutterBottom>Connection Timeout (seconds)</Typography>
                  <Slider
                    value={formData.timeout}
                    onChange={(_, value) => setFormData(prev => ({ ...prev, timeout: value as number }))}
                    valueLabelDisplay="auto"
                    step={1}
                    marks
                    min={1}
                    max={30}
                  />
                </Grid>
              </>
            )}

            {/* Splunk Configuration */}
            {formData.checkType === 'SPLUNK' && (
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    label="Splunk Query"
                    value={formData.splunkQuery}
                    onChange={handleInputChange('splunkQuery')}
                    placeholder={`search index=trading earliest=-15m | stats count by status | where status="success"`}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Index (optional)"
                    value={formData.splunkIndex}
                    onChange={handleInputChange('splunkIndex')}
                    placeholder="trading, logs, metrics"
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Time Range</InputLabel>
                    <Select
                      value={formData.timeRange}
                      label="Time Range"
                      onChange={handleInputChange('timeRange')}
                    >
                      <MenuItem value="5m">Last 5 minutes</MenuItem>
                      <MenuItem value="15m">Last 15 minutes</MenuItem>
                      <MenuItem value="1h">Last hour</MenuItem>
                      <MenuItem value="24h">Last 24 hours</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Count Operator</InputLabel>
                    <Select
                      value={formData.countOperator}
                      label="Count Operator"
                      onChange={handleInputChange('countOperator')}
                    >
                      <MenuItem value=">">&gt; (greater than)</MenuItem>
                      <MenuItem value=">=">&gt;= (greater or equal)</MenuItem>
                      <MenuItem value="<">&lt; (less than)</MenuItem>
                      <MenuItem value="<=">&lt;= (less or equal)</MenuItem>
                      <MenuItem value="==">=== (equal to)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Expected Count"
                    value={formData.expectedCount}
                    onChange={handleInputChange('expectedCount')}
                    InputProps={{ inputProps: { min: 0 } }}
                  />
                </Grid>
              </>
            )}

            {/* Grafana Configuration */}
            {formData.checkType === 'GRAFANA' && (
              <>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Dashboard ID/Name"
                    value={formData.grafanaDashboard}
                    onChange={handleInputChange('grafanaDashboard')}
                    placeholder="trading-dashboard or d/abc123"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Panel ID/Name"
                    value={formData.grafanaPanel}
                    onChange={handleInputChange('grafanaPanel')}
                    placeholder="CPU Usage or panel-id-5"
                    required
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Metric Query"
                    value={formData.metric}
                    onChange={handleInputChange('metric')}
                    placeholder="avg(cpu_usage_percent)"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Threshold Operator</InputLabel>
                    <Select
                      value={formData.thresholdOperator}
                      label="Threshold Operator"
                      onChange={handleInputChange('thresholdOperator')}
                    >
                      <MenuItem value="<">Less than (&lt;)</MenuItem>
                      <MenuItem value="<=">Less or equal (&lt;=)</MenuItem>
                      <MenuItem value=">">Greater than (&gt;)</MenuItem>
                      <MenuItem value=">=">Greater or equal (&gt;=)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Threshold Value"
                    value={formData.threshold}
                    onChange={handleInputChange('threshold')}
                    inputProps={{ step: 0.1 }}
                  />
                </Grid>
              </>
            )}

            {/* ITRS Configuration */}
            {formData.checkType === 'ITRS' && (
              <>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="ITRS Sampler Path"
                    value={formData.itrsSampler}
                    onChange={handleInputChange('itrsSampler')}
                    placeholder="Gateway > ManagedEntity > Sampler > Dataview"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Expected Status</InputLabel>
                    <Select
                      value={formData.itrsExpectedStatus}
                      label="Expected Status"
                      onChange={handleInputChange('itrsExpectedStatus')}
                    >
                      <MenuItem value="OK">OK</MenuItem>
                      <MenuItem value="WARNING">WARNING</MenuItem>
                      <MenuItem value="CRITICAL">CRITICAL</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </>
            )}

            {/* AppDynamics Configuration */}
            {formData.checkType === 'APPDYNAMICS' && (
              <>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Application Name"
                    value={formData.appDynamicsApp}
                    onChange={handleInputChange('appDynamicsApp')}
                    placeholder="Trading-Platform-Prod"
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Health Rule Name"
                    value={formData.healthRule}
                    onChange={handleInputChange('healthRule')}
                    placeholder="Database Connection Pool"
                    required
                  />
                </Grid>
              </>
            )}

            {/* UI Test Configuration */}
            {formData.checkType === 'UI_TEST' && (
              <>
                {/* Banner removed per request */}

                {/* Removed browser and screen size controls as they are not required here */}

                <Grid item xs={12} md={8}>
                  <FormControl fullWidth required>
                    <InputLabel>Studio Test</InputLabel>
                    <Select
                      value={(formData as any).uiTestId || ''}
                      label="Studio Test"
                      onChange={(e) => setFormData((p) => ({ ...p, uiTestId: e.target.value }))}
                    >
                      {availableUITests.map((t) => (
                        <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Optional overrides removed per request */}

                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Variables (Parameters)</Typography>
                  <Paper variant="outlined" sx={{ p: 1 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ width: 220 }}>Name</TableCell>
                          <TableCell sx={{ width: 160 }}>Type</TableCell>
                          <TableCell>Value / Secret</TableCell>
                          <TableCell align="right" sx={{ width: 80 }}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Object.entries(((formData as any).uiVariables || {}) as Record<string, any>).map(([name, v]: any) => (
                          <TableRow key={name} hover>
                            <TableCell>
                              <TextField size="small" fullWidth label="Name" value={name} disabled />
                            </TableCell>
                            <TableCell>
                              <FormControl size="small" fullWidth>
                                <Select value={v?.kind || 'plain'} onChange={(e) => {
                                  setFormData((p) => ({ ...p, uiVariables: { ...(p as any).uiVariables, [name]: { ...(v || {}), kind: e.target.value } } }));
                                }}>
                                  <MenuItem value="plain">Plain</MenuItem>
                                  <MenuItem value="number">Number</MenuItem>
                                  <MenuItem value="boolean">Boolean</MenuItem>
                                  <MenuItem value="secret">Secret</MenuItem>
                                </Select>
                              </FormControl>
                            </TableCell>
                            <TableCell>
                              {v?.kind === 'secret' ? (
                                <SecretInput label="Select secret" value={v?.secretId ? { id: v.secretId } : null} onChange={(ref) => {
                                  setFormData((p) => ({ ...p, uiVariables: { ...(p as any).uiVariables, [name]: { ...(v || {}), secretId: ref?.id } } }));
                                }} />
                              ) : (
                                <TextField size="small" fullWidth label="Value" value={v?.value ?? ''} onChange={(e) => {
                                  setFormData((p) => ({ ...p, uiVariables: { ...(p as any).uiVariables, [name]: { ...(v || {}), value: e.target.value } } }));
                                }} />
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <IconButton size="small" onClick={() => {
                                const next = { ...(formData as any).uiVariables };
                                delete (next as any)[name];
                                setFormData((p) => ({ ...p, uiVariables: next }));
                              }}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={4}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <TextField size="small" label="New variable name" value={headerKey} onChange={(e) => setHeaderKey(e.target.value)} sx={{ maxWidth: 240 }} />
                              <Button size="small" disabled={!headerKey.trim()} onClick={() => {
                                const name = headerKey.trim().toUpperCase();
                                setHeaderKey('');
                                setFormData((p) => ({ ...p, uiVariables: { ...(p as any).uiVariables, [name]: { kind: 'plain', value: '' } } }));
                              }}>Add variable</Button>
                              <Typography variant="caption" color="text.secondary">Use in Studio steps as &lt;var NAME&gt; or &lt;secret SECRET_ID&gt;</Typography>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </Paper>
                </Grid>
                <Grid item xs={12}>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" onClick={async () => {
                      try {
                        const studio = (await import('@/services/api/studioApi')).default;
                        const testId = (formData as any).uiTestId;
                        if (!testId) return;
                        const vars = (formData as any).uiVariables || {};
                        const res = await studio.validateVariables(testId, vars);
                        const ok = (res as any).isValid !== false;
                        setSnackbar({ open: true, message: ok ? 'Variables look good' : `Missing: ${(res as any).missing?.join(', ')}`, severity: ok ? 'success' : 'error' });
                      } catch {
                        setSnackbar({ open: true, message: 'Validation failed', severity: 'error' });
                      }
                    }}>Validate variables</Button>
                  </Stack>
                </Grid>
              </>
            )}

            {!formData.checkType && (
              <Grid item xs={12}>
                <Alert severity="warning">
                  Please select a check type in the previous step to configure specific options.
                </Alert>
              </Grid>
            )}
          </Grid>
        );

      case 2:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Scheduling Configuration
              </Typography>
            </Grid>

            <Grid item xs={12} md={8}>
              <ScheduleEditor
                enabled={schedule.enabled}
                frequency={schedule.frequency}
                time={schedule.time}
                cron={schedule.cron}
                timezone={schedule.timezone}
                daysOfWeek={schedule.daysOfWeek}
                daysOfMonth={schedule.daysOfMonth}
                onChange={(n) => setSchedule((s) => ({
                  ...s,
                  enabled: typeof n.enabled === 'boolean' ? n.enabled : s.enabled,
                  frequency: (n.frequency as any) || s.frequency,
                  time: n.time || s.time,
                  cron: n.cron || s.cron,
                  timezone: n.timezone || s.timezone,
                  daysOfWeek: (n as any).daysOfWeek || s.daysOfWeek,
                  daysOfMonth: (n as any).daysOfMonth || s.daysOfMonth,
                }))}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Warning color="warning" />
                Alert Configuration
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.alertOnFailure}
                    onChange={handleInputChange('alertOnFailure')}
                    color="primary"
                  />
                }
                label="Send alerts when check fails"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Alert After N Consecutive Failures"
                value={formData.alertThreshold}
                onChange={handleInputChange('alertThreshold')}
                disabled={!formData.alertOnFailure}
                InputProps={{ inputProps: { min: 1, max: 10 } }}
                helperText="Prevents alert spam from transient failures"
              />
            </Grid>

            {formData.alertOnFailure && (
              <Grid item xs={12}>
                <Autocomplete
                  multiple
                  options={notificationChannels.map(channel => channel.value)}
                  value={formData.notificationChannels}
                  onChange={(_, newValue) => setFormData(prev => ({ ...prev, notificationChannels: newValue }))}
                  getOptionLabel={(option) => notificationChannels.find(ch => ch.value === option)?.label || option}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => {
                      const channel = notificationChannels.find(ch => ch.value === option);
                      return (
                        <Chip 
                          variant="outlined" 
                          label={channel?.label || option} 
                          {...getTagProps({ index })} 
                          key={option}
                        />
                      );
                    })
                  }
                  renderInput={(params) => (
                    <TextField 
                      {...params} 
                      label="Notification Channels" 
                      helperText="Select one or more channels to receive failure alerts"
                    />
                  )}
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <Alert severity="info">
                <AlertTitle>Scheduling Notes</AlertTitle>
                <Typography variant="body2">
                  • Checks will run according to the selected frequency after creation<br />
                  • You can pause/resume checks anytime from the Checks dashboard<br />
                  • Failed checks will retry automatically based on your configuration<br />
                  • All execution history and logs are preserved for analysis
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        );

      case 3:
        const selectedCsi = csiEntities?.find(csi => csi.id === formData.csiId);
        const frequencyLabel = frequencies.find(f => f.value === formData.frequency)?.label;
        
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Alert severity="success" sx={{ mb: 2 }}>
                <AlertTitle>{editId ? 'Review & Update' : 'Review & Create'}</AlertTitle>
                Double-check details below. Use Edit actions to jump back to a section.
              </Alert>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Basic Info</Typography>
                  <Button size="small" startIcon={<Edit fontSize="small" />} onClick={() => setActiveStep(0)}>Edit</Button>
                </Stack>
                <List dense>
                  <ListItem disableGutters>
                    <ListItemText primary="Name" secondary={formData.name || 'Not specified'} />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Type" secondary={getSelectedCheckType()?.label || '—'} />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="CSI" secondary={selectedCsi ? `${selectedCsi.id} - ${selectedCsi.name}` : 'Not selected'} />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Environment" secondary={formData.environment || 'Not selected'} />
                  </ListItem>
                  {formData.description && (
                    <ListItem disableGutters>
                      <ListItemText primary="Description" secondary={formData.description} />
                    </ListItem>
                  )}
                  {formData.tags.length > 0 && (
                    <ListItem disableGutters>
                      <ListItemText primary="Tags" secondary={formData.tags.join(', ')} />
                    </ListItem>
                  )}
                </List>
              </Paper>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Configuration</Typography>
                  <Button size="small" startIcon={<Edit fontSize="small" />} onClick={() => setActiveStep(1)}>Edit</Button>
                </Stack>

                {formData.checkType === 'HTTP' && (
                  <List dense>
                    <ListItem disableGutters><ListItemText primary="Endpoint" secondary={formData.endpoint || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Method" secondary={formData.method} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Expected Status" secondary={formData.expectedStatus} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Timeout" secondary={`${formData.timeout}s`} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Retries" secondary={formData.retries} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="SSL Validation" secondary={formData.validateSSL ? 'Enabled' : 'Disabled'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Follow Redirects" secondary={formData.followRedirects ? 'Yes' : 'No'} /></ListItem>
                  </List>
                )}

                {formData.checkType === 'TCP' && (
                  <List dense>
                    <ListItem disableGutters><ListItemText primary="Host" secondary={formData.host || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Port" secondary={formData.port} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Timeout" secondary={`${formData.timeout}s`} /></ListItem>
                  </List>
                )}

                {formData.checkType === 'SPLUNK' && (
                  <>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Query</Typography>
                    <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50', mb: 1 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{formData.splunkQuery || '—'}</Typography>
                    </Paper>
                    <List dense>
                      <ListItem disableGutters><ListItemText primary="Index" secondary={formData.splunkIndex || 'Default'} /></ListItem>
                      <ListItem disableGutters><ListItemText primary="Time Range" secondary={formData.timeRange} /></ListItem>
                      <ListItem disableGutters><ListItemText primary="Expected Count" secondary={`${formData.countOperator} ${formData.expectedCount}`} /></ListItem>
                    </List>
                  </>
                )}

                {formData.checkType === 'GRAFANA' && (
                  <List dense>
                    <ListItem disableGutters><ListItemText primary="Dashboard" secondary={formData.grafanaDashboard || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Panel" secondary={formData.grafanaPanel || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Metric" secondary={formData.metric || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Threshold" secondary={`${formData.thresholdOperator} ${formData.threshold}`} /></ListItem>
                  </List>
                )}

                {formData.checkType === 'ITRS' && (
                  <List dense>
                    <ListItem disableGutters><ListItemText primary="Sampler Path" secondary={formData.itrsSampler || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Expected Status" secondary={formData.itrsExpectedStatus} /></ListItem>
                  </List>
                )}

                {formData.checkType === 'APPDYNAMICS' && (
                  <List dense>
                    <ListItem disableGutters><ListItemText primary="Application" secondary={formData.appDynamicsApp || '—'} /></ListItem>
                    <ListItem disableGutters><ListItemText primary="Health Rule" secondary={formData.healthRule || '—'} /></ListItem>
                  </List>
                )}

                {formData.checkType === 'UI_TEST' && (
                  <>
                    <List dense>
                      <ListItem disableGutters><ListItemText primary="Studio Test" secondary={(() => {
                        const t = availableUITests.find((t) => t.id === (formData as any).uiTestId);
                        return t?.name || (formData as any).uiTestId || 'Not selected';
                      })()} /></ListItem>
                      {formData.timeout && (
                        <ListItem disableGutters><ListItemText primary="Timeout override" secondary={`${formData.timeout}s`} /></ListItem>
                      )}
                    </List>
                    {Object.keys(((formData as any).uiVariables || {})).length > 0 && (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 600, mt: 1 }}>Variables</Typography>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ width: 220 }}>Name</TableCell>
                              <TableCell sx={{ width: 140 }}>Type</TableCell>
                              <TableCell>Value</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {Object.entries(((formData as any).uiVariables || {}) as Record<string, any>).map(([name, v]) => (
                              <TableRow key={name}>
                                <TableCell>{name}</TableCell>
                                <TableCell>{v?.kind || 'plain'}</TableCell>
                                <TableCell>{v?.kind === 'secret' ? (v?.secretId ? `••••${String(v.secretId).slice(-4)}` : '—') : (String(v?.value ?? ''))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </>
                    )}
                  </>
                )}
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Scheduling & Alerts</Typography>
                  <Button size="small" startIcon={<Edit fontSize="small" />} onClick={() => setActiveStep(2)}>Edit</Button>
                </Stack>
                <List dense>
                  <ListItem disableGutters>
                    <ListItemText primary="Frequency" secondary={frequencyLabel} />
                  </ListItem>
                  {formData.frequency === '1w' && (
                    <ListItem disableGutters>
                      <ListItemText primary="Day of Week" secondary={(formData as any).dayOfWeek?.toUpperCase() || 'MON'} />
                    </ListItem>
                  )}
                  {formData.frequency === '1mo' && (
                    <ListItem disableGutters>
                      <ListItemText primary="Day of Month" secondary={(formData as any).dayOfMonth ?? 1} />
                    </ListItem>
                  )}
                  {formData.frequency === 'custom' && (
                    <ListItem disableGutters>
                      <ListItemText primary="Cron" secondary={(formData as any).cron || '—'} />
                    </ListItem>
                  )}
                  <ListItem disableGutters>
                    <ListItemText primary="Enabled" secondary={formData.enabled ? 'Yes' : 'No'} />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText primary="Alerts" secondary={formData.alertOnFailure ? `After ${formData.alertThreshold} consecutive failures` : 'Disabled'} />
                  </ListItem>
                  {formData.notificationChannels.length > 0 && (
                    <ListItem disableGutters>
                      <ListItemText primary="Channels" secondary={formData.notificationChannels.map(ch => notificationChannels.find(c => c.value === ch)?.label).join(', ')} />
                    </ListItem>
                  )}
                </List>
              </Paper>
            </Grid>
          </Grid>
        );

      default:
        return 'Unknown step';
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {editId ? (
            <>
              <Edit sx={{ fontSize: 32, color: 'primary.main' }} />
              Edit Check{formData.name ? `: ${formData.name}` : ''}
            </>
          ) : (
            <>
              <AddIcon sx={{ fontSize: 32, color: 'primary.main' }} />
              Create Check
            </>
          )}
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="body1" color="text.secondary">
            Build comprehensive health checks for your applications and infrastructure using our multi-step wizard.
          </Typography>
          <Typography variant="caption" color={saveHint === 'saving' ? 'text.secondary' : 'success.main'}>
            {saveHint === 'saving' ? 'Saving draft…' : saveHint === 'saved' ? 'Draft saved' : ''}
          </Typography>
          <FormControlLabel
            sx={{ ml: 2 }}
            control={<Switch checked={autosaveEnabled} onChange={(e) => setAutosaveEnabled(e.target.checked)} />}
            label="Autosave"
          />
        </Stack>
      </Box>

      <Card>
        <CardContent>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label, index) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Box sx={{ mb: 4 }}>
            {renderStepContent(activeStep)}
            {/* Inline validation hints */}
            {activeStep === 0 && !step0Valid && (
              <Alert severity="warning" sx={{ mt: 2 }}>Name, Type, and CSI are required.</Alert>
            )}
            {activeStep === 1 && !step1Valid && (
              <Alert severity="warning" sx={{ mt: 2 }}>Please complete the required configuration for the selected type.</Alert>
            )}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
              <Button
              color="inherit"
              disabled={activeStep === 0}
              onClick={handleBack}
              startIcon={<BackIcon />}
              sx={{ mr: 1 }}
            >
              Back
            </Button>
            
            <Box sx={{ flex: '1 1 auto' }} />
            
            {activeStep < steps.length - 1 ? (
                          <Tooltip title="A check type must be selected to continue" arrow>
                            <span>
                              <Button 
                                variant="contained" 
                                onClick={handleNext}
                                endIcon={<NextIcon />}
                                disabled={(activeStep === 0 && !step0Valid) || (activeStep === 1 && !step1Valid)}
                              >
                                Next
                              </Button>
                            </span>
                          </Tooltip>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                  {/* Preview button removed per request */}
                <Tooltip title="Check Name, Type, and CSI Entity are required" arrow>
                  <span>
                    <Button 
                      variant="contained" 
                      color="success"
                      startIcon={<SaveIcon />}
                      onClick={async () => {
                        if (!step0Valid || !step1Valid) return;
                        try {
                          if (editId) {
                            const checkData: any = {
                              name: formData.name,
                              description: formData.description,
                              type: formData.checkType,
                              csiId: formData.csiId,
                              environment: formData.environment,
                              tags: formData.tags,
                              configuration: getConfigurationForCheckType(),
                              schedule: {
                                enabled: schedule.enabled,
                                frequency: schedule.frequency,
                                ...(schedule.time ? { time: schedule.time } : {}),
                                ...(schedule.cron ? { cron: schedule.cron } : {}),
                                ...(schedule.daysOfWeek && schedule.daysOfWeek.length ? { daysOfWeek: schedule.daysOfWeek } : {}),
                                ...(schedule.daysOfMonth && schedule.daysOfMonth.length ? { daysOfMonth: schedule.daysOfMonth } : {}),
                                timezone: schedule.timezone,
                              },
                              alerting: {
                                enabled: formData.alertOnFailure,
                                threshold: formData.alertThreshold,
                                channels: formData.notificationChannels,
                              },
                            };
                            await checksApi.updateCheck(editId, checkData);
                            dispatch(addNotification({ type: 'success', title: 'Update', message: 'Check updated successfully' }));
                            navigate(`/checks/details/${editId}`);
                          } else {
                            await handleCreateCheck();
                          }
                        } catch (e) {
                          setSnackbar({ open: true, message: 'Failed to save check', severity: 'error' });
                        }
                      }}
                      disabled={!step0Valid || !step1Valid}
                    >
                      {editId ? 'Update Check' : 'Create Check'}
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CreateCheckPage;
'@
}

# File 60: src/pages/CreateCheckPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/CreateCheckPage/index.ts'
  SizeBytes    = 44
  Sha256       = 'c32730ca0221ca12ed07aeb917dd41bc3070759123b3eca9ec1db4c1bc965c93'
  Content      = @'
export { default } from './CreateCheckPage';
'@
}

# File 61: src/pages/CSIOverviewPage/CSIOverviewPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/CSIOverviewPage/CSIOverviewPage.tsx'
  SizeBytes    = 2845
  Sha256       = '6a4880eb72750c0f6bf6aaed0253cd7e75a8625b9dcf55464f5aa249d2e07445'
  Content      = @'
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Tabs, Tab, Card, CardContent, Divider, Stack, Chip, Skeleton, IconButton, Tooltip } from '@mui/material';
import { PushPin, PushPinOutlined } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { pinCsi, unpinCsi } from '@/store/slices/dashboardSlice';

// Static CSI Overview placeholder with tabs
const CSIOverviewPage: React.FC = () => {
  const { csiId } = useParams<{ csiId: string }>();
  const [tab, setTab] = useState(0);
  const dispatch = useAppDispatch();
  const pinned = useAppSelector((s) => s.dashboard.pinnedCsiIds);
  const isPinned = !!(csiId && pinned.includes(csiId));

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>CSI Overview</Typography>
          <Typography variant="body2" color="text.secondary">{csiId}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label="Open in scope" variant="outlined" />
          {csiId && (
            <Tooltip title={isPinned ? 'Unpin from Home' : 'Pin to Home'}>
              <IconButton onClick={() => dispatch(isPinned ? unpinCsi(csiId) : pinCsi(csiId))}>
                {isPinned ? <PushPin /> : <PushPinOutlined />}
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      <Card variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="CSI tabs">
          <Tab label="Health" />
          <Tab label="Checks" />
          <Tab label="Applications" />
          <Tab label="Reports" />
          <Tab label="Studio" />
        </Tabs>
        <Divider />
        <CardContent>
          {tab === 0 && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1}>
                <Chip label="Owner: --" size="small" />
                <Chip label="BU: --" size="small" />
                <Chip label="Criticality: --" size="small" />
                <Chip label="Tags: env:*" size="small" />
              </Stack>
              <Skeleton variant="rounded" height={160} />
            </Stack>
          )}
          {tab === 1 && (
            <Stack spacing={1}>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} variant="rounded" height={36} />
              ))}
            </Stack>
          )}
          {tab === 2 && <Skeleton variant="rounded" height={120} />}
          {tab === 3 && <Skeleton variant="rounded" height={120} />}
          {tab === 4 && <Skeleton variant="rounded" height={120} />}
        </CardContent>
      </Card>
    </Box>
  );
};

export default CSIOverviewPage;



'@
}

# File 62: src/pages/CSIOverviewPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/CSIOverviewPage/index.ts'
  SizeBytes    = 47
  Sha256       = '27bd19a4fd7003994c51e79f2ac6990721f23c810247c4bebc1baf2c25de962d'
  Content      = @'
export { default } from './CSIOverviewPage';



'@
}

# File 63: src/pages/CSIsDirectoryPage/CSIsDirectoryPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/CSIsDirectoryPage/CSIsDirectoryPage.tsx'
  SizeBytes    = 3682
  Sha256       = 'bdfc62cb6802097c3192149657f32aa43d4c227d166802aa9751d4fdd4a6d058'
  Content      = @'
import React from 'react';
import { Box, Grid, Card, CardContent, Typography, Chip, Stack, Paper, Divider } from '@mui/material';

// Static CSI directory placeholder per UI implementation plan
const CSIsDirectoryPage: React.FC = () => {
  const placeholderCSIs = [
    { id: '172087', name: 'Production tools', bu: 'Technology Infrastructure', criticality: 'CRITICAL', tags: ['application:automation-platform', 'team:devops'] },
    { id: '168942', name: 'Core Banking Platform', bu: 'Consumer Banking', criticality: 'CRITICAL', tags: ['application:core-banking', 'team:core-systems'] },
    { id: '174523', name: 'Trading Platform Services', bu: 'Markets & Securities', criticality: 'CRITICAL', tags: ['application:trading-platform', 'team:platform-engineering'] },
    { id: '169834', name: 'Payment Gateway Infrastructure', bu: 'Payments', criticality: 'CRITICAL', tags: ['application:payment-gateway', 'team:payments-team'] },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>CSIs</Typography>
          <Typography variant="body2" color="text.secondary">Directory of CSI systems with health badges and tags</Typography>
        </Box>
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Facets</Typography>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="caption" color="text.secondary">Business Unit</Typography>
            <Stack spacing={0.5} sx={{ mt: 1, mb: 2 }}>
              {['Technology Infrastructure', 'Consumer Banking', 'Markets & Securities', 'Payments'].map(bu => (
                <Chip key={bu} label={bu} size="small" variant="outlined" />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">Criticality</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 2, flexWrap: 'wrap' }}>
              {['CRITICAL', 'HIGH', 'MEDIUM'].map(c => (
                <Chip key={c} label={c} size="small" variant="outlined" />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">Tags</Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {[...Array(6)].map((_, i) => (
                <Paper key={i} variant="outlined" sx={{ height: 18 }} />
              ))}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={9}>
          <Grid container spacing={2}>
            {placeholderCSIs.map(csi => (
              <Grid item xs={12} md={6} key={csi.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="subtitle1" fontWeight={600}>{csi.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{csi.id} • {csi.bu}</Typography>
                      <Stack direction="row" spacing={1}>
                        <Chip label={csi.criticality} color="error" size="small" variant="outlined" />
                        {csi.tags.slice(0, 2).map(t => (
                          <Chip key={t} label={t} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CSIsDirectoryPage;



'@
}

# File 64: src/pages/CSIsDirectoryPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/CSIsDirectoryPage/index.ts'
  SizeBytes    = 49
  Sha256       = '3179f8e92ac547fc50d6cc91825837575e2a0311054ed9a7704632cdd36c142c'
  Content      = @'
export { default } from './CSIsDirectoryPage';



'@
}

# File 65: src/pages/DashboardPage/DashboardPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/DashboardPage/DashboardPage.tsx'
  SizeBytes    = 31945
  Sha256       = 'c23355bcda08d65d8711a082b2eb4014198ef7ee737397b256058a8fa28af289'
  Content      = @'
import React, { useEffect, useMemo, useState } from 'react';
import { 
  Box, 
  Grid, 
  Typography, 
  Paper,
  Card,
  CardContent,
  Chip,
  Alert,
  IconButton,
  useTheme,
  alpha,
  Stack,
  Avatar,
  Button,
  Tooltip,
  Badge,
  Fade,
  Grow,
  CircularProgress,
  Divider,
} from '@mui/material';
import { keyframes } from '@emotion/react';
import {
  CheckCircle,
  Error,
  Warning,
  Refresh,
  TrendingUp,
  TrendingDown,
  Schedule,
  Speed,
  Api,
  // Storage,
  AutoGraph,
  Security,
  BugReport,
  Science,
  ArrowForward,
  Business,
  Groups,
  Category,
  // Visibility,
  PlayArrow,
  Timer,
  // CloudSync,
  // IntegrationInstructions,
  Hub,
  Insights,
  // AccountTree,
  HealthAndSafety,
  Assessment,
  NotificationsActive,
  Timeline,
  // DataUsage,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/index';
import { fetchChecks } from '@store/slices/checksSlice';
import { useNavigate } from 'react-router-dom';
// Page-level FilterBar removed per global Scope Bar adoption in layout
import { parseTag } from '@utils/tagUtils';
import type { CSI } from '@/types/csi/csiTypes';
import UpcomingExecutions from '@components/scheduling/UpcomingExecutions';

// Mock real-time data for demonstration
const mockRealTimeData = {
  executionsPerMinute: 47,
  averageResponseTime: 145,
  activeIncidents: 2,
  scheduledMaintenance: 1,
};

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
`;

const DashboardPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  
  const { data: checks, loading, error } = useAppSelector(state => state.checks);
  const { selectedCSI, tags: { selected: selectedTags }, data: csiData } = useAppSelector(state => state.csi);
  
  const [refreshing, setRefreshing] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(true);

  useEffect(() => {
    dispatch(fetchChecks({ page: 1, limit: 100 }));
    // Simulate real-time updates
    const interval = setInterval(() => {
      setPulseAnimation(prev => !prev);
    }, 3000);
    return () => clearInterval(interval);
  }, [dispatch]);

  // Filter checks based on selected CSI and tags
  const filteredChecks = useMemo(() => {
    let result = checks || [];
    
    if (selectedCSI) {
      result = result.filter(check => check.csiId === selectedCSI);
    }
    
    if (selectedTags && selectedTags.length > 0) {
      result = result.filter(check => 
        selectedTags.every(tag => check.tags.includes(tag))
      );
    }
    
    return result;
  }, [checks, selectedCSI, selectedTags]);

  // Get selected CSI details
  const selectedCSIDetails = useMemo(() => {
    if (!selectedCSI || !Array.isArray(csiData)) return null;
    return (csiData as CSI[]).find((csi: CSI) => csi.id === selectedCSI) || null;
  }, [selectedCSI, csiData]);

  // Calculate comprehensive metrics
  const metrics = useMemo(() => {
    const total = filteredChecks?.length || 0;
    const passing = filteredChecks?.filter(c => c.status === 'PASSING').length || 0;
    const failing = filteredChecks?.filter(c => c.status === 'FAILING').length || 0;
    const warning = filteredChecks?.filter(c => c.status === 'WARNING').length || 0;
    const pending = filteredChecks?.filter(c => c.status === 'PENDING').length || 0;
    const uptime = total > 0 ? ((passing / total) * 100) : 0;
    
    // Calculate trends (mock data for demo)
    const weeklyTrend = uptime > 95 ? 2.3 : uptime > 85 ? 0.5 : -1.2;
    const mttr = failing > 0 ? 24.5 : 0; // Mean Time To Resolve in minutes
    
    return { total, passing, failing, warning, pending, uptime, weeklyTrend, mttr };
  }, [filteredChecks]);

  // Group checks by integration tool
  const integrationMetrics = useMemo(() => {
    const tools: Record<string, { count: number; icon: React.ElementType; color: 'primary' | 'warning' | 'info' | 'success' | 'error' | 'secondary' }>
      = {
        'HTTP/TCP': { count: 0, icon: Api, color: 'primary' },
        'Splunk': { count: 0, icon: AutoGraph, color: 'warning' },
        'Grafana': { count: 0, icon: Speed, color: 'info' },
        'ITRS': { count: 0, icon: Security, color: 'success' },
        'AppDynamics': { count: 0, icon: BugReport, color: 'error' },
        'UI Tests': { count: 0, icon: Science, color: 'secondary' },
      };

    filteredChecks.forEach(check => {
      switch (check.type) {
        case 'HTTP':
        case 'TCP':
          tools['HTTP/TCP'].count += 1;
          break;
        case 'SPLUNK':
          tools['Splunk'].count += 1;
          break;
        case 'GRAFANA':
          tools['Grafana'].count += 1;
          break;
        case 'ITRS':
          tools['ITRS'].count += 1;
          break;
        case 'APPDYNAMICS':
          tools['AppDynamics'].count += 1;
          break;
        case 'UI_TEST':
          tools['UI Tests'].count += 1;
          break;
      }
    });

    return Object.entries(tools).filter(([_, data]) => data.count > 0);
  }, [filteredChecks]);

  // Get recent critical events
  const criticalEvents = useMemo(() => {
    const events: Array<{ type: 'error' | 'warning'; title: string; description: string; csi: string; time: string; checkId: string }>= [];
    
    filteredChecks.filter(c => c.status === 'FAILING').slice(0, 3).forEach(check => {
      events.push({
        type: 'error',
        title: 'Check Failed',
        description: check.name,
        csi: check.csiName,
        time: '2m ago',
        checkId: check.id
      });
    });
    
    filteredChecks.filter(c => c.status === 'WARNING').slice(0, 2).forEach(check => {
      events.push({
        type: 'warning',
        title: 'Performance Degradation',
        description: check.name,
        csi: check.csiName,
        time: '5m ago',
        checkId: check.id
      });
    });

    return events;
  }, [filteredChecks]);

  // Extract team and LOB information from tags
  const organizationMetrics = useMemo(() => {
    const teams = new Set<string>();
    const lobs = new Set<string>();
    const applications = new Set<string>();

    filteredChecks.forEach(check => {
      check.tags.forEach(tag => {
        const parsed = parseTag(tag);
        if (parsed) {
          if (parsed.prefix === 'team') teams.add(parsed.value);
          if (parsed.prefix === 'lob') lobs.add(parsed.value);
          if (parsed.prefix === 'application') applications.add(parsed.value);
        }
      });
    });

    return {
      teams: teams.size,
      lobs: lobs.size,
      applications: applications.size
    };
  }, [filteredChecks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchChecks({ page: 1, limit: 100 }));
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getHealthColor = (value: number) => {
    if (value >= 95) return theme.palette.success.main;
    if (value >= 85) return theme.palette.warning.main;
    return theme.palette.error.main;
  };

  const getHealthLabel = (value: number) => {
    if (value >= 95) return 'Excellent';
    if (value >= 85) return 'Good';
    if (value >= 70) return 'Fair';
    return 'Critical';
  };

  return (
    <Box>
      {/* Modern Header with CSI Context */}
      <Fade in timeout={600}>
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={3}>
            <Box flex={1}>
              {/* Title with Health Indicator */}
              <Stack direction="row" alignItems="center" spacing={2} mb={1}>
                <Avatar 
                  sx={{ 
                    bgcolor: getHealthColor(metrics.uptime),
                    width: 48,
                    height: 48,
                    animation: pulseAnimation ? `${pulse} 2s infinite` : 'none'
                  }}
                >
                  <HealthAndSafety />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    Operational Health Dashboard
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {selectedCSIDetails ? (
                      <>
                        <Chip 
                          label={selectedCSIDetails.name} 
                          size="small" 
                          sx={{ mr: 1 }} 
                          color="primary"
                          variant="outlined"
                        />
                        {selectedCSIDetails.businessUnit}
                      </>
                    ) : (
                      'Centralized orchestration view across all systems'
                    )}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            {/* Real-time Status Indicator */}
            <Stack direction="row" spacing={2} alignItems="center">
              <Badge 
                badgeContent="LIVE" 
                color="success" 
                variant="dot"
                sx={{
                  '& .MuiBadge-badge': {
                    animation: `${pulse} 2s infinite`,
                  }
                }}
              >
                <Chip 
                  icon={<Timer />}
                  label={`${mockRealTimeData.executionsPerMinute} checks/min`}
                  variant="outlined"
                />
              </Badge>
              <Tooltip title="Refresh Dashboard">
                <span>
                  <IconButton 
                    onClick={handleRefresh} 
                    disabled={loading === 'loading' || refreshing}
                    sx={{
                      bgcolor: 'background.paper',
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    {refreshing ? <CircularProgress size={20} /> : <Refresh />}
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>
          
          {/* Scope is handled globally via ScopeBar in layout */}
        </Box>
      </Fade>

      {/* Error Alert */}
      {error && (
        <Grow in>
          <Alert severity="error" sx={{ mb: 3 }}>
            Error loading dashboard data: {error}
          </Alert>
        </Grow>
      )}

      {/* Main Dashboard Grid */}
      <Grid container spacing={3}>
        
        {/* Health Score Card - Hero Metric */}
        <Grid item xs={12} md={4}>
          <Grow in timeout={800}>
            <Card 
              elevation={0}
              sx={{ 
                border: `2px solid ${getHealthColor(metrics.uptime)}`,
                background: `linear-gradient(135deg, ${alpha(getHealthColor(metrics.uptime), 0.05)} 0%, transparent 100%)`,
                height: '100%'
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Stack spacing={3}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="overline" color="text.secondary" fontWeight={600}>
                        OVERALL HEALTH SCORE
                      </Typography>
                      <Typography variant="h2" fontWeight={700} color={getHealthColor(metrics.uptime)}>
                        {metrics.uptime.toFixed(1)}%
                      </Typography>
                      <Typography variant="h6" color="text.secondary" fontWeight={400}>
                        {getHealthLabel(metrics.uptime)}
                      </Typography>
                    </Box>
                    <Avatar sx={{ bgcolor: alpha(getHealthColor(metrics.uptime), 0.1), width: 64, height: 64 }}>
                      <Assessment sx={{ fontSize: 32, color: getHealthColor(metrics.uptime) }} />
                    </Avatar>
                  </Stack>

                  {/* Trend Indicator */}
                  <Stack direction="row" alignItems="center" spacing={1}>
                    {metrics.weeklyTrend >= 0 ? (
                      <TrendingUp color="success" />
                    ) : (
                      <TrendingDown color="error" />
                    )}
                    <Typography variant="body2" color={metrics.weeklyTrend >= 0 ? 'success.main' : 'error.main'}>
                      {Math.abs(metrics.weeklyTrend)}% vs last week
                    </Typography>
                  </Stack>

                  <Divider />

                  {/* Quick Stats */}
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">
                        Active Checks
                      </Typography>
                      <Typography variant="h6" fontWeight={600}>
                        {metrics.total}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">
                        Avg Response
                      </Typography>
                      <Typography variant="h6" fontWeight={600}>
                        {mockRealTimeData.averageResponseTime}ms
                      </Typography>
                    </Grid>
                  </Grid>
                </Stack>
              </CardContent>
            </Card>
          </Grow>
        </Grid>

        {/* Check Status Distribution */}
        <Grid item xs={12} md={8}>
          <Grow in timeout={900}>
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight={600} mb={3}>
                  Check Status Distribution
                </Typography>
                
                <Grid container spacing={3}>
                  <Grid item xs={6} sm={3}>
                    <Paper 
                      sx={{ 
                        p: 2, 
                        textAlign: 'center',
                        bgcolor: alpha(theme.palette.success.main, 0.05),
                        border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`
                      }}
                    >
                      <CheckCircle sx={{ fontSize: 32, color: 'success.main', mb: 1 }} />
                      <Typography variant="h4" fontWeight={700} color="success.main">
                        {metrics.passing}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Passing
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Paper 
                      sx={{ 
                        p: 2, 
                        textAlign: 'center',
                        bgcolor: alpha(theme.palette.error.main, 0.05),
                        border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`
                      }}
                    >
                      <Error sx={{ fontSize: 32, color: 'error.main', mb: 1 }} />
                      <Typography variant="h4" fontWeight={700} color="error.main">
                        {metrics.failing}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Failing
                      </Typography>
                      {metrics.mttr > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          MTTR: {metrics.mttr}m
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Paper 
                      sx={{ 
                        p: 2, 
                        textAlign: 'center',
                        bgcolor: alpha(theme.palette.warning.main, 0.05),
                        border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`
                      }}
                    >
                      <Warning sx={{ fontSize: 32, color: 'warning.main', mb: 1 }} />
                      <Typography variant="h4" fontWeight={700} color="warning.main">
                        {metrics.warning}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Warning
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Paper 
                      sx={{ 
                        p: 2, 
                        textAlign: 'center',
                        bgcolor: alpha(theme.palette.info.main, 0.05),
                        border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`
                      }}
                    >
                      <Schedule sx={{ fontSize: 32, color: 'info.main', mb: 1 }} />
                      <Typography variant="h4" fontWeight={700} color="info.main">
                        {metrics.pending}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Pending
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>

                {/* Health Bar Visualization */}
                <Box mt={3}>
                  <Stack direction="row" spacing={0.5} sx={{ height: 8, borderRadius: 1, overflow: 'hidden' }}>
                    {metrics.total > 0 && (
                      <>
                        <Box 
                          sx={{ 
                            flex: metrics.passing / metrics.total,
                            bgcolor: 'success.main',
                            minWidth: metrics.passing > 0 ? 20 : 0
                          }} 
                        />
                        <Box 
                          sx={{ 
                            flex: metrics.warning / metrics.total,
                            bgcolor: 'warning.main',
                            minWidth: metrics.warning > 0 ? 20 : 0
                          }} 
                        />
                        <Box 
                          sx={{ 
                            flex: metrics.failing / metrics.total,
                            bgcolor: 'error.main',
                            minWidth: metrics.failing > 0 ? 20 : 0
                          }} 
                        />
                        <Box 
                          sx={{ 
                            flex: metrics.pending / metrics.total,
                            bgcolor: 'grey.400',
                            minWidth: metrics.pending > 0 ? 20 : 0
                          }} 
                        />
                      </>
                    )}
                  </Stack>
                </Box>
              </CardContent>
            </Card>
          </Grow>
        </Grid>

        {/* Integration Tools Overview */}
        <Grid item xs={12} lg={8}>
          <Grow in timeout={1000}>
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                  <Typography variant="h6" fontWeight={600}>
                    Cross-Tool Integration Status
                  </Typography>
                  <Chip 
                    icon={<Hub />}
                    label="Orchestration Layer"
                    size="small"
                    variant="outlined"
                  />
                </Stack>

                <Grid container spacing={2}>
                  {integrationMetrics.map(([tool, data], index) => {
                    const IconComponent = data.icon;
                    return (
                      <Grid item xs={6} sm={4} md={2} key={tool}>
                        <Fade in timeout={1100 + index * 100}>
                          <Paper
                            sx={{
                              p: 2,
                              textAlign: 'center',
                              border: `1px solid ${theme.palette.divider}`,
                              cursor: 'pointer',
                              transition: 'all 0.3s ease',
                              '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: theme.shadows[4],
                                borderColor: theme.palette[data.color as 'primary'].main,
                              }
                            }}
                            onClick={() => navigate('/checks')}
                          >
                            <Avatar 
                              sx={{ 
                                bgcolor: alpha(theme.palette[data.color as 'primary'].main, 0.1),
                                width: 48,
                                height: 48,
                                mx: 'auto',
                                mb: 1
                              }}
                            >
                              <IconComponent sx={{ color: theme.palette[data.color as 'primary'].main }} />
                            </Avatar>
                            <Typography variant="h5" fontWeight={700}>
                              {data.count}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {tool}
                            </Typography>
                          </Paper>
                        </Fade>
                      </Grid>
                    );
                  })}
                </Grid>

                {/* Organization Metrics */}
                <Box mt={3} p={2} bgcolor={alpha(theme.palette.primary.main, 0.02)} borderRadius={2}>
                  <Grid container spacing={3}>
                    <Grid item xs={4}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Groups color="primary" />
                        <Box>
                          <Typography variant="h6" fontWeight={600}>
                            {organizationMetrics.teams}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Teams
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>
                    <Grid item xs={4}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Business color="primary" />
                        <Box>
                          <Typography variant="h6" fontWeight={600}>
                            {organizationMetrics.lobs}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Lines of Business
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>
                    <Grid item xs={4}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Category color="primary" />
                        <Box>
                          <Typography variant="h6" fontWeight={600}>
                            {organizationMetrics.applications}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Applications
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>
                  </Grid>
                </Box>
              </CardContent>
            </Card>
          </Grow>
        </Grid>

        {/* Critical Events & Quick Actions */}
        <Grid item xs={12} lg={4}>
          <Stack spacing={3}>
            {/* Upcoming Executions */}
            <Grow in timeout={1000}>
              <Box>
                <UpcomingExecutions maxItems={5} />
              </Box>
            </Grow>

            {/* Critical Events */}
            {criticalEvents.length > 0 && (
              <Grow in timeout={1100}>
                <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                      <Typography variant="h6" fontWeight={600}>
                        Critical Events
                      </Typography>
                      <Badge badgeContent={criticalEvents.length} color="error">
                        <NotificationsActive color="action" />
                      </Badge>
                    </Stack>

                    <Stack spacing={2}>
                      {criticalEvents.slice(0, 3).map((event, index) => (
                        <Fade in timeout={1200 + index * 100} key={index}>
                          <Paper
                            sx={{
                              p: 2,
                              border: `1px solid ${
                                event.type === 'error' ? theme.palette.error.main : theme.palette.warning.main
                              }`,
                              bgcolor: alpha(
                                event.type === 'error' ? theme.palette.error.main : theme.palette.warning.main,
                                0.05
                              ),
                              cursor: 'pointer',
                              '&:hover': {
                                bgcolor: alpha(
                                  event.type === 'error' ? theme.palette.error.main : theme.palette.warning.main,
                                  0.1
                                ),
                              }
                            }}
                            onClick={() => navigate(`/checks/details/${event.checkId}`)}
                          >
                            <Stack spacing={1}>
                              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                <Typography variant="subtitle2" fontWeight={600}>
                                  {event.title}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {event.time}
                                </Typography>
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                {event.description}
                              </Typography>
                              <Chip 
                                label={event.csi} 
                                size="small" 
                                variant="outlined"
                                sx={{ width: 'fit-content' }}
                              />
                            </Stack>
                          </Paper>
                        </Fade>
                      ))}
                    </Stack>

                    {criticalEvents.length > 3 && (
                      <Button 
                        fullWidth 
                        sx={{ mt: 2 }}
                        endIcon={<ArrowForward />}
                        onClick={() => navigate('/checks')}
                      >
                        View All Events
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </Grow>
            )}

            {/* Quick Actions */}
            <Grow in timeout={1200}>
              <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" fontWeight={600} mb={2}>
                    Quick Actions
                  </Typography>
                  
                  <Stack spacing={2}>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<Science />}
                    onClick={() => navigate('/checks/studio')}
                      sx={{
                        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                        py: 1.5
                      }}
                    >
                      Open Checks Studio
                    </Button>
                    
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<PlayArrow />}
                      onClick={() => navigate('/checks/create')}
                    >
                      Create New Check
                    </Button>
                    
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<Assessment />}
                      onClick={() => navigate('/checks/reports')}
                    >
                      Generate Report
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grow>
          </Stack>
        </Grid>

        {/* System Insights Footer */}
        <Grid item xs={12}>
          <Grow in timeout={1300}>
            <Paper 
              sx={{ 
                p: 3,
                border: `1px solid ${theme.palette.divider}`,
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.02)} 0%, transparent 100%)`
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Insights color="primary" />
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>
                      System Insights
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Powered by unified orchestration across ITRS, Grafana, Splunk, and AppDynamics
                    </Typography>
                  </Box>
                </Stack>
                
                <Stack direction="row" spacing={3}>
                  <Tooltip title="Active Incidents">
                    <Chip 
                      icon={<Warning />}
                      label={`${mockRealTimeData.activeIncidents} Active`}
                      color="warning"
                      variant="outlined"
                    />
                  </Tooltip>
                  <Tooltip title="Scheduled Maintenance">
                    <Chip 
                      icon={<Schedule />}
                      label={`${mockRealTimeData.scheduledMaintenance} Scheduled`}
                      color="info"
                      variant="outlined"
                    />
                  </Tooltip>
                  <Tooltip title="View Timeline">
                    <IconButton onClick={() => navigate('/checks')}>
                      <Timeline />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Paper>
          </Grow>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
'@
}

# File 66: src/pages/DashboardPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/DashboardPage/index.ts'
  SizeBytes    = 136
  Sha256       = '721db416780f455afa484f15292246f5a95d9440615c325041577a72f7c9599d'
  Content      = @'
// Deprecated: Dashboard has been replaced by Home. Keeping file for compatibility only.
export { default } from '../HomePage/HomePage';
'@
}

# File 67: src/pages/HomePage/HomePage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/HomePage/HomePage.tsx'
  SizeBytes    = 3133
  Sha256       = 'ac4b5c64e7e153c4006c88a548eb26a353698a2ef9a8c4ec529cab95a4b6a572'
  Content      = @'
import React, { useEffect } from 'react';
import { Box, Grid, Stack, Typography } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchDashboardSummary,
  fetchAttention,
  fetchActivity,
  fetchUpcomingSchedules,
  fetchReportsSnapshot,
} from '@/store/slices/dashboardSlice';
import KPIBar from '@/components/home/KPIBar';
import AttentionPanel from '@/components/home/AttentionPanel';
import ActivityFeed from '@/components/home/ActivityFeed';
import ReportsSnapshot from '@/components/home/ReportsSnapshot';
import UpcomingSchedules from '@/components/home/UpcomingSchedules';
import PinnedCSIs from '@/components/home/PinnedCSIs';

const HomePage: React.FC = () => {
  const dispatch = useAppDispatch();
  const summary = useAppSelector((s) => s.dashboard.summary);
  const searchContext = useAppSelector((s) => s.dashboard.searchContext);

  useEffect(() => {
    const load = () => {
      dispatch(fetchDashboardSummary());
      dispatch(fetchAttention({ limit: 20 }));
      dispatch(fetchActivity({ scope: 'ALL', hours: 24 }));
      dispatch(fetchUpcomingSchedules({ limit: 10 }));
      dispatch(fetchReportsSnapshot({ limit: 5 }));
    };
    load();
    const id = setInterval(() => {
      if (!document.hidden) {
        dispatch(fetchDashboardSummary());
        dispatch(fetchAttention({ limit: 20 }));
      }
    }, 60000);
    return () => clearInterval(id);
  }, [dispatch]);

  // Refetch scoped widgets when search context changes
  useEffect(() => {
    dispatch(fetchDashboardSummary());
    dispatch(fetchAttention({ limit: 20 }));
    dispatch(fetchActivity({ scope: 'ALL', hours: 24 }));
    dispatch(fetchUpcomingSchedules({ limit: 10 }));
    dispatch(fetchReportsSnapshot({ limit: 5 }));
  }, [dispatch, searchContext.csiId, searchContext.environment, searchContext.tags, searchContext.tagMode]);

  return (
    <Box>
      <Stack spacing={2} mb={2}>
        <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HomeIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          Home
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your centralized view of critical checks, anomalies, and system health across all environments.
        </Typography>
      </Stack>

      {/* GlobalSearch moved to layout header */}

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <PinnedCSIs />
        </Grid>

        <Grid item xs={12}>
          <KPIBar summary={summary.data} loading={summary.loading} error={summary.error} />
        </Grid>

        <Grid item xs={12} md={7}>
          <AttentionPanel maxHeight={420} />
        </Grid>
        <Grid item xs={12} md={5}>
          <UpcomingSchedules maxHeight={420} />
        </Grid>

        <Grid item xs={12} md={7}>
          <ActivityFeed maxHeight={360} />
        </Grid>
        <Grid item xs={12} md={5}>
          <ReportsSnapshot maxHeight={360} />
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomePage;



'@
}

# File 68: src/pages/HomePage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/HomePage/index.ts'
  SizeBytes    = 40
  Sha256       = '4072a25de2f7e09468ca202cbb17166a433e7cc96d92787f30b6566dd2504936'
  Content      = @'
export { default } from './HomePage';



'@
}

# File 69: src/pages/Reports/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/Reports/index.ts'
  SizeBytes    = 185
  Sha256       = '5161638d61fb7d76047eec2917145ad8442ebb5295e9494f5cdfb296ac3b3db6'
  Content      = @'
export { default as ReportsHome } from './ReportsHome';
export { default as ReportBuilder } from './ReportBuilder';
export { default as ReportDetailsPage } from './ReportDetailsPage';


'@
}

# File 70: src/pages/Reports/ReportBuilder.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/Reports/ReportBuilder.tsx'
  SizeBytes    = 30506
  Sha256       = '0581e0ecd819c84df7a877212014f966eeb1feb1a19c2e18d7685d3a812b06dc'
  Content      = @'
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Card, CardContent, CardHeader, Chip, Divider, Grid, IconButton, Paper, Stack, TextField, Tooltip, Typography, alpha, Button, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Autocomplete } from '@mui/material';
import { Refresh, Send, ShowChart, Search, Save, Add, CheckCircle, Info } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { createReport, fetchReports, generatePreview, addSection, updateSection, removeSection, reorderSections } from '@/store/slices/reportsSlice';
import { useNavigate, useParams } from 'react-router-dom';
import { checksApi } from '@/services/api/checksApi';
import reportsApi from '@/services/api/reportsApi';
import RecipientsEditor from '@/components/reports/RecipientsEditor';
import ScheduleEditor from '@/components/reports/ScheduleEditor';
import RuleBuilder from '@/components/reports/RuleBuilder';
import type { ReportSection, ReportSchedule, ManualReportSection } from '@/types/reports/reportTypes';

type CheckSearchOption = { id: string; name: string; csiId: string; csiName: string };

const ReportBuilder: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const isEditMode = Boolean(params.id);
  const { previewContent, generatingPreview } = useAppSelector((s) => s.reports);

  const [reportConfig, setReportConfig] = useState({
    name: '',
    description: '',
    subject: '',
    frequency: 'daily',
    recipients: '',
    includeCharts: true,
    template: 'executive-summary',
    checks: [] as string[],
    sections: [] as ReportSection[],
    schedule: { frequency: 'daily', time: '18:00', timezone: 'EST', enabled: true } as ReportSchedule,
  });
  // Load draft from localStorage
  useEffect(() => {
    const key = 'reports.builderDraft.v2';
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setReportConfig((rc) => ({ ...rc, ...parsed }));
        }
      }
    } catch {}
  }, []);

  // Persist draft to localStorage
  useEffect(() => {
    const key = 'reports.builderDraft.v2';
    try {
      const toSave = {
        name: reportConfig.name,
        description: reportConfig.description,
        subject: reportConfig.subject,
        frequency: reportConfig.frequency,
        recipients: reportConfig.recipients,
        includeCharts: reportConfig.includeCharts,
        template: reportConfig.template,
        checks: reportConfig.checks,
        sections: reportConfig.sections,
        schedule: reportConfig.schedule,
      };
      window.localStorage.setItem(key, JSON.stringify(toSave));
    } catch {}
  }, [reportConfig]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingIndicator, setSavingIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testRecipients, setTestRecipients] = useState<string[]>([]);
  const [sendingTest, setSendingTest] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  // Manual section selector state (per section)
  const [checkMeta, setCheckMeta] = useState<Record<string, { name: string; csiId: string; csiName: string }>>({});
  const [manualSearch, setManualSearch] = useState<Record<string, string>>({});
  const [manualResults, setManualResults] = useState<Record<string, CheckSearchOption[]>>({});
  const [manualLoading, setManualLoading] = useState<Record<string, boolean>>({});
  const searchTimersRef = useRef<Record<string, any>>({});
  const autosaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (params.id) {
      // load existing report for editing (best-effort)
      reportsApi.getById(params.id).then((r: any) => {
        const safeSections = Array.isArray(r.sections)
          ? r.sections.map((s: any) => ({
              id: s.id,
              title: s.title ?? '',
              kind: s.kind,
              checkIds: Array.isArray(s.checkIds) ? s.checkIds : s.kind === 'manual' ? [] : undefined,
              rule: s.kind === 'rule' ? (s.rule || {}) : undefined,
            }))
          : [];
        setReportConfig({
          name: r.name ?? '',
          description: r.description ?? '',
          subject: r.name ?? '',
          frequency: r.schedule?.frequency || 'daily',
          recipients: Array.isArray(r.recipients) ? r.recipients.join(', ') : (r.recipients || ''),
          includeCharts: true,
          template: r.template || 'executive-summary',
          checks: r.selectedChecks || (r.checks || []),
          sections: safeSections,
          schedule: r.schedule || { frequency: 'daily', time: '18:00', timezone: 'EST', enabled: true },
        });
        setDraftId(r.id);
      }).catch(() => {});
    }
  }, [params.id]);

  useEffect(() => {
    dispatch(fetchReports(undefined));
  }, [dispatch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSaveReport();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleGeneratePreview();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [reportConfig, draftId]);

  // Unsaved changes protection
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const isDirty = true; // lightweight: assume dirty when this component is mounted and config can be changed
    if (isDirty) {
      window.addEventListener('beforeunload', beforeUnload);
    }
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  const ensureMetaForIds = async (ids: string[]) => {
    const missing = ids.filter((id) => !checkMeta[id]);
    if (missing.length === 0) return;
    try {
      const fetched = await Promise.all(missing.map(async (id) => {
        try {
          const c = await checksApi.getCheckById(id);
          return { id, name: c.name, csiId: c.csiId, csiName: c.csiName } as CheckSearchOption & { id: string };
        } catch { return null; }
      }));
      const next: Record<string, { name: string; csiId: string; csiName: string }> = {};
      for (const it of fetched) {
        if (it && it.id) next[it.id] = { name: it.name, csiId: it.csiId, csiName: it.csiName };
      }
      if (Object.keys(next).length) setCheckMeta((m) => ({ ...m, ...next }));
    } catch {}
  };

  useEffect(() => {
    const allIds: string[] = (reportConfig.sections || [])
      .filter((s: any) => s.kind === 'manual')
      .flatMap((s: any) => (Array.isArray(s.checkIds) ? s.checkIds : []));
    void ensureMetaForIds(Array.from(new Set(allIds)));
  }, [reportConfig.sections]);

  const handleManualInputChange = (sectionId: string, q: string) => {
    setManualSearch((m) => ({ ...m, [sectionId]: q }));
    if (searchTimersRef.current[sectionId]) window.clearTimeout(searchTimersRef.current[sectionId]);
    if (!q.trim()) {
      setManualResults((r) => ({ ...r, [sectionId]: [] }));
      setManualLoading((l) => ({ ...l, [sectionId]: false }));
      return;
    }
    setManualLoading((l) => ({ ...l, [sectionId]: true }));
    searchTimersRef.current[sectionId] = window.setTimeout(async () => {
      try {
        const res = await checksApi.getChecks({ page: 1, limit: 10, filters: { searchQuery: q } });
        const items: CheckSearchOption[] = (res.data || []).map((c: any) => ({ id: c.id, name: c.name, csiId: c.csiId, csiName: c.csiName }));
        setManualResults((r) => ({ ...r, [sectionId]: items }));
      } finally {
        setManualLoading((l) => ({ ...l, [sectionId]: false }));
      }
    }, 300);
  };

  const addCheckToSection = (sectionIndex: number, option: CheckSearchOption) => {
    const updated = [...reportConfig.sections];
    const target = updated[sectionIndex];
    if (target.kind !== 'manual') return;
    const manual = target as ManualReportSection;
    const ids = new Set<string>(manual.checkIds || []);
    ids.add(option.id);
    updated[sectionIndex] = { ...manual, checkIds: Array.from(ids.values()) } as ManualReportSection;
    setReportConfig((rc) => ({ ...rc, sections: updated }));
    setCheckMeta((m) => ({ ...m, [option.id]: { name: option.name, csiId: option.csiId, csiName: option.csiName } }));
    setManualSearch((s) => ({ ...s, [target.id]: '' }));
  };

  const removeCheckFromSection = (sectionIndex: number, id: string) => {
    const updated = [...reportConfig.sections];
    const target = updated[sectionIndex];
    if (target.kind !== 'manual') return;
    const manual = target as ManualReportSection;
    updated[sectionIndex] = { ...manual, checkIds: (manual.checkIds || []).filter((x: string) => x !== id) } as ManualReportSection;
    setReportConfig((rc) => ({ ...rc, sections: updated }));
  };

  // Auto-refresh preview when subject or sections change (debounced)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void handleGeneratePreview();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [reportConfig.subject, reportConfig.sections]);

  const handleAddCheck = (id: string) => {
    if (!reportConfig.checks.includes(id)) {
      setReportConfig((rc) => ({ ...rc, checks: [...rc.checks, id] }));
    }
  };
  const handleRemoveCheck = (id: string) => {
    setReportConfig((rc) => ({ ...rc, checks: rc.checks.filter((x) => x !== id) }));
  };

  const handleSaveReport = async () => {
    try {
      setSaving(true);
      setSavingIndicator('saving');
      const payload = {
        name: reportConfig.name || 'Untitled Report',
        description: reportConfig.description,
        subject: reportConfig.subject || reportConfig.name || 'Checks Report',
        frequency: reportConfig.frequency as any,
        recipients: (reportConfig.recipients || '').split(',').map((s) => s.trim()).filter(Boolean),
        includeCharts: reportConfig.includeCharts,
        template: reportConfig.template,
        sections: reportConfig.sections,
        schedule: reportConfig.schedule,
      };
      if (draftId || isEditMode) {
        const idToUpdate = draftId || (params.id as string);
        try {
          const updated = await reportsApi.updateReport(idToUpdate, payload as any);
          setDraftId(updated.id);
          setSavingIndicator('saved');
          window.setTimeout(() => setSavingIndicator('idle'), 1500);
          return updated.id;
        } catch (e: any) {
          // Fallback: if report not found (e.g., mock reset), create a new one seamlessly
          if (e?.response?.status === 404) {
            const created = await dispatch(createReport(payload as any)).unwrap();
            setDraftId(created.id);
            setSavingIndicator('saved');
            window.setTimeout(() => setSavingIndicator('idle'), 1500);
            return created.id;
          }
          throw e;
        }
      } else {
        const created = await dispatch(createReport(payload as any)).unwrap();
        setDraftId(created.id);
        setSavingIndicator('saved');
        window.setTimeout(() => setSavingIndicator('idle'), 1500);
        return created.id;
      }
    } catch (e) {
      console.error('Failed to save report', e);
      setSnack({ open: true, message: 'Save failed', severity: 'error' });
      return null;
    } finally { setSaving(false); }
  };

  const handleGeneratePreview = async () => {
    let id = draftId;
    if (!id) {
      id = await handleSaveReport();
      if (!id) return;
    } else {
      try {
        await reportsApi.updateReport(id, {
          name: reportConfig.name || 'Untitled Report',
          description: reportConfig.description,
          subject: reportConfig.subject || reportConfig.name || 'Checks Report',
          frequency: reportConfig.frequency as any,
          recipients: (reportConfig.recipients || '').split(',').map((s) => s.trim()).filter(Boolean),
          includeCharts: reportConfig.includeCharts,
          template: reportConfig.template,
          checks: reportConfig.checks,
          sections: reportConfig.sections,
          schedule: reportConfig.schedule,
        } as any);
      } catch (e) {
        console.error('Failed to update before preview', e);
        setSnack({ open: true, message: 'Could not sync latest edits before preview', severity: 'error' });
      }
    }
    try {
      await dispatch(generatePreview(id)).unwrap();
    } catch {
      setSnack({ open: true, message: 'Preview failed to generate', severity: 'error' });
    }
  };

  // Debounced autosave when editing
  useEffect(() => {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void handleSaveReport();
    }, 1200) as unknown as number;
    return () => { if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current); };
  }, [reportConfig.name, reportConfig.description, reportConfig.subject, reportConfig.sections, reportConfig.schedule, reportConfig.recipients, reportConfig.template, reportConfig.includeCharts]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          {isEditMode ? `Edit Report${reportConfig.name ? `: ${reportConfig.name}` : ''}` : 'Create Report'}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Save (⌘S)"><span>
            <Button variant="contained" size="small" startIcon={<Save />} onClick={handleSaveReport} disabled={saving} aria-label="save report">
              {saving ? 'Saving…' : 'Save Report'}
            </Button>
          </span></Tooltip>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 1 }} aria-live="polite" role="status">
            {savingIndicator === 'saving' && <>
              <Info fontSize="small" color="info" />
              <Typography variant="caption" color="text.secondary">Saving…</Typography>
            </>}
            {savingIndicator === 'saved' && <>
              <CheckCircle fontSize="small" color="success" />
              <Typography variant="caption" color="text.secondary">All changes saved</Typography>
            </>}
          </Stack>
        </Stack>
      </Stack>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Configuration" />
            <CardContent>
              <Stack spacing={2}>
                <TextField
                  label="Report Name"
                  value={reportConfig.name}
                  onChange={(e) => setReportConfig({ ...reportConfig, name: e.target.value })}
                  fullWidth
                  required
                  error={!reportConfig.name.trim()}
                  helperText={!reportConfig.name.trim() ? 'Name is required' : ' '}
                  inputProps={{ 'aria-label': 'Report Name' }}
                />
                <TextField label="Description" value={reportConfig.description} onChange={(e) => setReportConfig({ ...reportConfig, description: e.target.value })} fullWidth multiline rows={3} />
                {!reportConfig.name && (
                  <Typography variant="caption" color="error">Report name is required to save.</Typography>
                )}
                <Divider />
                <Typography variant="subtitle2">Check Sections (grouped content)</Typography>
                <Stack spacing={1}>
                  {reportConfig.sections.length === 0 && (
                    <Typography variant="caption" color="text.secondary">No sections yet. Add manual or rule-based sections.</Typography>
                  )}
                  {reportConfig.sections.map((s, idx) => (
                    <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Stack direction="row" spacing={1} alignItems="center">
                            <TextField size="small" label="Title" value={s.title || ''} required error={!String(s.title || '').trim()} helperText={!String(s.title || '').trim() ? 'Title is required' : ' '} onChange={(e) => {
                              const updated = [...reportConfig.sections];
                              updated[idx] = { ...updated[idx], title: e.target.value };
                              setReportConfig((rc) => ({ ...rc, sections: updated }));
                            }} sx={{ minWidth: 240 }} />
                            <Chip size="small" label={s.kind} />
                          </Stack>
                          <Stack direction="row" spacing={1}>
                            <Button size="small" onClick={() => {
                              if (idx > 0) {
                                const updated = [...reportConfig.sections];
                                const [moved] = updated.splice(idx, 1);
                                updated.splice(idx - 1, 0, moved);
                                setReportConfig((rc) => ({ ...rc, sections: updated }));
                              }
                            }}>Up</Button>
                            <Button size="small" onClick={() => {
                              if (idx < (reportConfig.sections.length - 1)) {
                                const updated = [...reportConfig.sections];
                                const [moved] = updated.splice(idx, 1);
                                updated.splice(idx + 1, 0, moved);
                                setReportConfig((rc) => ({ ...rc, sections: updated }));
                              }
                            }}>Down</Button>
                            <Button size="small" color="error" onClick={() => {
                              setReportConfig((rc) => ({ ...rc, sections: rc.sections.filter((x) => x.id !== s.id) }));
                            }}>Remove</Button>
                          </Stack>
                        </Stack>
                        {s.kind === 'manual' ? (
                          <Stack spacing={1}>
                            <Autocomplete<CheckSearchOption>
                              options={manualResults[s.id] || []}
                              getOptionLabel={(opt: CheckSearchOption) => `${opt.name} (${opt.csiId} - ${opt.csiName})`}
                              loading={!!manualLoading[s.id]}
                              inputValue={manualSearch[s.id] || ''}
                              clearOnBlur
                              clearOnEscape
                              filterOptions={(x) => x}
                              onInputChange={(_: any, v: string) => handleManualInputChange(s.id, v)}
                              renderOption={(props, option) => (
                                <li {...props} key={option.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>{option.name} ({option.csiId} - {option.csiName})</span>
                                  <Button size="small" startIcon={<Add />} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); addCheckToSection(idx, option); }}>Add</Button>
                                </li>
                              )}
                              onChange={(_: any, val: CheckSearchOption | null) => { if (val) addCheckToSection(idx, val); }}
                              renderInput={(params: any) => (
                                <TextField
                                  {...params}
                                  size="small"
                                  placeholder="Search checks to add to this section"
                                  InputProps={{
                                    ...params.InputProps,
                                    startAdornment: <Search fontSize="small" sx={{ mr: 1 }} />,
                                  }}
                                />
                              )}
                            />
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ rowGap: 1 }}>
                              {((s as ManualReportSection).checkIds || []).map((id) => {
                                const meta = checkMeta[id];
                                const label = meta ? `${meta.name} (${meta.csiId} - ${meta.csiName})` : id;
                                return (
                                  <Chip key={id} label={label} size="small" onDelete={() => removeCheckFromSection(idx, id)} />
                                );
                              })}
                            </Stack>
                          </Stack>
                        ) : (
                          <RuleBuilder value={s.rule || {}} onChange={(rule) => {
                            const updated = [...reportConfig.sections];
                            updated[idx] = { ...updated[idx], rule } as any;
                            setReportConfig((rc) => ({ ...rc, sections: updated }));
                          }} />
                        )}
                      </Stack>
                    </Paper>
                  ))}
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" size="small" onClick={() => {
                      const id = `section-${Date.now()}`;
                      const newSection: ReportSection = { id, title: 'New Manual Section', kind: 'manual', checkIds: [] };
                      setReportConfig((rc) => ({ ...rc, sections: [...rc.sections, newSection] }));
                    }}>Add Manual Section</Button>
                    <Button variant="outlined" size="small" onClick={() => {
                      const id = `section-${Date.now()}`;
                      const newSection: ReportSection = { id, title: 'New Rule Section', kind: 'rule', rule: { limit: 10, sort: 'failing-first' } } as any;
                      setReportConfig((rc) => ({ ...rc, sections: [...rc.sections, newSection] }));
                    }}>Add Rule-based Section</Button>
                  </Stack>
                </Stack>
                <Divider />
                <ScheduleEditor
                  enabled={reportConfig.schedule.enabled}
                  frequency={reportConfig.schedule.frequency as any}
                  time={reportConfig.schedule.time}
                  cron={reportConfig.schedule.cron}
                  timezone={reportConfig.schedule.timezone}
                  daysOfWeek={(reportConfig.schedule as any)?.daysOfWeek}
                  daysOfMonth={(reportConfig.schedule as any)?.daysOfMonth}
                  onChange={(n) => setReportConfig((rc) => ({
                    ...rc,
                    schedule: {
                      ...rc.schedule,
                      enabled: typeof n.enabled === 'boolean' ? n.enabled : rc.schedule.enabled,
                      frequency: (n.frequency as any) || rc.schedule.frequency,
                      time: n.time || rc.schedule.time,
                      cron: n.cron || rc.schedule.cron,
                      timezone: n.timezone || rc.schedule.timezone,
                      daysOfWeek: (n as any).daysOfWeek || (rc.schedule as any).daysOfWeek,
                      daysOfMonth: (n as any).daysOfMonth || (rc.schedule as any).daysOfMonth,
                    }
                  }))}
                />
                {/* Recipients removed from left pane per requirements; now lives in Live Preview card */}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader title="Live Preview" action={
              <Tooltip title="Refresh Preview (⌘⏎)"><span>
                <IconButton size="small" onClick={handleGeneratePreview} disabled={saving}><Refresh /></IconButton>
              </span></Tooltip>
            } />
            <CardContent sx={{ flex: 1 }}>
              <Stack spacing={2} sx={{ mb: 2 }}>
                <TextField label="Email Subject" value={reportConfig.subject} onChange={(e) => setReportConfig({ ...reportConfig, subject: e.target.value })} fullWidth />
                <RecipientsEditor value={(reportConfig.recipients || '').split(',').map((s) => s.trim()).filter(Boolean)} onChange={(arr) => setReportConfig((rc) => ({ ...rc, recipients: arr.join(', ') }))} reportId={draftId} />
              </Stack>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>{reportConfig.subject || reportConfig.name || 'Report Preview'}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  To: {reportConfig.recipients || 'recipients@citi.com'} • {new Date().toLocaleDateString()} • Schedule: {reportConfig.schedule.frequency}{reportConfig.schedule.time ? ` at ${reportConfig.schedule.time}` : ''}{reportConfig.schedule.timezone ? ` ${reportConfig.schedule.timezone}` : ''}
                </Typography>
                 {generatingPreview ? (
                  <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">Generating preview…</Typography>
                ) : (reportConfig.sections || []).length === 0 ? (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      No sections configured yet.
                    </Typography>
                    <Typography variant="body2">
                      Add a manual or rule-based section to build your report preview.
                    </Typography>
                  </Paper>
                ) : previewContent ? (
                  <Paper variant="outlined" sx={{ p: 0, mb: 2, overflow: 'hidden' }}>
                    <iframe title="Email Preview" style={{ border: 'none', width: '100%', height: 520, background: '#f3f4f6' }} srcDoc={(() => {
                      const anyWin = window as any;
                      if (typeof anyWin.__REPORT_HTML_PREVIEW__ === 'string' && anyWin.__REPORT_HTML_PREVIEW__.length > 0) return anyWin.__REPORT_HTML_PREVIEW__;
                      const safe = (previewContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                      return `<!DOCTYPE html><html><body style=\"font-family:ui-sans-serif,system-ui,Helvetica,Arial,sans-serif;padding:16px;\"><pre style=\"white-space:pre-wrap;margin:0;\">${safe}</pre></body></html>`;
                    })()} />
                  </Paper>
                ) : (
                  <>
                    <Typography variant="body2" sx={{ mb: 2 }}>{reportConfig.description || 'Your automated health monitoring report is ready.'}</Typography>
                    <Stack spacing={2}>
                      {(reportConfig.sections || []).map((s) => (
                        <Paper key={s.id} variant="outlined" sx={{ p: 2 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{s.title}</Typography>
                          {s.kind === 'manual' ? (
                            <Typography variant="caption" color="text.secondary">{s.checkIds?.length || 0} checks will be included</Typography>
                          ) : (
                            <Typography variant="caption" color="text.secondary">Rule-based section; contents resolved at send time</Typography>
                          )}
                        </Paper>
                      ))}
                    </Stack>
                  </>
                )}
              </Paper>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    {/* Send Test Dialog */}
    <Dialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Send Test Email</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <RecipientsEditor value={testRecipients} onChange={setTestRecipients} />
          <Typography variant="caption" color="text.secondary">Enter one or more email addresses to receive a test. These will not be saved to the report.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setTestDialogOpen(false)}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<Send />}
          disabled={testRecipients.length === 0 || sendingTest}
          onClick={async () => {
            let id = draftId;
            if (!id) {
              id = await handleSaveReport();
            }
            if (!id) return;
            try {
              setSendingTest(true);
              await Promise.all(testRecipients.map((to) => reportsApi.sendTest(id!, to)));
              setTestDialogOpen(false);
              setSnack({ open: true, message: `Test email sent to ${testRecipients.length} recipient${testRecipients.length > 1 ? 's' : ''}` , severity: 'success' });
            } finally {
              setSendingTest(false);
            }
          }}
        >
          {sendingTest ? 'Sending…' : 'Send Test'}
        </Button>
      </DialogActions>
    </Dialog>
    {/* Toast (aligned with Studio) */}
    <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} sx={{ width: '100%' }} variant="filled">
        {snack.message}
      </Alert>
    </Snackbar>
    </Box>
  );
};

export default ReportBuilder;



'@
}

# File 71: src/pages/Reports/ReportDetailsPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/Reports/ReportDetailsPage.tsx'
  SizeBytes    = 13049
  Sha256       = 'cdc72cf74bd9889fee43ac1b2541253613917bebfbf0a36e71e65e59a40d1b63'
  Content      = @'
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, CardHeader, Chip, Divider, Grid, IconButton, Stack, Typography, Button, Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Paper, Tooltip, Skeleton, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchReportById, fetchReportExecutions, pauseReport, resumeReport, duplicateReport, generatePreview, sendTestReport, runReportNow } from '@/store/slices/reportsSlice';
import EmptyState from '@/components/shared/States/EmptyState';
import ErrorState from '@/components/shared/States/ErrorState';
import { Preview, Edit, Pause, PlayArrow, ContentCopy, Send } from '@mui/icons-material';

const ReportDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data: reports, generatingPreview, previewContent, executionsByReportId, loading, errorsById } = useAppSelector((s) => s.reports);
  const report = useMemo(() => reports.find((r) => r.id === id), [reports, id]);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [viewEmailOpen, setViewEmailOpen] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<any | null>(null);

  const computeNextRun = (sched: any | undefined): string | null => {
    if (!sched || !sched.enabled) return null;
    const now = new Date();
    const time = (sched.time || '09:00').split(':');
    const target = new Date();
    target.setHours(parseInt(time[0] || '9', 10), parseInt(time[1] || '0', 10), 0, 0);
    if (sched.frequency === 'daily') {
      if (target <= now) target.setDate(target.getDate() + 1);
      return target.toLocaleString();
    }
    if (sched.frequency === 'weekly' && Array.isArray(sched.daysOfWeek) && sched.daysOfWeek.length) {
      const desired = sched.daysOfWeek[0];
      const day = now.getDay();
      let diff = desired - day;
      if (diff < 0 || (diff === 0 && target <= now)) diff += 7;
      target.setDate(target.getDate() + diff);
      return target.toLocaleString();
    }
    // Fallback
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.toLocaleString();
  };

  useEffect(() => {
    if (id) {
      dispatch(fetchReportById(id));
      dispatch(fetchReportExecutions(id));
    }
  }, [id, dispatch]);

  if (!id) return null;

  const notFound = id && errorsById && errorsById[id] === 404;

  return (
    <Box>
      {notFound && (
        <Box sx={{ mb: 2 }}>
          <ErrorState message="Report not found" onRetry={() => navigate('/checks/reports')} />
        </Box>
      )}
      <Card sx={{ mb: 2 }}>
        <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack spacing={0.5}>
            <Typography variant="h4" fontWeight={700}>{report?.name || 'Report Details'}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              {report ? <Chip size="small" label={report.status} color={report.status === 'active' ? 'success' : report.status === 'paused' ? 'warning' : 'default'} /> : <Skeleton width={60} />}
              <Typography variant="body2" color="text.secondary">{report?.description || `ID: ${id}`}</Typography>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary">Last sent: {report?.lastSent ? new Date(report.lastSent).toLocaleString() : '—'}</Typography>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1}>
          <Tooltip title="Edit">
            <span>
              <Button size="small" variant="outlined" startIcon={<Edit />} onClick={() => navigate(`/checks/reports/${id}/edit`)}>Edit</Button>
            </span>
          </Tooltip>
          {report?.status === 'paused' ? (
            <Tooltip title="Resume">
              <span>
                <Button size="small" variant="outlined" startIcon={<PlayArrow />} onClick={() => dispatch(resumeReport(id))}>Resume</Button>
              </span>
            </Tooltip>
          ) : (
            <Tooltip title="Pause">
              <span>
                <Button size="small" variant="outlined" startIcon={<Pause />} onClick={() => dispatch(pauseReport(id))}>Pause</Button>
              </span>
            </Tooltip>
          )}
          <Tooltip title="Duplicate">
            <span>
              <Button size="small" variant="outlined" startIcon={<ContentCopy />} onClick={() => dispatch(duplicateReport(id))}>Duplicate</Button>
            </span>
          </Tooltip>
          <Tooltip title="Send now">
            <span>
              <Button size="small" variant="contained" startIcon={<Send />} onClick={async () => {
                try {
                  await dispatch(runReportNow(id)).unwrap();
                  setSnack({ open: true, message: 'Report sent (mock)', severity: 'success' });
                } catch {
                  setSnack({ open: true, message: 'Send failed', severity: 'error' });
                }
              }}>Send now</Button>
            </span>
          </Tooltip>
        </Stack>
        </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardHeader title="Overview"/>
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Stack spacing={1}>
                      <Typography variant="body2">Schedule: {report ? `${report?.schedule?.frequency || '—'} ${report?.schedule?.time || ''}` : <Skeleton width={160} />}</Typography>
                      <Typography variant="body2">Next send: {report ? (computeNextRun(report.schedule) || '—') : (<Skeleton width={120} />)}</Typography>
                      <Typography variant="body2">Recipients: {report ? (report?.recipients?.length || 0) : (<Skeleton width={40} />)}</Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Stack spacing={1}>
                      <Typography variant="body2">Owner: {report?.createdBy || '—'}</Typography>
                      <Typography variant="body2">Sections: {report ? (Array.isArray((report as any)?.sections) ? (report as any).sections.length : 0) : (<Skeleton width={40} />)}</Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Sections</Typography>
                    <Stack spacing={1}>
                      {Array.isArray((report as any)?.sections) ? (
                        (report as any).sections.map((s: any) => (
                          <Stack key={s.id}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.title} <Chip size="small" label={s.kind} sx={{ ml: 1 }} /></Typography>
                            <Typography variant="caption" color="text.secondary">{s.kind === 'manual' ? `${(s.checkIds || []).length} checks` : 'Rule-based'}</Typography>
                          </Stack>
                        ))
                      ) : loading === 'loading' ? (
                        <>
                          <Skeleton height={24} />
                          <Skeleton height={24} width={200} />
                        </>
                      ) : (
                        <Typography variant="caption" color="text.secondary">This report uses a legacy flat list of checks.</Typography>
                      )}
                    </Stack>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardHeader title="Recent Sends"/>
              <CardContent>
                {Array.isArray(executionsByReportId?.[id]) && executionsByReportId![id].length > 0 ? (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Time</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Recipients</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {executionsByReportId![id].map((exec: any) => (
                          <TableRow key={exec.id} hover>
                            <TableCell>{new Date(exec.executionTime).toLocaleString()}</TableCell>
                            <TableCell>
                              <Chip size="small" label={exec.status} color={exec.status === 'success' ? 'success' : exec.status === 'partial' ? 'warning' : 'error'} />
                            </TableCell>
                            <TableCell align="right">{exec.recipientCount}</TableCell>
                            <TableCell align="right">
                              <Button size="small" onClick={() => { setSelectedExecution(exec); setViewEmailOpen(true); }}>View email</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <EmptyState title="No sends yet" description="This report hasn't been sent yet." onAction={async () => { try { await dispatch(runReportNow(id)).unwrap(); } catch {} }} />
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        <Grid item xs={12} md={7}>
          <Card variant="outlined" sx={{ position: 'sticky', top: 88 }}>
            <CardHeader title="Live Preview" action={<Button size="small" onClick={async () => { await dispatch(generatePreview(id)); }} disabled={generatingPreview}>Preview now</Button>} />
            <CardContent>
              {generatingPreview ? (
                <Typography variant="body2" color="text.secondary">Generating preview…</Typography>
              ) : previewContent ? (
                <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
                  <iframe
                    title="Report Preview"
                    style={{ border: 'none', width: '100%', height: 640, background: '#f3f4f6' }}
                    srcDoc={(() => {
                      const anyWin = window as any;
                      if (typeof anyWin.__REPORT_HTML_PREVIEW__ === 'string' && anyWin.__REPORT_HTML_PREVIEW__.length > 0) return anyWin.__REPORT_HTML_PREVIEW__;
                      const safe = (previewContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                      return `<!DOCTYPE html><html><body style=\"font-family:ui-sans-serif,system-ui,Helvetica,Arial,sans-serif;padding:16px;\"><pre style=\"white-space:pre-wrap;margin:0;\">${safe}</pre></body></html>`;
                    })()}
                  />
                </Paper>
              ) : (
                <Typography variant="body2" color="text.secondary">No preview yet.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={viewEmailOpen} onClose={() => setViewEmailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Sent Email</DialogTitle>
        <DialogContent dividers>
          {selectedExecution?.emailContent ? (
            <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
              <iframe title="Sent Email" style={{ border: 'none', width: '100%', height: 520, background: '#f3f4f6' }} srcDoc={selectedExecution.emailContent} />
            </Paper>
          ) : (
            <Typography variant="body2" color="text.secondary">No email content captured for this execution.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewEmailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} sx={{ width: '100%' }} variant="filled">
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ReportDetailsPage;



'@
}

# File 72: src/pages/Reports/ReportsHome.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/Reports/ReportsHome.tsx'
  SizeBytes    = 23715
  Sha256       = 'c17ca2d85cbbe67c224d04d33f53725f6318aa584d84b5768d056f010343ff0c'
  Content      = @'
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Grid, Skeleton, Stack, TextField, Typography, Select, MenuItem, InputLabel, FormControl, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, Toolbar, Alert, Snackbar, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, LinearProgress, InputAdornment, Menu, CircularProgress, Paper, Tooltip } from '@mui/material';
import { Search as SearchIcon, FilterList, Add as AddIcon, Visibility, Edit as EditIcon, ContentCopy, Pause, PlayArrow, Delete as DeleteIcon, Preview, MoreVert, Send, Assessment } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchReports, pauseReport, resumeReport, duplicateReport, deleteReportThunk, runReportNow } from '@/store/slices/reportsSlice';
import { fetchChecks } from '@/store/slices/checksSlice';
import reportsApi from '@/services/api/reportsApi';
import { useNavigate } from 'react-router-dom';
import EmptyState from '@/components/shared/States/EmptyState';
import ErrorState from '@/components/shared/States/ErrorState';

const ReportsHome: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data, loading, error, lastFetched } = useAppSelector((s) => s.reports);
  const searchContext = useAppSelector((s) => s.dashboard.searchContext);
  const checksData = useAppSelector((s) => s.checks.data);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [templateFilter, setTemplateFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('Report Preview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuReportId, setMenuReportId] = useState<string | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, 'active' | 'paused' | 'draft'>>({});

  useEffect(() => {
    const freshMs = 60 * 1000;
    const last = lastFetched ? new Date(lastFetched).getTime() : 0;
    if (!last || Date.now() - last > freshMs) {
      dispatch(fetchReports(undefined));
    }
    // Also fetch checks to determine CSI relationships
    if (!checksData || checksData.length === 0) {
      dispatch(fetchChecks({ page: 1, limit: 100 }));
    }
  }, [dispatch, lastFetched, checksData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>('input[placeholder="Search reports..."]');
        el?.focus();
      }
      if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const first = (data && data.length > 0) ? data[0] : undefined;
        if (first) {
          setPreviewOpen(true);
          setPreviewTitle(first.name);
          setPreviewLoading(true);
          reportsApi.previewReport(first.id).then((resp) => setPreviewContent(resp.preview)).finally(() => setPreviewLoading(false));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [data]);

  const filteredReports = useMemo(() => {
    let result = data || [];
    
    // Apply global CSI filter
    if (searchContext.csiId && checksData) {
      // Get all check IDs that belong to the selected CSI
      const csiCheckIds = checksData
        .filter(check => check.csiId === searchContext.csiId)
        .map(check => check.id);
      
      // Filter reports that either:
      // 1. Include checks from the selected CSI
      // 2. Have sections with rules that include the selected CSI
      result = result.filter((report) => {
        // Check if report has any checks from the selected CSI
        const hasChecksFromCSI = report.selectedChecks.some(checkId => 
          csiCheckIds.includes(checkId)
        );
        
        // Check if report has sections with rules that include the CSI
        const hasSectionWithCSI = (report as any).sections?.some((section: any) => 
          section.rule?.csiIds?.includes(searchContext.csiId)
        );
        
        return hasChecksFromCSI || hasSectionWithCSI;
      });
    }
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
    }
    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (templateFilter) {
      result = result.filter((r) => (r as any).template === templateFilter);
    }
    return result;
  }, [data, searchQuery, statusFilter, templateFilter, searchContext.csiId, checksData]);

  const paginatedReports = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredReports.slice(start, start + rowsPerPage);
  }, [filteredReports, page, rowsPerPage]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3} sx={{ rowGap: 1 }}>
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Assessment sx={{ fontSize: 32, color: 'primary.main' }} />
            All Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">Create, preview, and manage scheduled reports</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/checks/reports/new')} size="large">Create Report</Button>
        </Stack>
      </Stack>

      {/* Global search context indicator */}
      {searchContext.csiId && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Global filter active:</Typography>
            <Chip label={`CSI: ${searchContext.csiId}`} size="small" />
            <Typography variant="body2" sx={{ ml: 2 }}>
              Showing reports that include checks or rules for this CSI
            </Typography>
          </Stack>
        </Alert>
      )}

      <Card elevation={0} sx={{ border: theme => `1px solid ${theme.palette.divider}`, mb: 3 }}>
        <CardContent>
          <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField fullWidth placeholder="Search reports..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /> </InputAdornment>) }} />
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
                  <MenuItem value="">All Status</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="paused">Paused</MenuItem>
                  <MenuItem value="draft">Draft</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Template</InputLabel>
                <Select value={templateFilter} label="Template" onChange={(e) => setTemplateFilter(e.target.value)}>
                  <MenuItem value="">All Templates</MenuItem>
                  <MenuItem value="standard">Standard</MenuItem>
                  <MenuItem value="executive">Executive</MenuItem>
                  <MenuItem value="detailed">Detailed</MenuItem>
                  <MenuItem value="alert-digest">Alert Digest</MenuItem>
                  <MenuItem value="trend-analysis">Trend Analysis</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                 <Button variant="outlined" startIcon={<FilterList />} onClick={() => { setSearchQuery(''); setStatusFilter(''); setTemplateFilter(''); }}>Clear Filters</Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <Card elevation={0} sx={{ mb: 2, border: theme => `1px solid ${theme.palette.divider}` }}>
          <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">{selectedIds.length} selected</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={async () => { await Promise.all(selectedIds.map(id => dispatch(pauseReport(id)))); setSelectedIds([]); setSnackbar({ open: true, message: 'Paused selected reports', severity: 'success' }); }}>Pause</Button>
              <Button size="small" variant="outlined" onClick={async () => { await Promise.all(selectedIds.map(id => dispatch(resumeReport(id)))); setSelectedIds([]); setSnackbar({ open: true, message: 'Resumed selected reports', severity: 'success' }); }}>Resume</Button>
              <Button size="small" color="error" variant="contained" onClick={() => { setSelectedReport(null); setDeleteDialogOpen(true); }}>Delete</Button>
              <Button size="small" onClick={() => setSelectedIds([])}>Clear</Button>
            </Stack>
          </Toolbar>
        </Card>
      )}

      <Card elevation={0} sx={{ border: theme => `1px solid ${theme.palette.divider}` }}>
        {loading === 'loading' && <LinearProgress />}
        {loading === 'failed' && (
          <Box sx={{ p: 2 }}>
            <ErrorState message={error || 'Failed to load reports'} onRetry={() => dispatch(fetchReports(undefined))} />
          </Box>
        )}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={paginatedReports.length > 0 && selectedIds.length > 0 && selectedIds.length < paginatedReports.length}
                    checked={paginatedReports.length > 0 && paginatedReports.every(r => selectedIds.includes(r.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const ids = Array.from(new Set([...selectedIds, ...paginatedReports.map(r => r.id)]));
                        setSelectedIds(ids);
                      } else {
                        const visibleIds = new Set(paginatedReports.map(r => r.id));
                        setSelectedIds(selectedIds.filter(id => !visibleIds.has(id)));
                      }
                    }}
                  />
                </TableCell>
                <TableCell>Report Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Recipients</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading === 'loading' ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 4 }}>
                    <Stack spacing={1}>
                      {[...Array(5)].map((_, idx) => (
                        <Stack key={idx} direction="row" spacing={2} alignItems="center">
                          <Skeleton variant="circular" width={24} height={24} />
                          <Skeleton variant="text" sx={{ flex: 1 }} height={20} />
                          <Skeleton variant="text" width={120} height={20} />
                        </Stack>
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : paginatedReports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <EmptyState title="No reports found" description="Adjust filters or create a new report to get started." actionLabel="Create Report" onAction={() => navigate('/checks/reports/new')} />
                  </TableCell>
                </TableRow>
              )}
              {paginatedReports.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox checked={selectedIds.includes(r.id)} onChange={() => setSelectedIds(prev => prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id])} />
                  </TableCell>
                  <TableCell>
                    <Stack>
                      <Typography onClick={() => navigate(`/checks/reports/${r.id}`)} variant="subtitle2" fontWeight={600} sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>{r.name}</Typography>
                      {r.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{r.description}</Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const rowStatus = optimisticStatus[r.id] ?? r.status;
                      return (
                        <Chip label={rowStatus} size="small" color={rowStatus === 'active' ? 'success' : rowStatus === 'paused' ? 'warning' : 'default'} aria-label={`status ${rowStatus}`} />
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{r.schedule ? `${r.schedule.frequency} ${r.schedule.time ?? ''}` : '—'}</Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    <Typography variant="body2">{r.recipients?.length ?? 0}</Typography>
                  </TableCell>
                   <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                    {r.status !== 'draft' && (
                        <Tooltip title={r.status === 'paused' ? 'Resume' : 'Pause'}>
                          <span>
                            <IconButton
                          size="small"
                          onClick={async () => {
                            try {
                              setStatusLoadingId(r.id);
                              const previous = r.status;
                              const next = previous === 'paused' ? 'active' : 'paused';
                              setOptimisticStatus((prev) => ({ ...prev, [r.id]: next }));
                              const action = previous === 'paused' ? resumeReport(r.id) : pauseReport(r.id);
                              try {
                                await dispatch(action).unwrap();
                              } catch {
                                // revert visual override on failure
                                setOptimisticStatus((prev) => ({ ...prev, [r.id]: previous }));
                              }
                            } finally {
                              setStatusLoadingId(null);
                              // clear override to reflect store state
                              setOptimisticStatus((prev) => { const { [r.id]: _omit, ...rest } = prev; return rest; });
                            }
                          }}
                          disabled={statusLoadingId === r.id}
                          aria-label={r.status === 'paused' ? 'resume report' : 'pause report'}
                        >
                          {statusLoadingId === r.id ? (
                            <CircularProgress size={16} />
                          ) : r.status === 'paused' ? (
                            <PlayArrow />
                          ) : (
                            <Pause />
                          )}
                        </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      <Tooltip title="Quick Preview">
                        <span>
                      <IconButton size="small" aria-label="quick preview" onClick={async () => {
                        try {
                          setPreviewLoading(true);
                          setPreviewLoadingId(r.id);
                          setPreviewOpen(true);
                          setPreviewTitle(r.name);
                          const resp = await reportsApi.previewReport(r.id);
                          try { (window as any).__REPORT_HTML_PREVIEW__ = resp?.html; } catch {}
                          setPreviewContent(resp.preview || '');
                        } catch {
                          setPreviewContent('Failed to load preview');
                        } finally {
                          setPreviewLoading(false);
                          setPreviewLoadingId(null);
                        }
                      }}>
                        {previewLoadingId === r.id ? (<CircularProgress size={16} />) : (<Preview />)}
                      </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Send now">
                        <span>
                      <IconButton size="small" aria-label="send now" onClick={async () => {
                        try {
                          await dispatch(runReportNow(r.id)).unwrap();
                          setSnackbar({ open: true, message: 'Report sent (mock)', severity: 'success' });
                        } catch {
                          setSnackbar({ open: true, message: 'Send failed', severity: 'error' });
                        }
                      }}>
                        <Send />
                      </IconButton>
                        </span>
                      </Tooltip>
                      <IconButton size="small" onClick={(e) => { setMenuAnchorEl(e.currentTarget); setMenuReportId(r.id); }}>
                        <MoreVert />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={filteredReports.length} page={page} onPageChange={(_, newPage) => setPage(newPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} rowsPerPageOptions={[10, 25, 50, 100]} />
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Report{selectedReport ? '' : 's'}</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete {selectedReport ? 'this report' : 'the selected reports'}? This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={async () => {
            try {
              if (selectedReport) {
                await dispatch(deleteReportThunk(selectedReport));
              } else {
                await Promise.all(selectedIds.map(id => dispatch(deleteReportThunk(id))));
                setSelectedIds([]);
              }
              setSnackbar({ open: true, message: 'Deleted successfully', severity: 'success' });
            } catch {
              setSnackbar({ open: true, message: 'Delete failed', severity: 'error' });
            } finally {
              setDeleteDialogOpen(false);
              setSelectedReport(null);
            }
          }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Quick Preview Dialog */}
        <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth aria-labelledby="quick-preview-title">
        <DialogTitle id="quick-preview-title">{previewTitle}</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{new Date().toLocaleString()}</Typography>
            {previewLoading ? (
              <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">Loading…</Typography>
            ) : (
              <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
                <iframe
                  title="Report Quick Preview"
                  style={{ border: 'none', width: '100%', height: 520, background: '#f3f4f6' }}
                  srcDoc={(() => {
                    const anyWin = window as any;
                    if (typeof anyWin.__REPORT_HTML_PREVIEW__ === 'string' && anyWin.__REPORT_HTML_PREVIEW__.length > 0) return anyWin.__REPORT_HTML_PREVIEW__;
                    const safe = (previewContent || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    return `<!DOCTYPE html><html><body style=\"font-family:ui-sans-serif,system-ui,Helvetica,Arial,sans-serif;padding:16px;\"><pre style=\"white-space:pre-wrap;margin:0;\">${safe}</pre></body></html>`;
                  })()}
                />
              </Paper>
            )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>

      {/* Row Actions Menu */}
      <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={() => { setMenuAnchorEl(null); setMenuReportId(null); }}>
        <MenuItem onClick={() => { if (menuReportId) navigate(`/checks/reports/${menuReportId}/edit`); setMenuAnchorEl(null); }}>Edit</MenuItem>
        
        <MenuItem onClick={async () => { if (menuReportId) await dispatch(duplicateReport(menuReportId)); setMenuAnchorEl(null); }}>Duplicate</MenuItem>
        <MenuItem onClick={() => { setSelectedReport(menuReportId); setDeleteDialogOpen(true); setMenuAnchorEl(null); }}>Delete</MenuItem>
      </Menu>
    </Box>
  );
};

export default ReportsHome;


'@
}

# File 73: src/pages/ReportsPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/ReportsPage/index.ts'
  SizeBytes    = 71
  Sha256       = '9f2f2a6b85933239d8bad7a1c1ad2c9f12768ebfd92db2cee3fb8dadeb442d1d'
  Content      = @'
export { default } from './ReportsPage';
export * from './ReportsPage';
'@
}

# File 74: src/pages/ReportsPage/ReportsPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/ReportsPage/ReportsPage.tsx'
  SizeBytes    = 44212
  Sha256       = '82a0c166718ab200f67ac433be59bfa8383f131b11cdf796aab38ec8bb0feb60'
  Content      = @'
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Button,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Avatar,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormGroup,
  Tabs,
  Tab,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Badge,
  useTheme,
  alpha,
} from '@mui/material';
import {
  AutoGraph,
  Schedule,
  Email,
  Add,
  Edit,
  Delete,
  Share,
  Download,
  Preview,
  Send,
  Settings,
  CheckCircle,
  Error,
  Warning,
  BarChart,
  PieChart,
  TrendingUp,
  CalendarToday,
  AccessTime,
  Group,
  Visibility,
  Assessment,
  Dashboard,
  DataUsage,
  Timeline,
  Analytics,
  InsertChart,
  ShowChart,
  DonutLarge,
  Refresh,
  Save,
  FileCopy,
  Search,
} from '@mui/icons-material';
import { Alert, Snackbar } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import reportsApi from '@/services/api/reportsApi';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchReports, createReport, generatePreview } from '@/store/slices/reportsSlice';
import { checksApi } from '@/services/api/checksApi';
import type { ReportEntity } from '@/types/reports/reportTypes';

// Deprecated component. Keeping for backward-compat in demos; replaced by pages in `pages/Reports/`.

// Placeholder analytics (static for prototype)
const ANALYTICS = {
  totalReportsSent: 1247,
  avgOpenRate: 87.3,
  avgClickRate: 45.2,
  mostPopularTemplate: 'executive-summary',
  topRecipient: 'platform-team@citi.com',
  deliverySuccess: 99.1,
  trends: [
    { period: 'Last 7 days', reports: 42, opens: 38, clicks: 19 },
    { period: 'Last 30 days', reports: 186, opens: 162, clicks: 84 },
    { period: 'Last 90 days', reports: 548, opens: 478, clicks: 248 }
  ]
} as const;

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`report-tabpanel-${index}`}
      aria-labelledby={`report-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const ReportsPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const params = useParams();
  const navigate = useNavigate();
  const { data: reports, loading: reportsLoading, previewContent, generatingPreview } = useAppSelector((s) => s.reports);
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [showNewReportDialog, setShowNewReportDialog] = useState(false);
  const [reportConfig, setReportConfig] = useState({
    name: '',
    description: '',
    subject: '',
    frequency: 'daily',
    recipients: '',
    includeCharts: true,
    template: 'executive-summary',
    checks: [] as string[]
  });
  const [draftId, setDraftId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; csiName: string }>>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [saving, setSaving] = useState(false);

  const selectedReportData: ReportEntity | undefined = useMemo(() => reports.find(r => r.id === selectedReport), [reports, selectedReport]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'paused': return 'warning';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  useEffect(() => {
    dispatch(fetchReports(undefined));
  }, [dispatch]);

  useEffect(() => {
    if (params.id) {
      setSelectedReport(params.id);
    }
  }, [params.id]);

  // Autosave builder draft to localStorage
  useEffect(() => {
    const key = 'reports.builderDraft.v1';
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setReportConfig((rc) => ({ ...rc, ...parsed }));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const key = 'reports.builderDraft.v1';
    try {
      window.localStorage.setItem(key, JSON.stringify({
        name: reportConfig.name,
        description: reportConfig.description,
        subject: reportConfig.subject,
        frequency: reportConfig.frequency,
        recipients: reportConfig.recipients,
        includeCharts: reportConfig.includeCharts,
        template: reportConfig.template,
        checks: reportConfig.checks,
      }));
    } catch {}
  }, [reportConfig]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSaveReport();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleGeneratePreview();
      }
      if (e.key === '/') {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [reportConfig, draftId]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await checksApi.getChecks({ page: 1, limit: 5, filters: { searchQuery: q } });
      const items = (res.data || []).map((c: any) => ({ id: c.id, name: c.name, csiName: c.csiName }));
      setSearchResults(items);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddCheck = (id: string) => {
    if (!reportConfig.checks.includes(id)) {
      setReportConfig((rc) => ({ ...rc, checks: [...rc.checks, id] }));
    }
  };

  const handleRemoveCheck = (id: string) => {
    setReportConfig((rc) => ({ ...rc, checks: rc.checks.filter((x) => x !== id) }));
  };

  const handleSaveReport = async () => {
    try {
      setSaving(true);
      const payload = {
        name: reportConfig.name || 'Untitled Report',
        description: reportConfig.description,
        subject: reportConfig.subject || reportConfig.name || 'Checks Report',
        frequency: reportConfig.frequency as any,
        recipients: (reportConfig.recipients || '').split(',').map((s) => s.trim()).filter(Boolean),
        includeCharts: reportConfig.includeCharts,
        template: reportConfig.template,
        checks: reportConfig.checks,
      };
      const created = await dispatch(createReport(payload as any)).unwrap();
      setDraftId(created.id);
      setSnack({ open: true, message: 'Report saved', severity: 'success' });
      return created.id;
    } catch (e: any) {
      setSnack({ open: true, message: e?.message || 'Failed to save report', severity: 'error' });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePreview = async () => {
    let id = draftId;
    if (!id) {
      id = await handleSaveReport();
      if (!id) return;
    } else {
      try {
        await reportsApi.updateReport(id, {
          name: reportConfig.name || 'Untitled Report',
          description: reportConfig.description,
          subject: reportConfig.subject || reportConfig.name || 'Checks Report',
          frequency: reportConfig.frequency as any,
          recipients: (reportConfig.recipients || '').split(',').map((s) => s.trim()).filter(Boolean),
          includeCharts: reportConfig.includeCharts,
          template: reportConfig.template,
          checks: reportConfig.checks,
        } as any);
      } catch {}
    }
    try {
      await dispatch(generatePreview(id)).unwrap();
      setSnack({ open: true, message: 'Preview generated', severity: 'success' });
    } catch (e: any) {
      setSnack({ open: true, message: e?.message || 'Failed to generate preview', severity: 'error' });
    }
  };

  return (
    <Box>
      {/* Enhanced Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Avatar sx={{ bgcolor: 'warning.main', width: 48, height: 48 }}>
                <AutoGraph sx={{ fontSize: 28 }} />
              </Avatar>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  Reports & Analytics
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Scope-aware reporting. Selections reflect your current CSI/tag scope.
                </Typography>
              </Box>
            </Box>
          </Box>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<FileCopy />}
              size="small"
            >
              Templates
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setShowNewReportDialog(true)}
            >
              New Report
            </Button>
          </Stack>
        </Box>

        {/* Analytics Overview */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.primary.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Reports Sent
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {ANALYTICS.totalReportsSent.toLocaleString()}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                      <TrendingUp sx={{ fontSize: 16, color: 'success.main' }} />
                      <Typography variant="caption" color="success.main">+8% this month</Typography>
                    </Box>
                  </Box>
                  <Email sx={{ fontSize: 48, color: 'primary.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.1)} 0%, ${alpha(theme.palette.success.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.success.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Open Rate
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'success.main' }}>
                      {ANALYTICS.avgOpenRate}%
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={ANALYTICS.avgOpenRate}
                      sx={{ 
                        mt: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.success.main, 0.2),
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: theme.palette.success.main,
                        }
                      }}
                    />
                  </Box>
                  <Visibility sx={{ fontSize: 48, color: 'success.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.1)} 0%, ${alpha(theme.palette.info.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.info.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Click Rate
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'info.main' }}>
                      {ANALYTICS.avgClickRate}%
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={ANALYTICS.avgClickRate}
                      sx={{ 
                        mt: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.info.main, 0.2),
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: theme.palette.info.main,
                        }
                      }}
                    />
                  </Box>
                  <Assessment sx={{ fontSize: 48, color: 'info.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.1)} 0%, ${alpha(theme.palette.warning.main, 0.05)} 100%)`,
              borderTop: `3px solid ${theme.palette.warning.main}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography color="text.secondary" variant="overline" sx={{ fontWeight: 600 }}>
                      Delivery Success
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: 'warning.main' }}>
                      {ANALYTICS.deliverySuccess}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {ANALYTICS.mostPopularTemplate} most used
                    </Typography>
                  </Box>
                  <CheckCircle sx={{ fontSize: 48, color: 'warning.main', opacity: 0.7 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Main Content with Tabs */}
      <Paper sx={{ overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={selectedTab} onChange={handleTabChange} aria-label="Reports sections">
            <Tab id="report-tab-0" aria-controls="report-tabpanel-0" label="Report Builder" icon={<Settings />} />
            <Tab id="report-tab-1" aria-controls="report-tabpanel-1" label="Scheduled Reports" icon={<Schedule />} />
            <Tab id="report-tab-2" aria-controls="report-tabpanel-2" label="Analytics" icon={<Analytics />} />
          </Tabs>
        </Box>

        {/* Report Builder Tab */}
        <TabPanel value={selectedTab} index={0}>
          <Grid container spacing={3} sx={{ p: 3, minHeight: '600px' }}>
            {/* Left Panel - Configuration */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardHeader
                  avatar={<Settings sx={{ color: 'primary.main' }} />}
                  title="Report Configuration"
                  subheader="Customize your report settings"
                  action={
                    <IconButton size="small" aria-label="save report">
                      <Save />
                    </IconButton>
                  }
                />
                <CardContent sx={{ flex: 1, overflow: 'auto' }}>
                  <Stack spacing={3}>
                    {/* Basic Settings */}
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                        Basic Information
                      </Typography>
                      <TextField
                        fullWidth
                        label="Email Subject"
                        placeholder="e.g., Checks Report: Daily Health Summary"
                        value={reportConfig.subject}
                        onChange={(e) => setReportConfig({ ...reportConfig, subject: e.target.value })}
                        sx={{ mb: 2 }}
                      />
                      <TextField
                        fullWidth
                        label="Report Name"
                        placeholder="e.g., Daily Health Summary"
                        value={reportConfig.name}
                        onChange={(e) => setReportConfig({...reportConfig, name: e.target.value})}
                        sx={{ mb: 2 }}
                      />
                      <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Description"
                        placeholder="Describe what this report covers..."
                        value={reportConfig.description}
                        onChange={(e) => setReportConfig({...reportConfig, description: e.target.value})}
                      />
                    </Box>

                    <Divider />

                    {/* Schedule Settings */}
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                        Schedule & Recipients
                      </Typography>
                      <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Frequency</InputLabel>
                        <Select
                          value={reportConfig.frequency}
                          label="Frequency"
                          onChange={(e) => setReportConfig({...reportConfig, frequency: e.target.value})}
                        >
                          <MenuItem value="hourly">Every Hour</MenuItem>
                          <MenuItem value="daily">Daily</MenuItem>
                          <MenuItem value="weekly">Weekly</MenuItem>
                          <MenuItem value="monthly">Monthly</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField
                        fullWidth
                        label="Recipients"
                        placeholder="email1@citi.com, email2@citi.com"
                        value={reportConfig.recipients}
                        onChange={(e) => setReportConfig({...reportConfig, recipients: e.target.value})}
                      />
                    </Box>

                    <Divider />

                    {/* Content Settings */}
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                        Content & Format
                      </Typography>
                      <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Template</InputLabel>
                        <Select
                          value={reportConfig.template}
                          label="Template"
                          onChange={(e) => setReportConfig({...reportConfig, template: e.target.value})}
                        >
                          <MenuItem value="executive-summary">Executive Summary</MenuItem>
                          <MenuItem value="detailed-report">Detailed Report</MenuItem>
                          <MenuItem value="alert-digest">Alert Digest</MenuItem>
                          <MenuItem value="trend-analysis">Trend Analysis</MenuItem>
                        </Select>
                      </FormControl>

                      <FormControlLabel
                        control={
                          <Switch
                            checked={reportConfig.includeCharts}
                            onChange={(e) => setReportConfig({...reportConfig, includeCharts: e.target.checked})}
                          />
                        }
                        label="Include Charts and Visualizations"
                        sx={{ mb: 2 }}
                      />

                       {/* Check Selection */}
                      <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                        Include Checks
                      </Typography>
                       <Stack spacing={1.5}>
                         <TextField
                           inputRef={searchInputRef}
                           placeholder="Search checks (press '/' to focus)"
                           value={searchQuery}
                           onChange={(e) => handleSearch(e.target.value)}
                           InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1 }} /> }}
                           aria-label="Search checks to add to report"
                         />
                         {searchLoading ? (
                           <Typography variant="caption" color="text.secondary">Searching…</Typography>
                         ) : searchResults.length > 0 ? (
                           <List dense sx={{ border: `1px dashed ${theme.palette.divider}`, borderRadius: 1 }}>
                             {searchResults.map((r) => (
                               <ListItem key={r.id} secondaryAction={
                                 <Button size="small" onClick={() => handleAddCheck(r.id)}>Add</Button>
                               }>
                                 <ListItemText primary={r.name} secondary={r.csiName} />
                               </ListItem>
                             ))}
                           </List>
                         ) : null}
                         <Stack direction="row" spacing={1} flexWrap="wrap">
                           {reportConfig.checks.map((id) => (
                             <Chip key={id} label={id} size="small" onDelete={() => handleRemoveCheck(id)} />
                           ))}
                           {reportConfig.checks.length === 0 && (
                             <Typography variant="caption" color="text.secondary">No checks selected</Typography>
                           )}
                         </Stack>
                       </Stack>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Right Panel - Live Preview */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardHeader
                  avatar={<Preview sx={{ color: 'info.main' }} />}
                  title="Live Preview"
                  subheader="Real-time email preview"
                  action={
                    <Stack direction="row" spacing={1}>
                      <Tooltip title="Generate Preview (⌘⏎)"><span>
                        <IconButton size="small" onClick={handleGeneratePreview} disabled={saving}>
                          <Preview />
                        </IconButton>
                      </span></Tooltip>
                      <Tooltip title="Save Draft (⌘S)"><span>
                        <IconButton size="small" onClick={handleSaveReport} disabled={saving}>
                          <Send />
                        </IconButton>
                      </span></Tooltip>
                      <Tooltip title="Export HTML">
                        <IconButton size="small" disabled>
                          <Download />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  }
                />
                <CardContent sx={{ flex: 1, overflow: 'auto' }}>
                  {/* Email Preview */}
                  <Paper 
                    variant="outlined" 
                    sx={{ 
                      height: '100%',
                      p: 3,
                      bgcolor: '#FAFAFA',
                      border: '2px dashed',
                      borderColor: 'divider',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {/* Email Header */}
                    <Box sx={{ mb: 3, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {reportConfig.subject || reportConfig.name || 'Report Preview'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        To: {reportConfig.recipients || 'recipients@citi.com'} | {new Date().toLocaleDateString()}
                      </Typography>
                    </Box>

                    {/* Live text preview if available */}
                    {generatingPreview ? (
                      <Typography variant="body2" color="text.secondary">Generating preview…</Typography>
                    ) : previewContent ? (
                      <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'background.paper' }}>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace' }}>{previewContent}</pre>
                      </Paper>
                    ) : (
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                          {reportConfig.description || 'Your automated health monitoring report is ready.'}
                        </Typography>
                        <Grid container spacing={2} sx={{ mb: 3 }}>
                          <Grid item xs={6}>
                            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: alpha(theme.palette.success.main, 0.1) }}>
                              <Typography variant="h4" color="success.main" sx={{ fontWeight: 700 }}>
                                42
                              </Typography>
                              <Typography variant="caption">Passing Checks</Typography>
                            </Paper>
                          </Grid>
                          <Grid item xs={6}>
                            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: alpha(theme.palette.error.main, 0.1) }}>
                              <Typography variant="h4" color="error.main" sx={{ fontWeight: 700 }}>
                                3
                              </Typography>
                              <Typography variant="caption">Failed Checks</Typography>
                            </Paper>
                          </Grid>
                        </Grid>
                        {reportConfig.includeCharts && (
                          <Box sx={{ mb: 3 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                              {reportConfig.template === 'alert-digest' ? 'Recent Alerts' : 'System Health Trends'}
                            </Typography>
                            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.100' }}>
                              <ShowChart sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                              <Typography variant="caption" color="text.secondary">
                                Chart visualization will appear here
                              </Typography>
                            </Paper>
                          </Box>
                        )}
                        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Check Name</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Response Time</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {reportConfig.template === 'alert-digest' ? (
                                <>
                                  <TableRow>
                                    <TableCell>Market Data Feed</TableCell>
                                    <TableCell><Chip label="Failing" size="small" color="error" /></TableCell>
                                    <TableCell>Latency {'>'} 200ms</TableCell>
                                  </TableRow>
                                  <TableRow>
                                    <TableCell>Payment Gateway</TableCell>
                                    <TableCell><Chip label="Warning" size="small" color="warning" /></TableCell>
                                    <TableCell>Intermittent failures</TableCell>
                                  </TableRow>
                                </>
                              ) : (
                                <>
                                  <TableRow>
                                    <TableCell>Trading API</TableCell>
                                    <TableCell>
                                      <Chip label="Passing" size="small" color="success" />
                                    </TableCell>
                                    <TableCell>89ms</TableCell>
                                  </TableRow>
                                  <TableRow>
                                    <TableCell>Database</TableCell>
                                    <TableCell>
                                      <Chip label="Warning" size="small" color="warning" />
                                    </TableCell>
                                    <TableCell>245ms</TableCell>
                                  </TableRow>
                                </>
                              )}
                            </TableBody>
                          </Table>
                        </TableContainer>
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          This is a preview of your email report. The actual report will contain live data.
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Scheduled Reports Tab */}
        <TabPanel value={selectedTab} index={1}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              Active Scheduled Reports
            </Typography>
            
            <Grid container spacing={3}>
              {reportsLoading === 'loading' ? (
                <Grid item xs={12}><Typography variant="body2" color="text.secondary">Loading…</Typography></Grid>
              ) : reports.map((report) => (
                <Grid item xs={12} md={6} lg={4} key={report.id}>
                  <Card 
                    variant="outlined"
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      '&:hover': {
                        boxShadow: 4,
                        transform: 'translateY(-2px)'
                      }
                    }}
                    onClick={() => setSelectedReport(report.id)}
                  >
                    <CardHeader
                      avatar={<Email sx={{ color: 'primary.main' }} />}
                      title={report.name}
                      subheader={report.schedule ? `${report.schedule.frequency} ${report.schedule.time ?? ''}` : '—'}
                      action={
                        <Stack direction="row" spacing={0.5}>
                          <Chip 
                            label={report.status} 
                            size="small" 
                            color={getStatusColor(report.status) as any}
                          />
                          <IconButton size="small">
                            <Edit />
                          </IconButton>
                        </Stack>
                      }
                    />
                    <CardContent>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {report.description}
                      </Typography>
                      
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          Recipients ({report.recipients?.length || 0})
                        </Typography>
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                          {report.recipients?.slice(0, 2).map((email, index) => (
                            <Chip key={index} label={email} size="small" variant="outlined" />
                          ))}
                          {report.recipients && report.recipients.length > 2 && (
                            <Chip label={`+${report.recipients.length - 2} more`} size="small" variant="outlined" />
                          )}
                        </Stack>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          Last sent: {report.lastSent ? new Date(report.lastSent).toLocaleDateString() : '—'}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        </TabPanel>

        {/* Analytics Tab */}
        <TabPanel value={selectedTab} index={2}>
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
              {/* Engagement Analytics */}
              <Grid item xs={12} md={8}>
                <Card>
                  <CardHeader
                    avatar={<Timeline sx={{ color: 'primary.main' }} />}
                    title="Engagement Analytics"
                    subheader="Email open and click trends"
                    action={
                      <IconButton size="small">
                        <Refresh />
                      </IconButton>
                    }
                  />
                  <CardContent>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>Period</TableCell>
                            <TableCell align="center">Reports Sent</TableCell>
                            <TableCell align="center">Opens</TableCell>
                            <TableCell align="center">Clicks</TableCell>
                            <TableCell align="center">Open Rate</TableCell>
                            <TableCell align="center">Click Rate</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {ANALYTICS.trends.map((trend, index) => (
                            <TableRow key={index}>
                              <TableCell>{trend.period}</TableCell>
                              <TableCell align="center">{trend.reports}</TableCell>
                              <TableCell align="center">{trend.opens}</TableCell>
                              <TableCell align="center">{trend.clicks}</TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={`${((trend.opens / trend.reports) * 100).toFixed(1)}%`}
                                  size="small"
                                  color="success"
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={`${((trend.clicks / trend.reports) * 100).toFixed(1)}%`}
                                  size="small"
                                  color="info"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>

              {/* Performance Metrics */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardHeader
                    avatar={<DataUsage sx={{ color: 'warning.main' }} />}
                    title="Performance Metrics"
                    subheader="Key performance indicators"
                  />
                  <CardContent>
                    <Stack spacing={3}>
                      <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          Most Popular Template
                        </Typography>
                        <Chip 
                          label={ANALYTICS.mostPopularTemplate} 
                          color="primary" 
                          sx={{ width: '100%' }}
                        />
                      </Box>

                      <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          Top Recipient
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {ANALYTICS.topRecipient}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          Delivery Success Rate
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={ANALYTICS.deliverySuccess}
                            sx={{ flex: 1, height: 8, borderRadius: 4 }}
                          />
                          <Typography variant="caption" sx={{ minWidth: 35 }}>
                            {ANALYTICS.deliverySuccess}%
                          </Typography>
                        </Box>
                      </Box>

                      <Divider />

                      <Box>
                        <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>
                          Quick Actions
                        </Typography>
                        <Stack spacing={1}>
                          <Button variant="outlined" size="small" startIcon={<Download />}>
                            Export Data
                          </Button>
                          <Button variant="outlined" size="small" startIcon={<Settings />}>
                            Configure Tracking
                          </Button>
                        </Stack>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        </TabPanel>
      </Paper>

      {/* Toast */}
      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>

      {/* New Report Dialog */}
      <Dialog open={showNewReportDialog} onClose={() => setShowNewReportDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create New Report</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Report Name"
                  placeholder="e.g., Weekly Health Summary"
                  sx={{ mb: 2 }}
                />
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Description"
                  placeholder="Describe what this report covers..."
                  sx={{ mb: 2 }}
                />
                <FormControl fullWidth>
                  <InputLabel>Template</InputLabel>
                  <Select label="Template" defaultValue="executive-summary">
                    <MenuItem value="executive-summary">Executive Summary</MenuItem>
                    <MenuItem value="detailed-report">Detailed Report</MenuItem>
                    <MenuItem value="alert-digest">Alert Digest</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Frequency</InputLabel>
                  <Select label="Frequency" defaultValue="daily">
                    <MenuItem value="hourly">Hourly</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  label="Recipients"
                  placeholder="email1@citi.com, email2@citi.com"
                  sx={{ mb: 2 }}
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Include Charts and Visualizations"
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewReportDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setShowNewReportDialog(false)}>
            Create Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReportsPage;
'@
}

# File 75: src/pages/SchedulesPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/SchedulesPage/index.ts'
  SizeBytes    = 45
  Sha256       = 'ad96d930c49fbcbfa5ae3397269f258d74ea68088f613169271b1f1b14dba3c8'
  Content      = @'
export { default } from './SchedulesPage';



'@
}

# File 76: src/pages/SchedulesPage/SchedulesPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/SchedulesPage/SchedulesPage.tsx'
  SizeBytes    = 619
  Sha256       = 'a97039adbd5eb7898d65433f85ce44185beb7c70bf2ccb9cb922b423cf8bd15b'
  Content      = @'
import React from 'react';
import { Box, Typography, Paper, Stack, Skeleton } from '@mui/material';

const SchedulesPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Schedules</Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>Calendar</Typography>
        <Stack spacing={1}>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={40} />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
};

export default SchedulesPage;



'@
}

# File 77: src/pages/StudioRunsPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/StudioRunsPage/index.ts'
  SizeBytes    = 46
  Sha256       = '6cb4faa011d558ddb071c8d2a1eb3956c31330d97f7b2baff8c05327aa1626e0'
  Content      = @'
export { default } from './StudioRunsPage';



'@
}

# File 78: src/pages/StudioRunsPage/StudioRunsPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/StudioRunsPage/StudioRunsPage.tsx'
  SizeBytes    = 6086
  Sha256       = 'c3e694313604dab0c49c6acfe67532c8c012bb1557864319458bd4d5a3d41620'
  Content      = @'
import React, { useEffect, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, Chip, Stack, Skeleton, IconButton, Tooltip, LinearProgress, Alert } from '@mui/material';
import { Refresh, PlayArrow, Movie } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import studioApi from '@/services/api/studioApi';
import { useAppSelector } from '@/store';

type Status = 'running' | 'completed' | 'failed' | 'timeout';
interface RunItem {
  id: string;
  testId: string;
  testName?: string;
  csiId?: string;
  status: Status;
  startTime: string;
  endTime?: string;
  duration?: number;
  videoUrl?: string;
}

const colorFor = (status: string) => (status === 'completed' ? 'success' : status === 'running' ? 'info' : status === 'failed' ? 'error' : 'default');

const StudioRunsPage: React.FC = () => {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [allRuns, setAllRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();
  const searchContext = useAppSelector(state => state.dashboard.searchContext);

  const load = async () => {
    setLoading(true);
    try {
      const res = (await studioApi.listExecutions()) as any;
      const runsData = res.data || [];
      
      // Fetch test details to get csiId for each run
      const testsRes = (await studioApi.listTests({})) as any;
      const tests = testsRes.data || testsRes || [];
      const testMap = new Map(tests.map((t: any) => [t.id, t]));
      
      // Enrich runs with test data including csiId
      const enrichedRuns = runsData.map((run: any) => {
        const test = testMap.get(run.testId) as any;
        return {
          ...run,
          csiId: test?.csiId,
          testName: test?.name
        };
      });
      
      setAllRuns(enrichedRuns);
      setRuns(enrichedRuns);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Filter runs based on global search context
  useEffect(() => {
    if (searchContext.csiId) {
      setRuns(allRuns.filter(run => run.csiId === searchContext.csiId));
    } else {
      setRuns(allRuns);
    }
  }, [searchContext.csiId, allRuns]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Movie sx={{ fontSize: 32, color: 'primary.main' }} />
          Studio Runs
        </Typography>
        <Tooltip title="Refresh">
          <span>
            <IconButton onClick={load} disabled={loading}>
              <Refresh />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Global search context indicator */}
      {searchContext.csiId && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Global filter active:</Typography>
            <Chip label={`CSI: ${searchContext.csiId}`} size="small" />
            <Typography variant="body2" sx={{ ml: 2 }}>
              Showing {runs.length} of {allRuns.length} runs
            </Typography>
          </Stack>
        </Alert>
      )}
      <Grid container spacing={2}>
        {(loading ? [...Array(6)].map((_, i) => ({ id: `s${i}` })) : runs).map((r: any) => (
          <Grid key={r.id} item xs={12} md={6} lg={4}>
            <Card variant="outlined" sx={{ display: 'flex' }}>
              <CardContent sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                <Stack spacing={1} sx={{ flexGrow: 1 }}>
                  {loading ? (
                    <>
                      <Skeleton variant="text" width={180} />
                      <Skeleton variant="text" width={220} />
                      <Skeleton variant="rounded" height={120} />
                    </>
                  ) : (
                    <>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography 
                          variant="subtitle1" 
                          fontWeight={600}
                          onClick={() => navigate(`/checks/studio/${r.testId}`)}
                          sx={{ 
                            cursor: 'pointer',
                            color: 'primary.main',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                        >
                          {r.testName || r.testId}
                        </Typography>
                        <Chip label={r.status} color={colorFor(r.status) as any} size="small" />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Started: {new Date(r.startTime).toLocaleString()} • Duration: {r.duration ? `${Math.round(r.duration/1000)}s` : (r.status === 'running' ? 'in progress' : '—')}
                      </Typography>
                      {r.status === 'running' ? (
                        <LinearProgress variant="indeterminate" sx={{ height: 6, borderRadius: 2 }} />
                      ) : (
                        <Box sx={{
                          minHeight: 120,
                          flexGrow: 1,
                          bgcolor: 'grey.900',
                          color: 'grey.300',
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.9rem',
                        }}>
                          {r.videoUrl ? 'Video available' : 'No video'}
                        </Box>
                      )}
                    </>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default StudioRunsPage;



'@
}

# File 79: src/pages/StudioTestsPage/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/StudioTestsPage/index.ts'
  SizeBytes    = 47
  Sha256       = 'ef4bbfc54827272b43326859c332fcb1ade1f056597f87b661c955e4e265a100'
  Content      = @'
export { default } from './StudioTestsPage';



'@
}

# File 80: src/pages/StudioTestsPage/StudioTestsPage.tsx
$Files += [pscustomobject]@{
  RelativePath = 'src/pages/StudioTestsPage/StudioTestsPage.tsx'
  SizeBytes    = 13057
  Sha256       = '63a70dbdaae53b1316eac4aaa302d602adfe5c6626983e08c7d26a435b0fb07b'
  Content      = @'
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, Chip, Divider, Grid, IconButton, InputAdornment, MenuItem, Pagination, Paper, Select, Stack, TextField, Tooltip, Typography, Skeleton, CircularProgress, Snackbar, Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel } from '@mui/material';
import { Add, Delete, PlayArrow, Refresh, Search, Science } from '@mui/icons-material';
import studioApi from '@/services/api/studioApi';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/store';

interface UITestItem {
  id: string;
  name: string;
  csiId: string;
  description?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

const pageSize = 9;

const StudioTestsPage: React.FC = () => {
  const [tests, setTests] = useState<UITestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  // CSI filter removed per request
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const searchContext = useAppSelector(state => state.dashboard.searchContext);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [lastOutcome, setLastOutcome] = useState<Record<string, 'success' | 'failed' | 'timeout'>>({});
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error'; id?: string }>({ open: false, message: '', severity: 'success' });
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', environment: 'Development', csiId: '', description: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = (await studioApi.listTests({})) as any;
      setTests(res.data || res || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (tests || []).filter((t) => {
      // Apply global CSI filter
      if (searchContext.csiId && t.csiId !== searchContext.csiId) {
        return false;
      }
      const matchesQ = !term || t.name.toLowerCase().includes(term) || t.description?.toLowerCase().includes(term);
      const matchesStatus = !status || t.status === status;
      return matchesQ && matchesStatus;
    });
  }, [tests, q, status, searchContext.csiId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Science sx={{ fontSize: 32, color: 'primary.main' }} />
          Studio Tests
        </Typography>
        <Stack direction="row" spacing={1}>
          
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateOpen(true)}
            size="large"
          >
            Create Test
          </Button>
        </Stack>
      </Stack>

      {/* Global search context indicator */}
      {searchContext.csiId && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Global filter active:</Typography>
            <Chip label={`CSI: ${searchContext.csiId}`} size="small" />
          </Stack>
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={12} md={9}>
            <TextField fullWidth placeholder="Search by name, description…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField fullWidth select label="Status" size="medium" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="archived">Archived</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2}>
        {(loading ? [...Array(pageSize)].map((_, i) => ({ id: `s${i}` })) : paged).map((t: any) => (
          <Grid key={t.id} item xs={12} md={6} lg={4}>
            <Card variant="outlined" sx={{ height: 200, display: 'flex' }}>
              <CardContent sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography 
                      variant="subtitle1" 
                      fontWeight={600}
                      onClick={() => !loading && !running[t.id] && navigate(`/checks/studio/${t.id}`)}
                      sx={{ 
                        cursor: loading || running[t.id] ? 'default' : 'pointer',
                        color: loading || running[t.id] ? 'text.primary' : 'primary.main',
                        '&:hover': { 
                          textDecoration: loading || running[t.id] ? 'none' : 'underline' 
                        }
                      }}
                    >
                      {t.name || <Skeleton width={160} />}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title={running[t.id] ? 'Running…' : 'Run'}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={loading || !!running[t.id]}
                            onClick={async () => {
                              try {
                                setRunning((r) => ({ ...r, [t.id]: true }));
                                const res = await studioApi.executeTest(t.id) as any;
                                const execId = res?.executionId;
                                const startedAt = Date.now();
                                // Poll until terminal or timeout ~6s
                                const poll = async () => {
                                  try {
                                    const exec = await studioApi.getExecution(execId) as any;
                                    if (exec?.status === 'completed' || exec?.status === 'failed' || exec?.status === 'timeout') {
                                      setRunning((r) => ({ ...r, [t.id]: false }));
                                      setLastOutcome((o) => ({ ...o, [t.id]: exec.status === 'completed' ? 'success' : exec.status }));
                                      setSnack({ open: true, message: `${t.name}: ${exec.status === 'completed' ? 'SUCCESS' : 'FAILED'}`, severity: exec.status === 'completed' ? 'success' : 'error', id: t.id });
                                      return;
                                    }
                                  } catch {}
                                  if (Date.now() - startedAt < 6500) {
                                    setTimeout(poll, 500);
                                  } else {
                                    setRunning((r) => ({ ...r, [t.id]: false }));
                                  }
                                };
                                if (execId) poll(); else setRunning((r) => ({ ...r, [t.id]: false }));
                              } catch {
                                setRunning((r) => ({ ...r, [t.id]: false }));
                              }
                            }}
                          >
                            {running[t.id] ? <CircularProgress size={16} /> : <PlayArrow fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <span><IconButton size="small" disabled={loading || !!running[t.id]} onClick={async () => { try { await studioApi.deleteTest(t.id); await load(); } catch {} }}><Delete fontSize="small" /></IconButton></span>
                      </Tooltip>
                    </Stack>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{t.description || <Skeleton width={220} />}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="small"
                      label={(t.status || 'draft')}
                      color={t.status === 'active' ? 'success' : t.status === 'archived' ? 'default' : 'warning'}
                      variant="filled"
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>Updated {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ''}</Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Stack alignItems="center" sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Showing {paged.length} of {filtered.length} tests
          {searchContext.csiId && ` (filtered by CSI: ${searchContext.csiId})`}
        </Typography>
        <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} size="small" />
      </Stack>

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} sx={{ width: '100%' }} variant="filled"
          action={
            <Button color="inherit" size="small" onClick={() => { if (snack.id) navigate(`/checks/studio/${snack.id}`); }}>
              View
            </Button>
          }
        >
          {snack.message}
        </Alert>
      </Snackbar>

      {/* New Test Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New UI Test</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Name" fullWidth value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} required />
            <FormControl fullWidth>
              <InputLabel>Environment</InputLabel>
              <Select label="Environment" value={createForm.environment} onChange={(e) => setCreateForm((f) => ({ ...f, environment: e.target.value as string }))}>
                <MenuItem value="Development">Development</MenuItem>
                <MenuItem value="Staging">Staging</MenuItem>
                <MenuItem value="UAT">UAT</MenuItem>
                <MenuItem value="Production">Production</MenuItem>
              </Select>
            </FormControl>
            <TextField label="CSI ID" fullWidth placeholder="123456" value={createForm.csiId} onChange={(e) => setCreateForm((f) => ({ ...f, csiId: e.target.value }))} />
            <TextField label="Description" fullWidth multiline minRows={2} value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} />
            <Typography variant="caption" color="text.secondary">You can add steps and variables in the Studio editor after creating the test.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!createForm.name || creating} onClick={async () => {
            try {
              setCreating(true);
              const payload: any = { name: createForm.name, csiId: createForm.csiId, description: createForm.description, steps: [], environment: createForm.environment };
              const created = await studioApi.createTest(payload) as any;
              setSnack({ open: true, message: 'Test created', severity: 'success', id: created?.id });
              setCreateOpen(false);
              setCreateForm({ name: '', environment: 'Development', csiId: '', description: '' });
              await load();
            } catch (e) {
              setSnack({ open: true, message: 'Failed to create test', severity: 'error' });
            } finally {
              setCreating(false);
            }
          }}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StudioTestsPage;



'@
}

# File 81: src/services/api/apiClient.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/api/apiClient.ts'
  SizeBytes    = 6561
  Sha256       = 'f6442fa450e804ef2730e38db25a6f66a07bffae20068aafc8d72f6c0363dcf6'
  Content      = @'
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { APP_CONFIG } from '@utils/constants/appConfig';

class ApiClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: APP_CONFIG.apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // Add authentication token if available
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Inject MSW debug params for development scenarios
        try {
          const isDev = typeof window !== 'undefined' && (import.meta as any).env?.DEV;
          if (isDev && APP_CONFIG.debugMode) {
            const slow = window.localStorage.getItem('__msw_debug_slow');
            const fail = window.localStorage.getItem('__msw_debug_fail');
            const empty = window.localStorage.getItem('__msw_debug_empty');
            if (slow || fail || empty) {
              // Normalize params to object
              let paramsObj: Record<string, any> = {};
              if (config.params instanceof URLSearchParams) {
                config.params.forEach((value, key) => {
                  paramsObj[key] = value;
                });
              } else if (typeof config.params === 'object' && config.params !== null) {
                paramsObj = { ...config.params } as Record<string, any>;
              }
              if (slow && !Number.isNaN(Number(slow))) paramsObj.__slow = slow;
              if (fail && !Number.isNaN(Number(fail))) paramsObj.__fail = fail;
              if (empty === '1' || empty === 'true') paramsObj.__empty = '1';
              config.params = paramsObj;
            }
          }
        } catch {
          // no-op if localStorage not available
        }

        // Log requests in development
        if (APP_CONFIG.debugMode) {
          console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, {
            params: config.params,
            data: config.data,
          });
        }

        return config;
      },
      (error) => {
        console.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        // Log responses in development
        if (APP_CONFIG.debugMode) {
          console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url}`, {
            status: response.status,
            data: response.data,
          });
        }

        return response;
      },
      async (error) => {
        // Log errors
        console.error('API Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
          data: error.response?.data,
        });

        // Handle common error cases
        if (error.response?.status === 401) {
          // Handle unauthorized - could redirect to login
          console.warn('Unauthorized access - token may be expired');
        } else if (error.response?.status === 403) {
          // Handle forbidden
          console.warn('Access forbidden - insufficient permissions');
        } else if (error.response?.status >= 500) {
          // Handle server errors
          console.error('Server error - check service status');
        }

        // Lightweight retry/backoff for idempotent GET requests
        const originalConfig = error.config as (AxiosRequestConfig & { __retryCount?: number; __doNotRetry?: boolean });
        const shouldRetry = !originalConfig?.__doNotRetry && (originalConfig?.method || 'get').toLowerCase() === 'get';
        const retriableStatus = !error.response || (error.response.status >= 500 && error.response.status < 600);
        if (shouldRetry && retriableStatus) {
          originalConfig.__retryCount = (originalConfig.__retryCount || 0) + 1;
          const maxRetries = 2;
          if (originalConfig.__retryCount <= maxRetries) {
            const delayMs = Math.min(1500, 200 * Math.pow(2, originalConfig.__retryCount - 1));
            await new Promise((r) => setTimeout(r, delayMs));
            return this.instance.request(originalConfig);
          }
        }

        // Normalize error message shape
        const normalized = new Error(
          error.response?.data?.error || error.response?.data?.message || error.message || 'Request failed'
        );
        // Preserve response for callers who need it
        (normalized as any).response = error.response;
        return Promise.reject(normalized);
      }
    );
  }

  private getAuthToken(): string | null {
    // In a real application, this would get the token from auth context or storage
    // For now, return null as we're using MSW
    return null;
  }

  // HTTP methods
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.post(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.put(url, data, config);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.patch(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete(url, config);
    return response.data;
  }

  // Utility methods
  getBaseURL(): string {
    return this.instance.defaults.baseURL || '';
  }

  setTimeout(timeout: number): void {
    this.instance.defaults.timeout = timeout;
  }

  setAuthToken(token: string): void {
    this.instance.defaults.headers.Authorization = `Bearer ${token}`;
  }

  clearAuthToken(): void {
    delete this.instance.defaults.headers.Authorization;
  }
}

// Create and export a singleton instance
export const apiClient = new ApiClient();
export default apiClient;
'@
}

# File 82: src/services/api/checksApi.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/api/checksApi.ts'
  SizeBytes    = 4784
  Sha256       = '506efe6296e3132c733410c8abf39b4abd0e3e66d01db9551e38428bf3b8a67a'
  Content      = @'
import { apiClient } from './apiClient';
import { API_ENDPOINTS } from '@utils/constants/appConfig';
import { 
  CheckEntity, 
  CreateCheckRequest, 
  UpdateCheckRequest, 
  ExecutionResult,
  CheckFilters 
} from '../../types/checks/checkTypes';
import { ApiResponse, PaginationParams } from '../../types/common/commonTypes';

interface GetChecksParams extends PaginationParams {
  filters?: Partial<CheckFilters>;
}

export const checksApi = {
  // Get all checks with optional filtering and pagination
  async getChecks(params: GetChecksParams = {}): Promise<ApiResponse<CheckEntity[]>> {
    const { page = 1, limit = 20, filters = {} } = params;
    
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    // Add filters to query params
    if (filters.csiId) queryParams.append('csiId', filters.csiId);
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.type) queryParams.append('type', filters.type);
    if (filters.searchQuery) queryParams.append('search', filters.searchQuery);
    if (filters.tags?.length) {
      filters.tags.forEach(tag => queryParams.append('tags', tag));
    }

    return apiClient.get(`${API_ENDPOINTS.CHECKS}?${queryParams.toString()}`);
  },

  // Get a single check by ID
  async getCheckById(id: string): Promise<CheckEntity> {
    return apiClient.get(API_ENDPOINTS.CHECK_BY_ID(id));
  },

  // Create a new check
  async createCheck(checkData: CreateCheckRequest): Promise<CheckEntity> {
    return apiClient.post(API_ENDPOINTS.CHECKS, checkData);
  },

  // Update an existing check
  async updateCheck(id: string, updateData: Partial<UpdateCheckRequest>): Promise<CheckEntity> {
    return apiClient.put(API_ENDPOINTS.CHECK_BY_ID(id), updateData);
  },

  // Delete a check
  async deleteCheck(id: string): Promise<void> {
    return apiClient.delete(API_ENDPOINTS.CHECK_BY_ID(id));
  },

  // Execute a check
  async executeCheck(id: string): Promise<ExecutionResult> {
    return apiClient.post(API_ENDPOINTS.EXECUTE_CHECK(id));
  },

  // Get execution history for a check
  async getCheckExecutions(id: string, limit: number = 10): Promise<ApiResponse<ExecutionResult[]>> {
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
    });

    return apiClient.get(`${API_ENDPOINTS.CHECK_EXECUTIONS(id)}?${queryParams.toString()}`);
  },

  // Schedule management
  async updateCheckSchedule(id: string, schedule: { enabled: boolean; frequency?: string; cron?: string }): Promise<CheckEntity> {
    return apiClient.put(`${API_ENDPOINTS.CHECK_BY_ID(id)}/schedule`, schedule);
  },

  async pauseCheck(id: string): Promise<CheckEntity> {
    return apiClient.post(`${API_ENDPOINTS.CHECK_BY_ID(id)}/pause`);
  },

  async resumeCheck(id: string): Promise<CheckEntity> {
    return apiClient.post(`${API_ENDPOINTS.CHECK_BY_ID(id)}/resume`);
  },

  // Get next scheduled executions
  async getUpcomingExecutions(limit: number = 20): Promise<ApiResponse<Array<{ checkId: string; checkName: string; nextExecution: string; csiName: string }>>> {
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
    });

    return apiClient.get(`${API_ENDPOINTS.CHECKS}/upcoming?${queryParams.toString()}`);
  },

  // Bulk operations
  async executeMultipleChecks(checkIds: string[]): Promise<Record<string, ExecutionResult>> {
    const results: Record<string, ExecutionResult> = {};
    
    // Execute checks in parallel (limited concurrency)
    const maxConcurrent = 5;
    const batches = [];
    
    for (let i = 0; i < checkIds.length; i += maxConcurrent) {
      batches.push(checkIds.slice(i, i + maxConcurrent));
    }
    
    for (const batch of batches) {
      const promises = batch.map(async (id) => {
        try {
          const result = await this.executeCheck(id);
          return { id, result };
        } catch (error) {
          console.error(`Failed to execute check ${id}:`, error);
          return { id, result: null };
        }
      });
      
      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ id, result }) => {
        if (result) {
          results[id] = result;
        }
      });
    }
    
    return results;
  },

  async deleteMultipleChecks(checkIds: string[]): Promise<{ succeeded: string[]; failed: string[] }> {
    const succeeded: string[] = [];
    const failed: string[] = [];
    
    const promises = checkIds.map(async (id) => {
      try {
        await this.deleteCheck(id);
        succeeded.push(id);
      } catch (error) {
        console.error(`Failed to delete check ${id}:`, error);
        failed.push(id);
      }
    });
    
    await Promise.all(promises);
    
    return { succeeded, failed };
  },
};
'@
}

# File 83: src/services/api/csiApi.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/api/csiApi.ts'
  SizeBytes    = 1006
  Sha256       = '5708d6c6ea7f23ad043be4070b7cdbe99cb1774084c1a3f29c499cd57a5cfa62'
  Content      = @'
import apiClient from './apiClient';

export interface CsiSearchItem {
  id: string;
  name: string;
  description?: string;
  businessUnit?: string;
  environment?: string;
}

export const csiApi = {
  async listCsis(params?: { search?: string; businessUnit?: string; environment?: string; status?: string; page?: number; limit?: number }) {
    return await apiClient.get('/csi', { params });
  },

  async getCsiById(id: string) {
    return await apiClient.get(`/csi/${id}`);
  },

  async getBusinessUnits() {
    return await apiClient.get('/csi/business-units');
  },

  async getUserPermissions() {
    return await apiClient.get('/csi/user-permissions');
  },

  async getCsiHealth(id: string) {
    return await apiClient.get(`/csi/${id}/health`);
  },

  async searchCsis(query: string, limit: number = 10): Promise<CsiSearchItem[]> {
    if (!query || query.length < 2) return [];
    return await apiClient.get('/csi/search', { params: { q: query, limit } });
  },
};

export default csiApi;


'@
}

# File 84: src/services/api/dashboardApi.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/api/dashboardApi.ts'
  SizeBytes    = 2120
  Sha256       = 'e1579bcdba32f2750807a8c9d3a0f83898cfa37b17de3b75db5c70a141350304'
  Content      = @'
import apiClient from './apiClient';
import type {
  DashboardSummary,
  AttentionItem,
  ActivityItem,
  ReportSnapshotItem,
  SearchResultItem,
} from '@/types/dashboard/dashboardTypes';

export const dashboardApi = {
  async getDashboardSummary(params?: { csiId?: string | null }): Promise<DashboardSummary> {
    return await apiClient.get('/dashboard/summary', { params });
  },

  async getAttention(params?: { limit?: number; csiId?: string | null }): Promise<{ data: AttentionItem[] }> {
    return await apiClient.get('/dashboard/attention', { params });
  },

  async getActivity(params?: { scope?: 'ALL' | 'MINE'; hours?: number; csiId?: string | null }): Promise<{ data: ActivityItem[] }> {
    return await apiClient.get('/dashboard/activity', { params });
  },

  async getUpcomingSchedules(params?: { limit?: number; csiId?: string | null }): Promise<{ data: any[] }> {
    return await apiClient.get('/dashboard/upcoming', { params });
  },

  async getReportsSnapshot(params?: { limit?: number; csiId?: string | null }): Promise<{ data: ReportSnapshotItem[] }> {
    return await apiClient.get('/dashboard/reports/snapshot', { params });
  },

  async searchAll(
    query: string,
    context?: { csiId?: string | null; environment?: string | null; tags?: string[]; tagMode?: 'AND' | 'OR' }
  ): Promise<{ data: SearchResultItem[] }> {
    const params: Record<string, any> = { q: query };
    if (context?.csiId) params.csiId = context.csiId;
    if (context?.environment) params.environment = context.environment;
    if (context?.tags && context.tags.length) params.tags = context.tags;
    if (context?.tagMode) params.tagMode = context.tagMode;
    return await apiClient.get('/dashboard/search', { params });
  },

  async acknowledgeCheck(id: string): Promise<{ id: string; acknowledgedAt: string }> {
    return await apiClient.post(`/dashboard/attention/${id}/acknowledge`);
  },

  async assignCheck(id: string, userId: string): Promise<{ id: string; userId: string }> {
    return await apiClient.post(`/dashboard/attention/${id}/assign`, { userId });
  },
};

export default dashboardApi;


'@
}

# File 85: src/services/api/reportsApi.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/api/reportsApi.ts'
  SizeBytes    = 2504
  Sha256       = '947334edd348fe7e08c645ea6ee435aeff376c731147720bd2254734dfbda097'
  Content      = @'
import apiClient from './apiClient';
import { API_ENDPOINTS } from '@/utils/constants/appConfig';
import type { ReportEntity, ReportPreviewResponse, ReportSection, ReportSchedule, ReportExecution } from '@/types/reports/reportTypes';

export interface CreateReportPayload {
  name: string;
  description?: string;
  subject?: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  includeCharts: boolean;
  template: string;
  checks: string[];
  sections?: ReportSection[];
  schedule?: ReportSchedule;
}

export const reportsApi = {
  async getById(id: string): Promise<ReportEntity> {
    return await apiClient.get(API_ENDPOINTS.REPORT_BY_ID(id));
  },
  async createReport(payload: CreateReportPayload): Promise<ReportEntity> {
    return await apiClient.post(API_ENDPOINTS.REPORTS, payload);
  },

  async listReports(params?: { status?: string; page?: number; limit?: number }): Promise<{ data: ReportEntity[]; total: number; page: number; limit: number; totalPages: number; }> {
    return await apiClient.get(API_ENDPOINTS.REPORTS, { params });
  },

  async updateReport(id: string, payload: Partial<CreateReportPayload>): Promise<ReportEntity> {
    return await apiClient.put(API_ENDPOINTS.REPORT_BY_ID(id), payload);
  },

  async previewReport(id: string, params?: { __slow?: number; __fail?: number }): Promise<ReportPreviewResponse> {
    return await apiClient.post(API_ENDPOINTS.REPORT_PREVIEW(id), undefined, { params });
  },

  async getExecutions(id: string): Promise<{ data: any[]; total: number }> {
    return await apiClient.get(API_ENDPOINTS.REPORT_EXECUTIONS(id));
  },

  async pauseReport(id: string): Promise<ReportEntity> {
    return await apiClient.post(`/reports/${id}/pause`);
  },

  async resumeReport(id: string): Promise<ReportEntity> {
    return await apiClient.post(`/reports/${id}/resume`);
  },

  async duplicateReport(id: string): Promise<ReportEntity> {
    return await apiClient.post(`/reports/${id}/duplicate`);
  },

  async sendTest(id: string, to?: string): Promise<{ ok: boolean; sentAt: string }> {
    return await apiClient.post(`/reports/${id}/send-test`, to ? { to } : undefined);
  },

  async runNow(id: string): Promise<{ ok: boolean; execution: ReportExecution; report: ReportEntity }> {
    return await apiClient.post(`/reports/${id}/run-now`);
  },

  async deleteReport(id: string): Promise<{ ok: boolean }> {
    return await apiClient.delete(`/reports/${id}`);
  },
};

export default reportsApi;



'@
}

# File 86: src/services/api/studioApi.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/api/studioApi.ts'
  SizeBytes    = 1361
  Sha256       = '0924c1571c9ba8be83a1bdef0b1bae63f144e3e96d67e03f825b42aa6be92bab'
  Content      = @'
import apiClient from './apiClient';
import type { TestIR } from '@/types/studio/studioTypes';

export interface ValidateStepsResponse {
  isValid: boolean;
  results: Array<{ stepIndex: number; isValid: boolean; suggestion: string | null }>;
}

export const studioApi = {
  listTests: async (params?: { csiId?: string }) => apiClient.get('/studio/tests', { params }),
  getTest: async (id: string) => apiClient.get(`/studio/tests/${id}`),
  validateVariables: async (id: string, variables: Record<string, any>) => apiClient.post(`/studio/tests/${id}/validate-variables`, { variables }),
  createTest: async (payload: Partial<TestIR> & { name: string; csiId: string }) => apiClient.post('/studio/tests', payload),
  updateTest: async (id: string, payload: Partial<TestIR>) => apiClient.put(`/studio/tests/${id}`, payload),
  deleteTest: async (id: string) => apiClient.delete(`/studio/tests/${id}`),
  executeTest: async (id: string): Promise<{ executionId: string; status: string; message?: string }> => apiClient.post(`/studio/tests/${id}/execute`),
  getExecution: async (id: string) => apiClient.get(`/studio/executions/${id}`),
  validateSteps: async (steps: string[]): Promise<ValidateStepsResponse> => apiClient.post('/studio/validate-steps', { steps }),
  listExecutions: async () => apiClient.get('/studio/executions'),
};

export default studioApi;



'@
}

# File 87: src/services/api/templatesApi.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/api/templatesApi.ts'
  SizeBytes    = 363
  Sha256       = '31f1a97560558089960569079726c088120749321dc50d9908570c9293bf76a4'
  Content      = @'
import apiClient from './apiClient';

export interface ReportTemplateSummary {
  id: string;
  name: string;
  description: string;
}

export const templatesApi = {
  list: (params?: { q?: string; type?: string }) => apiClient.get('/check-templates', { params }),
  get: (id: string) => apiClient.get(`/check-templates/${id}`),
};

export default templatesApi;



'@
}

# File 88: src/services/mocks/browser.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/browser.ts'
  SizeBytes    = 342
  Sha256       = '446357a601bed523f3c18708d3ef6297e19a9e0c38397741ef3f30d5a756f902'
  Content      = @'
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

// Enhanced logging for development
if (process.env.NODE_ENV === 'development') {
  worker.events.on('request:start', ({ request }) => {
    console.log('MSW intercepted:', request.method, request.url);
  });
}
'@
}

# File 89: src/services/mocks/handlers/checksHandlers.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/handlers/checksHandlers.ts'
  SizeBytes    = 15554
  Sha256       = 'f6bd9a1ea2b2bb91abb041377874aa4a8ab7bce2b571ef7221f57ed4a315ff21'
  Content      = @'
import { http, HttpResponse, delay } from 'msw';
import { mockChecks } from '../mockData/checksData';

export const checksHandlers = [
  // Get all checks with filtering and pagination
  http.get('/api/checks', async ({ request }) => {
    await delay(500); // Simulate network delay
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const csiId = url.searchParams.get('csiId');
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const searchQuery = url.searchParams.get('search');
    const tags = url.searchParams.getAll('tags[]'); // Support multiple tags
    const tagMode = url.searchParams.get('tagMode') || 'AND'; // AND or OR
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    let filteredChecks = [...mockChecks];

    // Apply filters
    if (csiId) {
      filteredChecks = filteredChecks.filter(check => check.csiId === csiId);
    }
    if (status) {
      filteredChecks = filteredChecks.filter(check => check.status === status);
    }
    if (type) {
      filteredChecks = filteredChecks.filter(check => check.type === type);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredChecks = filteredChecks.filter(check =>
        check.name.toLowerCase().includes(query) ||
        check.description?.toLowerCase().includes(query) ||
        check.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    // Apply tag filtering
    if (tags && tags.length > 0) {
      filteredChecks = filteredChecks.filter(check => {
        if (tagMode === 'OR') {
          // Check has at least one of the selected tags
          return tags.some(tag => check.tags.includes(tag));
        } else {
          // Check has all selected tags (AND mode)
          return tags.every(tag => check.tags.includes(tag));
        }
      });
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    if (url.searchParams.get('__empty') === '1') {
      filteredChecks = [];
    }
    const paginatedChecks = filteredChecks.slice(startIndex, endIndex);

    return HttpResponse.json({
      data: paginatedChecks,
      total: filteredChecks.length,
      page,
      limit,
      totalPages: Math.ceil(filteredChecks.length / limit)
    });
  }),

  // Get single check by ID
  http.get('/api/checks/:id', async ({ params, request }) => {
    await delay(300);
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const check = mockChecks.find(c => c.id === id);
    
    if (!check) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    return HttpResponse.json(check);
  }),

  // Create new check
  http.post('/api/checks', async ({ request }) => {
    await delay(1000); // Simulate validation time
    
    const newCheckData = await request.json() as any;
    
    // Simulate validation errors occasionally
    if (Math.random() < 0.1) {
      return HttpResponse.json(
        {
          error: 'Validation failed',
          details: {
            name: 'Check name must be unique within the CSI'
          }
        },
        { status: 400 }
      );
    }
    
    const newCheck = {
      id: `check-${Date.now()}`,
      ...newCheckData,
      status: 'PENDING',
      lastExecution: null,
      nextExecution: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes from now
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'current.user@citi.com', // Would come from auth context
      tags: newCheckData.tags || []
    };
    
    // Add to mock data for subsequent requests
    mockChecks.push(newCheck);
    
    return HttpResponse.json(newCheck, { status: 201 });
  }),

  // Update check
  http.put('/api/checks/:id', async ({ params, request }) => {
    await delay(500);
    
    const { id } = params;
    const updateData = await request.json() as any;
    
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    if (checkIndex === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    // Update the check
    mockChecks[checkIndex] = {
      ...mockChecks[checkIndex],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    return HttpResponse.json(mockChecks[checkIndex]);
  }),

  // Delete check
  http.delete('/api/checks/:id', async ({ params }) => {
    await delay(300);
    
    const { id } = params;
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    
    if (checkIndex === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    // Remove from mock data
    mockChecks.splice(checkIndex, 1);
    
    return new HttpResponse(null, { status: 204 });
  }),

  // Execute check
  http.post('/api/checks/:id/execute', async ({ params, request }) => {
    await delay(2000 + Math.random() * 3000); // 2-5 second execution time
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const check = mockChecks.find(c => c.id === id);
    
    if (!check) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    // Simulate different execution outcomes
    const outcomes = ['SUCCESS', 'FAILURE', 'WARNING', 'TIMEOUT'];
    const weights = [0.7, 0.2, 0.08, 0.02]; // 70% success, 20% failure, etc.
    
    let randomValue = Math.random();
    let selectedOutcome = 'SUCCESS';
    
    for (let i = 0; i < outcomes.length; i++) {
      if (randomValue < weights[i]) {
        selectedOutcome = outcomes[i];
        break;
      }
      randomValue -= weights[i];
    }
    
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + Math.random() * 5000 + 1000); // 1-6 seconds
    
    const executionResult = {
      id: `exec-${Date.now()}`,
      checkId: id,
      status: selectedOutcome,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: endTime.getTime() - startTime.getTime(),
      output: generateMockOutput(check.type, selectedOutcome),
      metadata: generateMockMetadata(check.type, selectedOutcome),
      ...(selectedOutcome !== 'SUCCESS' && {
        error: generateMockError(check.type, selectedOutcome)
      })
    };
    
    // Update check's last execution time and status
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    if (checkIndex !== -1) {
      mockChecks[checkIndex].lastExecution = endTime.toISOString();
      mockChecks[checkIndex].status = selectedOutcome === 'SUCCESS' ? 'PASSING' : 
                                    selectedOutcome === 'WARNING' ? 'WARNING' : 'FAILING';
      mockChecks[checkIndex].nextExecution = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }
    
    return HttpResponse.json(executionResult);
  }),

  // Get execution history for a check
  http.get('/api/checks/:id/executions', async ({ params, request }) => {
    await delay(400);
    
    const { id } = params;
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    // Generate mock execution history
    const executions = [];
    for (let i = 0; i < limit; i++) {
      const timestamp = new Date(Date.now() - i * 5 * 60 * 1000); // Every 5 minutes back
      executions.push({
        id: `exec-history-${id}-${i}`,
        checkId: id,
        status: Math.random() > 0.8 ? 'FAILURE' : 'SUCCESS',
        startTime: timestamp.toISOString(),
        endTime: new Date(timestamp.getTime() + Math.random() * 3000 + 500).toISOString(),
        duration: Math.random() * 3000 + 500,
        output: 'Historical execution result'
      });
    }
    
    return HttpResponse.json({
      data: executions,
      total: 50, // Simulate total history
      hasMore: limit < 50
    });
  }),

  // Update check schedule
  http.put('/api/checks/:id/schedule', async ({ params, request }) => {
    await delay(500);
    
    const { id } = params;
    const scheduleData = await request.json() as any;
    
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    if (checkIndex === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    // Update the check's schedule
    mockChecks[checkIndex] = {
      ...mockChecks[checkIndex],
      schedule: {
        ...mockChecks[checkIndex].schedule,
        ...scheduleData
      },
      updatedAt: new Date().toISOString(),
      nextExecution: scheduleData.enabled 
        ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
        : null
    };
    
    return HttpResponse.json(mockChecks[checkIndex]);
  }),

  // Pause check
  http.post('/api/checks/:id/pause', async ({ params }) => {
    await delay(300);
    
    const { id } = params;
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    
    if (checkIndex === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    mockChecks[checkIndex] = {
      ...mockChecks[checkIndex],
      schedule: {
        ...mockChecks[checkIndex].schedule,
        enabled: false
      },
      nextExecution: null,
      updatedAt: new Date().toISOString()
    };
    
    return HttpResponse.json(mockChecks[checkIndex]);
  }),

  // Resume check
  http.post('/api/checks/:id/resume', async ({ params }) => {
    await delay(300);
    
    const { id } = params;
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    
    if (checkIndex === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    mockChecks[checkIndex] = {
      ...mockChecks[checkIndex],
      schedule: {
        ...mockChecks[checkIndex].schedule,
        enabled: true
      },
      nextExecution: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return HttpResponse.json(mockChecks[checkIndex]);
  }),

  // Get upcoming executions
  http.get('/api/checks/upcoming', async ({ request }) => {
    await delay(400);
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const limit = parseInt(url.searchParams.get('limit') || '20');
    
    // Filter checks that are enabled and scheduled
    let upcomingChecks = mockChecks
      .filter(check => check.schedule.enabled && check.nextExecution)
      .sort((a, b) => new Date(a.nextExecution!).getTime() - new Date(b.nextExecution!).getTime())
      .slice(0, limit)
      .map(check => ({
        checkId: check.id,
        checkName: check.name,
        nextExecution: check.nextExecution!,
        csiName: check.csiName,
        frequency: check.schedule.frequency,
        priority: check.tags.find(tag => tag.startsWith('priority:'))?.split(':')[1] || 'medium'
      }));
    if (url.searchParams.get('__empty') === '1') upcomingChecks = [];
    
    return HttpResponse.json({
      data: upcomingChecks,
      total: upcomingChecks.length
    });
  })
];

// Helper functions for generating realistic mock data
function generateMockOutput(checkType: string, status: string): string {
  const outputs: Record<string, Record<string, string>> = {
    HTTP: {
      SUCCESS: 'HTTP GET request successful. Status: 200 OK. Response time: 145ms.',
      FAILURE: 'HTTP request failed. Status: 503 Service Unavailable. Response time: 5000ms.',
      WARNING: 'HTTP request successful but slow. Status: 200 OK. Response time: 2500ms.',
      TIMEOUT: 'HTTP request timed out after 5000ms.'
    },
    TCP: {
      SUCCESS: 'TCP connection established successfully. Response time: 23ms.',
      FAILURE: 'TCP connection refused. Unable to connect to host:port.',
      WARNING: 'TCP connection slow. Response time: 1500ms.',
      TIMEOUT: 'TCP connection timed out after 3000ms.'
    },
    SPLUNK: {
      SUCCESS: 'Splunk query executed successfully. Results: 0 events matching criteria.',
      FAILURE: 'Splunk query returned 15 events, exceeding threshold of 5.',
      WARNING: 'Splunk query returned 3 events, approaching threshold of 5.',
      TIMEOUT: 'Splunk query timed out after 30000ms.'
    }
  };
  
  return outputs[checkType]?.[status] || `${checkType} check completed with status: ${status}`;
}

function generateMockMetadata(checkType: string, status: string): Record<string, any> {
  const baseMetadata: Record<string, any> = {
    timestamp: new Date().toISOString(),
    executionId: `exec-${Date.now()}`
  };
  
  switch (checkType) {
    case 'HTTP':
      return {
        ...baseMetadata,
        responseTime: status === 'SUCCESS' ? Math.random() * 500 + 50 : Math.random() * 3000 + 2000,
        statusCode: status === 'SUCCESS' ? 200 : status === 'FAILURE' ? 503 : 200,
        responseSize: Math.floor(Math.random() * 5000) + 500
      };
    case 'TCP':
      return {
        ...baseMetadata,
        connectionTime: status === 'SUCCESS' ? Math.random() * 100 + 10 : Math.random() * 2000 + 1000
      };
    case 'SPLUNK':
      return {
        ...baseMetadata,
        eventCount: status === 'SUCCESS' ? 0 : Math.floor(Math.random() * 20),
        queryDuration: Math.random() * 10000 + 1000
      };
    default:
      return baseMetadata;
  }
}

function generateMockError(checkType: string, status: string): string {
  const errors: Record<string, Record<string, string>> = {
    HTTP: {
      FAILURE: 'Service unavailable - upstream service is down',
      WARNING: 'Response time exceeded acceptable threshold',
      TIMEOUT: 'Request timeout - service did not respond within 5 seconds'
    },
    TCP: {
      FAILURE: 'Connection refused - port may be closed or service down',
      WARNING: 'Connection established but response time is slow',
      TIMEOUT: 'Connection timeout - unable to establish connection'
    },
    SPLUNK: {
      FAILURE: 'Query returned results above acceptable threshold',
      WARNING: 'Query returned results approaching threshold limit',
      TIMEOUT: 'Query execution exceeded maximum allowed time'
    }
  };
  
  return errors[checkType]?.[status] || `${checkType} check failed with status: ${status}`;
}
'@
}

# File 90: src/services/mocks/handlers/csiHandlers.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/handlers/csiHandlers.ts'
  SizeBytes    = 6173
  Sha256       = '860aa49fa5d8534804a8673920d7946cba4ace2371a493dbc57a4d5ead8ff336'
  Content      = @'
import { http, HttpResponse, delay } from 'msw';
import { mockCSIs, mockUsers } from '../mockData/csiData';
import { mockChecks } from '../mockData/checksData';

export const csiHandlers = [
  // Get all CSIs with optional filtering
  http.get('/api/csi', async ({ request }) => {
    await delay(400);
    
    const url = new URL(request.url);
    const searchQuery = url.searchParams.get('search');
    const businessUnit = url.searchParams.get('businessUnit');
    const environment = url.searchParams.get('environment');
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    let filteredCSIs = [...mockCSIs];

    // Apply filters
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredCSIs = filteredCSIs.filter(csi =>
        csi.name.toLowerCase().includes(query) ||
        csi.description.toLowerCase().includes(query) ||
        csi.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (businessUnit) {
      filteredCSIs = filteredCSIs.filter(csi => csi.businessUnit === businessUnit);
    }

    if (environment) {
      filteredCSIs = filteredCSIs.filter(csi => csi.environment === environment);
    }

    if (status) {
      filteredCSIs = filteredCSIs.filter(csi => csi.status === status);
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedCSIs = filteredCSIs.slice(startIndex, endIndex);

    return HttpResponse.json({
      data: paginatedCSIs,
      total: filteredCSIs.length,
      page,
      limit,
      totalPages: Math.ceil(filteredCSIs.length / limit)
    });
  }),

  // Search CSIs with autocomplete (place BEFORE /api/csi/:id to avoid route shadowing)
  http.get('/api/csi/search', async ({ request }) => {
    await delay(200);
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    if (!query || query.length < 2) {
      return HttpResponse.json([]);
    }
    
    const searchTerm = query.toLowerCase();
    // Build unique CSIs from checks dataset first (ensures selections map to checks results)
    const uniqueFromChecks: Record<string, { id: string; name: string }> = {};
    mockChecks.forEach((ch) => {
      if (!uniqueFromChecks[ch.csiId]) {
        uniqueFromChecks[ch.csiId] = { id: ch.csiId, name: ch.csiName };
      }
    });
    const checksList = Object.values(uniqueFromChecks)
      .filter((i) => i.name.toLowerCase().includes(searchTerm) || i.id.toLowerCase().includes(searchTerm));

    // Fill with directory CSIs not already included
    const seenNames = new Set(checksList.map((i) => i.name));
    const directoryList = mockCSIs
      .filter(
        (csi) =>
          (csi.name.toLowerCase().includes(searchTerm) || csi.id.toLowerCase().includes(searchTerm)) &&
          !seenNames.has(csi.name)
      )
      .map((csi) => ({ id: csi.id, name: csi.name }));

    const combined = [...checksList, ...directoryList].slice(0, limit);
    return HttpResponse.json(combined);
  }),

  // Get single CSI by ID
  http.get('/api/csi/:id', async ({ params }) => {
    await delay(300);
    
    const { id } = params;
    const csi = mockCSIs.find(c => c.id === id);
    
    if (!csi) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'CSI not found'
      });
    }
    
    return HttpResponse.json(csi);
  }),

  // Get CSI applications
  http.get('/api/csi/:id/applications', async ({ params }) => {
    await delay(200);
    
    const { id } = params;
    const csi = mockCSIs.find(c => c.id === id);
    
    if (!csi) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'CSI not found'
      });
    }
    
    return HttpResponse.json(csi.applications);
  }),

  // Get business units (for filtering)
  http.get('/api/csi/business-units', async () => {
    await delay(200);
    
    const businessUnits = [...new Set(mockCSIs.map(csi => csi.businessUnit))];
    
    return HttpResponse.json(businessUnits);
  }),

  // Get user permissions
  http.get('/api/csi/user-permissions', async () => {
    await delay(300);
    
    // Simulate getting current user's permissions
    const currentUser = mockUsers[1]; // Priya Sharma for demo
    
    return HttpResponse.json({
      user: currentUser,
      allowedCSIs: currentUser.permissions,
      role: currentUser.role
    });
  }),

  

  // Get CSI health summary - derived from checks SSOT
  http.get('/api/csi/:id/health', async ({ params, request }) => {
    await delay(500);

    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });

    const { id } = params;
    const csi = mockCSIs.find((c) => c.id === id);
    if (!csi) {
      return new HttpResponse(null, { status: 404, statusText: 'CSI not found' });
    }

    const checksForCsi = mockChecks.filter((chk) => chk.csiId === id);
    const totalChecks = checksForCsi.length;
    const passingChecks = checksForCsi.filter((chk) => chk.status === 'PASSING').length;
    const failingChecks = checksForCsi.filter((chk) => chk.status === 'FAILING').length;
    const warningChecks = checksForCsi.filter((chk) => chk.status === 'WARNING').length;
    const overallStatus = failingChecks > 0 ? 'CRITICAL' : warningChecks > 0 ? 'WARNING' : 'HEALTHY';

    const healthSummary = {
      csiId: id,
      totalChecks,
      passingChecks,
      failingChecks,
      warningChecks,
      overallStatus,
      lastUpdated: new Date().toISOString(),
    } as any;

    return HttpResponse.json(healthSummary);
  })
];
'@
}

# File 91: src/services/mocks/handlers/dashboardHandlers.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/handlers/dashboardHandlers.ts'
  SizeBytes    = 9694
  Sha256       = 'e3c5b5b611e0df7ee90810197843559a3df472edf2a53ab786c0c8d91e1ee7de'
  Content      = @'
import { http, HttpResponse, delay } from 'msw';
import { mockChecks } from '../mockData/checksData';
import { mockReports } from '../mockData/reportsData';
import { mockCSIs } from '../mockData/csiData';

export const dashboardHandlers = [
  // Summary
  http.get('/api/dashboard/summary', async ({ request }) => {
    // Allow runtime scenario tuning via query params
    // __slow=ms to add latency; __fail=CODE to return error; __empty=1 to return empty summary
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });

    if (url.searchParams.get('__empty') === '1') {
      return HttpResponse.json({
        overallStatus: 'HEALTHY',
        counts: { passing: 0, failing: 0, warning: 0, muted: 0 },
        lastUpdated: new Date().toISOString(),
      });
    }
    const csiIdFilter = url.searchParams.get('csiId') || '';
    const inScope = (c: any) => (!csiIdFilter || c.csiId === csiIdFilter);
    const passing = mockChecks.filter((c) => inScope(c) && c.status === 'PASSING').length;
    const failing = mockChecks.filter((c) => inScope(c) && c.status === 'FAILING').length;
    const warning = mockChecks.filter((c) => inScope(c) && c.status === 'WARNING').length;
    const muted = mockChecks.filter((c) => inScope(c) && c.tags.includes('muted')).length;
    const overallStatus = failing > 0 ? 'CRITICAL' : warning > 0 ? 'WARNING' : 'HEALTHY';
    return HttpResponse.json({
      overallStatus,
      counts: { passing, failing, warning, muted },
      lastUpdated: new Date().toISOString(),
    });
  }),

  // Attention list
  http.get('/api/dashboard/attention', async ({ request }) => {
    await delay(250);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const csiIdFilter = url.searchParams.get('csiId') || '';
    let items = mockChecks
      .filter((c) => c.status === 'FAILING' || c.status === 'WARNING')
      .filter((c) => !csiIdFilter || c.csiId === csiIdFilter)
      .slice(0, limit)
      .map((c) => ({
        id: c.id,
        name: c.name,
        csiId: c.csiId,
        csiName: (mockCSIs.find((x) => x.id === c.csiId)?.name) || c.csiName,
        status: c.status as 'FAILING' | 'WARNING',
        since: c.lastExecution || new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        reason: c.description || 'Threshold exceeded',
      }));
    if (url.searchParams.get('__empty') === '1') items = [];
    return HttpResponse.json({ data: items });
  }),

  // Activity timeline
  http.get('/api/dashboard/activity', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const hours = parseInt(url.searchParams.get('hours') || '24');
    const csiIdFilter = url.searchParams.get('csiId') || '';
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    let events = [] as any[];
    mockChecks
      .filter((c) => !csiIdFilter || c.csiId === csiIdFilter)
      .slice(0, 8)
      .forEach((c, i) => {
      const t = new Date(cutoff + i * 60 * 60 * 1000).toISOString();
      events.push({
        id: `evt-${c.id}`,
        type: c.status === 'FAILING' ? 'FAIL' : 'RECOVER',
        title: c.status === 'FAILING' ? 'Check Failed' : 'Recovered',
        description: c.name,
        csiName: c.csiName,
        timestamp: t,
      });
    });
    // add a report-sent
    mockReports.slice(0, 1).forEach((r) => {
      events.push({
        id: `evt-report-${r.id}`,
        type: 'REPORT_SENT',
        title: 'Report sent',
        description: r.name,
        timestamp: new Date().toISOString(),
      });
    });
    if (url.searchParams.get('__empty') === '1') events = [];
    return HttpResponse.json({ data: events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)) });
  }),

  // Upcoming schedules (reuse checks nextExecution)
  http.get('/api/dashboard/upcoming', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const csiIdFilter = url.searchParams.get('csiId') || '';
    let items = mockChecks
      .filter((c) => c.schedule.enabled && c.nextExecution)
      .filter((c) => !csiIdFilter || c.csiId === csiIdFilter)
      .sort((a, b) => new Date(a.nextExecution!).getTime() - new Date(b.nextExecution!).getTime())
      .slice(0, limit)
      .map((c) => ({
        checkId: c.id,
        checkName: c.name,
        nextExecution: c.nextExecution!,
        csiName: c.csiName,
      }));
    if (url.searchParams.get('__empty') === '1') items = [];
    return HttpResponse.json({ data: items });
  }),

  // Reports snapshot
  http.get('/api/dashboard/reports/snapshot', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const limit = parseInt(url.searchParams.get('limit') || '5');
    const csiIdFilter = url.searchParams.get('csiId') || '';
    let items = mockReports
      .filter((r) => {
        if (!csiIdFilter) return true;
        // heuristics: include reports referencing checks for that CSI
        return r.selectedChecks.some((id) => {
          const chk = mockChecks.find((c) => c.id === id);
          return chk && chk.csiId === csiIdFilter;
        });
      })
      .slice(0, limit)
      .map((r) => ({
      id: r.id,
      name: r.name,
      nextScheduledAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      lastStatus: Math.random() > 0.1 ? 'SUCCESS' : 'FAILURE',
    }));
    if (url.searchParams.get('__empty') === '1') items = [];
    return HttpResponse.json({ data: items });
  }),

  // Search across CSIs, checks, and reports
  http.get('/api/dashboard/search', async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const csiId = url.searchParams.get('csiId') || '';
    const environment = url.searchParams.get('environment') || '';
    const tags = url.searchParams.getAll('tags');
    const tagMode = (url.searchParams.get('tagMode') || 'AND').toUpperCase();
    let csiNameFromId: string | undefined;
    if (csiId) {
      const csi = mockCSIs.find((c) => c.id === csiId);
      if (csi) csiNameFromId = csi.name;
    }
    if (!q) return HttpResponse.json({ data: [] });
    const results: any[] = [];
    mockCSIs.forEach((csi) => {
      if (csi.name.toLowerCase().includes(q) || csi.id.toLowerCase().includes(q)) {
        results.push({ id: csi.id, type: 'CSI', title: csi.name, subtitle: csi.id, path: `/` });
      }
    });
    mockChecks.forEach((c) => {
      // CSI scope
      const inScopeCsi = !csiId || c.csiId === csiId || (csiNameFromId && c.csiName === csiNameFromId);
      // Environment scope: prefer check.environment; fallback to CSI.environment when check env missing
      let inScopeEnv = true;
      if (environment) {
        const csi = mockCSIs.find((x) => x.id === c.csiId);
        const envCandidate = c.environment || csi?.environment || '';
        inScopeEnv = envCandidate.toLowerCase().startsWith(environment.toLowerCase());
      }
      // Tags scope
      let inScopeTags = true;
      if (tags && tags.length) {
        if (tagMode === 'OR') {
          inScopeTags = tags.some((t) => c.tags.includes(t));
        } else {
          inScopeTags = tags.every((t) => c.tags.includes(t));
        }
      }
      if (c.name.toLowerCase().includes(q) && inScopeCsi && inScopeEnv && inScopeTags) {
        results.push({ id: c.id, type: 'CHECK', title: c.name, subtitle: c.csiName, path: `/checks/details/${c.id}` });
      }
    });
    mockReports.forEach((r) => {
      if (r.name.toLowerCase().includes(q)) {
        results.push({ id: r.id, type: 'REPORT', title: r.name, path: `/checks/reports/${r.id}` });
      }
    });
    return HttpResponse.json({ data: results.slice(0, 15) });
  }),

  // Acknowledge and assign actions
  http.post('/api/dashboard/attention/:id/acknowledge', async ({ params }) => {
    await delay(120);
    const { id } = params;
    return HttpResponse.json({ id, acknowledgedAt: new Date().toISOString() });
  }),

  http.post('/api/dashboard/attention/:id/assign', async ({ params, request }) => {
    await delay(120);
    const { id } = params;
    const body = (await request.json()) as any;
    return HttpResponse.json({ id, userId: body.userId });
  }),
];



'@
}

# File 92: src/services/mocks/handlers/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/handlers/index.ts'
  SizeBytes    = 610
  Sha256       = 'f1e68df0c2cf2e5ccde108f2692171abc3441d8d843161cc200f2695405eab7b'
  Content      = @'
import { checksHandlers } from './checksHandlers';
import { csiHandlers } from './csiHandlers';
import { reportsHandlers } from './reportsHandlers';
import studioHandlers from './studioHandlers';
import { tagsHandlers } from './tagsHandlers';
import { dashboardHandlers } from './dashboardHandlers';
import { secretsHandlers } from './secretsHandlers';
import { templatesHandlers } from './templatesHandlers';

export const handlers = [
  ...checksHandlers,
  ...csiHandlers,
  ...reportsHandlers,
  ...tagsHandlers,
  ...studioHandlers,
  ...dashboardHandlers,
  ...secretsHandlers,
  ...templatesHandlers,
];
'@
}

# File 93: src/services/mocks/handlers/reportsHandlers.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/handlers/reportsHandlers.ts'
  SizeBytes    = 27818
  Sha256       = '4489912554d9cd9fb60693bb009cb46015892565cf292aa6eabcddc5ca15a668'
  Content      = @'
import { http, HttpResponse, delay } from 'msw';
import { mockReports, mockReportExecutions } from '../mockData/reportsData';
import { mockChecks, mockExecutionResults } from '../mockData/checksData';

export const reportsHandlers = [
  // Get all reports
  http.get('/api/reports', async ({ request }) => {
    await delay(300);
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    let filteredReports = [...mockReports];

    if (status) {
      filteredReports = filteredReports.filter(report => report.status === status);
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    if (url.searchParams.get('__empty') === '1') {
      filteredReports = [];
    }
    const paginatedReports = filteredReports.slice(startIndex, endIndex);

    return HttpResponse.json({
      data: paginatedReports,
      total: filteredReports.length,
      page,
      limit,
      totalPages: Math.ceil(filteredReports.length / limit)
    });
  }),

  // Pause report
  http.post('/api/reports/:id/pause', async ({ params, request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const idx = mockReports.findIndex((r) => r.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockReports[idx].status = 'paused' as any;
    mockReports[idx].updatedAt = new Date().toISOString();
    return HttpResponse.json(mockReports[idx]);
  }),

  // Resume report
  http.post('/api/reports/:id/resume', async ({ params, request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const idx = mockReports.findIndex((r) => r.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockReports[idx].status = 'active' as any;
    mockReports[idx].updatedAt = new Date().toISOString();
    return HttpResponse.json(mockReports[idx]);
  }),

  // Duplicate report
  http.post('/api/reports/:id/duplicate', async ({ params, request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const base = mockReports.find((r) => r.id === id);
    if (!base) return new HttpResponse(null, { status: 404 });
    const copy = { ...base, id: `report-${Date.now()}`, name: `${base.name} (Copy)`, status: 'draft' as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    mockReports.push(copy as any);
    return HttpResponse.json(copy);
  }),

  // Send test email (no-op)
  http.post('/api/reports/:id/send-test', async ({ params, request }) => {
    await delay(300);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const exists = mockReports.find((r) => r.id === id);
    if (!exists) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ ok: true, sentAt: new Date().toISOString() });
  }),
  // Get report by ID
  http.get('/api/reports/:id', async ({ params, request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const report = mockReports.find((r) => r.id === id);
    if (!report) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(report);
  }),

  // Create new report
  http.post('/api/reports', async ({ request }) => {
    await delay(800);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    
    const newReportData = await request.json() as any;
    // Normalize fields
    const selectedChecks: string[] = Array.isArray(newReportData.selectedChecks)
      ? newReportData.selectedChecks
      : Array.isArray(newReportData.checks)
        ? newReportData.checks
        : [];

    const newReport = {
      id: `report-${Date.now()}`,
      ...newReportData,
      selectedChecks,
      sections: Array.isArray((newReportData as any).sections) ? (newReportData as any).sections : undefined,
      status: 'paused',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'current.user@citi.com'
    };
    
    mockReports.push(newReport);
    
    return HttpResponse.json(newReport, { status: 201 });
  }),

  // Update report
  http.put('/api/reports/:id', async ({ params, request }) => {
    await delay(500);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    
    const { id } = params;
    const updateData = await request.json() as any;
    
    const reportIndex = mockReports.findIndex(r => r.id === id);
    if (reportIndex === -1) {
      // Seamless upsert: if not found (e.g., mock data reset) create it on-the-fly
      const created = {
        id: id as string,
        ...updateData,
        status: (updateData as any)?.status || 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'current.user@citi.com'
      };
      mockReports.push(created as any);
      return HttpResponse.json(created);
    }
    
    mockReports[reportIndex] = {
      ...mockReports[reportIndex],
      ...updateData,
      ...(Array.isArray((updateData as any).sections) ? { sections: (updateData as any).sections } : {}),
      ...(updateData.schedule ? { schedule: { ...mockReports[reportIndex].schedule, ...updateData.schedule } } : {}),
      updatedAt: new Date().toISOString()
    };
    
    return HttpResponse.json(mockReports[reportIndex]);
  }),

  // Generate report preview
  http.post('/api/reports/:id/preview', async ({ params, request }) => {
    await delay(1000);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    
    const { id } = params;
    const report = mockReports.find(r => r.id === id);
    
    if (!report) {
      return new HttpResponse(null, { status: 404 });
    }
    // Resolve sections (grouped) or fallback to selectedChecks/legacy
    const sections: Array<{ title: string; checkIds: string[] }> = [];
    const rAny = report as any;
    if (Array.isArray(rAny.sections) && rAny.sections.length > 0) {
      for (const section of rAny.sections) {
        if (section.kind === 'manual') {
          sections.push({ title: section.title || 'Section', checkIds: Array.isArray(section.checkIds) ? section.checkIds : [] });
        } else if (section.kind === 'rule') {
          // Filter mockChecks by rule
          let list = [...mockChecks];
          const rule = section.rule || {};
          if (rule.csiIds && rule.csiIds.length) list = list.filter(c => rule.csiIds!.includes(c.csiId));
          if (rule.tags && rule.tags.length) list = list.filter(c => rule.tags!.some((t: string) => c.tags.includes(t)));
          if (rule.types && rule.types.length) list = list.filter(c => rule.types!.includes(c.type as any));
          if (rule.status && rule.status.length) list = list.filter(c => rule.status!.includes(c.status as any));
          if (rule.timeframe) {
            const now = Date.now();
            const ms = rule.timeframe === '5m' ? 5*60*1000 : rule.timeframe === '15m' ? 15*60*1000 : rule.timeframe === '1h' ? 60*60*1000 : 24*60*60*1000;
            list = list.filter(c => {
              if (!c.lastExecution) return false;
              const dt = new Date(c.lastExecution).getTime();
              return (now - dt) <= ms && (c.status === 'FAILING' || c.status === 'WARNING' || c.status === 'PENDING');
            });
          }
          if (rule.sort === 'failing-first') {
            const order = { FAILING: 0, WARNING: 1, PENDING: 2, PASSING: 3, UNKNOWN: 4 } as Record<string, number>;
            list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
          } else if (rule.sort === 'recently-failed') {
            const score = (c: typeof mockChecks[number]) => (c.status === 'FAILING' ? 2 : c.status === 'WARNING' ? 1 : 0);
            list.sort((a, b) => (score(b) - score(a)) || (new Date(b.lastExecution || 0).getTime() - new Date(a.lastExecution || 0).getTime()));
          } else if (rule.sort === 'alphabetical') {
            list.sort((a, b) => a.name.localeCompare(b.name));
          }
          const limited = typeof rule.limit === 'number' ? list.slice(0, Math.max(0, rule.limit)) : list;
          sections.push({ title: section.title || 'Section', checkIds: limited.map(c => c.id) });
        }
      }
    } else {
      const chosenChecks: string[] = Array.isArray(report.selectedChecks) && report.selectedChecks.length
        ? report.selectedChecks
        : Array.isArray((report as any).checks)
          ? (report as any).checks
          : [];
      sections.push({ title: 'Selected Checks', checkIds: chosenChecks });
    }

    // Build a richer preview inspired by PRD
    const lines: string[] = [];
    const subject = (report as any).subject || report.name;
    const now = new Date();
    lines.push(`Subject: Checks Report: ${subject}`);
    lines.push('');
    lines.push('-----------------------------------------------------');
    lines.push('');
    lines.push(`Report for: ${now.toLocaleString()}`);

    // Compute overall status (warning if any failing/warning)
    const allCheckIds = sections.flatMap(s => s.checkIds);
    const allChecks = allCheckIds.map(id => mockChecks.find(c => c.id === id)).filter(Boolean) as typeof mockChecks[number][];
    const hasFailing = allChecks.some(c => c.status === 'FAILING');
    const hasWarning = allChecks.some(c => c.status === 'WARNING');
    const overall = hasFailing ? 'FAILING' : hasWarning ? 'WARNING' : (allChecks.length ? 'PASSING' : 'UNKNOWN');
    lines.push(`Overall Status: ${overall}`);
    lines.push('');

    if (report.schedule) {
      const sched = report.schedule as any;
      lines.push(`Schedule: ${sched.frequency}${sched.time ? ` at ${sched.time}` : ''}${sched.cron ? ` (cron: ${sched.cron})` : ''}${sched.timezone ? ` ${sched.timezone}` : ''}`);
      lines.push('');
    }

    for (const s of sections) {
      lines.push(`# ${s.title}`);
      if (s.checkIds.length === 0) {
        lines.push('  (no checks match)');
      } else {
        for (const id of s.checkIds) {
          const check = mockChecks.find(c => c.id === id);
          if (!check) { lines.push(`- Check: ${id}`); continue; }
          // Compute since-last-execution duration in a human way
          let since = '';
          if (check.lastExecution) {
            const ms = now.getTime() - new Date(check.lastExecution).getTime();
            const mins = Math.max(0, Math.round(ms / 60000));
            if (mins < 60) since = `${mins} minutes`;
            else {
              const hours = Math.round(mins / 60);
              since = `${hours} hours`;
            }
          }
          lines.push(`- Check: ${check.name} (CSI: ${check.csiId})`);
          lines.push(`  Status: ${check.status}${since ? ` (for ${since})` : ''}`);

          // Include recent error/details if available from mockExecutionResults
          const lastExec = [...mockExecutionResults]
            .filter(r => r.checkId === check.id)
            .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())[0];
          if (lastExec && (check.status === 'FAILING' || lastExec.status === 'FAILURE')) {
            const err = lastExec.error || lastExec.output?.slice(0, 180) || 'Failure reported';
            lines.push(`  Error: ${err}`);
          }
          // Deep link to investigate
          lines.push(`  [Investigate in Checks] → /checks/details/${check.id}`);
          lines.push('');
        }
      }
      lines.push('');
    }
    const total = sections.reduce((acc, s) => acc + s.checkIds.length, 0);
    lines.push('-----------------------------------------------------');
    lines.push(`Total Checks: ${total}`);
    lines.push('Generated with PUT Checks');
    const mockPreview = lines.join('\n');

    // Build HTML email (simple, professional, email-safe)
    const statusColor = overall === 'FAILING' ? '#D32F2F' : overall === 'WARNING' ? '#ED6C02' : overall === 'PASSING' ? '#2E7D32' : '#616161';
    const sectionHtml = sections.map((s) => {
      const items = s.checkIds.map((id) => {
        const check = mockChecks.find(c => c.id === id);
        if (!check) return '';
        const chipColor = check.status === 'FAILING' ? '#D32F2F' : check.status === 'WARNING' ? '#ED6C02' : check.status === 'PASSING' ? '#2E7D32' : '#616161';
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${check.name}<div style="color:#757575;font-size:12px;">${check.csiName}</div></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;"><span style="display:inline-block;padding:4px 8px;border-radius:16px;background:${chipColor};color:#fff;font-size:12px;">${check.status}</span></td>
        </tr>`;
      }).join('');
      return `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;">
          <thead>
            <tr>
              <th colspan="2" style="text-align:left;padding:8px 12px;background:#F5F7FA;color:#374151;border:1px solid #eee;border-bottom:none;font-size:14px;">${s.title}</th>
            </tr>
          </thead>
          <tbody>
            ${items || `<tr><td style="padding:12px;color:#757575;border:1px solid #eee;border-top:none;" colspan="2">No checks match</td></tr>`}
          </tbody>
        </table>`;
    }).join('');

    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body style="margin:0;padding:0;background:#F3F4F6;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F3F4F6;padding:20px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #E5E7EB;background:#0F172A;color:#ffffff;">
                  <div style="font-size:16px;font-weight:700;">Checks Report</div>
                  <div style="font-size:12px;opacity:0.85;">${now.toLocaleString()}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <div style="font-size:18px;color:#111827;font-weight:700;margin-bottom:4px;">${subject}</div>
                  <div style="font-size:13px;color:#6B7280;margin-bottom:12px;">Overall Status: <span style="color:${statusColor};font-weight:700;">${overall}</span></div>
                  <div style="font-size:12px;color:#6B7280;margin-bottom:12px;">Schedule: ${report?.schedule?.frequency || 'n/a'}${report?.schedule?.time ? ` at ${report?.schedule?.time}` : ''}${(report as any)?.schedule?.timezone ? ` ${(report as any).schedule.timezone}` : ''}</div>
                  ${sectionHtml}
                  <div style="border-top:1px solid #E5E7EB;margin-top:12px;padding-top:12px;font-size:12px;color:#6B7280;">Total Checks: ${total}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 20px;background:#F9FAFB;border-top:1px solid #E5E7EB;color:#6B7280;font-size:11px;">
                  Generated by PUT Checks
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
    
    return HttpResponse.json({
      preview: mockPreview,
      html,
      generatedAt: new Date().toISOString()
    });
  }),

  // Send report now (simulate immediate send/execution)
  http.post('/api/reports/:id/run-now', async ({ params, request }) => {
    await delay(800);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const report = mockReports.find(r => r.id === id);
    if (!report) return new HttpResponse(null, { status: 404 });
    // simulate generation outcome based on included checks and return email-like execution record
    const anySections = Array.isArray((report as any).sections) && (report as any).sections.length > 0;
    const chosenIds = anySections
      ? (report as any).sections.flatMap((s: any) => s.kind === 'manual' ? (s.checkIds || []) : mockChecks.slice(0, (s.rule?.limit || 5)).map(c => c.id))
      : (report.selectedChecks || []);
    const included = chosenIds.length || Math.floor(Math.random() * 5) + 1;
    const failures = Math.max(0, Math.floor(included * 0.2));
    // Build HTML similar to preview endpoint
    const rAny = report as any;
    const sections: Array<{ title: string; checkIds: string[] }> = [];
    if (Array.isArray(rAny.sections) && rAny.sections.length > 0) {
      for (const section of rAny.sections) {
        if (section.kind === 'manual') {
          sections.push({ title: section.title || 'Section', checkIds: Array.isArray(section.checkIds) ? section.checkIds : [] });
        } else if (section.kind === 'rule') {
          let list = [...mockChecks];
          const rule = section.rule || {};
          if (rule.csiIds && rule.csiIds.length) list = list.filter(c => rule.csiIds!.includes(c.csiId));
          if (rule.tags && rule.tags.length) list = list.filter(c => rule.tags!.some((t: string) => c.tags.includes(t)));
          if (rule.types && rule.types.length) list = list.filter(c => rule.types!.includes(c.type as any));
          if (rule.status && rule.status.length) list = list.filter(c => rule.status!.includes(c.status as any));
          if (rule.timeframe) {
            const nowT = Date.now();
            const ms = rule.timeframe === '5m' ? 5*60*1000 : rule.timeframe === '15m' ? 15*60*1000 : rule.timeframe === '1h' ? 60*60*1000 : 24*60*60*1000;
            list = list.filter(c => {
              if (!c.lastExecution) return false;
              const dt = new Date(c.lastExecution).getTime();
              return (nowT - dt) <= ms && (c.status === 'FAILING' || c.status === 'WARNING' || c.status === 'PENDING');
            });
          }
          if (rule.sort === 'failing-first') {
            const order = { FAILING: 0, WARNING: 1, PENDING: 2, PASSING: 3, UNKNOWN: 4 } as Record<string, number>;
            list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
          } else if (rule.sort === 'recently-failed') {
            const score = (c: typeof mockChecks[number]) => (c.status === 'FAILING' ? 2 : c.status === 'WARNING' ? 1 : 0);
            list.sort((a, b) => (score(b) - score(a)) || (new Date(b.lastExecution || 0).getTime() - new Date(a.lastExecution || 0).getTime()));
          } else if (rule.sort === 'alphabetical') {
            list.sort((a, b) => a.name.localeCompare(b.name));
          }
          const limited = typeof rule.limit === 'number' ? list.slice(0, Math.max(0, rule.limit)) : list;
          sections.push({ title: section.title || 'Section', checkIds: limited.map(c => c.id) });
        }
      }
    } else {
      sections.push({ title: 'Selected Checks', checkIds: chosenIds });
    }

    const now = new Date();
    const allCheckIds = sections.flatMap(s => s.checkIds);
    const allChecks = allCheckIds.map(id => mockChecks.find(c => c.id === id)).filter(Boolean) as typeof mockChecks[number][];
    const hasFailing = allChecks.some(c => c.status === 'FAILING');
    const hasWarning = allChecks.some(c => c.status === 'WARNING');
    const overall = hasFailing ? 'FAILING' : hasWarning ? 'WARNING' : (allChecks.length ? 'PASSING' : 'UNKNOWN');
    const statusColor = overall === 'FAILING' ? '#D32F2F' : overall === 'WARNING' ? '#ED6C02' : overall === 'PASSING' ? '#2E7D32' : '#616161';
    const sectionHtml = sections.map((s) => {
      const items = s.checkIds.map((id) => {
        const check = mockChecks.find(c => c.id === id);
        if (!check) return '';
        const chipColor = check.status === 'FAILING' ? '#D32F2F' : check.status === 'WARNING' ? '#ED6C02' : check.status === 'PASSING' ? '#2E7D32' : '#616161';
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${check.name}<div style="color:#757575;font-size:12px;">${check.csiName}</div></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;"><span style="display:inline-block;padding:4px 8px;border-radius:16px;background:${chipColor};color:#fff;font-size:12px;">${check.status}</span></td>
        </tr>`;
      }).join('');
      return `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;">
          <thead>
            <tr>
              <th colspan="2" style="text-align:left;padding:8px 12px;background:#F5F7FA;color:#374151;border:1px solid #eee;border-bottom:none;font-size:14px;">${s.title}</th>
            </tr>
          </thead>
          <tbody>
            ${items || `<tr><td style="padding:12px;color:#757575;border:1px solid #eee;border-top:none;" colspan="2">No checks match</td></tr>`}
          </tbody>
        </table>`;
    }).join('');
    const subject = (report as any).subject || report.name;
    const totalChecks = sections.reduce((acc, s) => acc + s.checkIds.length, 0);
    const emailHtml = `<!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body style="margin:0;padding:0;background:#F3F4F6;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F3F4F6;padding:20px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #E5E7EB;background:#0F172A;color:#ffffff;">
                  <div style="font-size:16px;font-weight:700;">Checks Report</div>
                  <div style="font-size:12px;opacity:0.85;">${now.toLocaleString()}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <div style="font-size:18px;color:#111827;font-weight:700;margin-bottom:4px;">${subject}</div>
                  <div style="font-size:13px;color:#6B7280;margin-bottom:12px;">Overall Status: <span style="color:${statusColor};font-weight:700;">${overall}</span></div>
                  <div style="font-size:12px;color:#6B7280;margin-bottom:12px;">Schedule: ${report?.schedule?.frequency || 'n/a'}${report?.schedule?.time ? ` at ${report?.schedule?.time}` : ''}${(report as any)?.schedule?.timezone ? ` ${(report as any).schedule.timezone}` : ''}</div>
                  ${sectionHtml}
                  <div style="border-top:1px solid #E5E7EB;margin-top:12px;padding-top:12px;font-size:12px;color:#6B7280;">Total Checks: ${totalChecks}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 20px;background:#F9FAFB;border-top:1px solid #E5E7EB;color:#6B7280;font-size:11px;">
                  Generated by PUT Checks
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

    const exec = {
      id: `exec-${Date.now()}`,
      reportId: id as string,
      executionTime: new Date().toISOString(),
      status: failures === 0 ? 'success' : failures < included ? 'partial' : 'failed',
      recipientCount: (report.recipients || []).length,
      checksIncluded: included,
      checksFailures: failures,
      generationDuration: Math.floor(Math.random() * 1500) + 500,
      emailContent: emailHtml,
    };
    mockReportExecutions.unshift(exec as any);
    report.updatedAt = new Date().toISOString();
    (report as any).lastSent = exec.executionTime;
    return HttpResponse.json({ ok: true, execution: exec, report });
  }),

  // Get report execution history
  http.get('/api/reports/:id/executions', async ({ params, request }) => {
    await delay(400);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    
    const executions = mockReportExecutions.filter(
      exec => exec.reportId === params.id
    );
    
    return HttpResponse.json({
      data: executions,
      total: executions.length
    });
  }),

  // Delete report
  http.delete('/api/reports/:id', async ({ params, request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const idx = mockReports.findIndex((r) => r.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockReports.splice(idx, 1);
    return HttpResponse.json({ ok: true });
  })
];
'@
}

# File 94: src/services/mocks/handlers/secretsHandlers.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/handlers/secretsHandlers.ts'
  SizeBytes    = 1892
  Sha256       = 'd2771c40a2dbf888d86170452f193f8275a7c1cd227ae07a8f3bef4ab116a682'
  Content      = @'
import { http, HttpResponse, delay } from 'msw';

interface SecretRecord {
  id: string;
  label: string;
  scope: 'project' | 'org' | 'user';
  last4?: string;
  createdAt: string;
  // value is intentionally not returned via API except one-time on create
  value?: string;
}

let mockSecrets: SecretRecord[] = [
  { id: 'sec_abc123', label: 'Trading API Key', scope: 'project', last4: '2f8c', createdAt: new Date().toISOString() },
  { id: 'sec_def456', label: 'Splunk Token', scope: 'org', last4: 'e91a', createdAt: new Date().toISOString() },
];

export const secretsHandlers = [
  // List secrets (metadata only)
  http.get('/api/secrets', async () => {
    await delay(250);
    return HttpResponse.json({
      data: mockSecrets.map(({ value, ...meta }) => meta),
    });
  }),

  // Create secret (one-time value echo)
  http.post('/api/secrets', async ({ request }) => {
    await delay(400);
    const { label, scope, value } = (await request.json()) as { label: string; scope: SecretRecord['scope']; value: string };
    const id = `sec_${Math.random().toString(36).slice(2, 8)}`;
    const last4 = value?.slice(-4) ?? undefined;
    const record: SecretRecord = { id, label, scope, last4, createdAt: new Date().toISOString(), value };
    mockSecrets.push(record);
    return HttpResponse.json({ id, label, scope, last4, createdAt: record.createdAt, value }, { status: 201 });
  }),

  // Resolve secret for execution (server-side only; UI should never call this directly)
  http.post('/api/internal/resolve-secret', async ({ request }) => {
    await delay(120);
    const { id } = (await request.json()) as { id: string };
    const found = mockSecrets.find((s) => s.id === id);
    if (!found) {
      return new HttpResponse(null, { status: 404 });
    }
    // Simulate privileged resolution
    return HttpResponse.json({ id, value: found.value ?? 'REDACTED' });
  }),
];



'@
}

# File 95: src/services/mocks/handlers/studioHandlers.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/handlers/studioHandlers.ts'
  SizeBytes    = 8056
  Sha256       = 'a042ab1a55ba82876bdaf12dcc22bb9c01e527f7fdae0a861a2c00daf3160a40'
  Content      = @'
import { http, HttpResponse, delay } from 'msw';
import { mockUITests, mockUITestExecutions } from '../mockData/studioData';

export const studioHandlers = [
  http.get('/api/studio/tests', async ({ request }) => {
    await delay(300);
    const url = new URL(request.url);
    const csiId = url.searchParams.get('csiId');
    let filteredTests = [...mockUITests];
    if (csiId) filteredTests = filteredTests.filter((test) => test.csiId === csiId);
    return HttpResponse.json({ data: filteredTests, total: filteredTests.length });
  }),
  http.post('/api/studio/tests', async ({ request }) => {
    await delay(800);
    const newTestData = (await request.json()) as any;
    const newTest = {
      id: `ui-test-${Date.now()}`,
      ...newTestData,
      status: 'paused',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'current.user@citi.com',
    };
    mockUITests.push(newTest);
    return HttpResponse.json(newTest, { status: 201 });
  }),
  http.post('/api/studio/tests/:id/execute', async ({ params, request }) => {
    const { id } = params;
    // Accept variables in payload, echo in logs metadata
    let variables: Record<string, any> | undefined;
    try {
      const body: any = await request.json();
      variables = body && typeof body === 'object' ? body.variables : undefined;
    } catch {}
    const test = mockUITests.find((t) => t.id === id);
    if (!test) return new HttpResponse(null, { status: 404 });
    const executionId = `exec-ui-${Date.now()}`;
    const startTime = new Date().toISOString();
    const execution = {
      id: executionId,
      testId: id as string,
      status: 'running' as const,
      startTime,
      stepResults: test.steps.map((_, index) => ({ stepIndex: index, status: 'pending' as const, timestamp: startTime })),
      logs: [
        { timestamp: startTime, level: 'info' as const, message: `Starting UI test execution: ${test.name}` },
        variables ? { timestamp: startTime, level: 'info', message: `Variables: ${JSON.stringify(variables)}` } as any : null,
      ].filter(Boolean),
      // Attach a mock video url when done; set later
    } as any;
    mockUITestExecutions.push(execution);
    // Simulate terminal outcome after a few seconds: success for Customer Login Flow, fail for Trade Booking Workflow
    setTimeout(() => {
      const exec = mockUITestExecutions.find((e) => e.id === executionId);
      if (!exec) return;
      // Force complete: mark all pending as pass first
      exec.stepResults = exec.stepResults.map((s: any) => ({ ...s, status: 'pass', timestamp: new Date().toISOString() }));
      const isSuccess = test.name?.toLowerCase().includes('customer login flow');
      if (isSuccess) {
        exec.status = 'completed';
        exec.logs.push({ timestamp: new Date().toISOString(), level: 'info', message: 'Execution finished: SUCCESS' } as any);
      } else {
        exec.status = 'failed';
        // Mark last step as fail
        if (exec.stepResults.length > 0) exec.stepResults[exec.stepResults.length - 1].status = 'fail';
        exec.logs.push({ timestamp: new Date().toISOString(), level: 'error', message: 'Execution finished: FAILED' } as any);
      }
      exec.endTime = new Date().toISOString();
      exec.videoUrl = '/assets/videos/sample-ui-test.mp4';
    }, Math.min(5000, 2500 + Math.random() * 2500));
    return HttpResponse.json({ executionId, status: 'started', message: 'Test execution started.' });
  }),
  // Polling endpoint returns current state; simulate progression over time
  http.get('/api/studio/executions/:id', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const execution = mockUITestExecutions.find((e) => e.id === id);
    if (!execution) return new HttpResponse(null, { status: 404 });
    // Simulate progression: mark next pending as running/pass and push logs
    const now = new Date().toISOString();
    const nextPending = execution.stepResults.find((s: any) => s.status === 'pending');
    const currentlyRunning = execution.stepResults.find((s: any) => s.status === 'running');
    if (execution.status === 'running') {
      if (!currentlyRunning && nextPending) {
        nextPending.status = 'running';
        nextPending.timestamp = now;
        execution.logs.push({ timestamp: now, level: 'info', message: `Step ${nextPending.stepIndex + 1}: ${execution.testId} running`, stepIndex: nextPending.stepIndex } as any);
      } else if (currentlyRunning) {
        // Move running to pass
        currentlyRunning.status = 'pass';
        currentlyRunning.timestamp = now;
        execution.logs.push({ timestamp: now, level: 'info', message: `Step ${currentlyRunning.stepIndex + 1}: completed`, stepIndex: currentlyRunning.stepIndex } as any);
        const next = execution.stepResults.find((s: any) => s.status === 'pending');
        if (next) {
          next.status = 'running';
          next.timestamp = now;
          execution.logs.push({ timestamp: now, level: 'info', message: `Step ${next.stepIndex + 1}: started`, stepIndex: next.stepIndex } as any);
        } else {
          // Allow the scheduled setTimeout to finalize status rather than forcing completed here
        }
      }
    }
    return HttpResponse.json(execution);
  }),
  http.get('/api/studio/executions', async () => {
    await delay(200);
    return HttpResponse.json({ data: mockUITestExecutions });
  }),
  http.put('/api/studio/tests/:id', async ({ params, request }) => {
    await delay(500);
    const { id } = params;
    const updateData = (await request.json()) as any;
    const testIndex = mockUITests.findIndex((t) => t.id === id);
    if (testIndex === -1) return new HttpResponse(null, { status: 404 });
    mockUITests[testIndex] = {
      ...mockUITests[testIndex],
      ...updateData,
      updatedAt: new Date().toISOString(),
    } as any;
    return HttpResponse.json(mockUITests[testIndex]);
  }),
  http.get('/api/studio/tests/:id', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const test = mockUITests.find((t) => t.id === id);
    if (!test) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(test);
  }),
  http.post('/api/studio/tests/:id/validate-variables', async ({ params, request }) => {
    await delay(250);
    const { id } = params;
    const test = mockUITests.find((t) => t.id === id);
    if (!test) return new HttpResponse(null, { status: 404 });
    const { variables } = (await request.json()) as { variables: Record<string, any> };
    const required = (test.variables || []).filter((v) => v.required).map((v) => v.name);
    const missing = required.filter((n) => variables?.[n] == null || (variables[n].kind === 'secret' ? !variables[n].secretId : variables[n].value == null || variables[n].value === ''));
    const isValid = missing.length === 0;
    return HttpResponse.json({ isValid, missing });
  }),
  http.delete('/api/studio/tests/:id', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const idx = mockUITests.findIndex((t) => t.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockUITests.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post('/api/studio/validate-steps', async ({ request }) => {
    await delay(300);
    const { steps } = (await request.json()) as { steps: string[] };
    const validationResults = steps.map((step, index) => {
      const s = step.trim().toLowerCase();
      const isValid = s.length > 0 && (s.startsWith('go to') || s.startsWith('navigate to') || s.startsWith('click') || s.startsWith('type') || s.startsWith('wait for') || s.startsWith('check that') || s.startsWith('check url contains'));
      return { stepIndex: index, isValid, suggestion: !isValid ? 'Step should start with a valid action' : null };
    });
    return HttpResponse.json({ isValid: validationResults.every((r) => r.isValid), results: validationResults });
  }),
];

export default studioHandlers;



'@
}

# File 96: src/services/mocks/handlers/tagsHandlers.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/handlers/tagsHandlers.ts'
  SizeBytes    = 4717
  Sha256       = '3dbe3b475dd94bd739de1b667032811d97c89518d523219b4312a4d1bb648ca0'
  Content      = @'
import { http, HttpResponse } from 'msw';
import { mockChecks } from '../mockData/checksData';
import { mockCSIs } from '../../../data/mockCSIData';
import { groupTagsByPrefix, TAG_CATEGORIES } from '../../../utils/tagUtils';

export const tagsHandlers = [
  // Get all available tags
  http.get('/api/tags', ({ request }) => {
    const url = new URL(request.url);
    const csiId = url.searchParams.get('csi');

    // Simulate network delay
    return new Promise((resolve) => {
      setTimeout(() => {
        const allTags = new Set<string>();

        if (csiId) {
          // Get tags from checks associated with the selected CSI
          const csiChecks = mockChecks.filter(check => check.csiId === csiId);
          csiChecks.forEach(check => {
            check.tags.forEach(tag => allTags.add(tag));
          });

          // Also get tags from the CSI itself
          const csi = mockCSIs.find(c => c.id === csiId);
          if (csi) {
            csi.tags.forEach(tag => allTags.add(tag));
          }
        } else {
          // Get all available tags from all checks and CSIs
          mockChecks.forEach(check => {
            check.tags.forEach(tag => allTags.add(tag));
          });
          mockCSIs.forEach(csi => {
            csi.tags.forEach(tag => allTags.add(tag));
          });
        }

        const sortedTags = Array.from(allTags).sort();
        const groupedTags = groupTagsByPrefix(sortedTags);

        resolve(HttpResponse.json({
          data: sortedTags,
          grouped: groupedTags,
          categories: TAG_CATEGORIES,
          total: sortedTags.length,
          csiId,
          timestamp: new Date().toISOString()
        }));
      }, Math.random() * 300 + 100); // 100-400ms delay
    });
  }),

  // Get tag statistics
  http.get('/api/tags/stats', ({ request }) => {
    const url = new URL(request.url);
    const csiId = url.searchParams.get('csi');

    return new Promise((resolve) => {
      setTimeout(() => {
        const tagStats = new Map<string, number>();
        let relevantChecks = mockChecks;

        if (csiId) {
          relevantChecks = mockChecks.filter(check => check.csiId === csiId);
        }

        // Count occurrences of each tag
        relevantChecks.forEach(check => {
          check.tags.forEach(tag => {
            tagStats.set(tag, (tagStats.get(tag) || 0) + 1);
          });
        });

        // Convert to array and sort by usage count
        const sortedStats = Array.from(tagStats.entries())
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count);

        resolve(HttpResponse.json({
          data: sortedStats,
          totalTags: tagStats.size,
          totalChecks: relevantChecks.length,
          csiId,
          timestamp: new Date().toISOString()
        }));
      }, Math.random() * 200 + 100);
    });
  }),

  // Get tag suggestions based on current selection
  http.post('/api/tags/suggestions', async ({ request }) => {
    const { selectedTags, csiId } = await request.json() as { 
      selectedTags: string[];
      csiId?: string;
    };

    return new Promise((resolve) => {
      setTimeout(() => {
        let relevantChecks = mockChecks;
        
        if (csiId) {
          relevantChecks = mockChecks.filter(check => check.csiId === csiId);
        }

        // Find checks that have at least one of the selected tags
        const checksWithSelectedTags = relevantChecks.filter(check =>
          selectedTags.some(selectedTag => check.tags.includes(selectedTag))
        );

        // Get all tags from these checks, excluding already selected ones
        const suggestedTags = new Set<string>();
        checksWithSelectedTags.forEach(check => {
          check.tags.forEach(tag => {
            if (!selectedTags.includes(tag)) {
              suggestedTags.add(tag);
            }
          });
        });

        // Count how often each suggested tag appears with selected tags
        const tagFrequency = new Map<string, number>();
        Array.from(suggestedTags).forEach(tag => {
          const count = checksWithSelectedTags.filter(check =>
            check.tags.includes(tag)
          ).length;
          tagFrequency.set(tag, count);
        });

        // Sort suggestions by frequency
        const sortedSuggestions = Array.from(suggestedTags)
          .sort((a, b) => (tagFrequency.get(b) || 0) - (tagFrequency.get(a) || 0))
          .slice(0, 10); // Return top 10 suggestions

        resolve(HttpResponse.json({
          data: sortedSuggestions,
          selectedTags,
          csiId,
          timestamp: new Date().toISOString()
        }));
      }, Math.random() * 200 + 150);
    });
  })
];
'@
}

# File 97: src/services/mocks/handlers/templatesHandlers.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/handlers/templatesHandlers.ts'
  SizeBytes    = 1067
  Sha256       = 'fa3b0b5d7593f8154f9eb60f7003635314176618a0b876a271397b3c960bfe9a'
  Content      = @'
import { http, HttpResponse, delay } from 'msw';
import { mockCheckTemplates } from '../mockData/templatesData';

export const templatesHandlers = [
  http.get('/api/check-templates', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const type = url.searchParams.get('type') || '';
    let results = [...mockCheckTemplates];
    if (q) {
      results = results.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    if (type) {
      results = results.filter((t) => t.type === type);
    }
    return HttpResponse.json({ data: results, total: results.length });
  }),
  http.get('/api/check-templates/:id', async ({ params }) => {
    await delay(150);
    const tpl = mockCheckTemplates.find((t) => t.id === params.id);
    if (!tpl) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(tpl);
  }),
];



'@
}

# File 98: src/services/mocks/mockData/checksData.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/mockData/checksData.ts'
  SizeBytes    = 25315
  Sha256       = 'a30806cee22fa59cf40eb9e312402c3c1d1613fcae30f2d61ec0e7461144e3db'
  Content      = @'
export interface MockCheck {
  id: string;
  name: string;
  type: 'HTTP' | 'TCP' | 'SPLUNK' | 'GRAFANA' | 'ITRS' | 'APPDYNAMICS' | 'UI_TEST';
  csiId: string;
  csiName: string;
  status: 'PASSING' | 'FAILING' | 'WARNING' | 'PENDING' | 'UNKNOWN';
  lastExecution: string | null;
  nextExecution: string | null;
  configuration: Record<string, any>;
  schedule: {
    frequency: string;
    timezone: string;
    enabled: boolean;
  };
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  description?: string;
  environment?: string;
}

export const mockChecks: MockCheck[] = [
  {
    id: 'check-001',
    name: 'Trade API Health Check',
    type: 'HTTP',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:30:00Z',
    nextExecution: '2024-01-15T10:35:00Z',
    configuration: {
      url: 'https://api.trade.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 5000,
      headers: {
        'Authorization': 'Bearer ${TRADE_API_TOKEN}',
        'Content-Type': 'application/json'
      }
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    createdBy: 'bruno.buger@citi.com',
    tags: ['application:trading-api', 'team:platform-engineering', 'lob:capital-markets', 'priority:critical'],
    description: 'Monitors the health of the main trading API endpoint'
  },
  {
    id: 'check-002',
    name: 'Database Connection Pool',
    type: 'TCP',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:29:00Z',
    nextExecution: '2024-01-15T10:34:00Z',
    configuration: {
      host: 'db.trade.internal',
      port: 5432,
      timeout: 3000
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T09:15:00Z',
    updatedAt: '2024-01-15T10:29:00Z',
    createdBy: 'bruno.buger@citi.com',
    tags: ['application:trading-db', 'team:database-ops', 'lob:capital-markets', 'type:infrastructure'],
    description: 'Checks TCP connectivity to the primary database'
  },
  {
    id: 'check-003',
    name: 'Trade Settlement Log Analysis',
    type: 'SPLUNK',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'WARNING',
    lastExecution: '2024-01-15T10:25:00Z',
    nextExecution: '2024-01-15T10:40:00Z',
    configuration: {
      query: 'search index=trading source="settlement.log" | eval settlement_time=now()-_time | where settlement_time>900 | stats count',
      threshold: {
        operator: 'less_than',
        value: 5
      },
      timeRange: 'last_15_minutes'
    },
    schedule: {
      frequency: 'every_15_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T09:30:00Z',
    updatedAt: '2024-01-15T10:25:00Z',
    createdBy: 'bruno.buger@citi.com',
    tags: ['application:settlement-engine', 'team:sre', 'lob:capital-markets', 'priority:business-critical', 'type:log-analysis'],
    description: 'Monitors trade settlement completion times via Splunk logs'
  },
  {
    id: 'check-004',
    name: 'CPU Usage Threshold',
    type: 'GRAFANA',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'FAILING',
    lastExecution: '2024-01-15T10:28:00Z',
    nextExecution: '2024-01-15T10:33:00Z',
    configuration: {
      datasource: 'prometheus',
      query: 'avg(cpu_usage_percent{job="market-data-api"})',
      threshold: {
        operator: 'greater_than',
        value: 85,
        duration: '5m'
      }
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-15T10:28:00Z',
    createdBy: 'matthew.robinson@citi.com',
    tags: ['application:market-data-api', 'team:performance-eng', 'lob:capital-markets', 'type:performance', 'priority:high'],
    description: 'Monitors CPU usage for market data processing servers'
  },
  {
    id: 'check-005',
    name: 'ITRS Gateway Status',
    type: 'ITRS',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:27:00Z',
    nextExecution: '2024-01-15T10:37:00Z',
    configuration: {
      gateway: 'market-data-gw01',
      sampler: 'feed-monitor',
      dataitem: 'connection-status',
      expectedValue: 'OK'
    },
    schedule: {
      frequency: 'every_10_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T10:15:00Z',
    updatedAt: '2024-01-15T10:27:00Z',
    createdBy: 'emanuel.stanciu@citi.com',
    tags: ['application:itrs-gateway', 'team:monitoring-ops', 'lob:capital-markets', 'type:monitoring'],
    description: 'Checks ITRS sampler status for market data feed connectivity'
  },
  {
    id: 'check-006',
    name: 'Application Performance Health Rule',
    type: 'APPDYNAMICS',
    csiId: '170456',
    csiName: 'Customer Digital Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:26:00Z',
    nextExecution: '2024-01-15T10:41:00Z',
    configuration: {
      application: 'customer-portal-prod',
      healthRule: 'response-time-violation',
      tier: 'web-tier'
    },
    schedule: {
      frequency: 'every_15_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T11:00:00Z',
    updatedAt: '2024-01-15T10:26:00Z',
    createdBy: 'bruno.buger@citi.com',
    tags: ['application:customer-portal', 'team:customer-experience', 'lob:retail-banking', 'type:apm', 'priority:customer-facing'],
    description: 'Monitors AppDynamics health rules for customer portal performance'
  },
  {
    id: 'check-007',
    name: 'Customer Login Flow Test',
    type: 'UI_TEST',
    csiId: '170456',
    csiName: 'Customer Digital Platform',
    status: 'PENDING',
    lastExecution: null,
    nextExecution: '2024-01-15T12:00:00Z',
    configuration: {
      steps: [
        'Go to "https://online.citi.com"',
        'Click "Sign On"',
        'Wait for the text "User ID" to appear',
        'Type "testuser123" in the "User ID" field',
        'Click "Continue"',
        'Wait for the text "Password" to appear',
        'Check that the URL contains "login"'
      ],
      browser: 'chrome',
      viewport: { width: 1920, height: 1080 }
    },
    schedule: {
      frequency: 'hourly',
      timezone: 'EST',
      enabled: false
    },
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-01-15T09:00:00Z',
    createdBy: 'bruno.buger@citi.com',
    tags: ['application:online-banking', 'team:qa-automation', 'lob:retail-banking', 'type:ui-test', 'priority:customer-facing'],
    description: 'End-to-end test of customer login flow'
  },
  {
    id: 'check-008',
    name: 'Core Banking API Health',
    type: 'HTTP',
    csiId: '168942',
    csiName: 'Core Banking Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:32:00Z',
    nextExecution: '2024-01-15T10:37:00Z',
    configuration: {
      url: 'https://api.corebanking.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 3000
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-12T08:00:00Z',
    updatedAt: '2024-01-15T10:32:00Z',
    createdBy: 'banking.ops@citi.com',
    tags: ['application:core-banking', 'team:core-systems', 'lob:enterprise-banking', 'priority:critical'],
    description: 'Monitors core banking API availability'
  },
  {
    id: 'check-009',
    name: 'Payment Gateway Health',
    type: 'HTTP',
    csiId: '169834',
    csiName: 'Payment Gateway Infrastructure',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:33:00Z',
    nextExecution: '2024-01-15T10:36:00Z',
    configuration: {
      url: 'https://payments.gateway.internal/status',
      method: 'GET',
      expectedStatus: 200,
      timeout: 5000
    },
    schedule: {
      frequency: 'every_3_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-12T09:00:00Z',
    updatedAt: '2024-01-15T10:33:00Z',
    createdBy: 'payments.ops@citi.com',
    tags: ['application:payment-gateway', 'team:payments-team', 'lob:transaction-services', 'priority:critical'],
    description: 'Monitors payment gateway infrastructure health'
  },
  {
    id: 'check-010',
    name: 'Risk Management System Health',
    type: 'HTTP',
    csiId: '171205',
    csiName: 'Risk Management Systems',
    status: 'WARNING',
    lastExecution: '2024-01-15T10:31:00Z',
    nextExecution: '2024-01-15T10:41:00Z',
    configuration: {
      url: 'https://risk.systems.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 8000
    },
    schedule: {
      frequency: 'every_10_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-12T10:00:00Z',
    updatedAt: '2024-01-15T10:31:00Z',
    createdBy: 'risk.ops@citi.com',
    tags: ['application:risk-management', 'team:risk-analytics', 'lob:risk-compliance', 'type:monitoring'],
    description: 'Monitors risk management system health'
  },
  {
    id: 'check-011',
    name: 'Security Operations Monitor',
    type: 'HTTP',
    csiId: '172954',
    csiName: 'Security Operations Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:34:00Z',
    nextExecution: '2024-01-15T10:39:00Z',
    configuration: {
      url: 'https://security.ops.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 3000
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-12T11:00:00Z',
    updatedAt: '2024-01-15T10:34:00Z',
    createdBy: 'security.ops@citi.com',
    tags: ['application:security-ops', 'team:cybersecurity', 'lob:enterprise-security', 'priority:critical'],
    description: 'Monitors security operations platform health'
  },
  {
    id: 'check-012',
    name: 'Production Tools',
    type: 'HTTP',
    csiId: '172087',
    csiName: 'Production Tools',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:35:00Z',
    nextExecution: '2024-01-15T10:40:00Z',
    configuration: {
      url: 'https://automation.prod.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 4000
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-12T12:00:00Z',
    updatedAt: '2024-01-15T10:35:00Z',
    createdBy: 'automation.ops@citi.com',
    tags: ['application:automation-platform', 'team:devops', 'lob:technology-infrastructure', 'type:infrastructure'],
    description: 'Monitors automated production management systems',
    environment: 'Production'
  },
  {
    id: 'check-013',
    name: 'Transaction Processing Queue Health',
    type: 'SPLUNK',
    csiId: '169834',
    csiName: 'Payment Gateway Infrastructure', 
    status: 'PASSING',
    lastExecution: '2024-01-15T10:30:00Z',
    nextExecution: '2024-01-15T10:45:00Z',
    configuration: {
      query: 'search index=payments source="transaction_queue.log" earliest=-15m | stats count by status | where status="processed" AND count > 1000',
      index: 'payments',
      timeRange: '15m',
      expectedCount: 1000,
      countOperator: '>'
    },
    schedule: {
      frequency: 'every_15_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-13T09:00:00Z',
    updatedAt: '2024-01-15T10:30:00Z', 
    createdBy: 'bruno.buger@citi.com',
    tags: ['application:payment-processor', 'team:payments-team', 'lob:transaction-services', 'type:splunk-query', 'priority:high'],
    description: 'Monitors payment transaction processing queue via Splunk logs',
    environment: 'Production'
  },
  {
    id: 'check-014',
    name: 'Market Data Feed Latency',
    type: 'GRAFANA',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'WARNING',
    lastExecution: '2024-01-15T10:32:00Z',
    nextExecution: '2024-01-15T10:37:00Z',
    configuration: {
      dashboard: 'market-data-monitoring',
      panel: 'feed-latency-panel-3',
      metric: 'avg(market_data_latency_ms{exchange="NYSE"})',
      threshold: 50,
      thresholdOperator: '<'
    },
    schedule: {
      frequency: 'every_5_minutes', 
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-13T10:00:00Z',
    updatedAt: '2024-01-15T10:32:00Z',
    createdBy: 'maria.rodriguez@citi.com',
    tags: ['application:market-feed', 'team:market-data', 'lob:capital-markets', 'type:grafana-metrics', 'exchange:nyse'],
    description: 'Monitors NYSE market data feed latency through Grafana metrics',
    environment: 'Production'
  },
  {
    id: 'check-015',
    name: 'Trading System Gateway Monitor',
    type: 'ITRS',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:28:00Z',
    nextExecution: '2024-01-15T10:38:00Z',
    configuration: {
      sampler: 'Gateway > TradingGW01 > OrderManagement > OrderFlow',
      expectedStatus: 'OK'
    },
    schedule: {
      frequency: 'every_10_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-13T11:00:00Z',
    updatedAt: '2024-01-15T10:28:00Z',
    createdBy: 'emanuel.stanciu@citi.com',
    tags: ['application:order-management', 'team:trading-ops', 'lob:capital-markets', 'type:itrs-monitor', 'component:gateway'],
    description: 'Monitors ITRS trading system gateway and order flow status',
    environment: 'Production'
  },
  {
    id: 'check-016',
    name: 'Customer Portal Database Pool',
    type: 'APPDYNAMICS',
    csiId: '170456',
    csiName: 'Customer Digital Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:31:00Z',
    nextExecution: '2024-01-15T10:46:00Z',
    configuration: {
      application: 'customer-digital-portal-prod',
      healthRule: 'Database Connection Pool Health'
    },
    schedule: {
      frequency: 'every_15_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-13T12:00:00Z',
    updatedAt: '2024-01-15T10:31:00Z',
    createdBy: 'bruno.buger@citi.com',
    tags: ['application:customer-portal', 'team:database-ops', 'lob:retail-banking', 'type:appdynamics', 'component:db-pool'],
    description: 'Monitors AppDynamics health rule for customer portal database connections',
    environment: 'Production'
  },
  {
    id: 'check-017',
    name: 'Payment Form UI Test',
    type: 'UI_TEST',
    csiId: '169834',
    csiName: 'Payment Gateway Infrastructure',
    status: 'PASSING',
    lastExecution: '2024-01-15T09:00:00Z',
    nextExecution: '2024-01-15T12:00:00Z',
    configuration: {
      steps: [
        'Go to "https://payments.citi.com/test"',
        'Wait for page to load completely',
        'Click "New Payment" button',
        'Fill "Amount" field with "100.00"',
        'Select "USD" from currency dropdown', 
        'Fill "Recipient" field with "Test Account"',
        'Click "Process Payment" button',
        'Wait for text "Payment Successful" to appear',
        'Check that URL contains "confirmation"'
      ],
      browserType: 'chrome',
      screenSize: '1920x1080'
    },
    schedule: {
      frequency: 'every_3_hours',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-14T08:00:00Z',
    updatedAt: '2024-01-15T09:00:00Z',
    createdBy: 'bruno.buger@citi.com',
    tags: ['application:payment-form', 'team:qa-automation', 'lob:transaction-services', 'type:ui-test', 'test-type:e2e'],
    description: 'End-to-end UI test for payment processing form and confirmation',
    environment: 'Staging'
  },
  {
    id: 'check-018',
    name: 'Redis Cache Server',
    type: 'TCP',
    csiId: '170456', 
    csiName: 'Customer Digital Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:33:00Z',
    nextExecution: '2024-01-15T10:38:00Z',
    configuration: {
      host: 'redis-cluster.customer.internal',
      port: 6379,
      timeout: 2000
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST', 
      enabled: true
    },
    createdAt: '2024-01-14T09:00:00Z',
    updatedAt: '2024-01-15T10:33:00Z',
    createdBy: 'bruno.buger@citi.com',
    tags: ['application:redis-cache', 'team:infrastructure', 'lob:retail-banking', 'type:tcp-check', 'component:cache'],
    description: 'Checks TCP connectivity to Redis cache cluster for customer platform',
    environment: 'Production'
  },
  {
    id: 'check-019',
    name: 'Mobile Banking API Performance',
    type: 'HTTP',
    csiId: '173621',
    csiName: 'Mobile Banking Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:34:00Z', 
    nextExecution: '2024-01-15T10:37:00Z',
    configuration: {
      endpoint: 'https://api.mobile.citi.com/v2/health',
      method: 'POST',
      expectedStatus: 200,
      timeout: 3000,
      retries: 2,
      validateSSL: true,
      followRedirects: false,
      headers: {
        'Authorization': 'Bearer ${MOBILE_API_TOKEN}',
        'Content-Type': 'application/json',
        'X-Client-Version': '3.2.1',
        'X-Platform': 'ios'
      }
    },
    schedule: {
      frequency: 'every_3_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-14T10:00:00Z',
    updatedAt: '2024-01-15T10:34:00Z',
    createdBy: 'mobile.team@citi.com',
    tags: ['application:mobile-banking', 'team:mobile-dev', 'lob:digital-channels', 'type:api-check', 'priority:critical', 'platform:ios'],
    description: 'Monitors mobile banking API health and performance metrics',
    environment: 'Production'
  },
  {
    id: 'check-020', 
    name: 'Compliance Audit Log Analysis',
    type: 'SPLUNK',
    csiId: '171205',
    csiName: 'Risk Management Systems',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:15:00Z',
    nextExecution: '2024-01-15T11:15:00Z',
    configuration: {
      query: 'search index=compliance source="audit.log" earliest=-1h | rex field=_raw "transaction_id=(?<tx_id>[A-Z0-9]+)" | stats dc(tx_id) as unique_transactions | eval status=if(unique_transactions>500,"healthy","warning")',
      index: 'compliance',
      timeRange: '1h',
      expectedCount: 500,
      countOperator: '>'
    },
    schedule: {
      frequency: 'hourly',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-14T11:00:00Z',
    updatedAt: '2024-01-15T10:15:00Z',
    createdBy: 'compliance.ops@citi.com',
    tags: ['application:compliance-audit', 'team:compliance-ops', 'lob:risk-compliance', 'type:splunk-query', 'priority:regulatory', 'audit:required'],
    description: 'Analyzes compliance audit logs for transaction monitoring and regulatory reporting',
    environment: 'Production'
  }
  ,
  {
    id: 'check-021',
    name: 'Liquidity API Health',
    type: 'HTTP',
    csiId: '176001',
    csiName: 'Treasury Liquidity Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:36:00Z',
    nextExecution: '2024-01-15T10:41:00Z',
    configuration: {
      url: 'https://liquidity.api.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 3000
    },
    schedule: { frequency: 'every_5_minutes', timezone: 'EST', enabled: true },
    createdAt: '2024-01-14T10:00:00Z',
    updatedAt: '2024-01-15T10:36:00Z',
    createdBy: 'treasury.ops@citi.com',
    tags: ['application:liquidity-api', 'team:treasury', 'lob:treasury', 'priority:critical'],
    description: 'Checks Liquidity API health endpoint',
    environment: 'Production'
  },
  {
    id: 'check-022',
    name: 'Fraud Scoring API Latency',
    type: 'GRAFANA',
    csiId: '176002',
    csiName: 'Fraud Detection Platform',
    status: 'WARNING',
    lastExecution: '2024-01-15T10:35:00Z',
    nextExecution: '2024-01-15T10:40:00Z',
    configuration: {
      datasource: 'prometheus',
      query: 'avg(fraud_scoring_latency_ms)',
      threshold: { operator: 'greater_than', value: 200, duration: '5m' }
    },
    schedule: { frequency: 'every_5_minutes', timezone: 'EST', enabled: true },
    createdAt: '2024-01-14T11:30:00Z',
    updatedAt: '2024-01-15T10:35:00Z',
    createdBy: 'fraud.ops@citi.com',
    tags: ['application:fraud-scoring', 'team:fraud-analytics', 'lob:risk-management', 'type:performance'],
    description: 'Monitors latency of fraud scoring API',
    environment: 'Production'
  }
];

export interface MockExecutionResult {
  id: string;
  checkId: string;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING' | 'TIMEOUT';
  startTime: string;
  endTime: string;
  duration: number;
  output: string;
  metadata: Record<string, any>;
  error?: string;
}

export const mockExecutionResults: MockExecutionResult[] = [
  {
    id: 'exec-001',
    checkId: 'check-001',
    status: 'SUCCESS',
    startTime: '2024-01-15T10:30:00Z',
    endTime: '2024-01-15T10:30:02Z',
    duration: 2147,
    output: 'HTTP GET request successful. Status: 200 OK. Response time: 145ms.',
    metadata: {
      responseTime: 145,
      statusCode: 200,
      responseSize: 1024,
      headers: {
        'content-type': 'application/json',
        'server': 'nginx/1.18.0'
      }
    }
  },
  {
    id: 'exec-002',
    checkId: 'check-004',
    status: 'FAILURE',
    startTime: '2024-01-15T10:28:00Z',
    endTime: '2024-01-15T10:28:05Z',
    duration: 5023,
    output: 'CPU usage threshold exceeded. Current: 92.5%, Threshold: 85%',
    metadata: {
      currentValue: 92.5,
      threshold: 85,
      duration: '7m',
      affectedNodes: ['mkt-data-01', 'mkt-data-02']
    },
    error: 'Threshold violation: CPU usage has been above 85% for 7 minutes'
  },
  {
    id: 'exec-003',
    checkId: 'check-007',
    status: 'SUCCESS',
    startTime: '2024-01-15T12:00:00Z',
    endTime: '2024-01-15T12:00:18Z',
    duration: 18342,
    output: 'UI test completed successfully. All 7 steps passed. Video recording available.',
    metadata: {
      stepsExecuted: 7,
      stepsPassed: 7,
      stepsFailed: 0,
      screenshotCount: 14,
      videoUrl: '/videos/customer-login-flow-test.mp4',
      browserVersion: 'Chrome 120.0.6099.109',
      viewport: '1920x1080'
    }
  },
  {
    id: 'exec-004',
    checkId: 'check-013',
    status: 'SUCCESS',
    startTime: '2024-01-15T10:30:00Z',
    endTime: '2024-01-15T10:30:03Z',
    duration: 3156,
    output: 'Splunk query executed successfully. Found 1247 processed transactions in the last 15 minutes.',
    metadata: {
      queryExecutionTime: 2.8,
      resultsCount: 1247,
      expectedThreshold: 1000,
      splunkIndex: 'payments',
      timeRange: '15m'
    }
  },
  {
    id: 'exec-005',
    checkId: 'check-014',
    status: 'WARNING',
    startTime: '2024-01-15T10:32:00Z',
    endTime: '2024-01-15T10:32:02Z',
    duration: 2894,
    output: 'Market data latency warning. Current average: 67ms, threshold: 50ms',
    metadata: {
      currentLatency: 67,
      thresholdLatency: 50,
      exchange: 'NYSE',
      affectedSymbols: ['SPY', 'QQQ', 'IWM'],
      grafanaDashboard: 'market-data-monitoring'
    }
  },
  {
    id: 'exec-006',
    checkId: 'check-015',
    status: 'SUCCESS',
    startTime: '2024-01-15T10:28:00Z',
    endTime: '2024-01-15T10:28:01Z',
    duration: 1203,
    output: 'ITRS sampler status check passed. OrderFlow status: OK',
    metadata: {
      samplerPath: 'Gateway > TradingGW01 > OrderManagement > OrderFlow',
      currentStatus: 'OK',
      expectedStatus: 'OK',
      lastUpdate: '2024-01-15T10:27:45Z'
    }
  },
  {
    id: 'exec-007',
    checkId: 'check-016',
    status: 'SUCCESS',
    startTime: '2024-01-15T10:31:00Z',
    endTime: '2024-01-15T10:31:04Z',
    duration: 4123,
    output: 'AppDynamics health rule check passed. Database connection pool is healthy.',
    metadata: {
      application: 'customer-digital-portal-prod',
      healthRule: 'Database Connection Pool Health',
      currentConnections: 45,
      maxConnections: 100,
      poolUtilization: 0.45
    }
  },
  {
    id: 'exec-008',
    checkId: 'check-017',
    status: 'SUCCESS',
    startTime: '2024-01-15T09:00:00Z',
    endTime: '2024-01-15T09:00:23Z',
    duration: 23567,
    output: 'Payment form UI test completed successfully. All 9 steps passed. Payment flow validated.',
    metadata: {
      stepsExecuted: 9,
      stepsPassed: 9,
      stepsFailed: 0,
      paymentAmount: '100.00',
      currency: 'USD',
      transactionId: 'TEST_TX_789123',
      videoUrl: '/videos/payment-form-test.mp4'
    }
  }
];

// Additional mock data for comprehensive testing
export const mockCheckStats = {
  total: 20,
  passing: 14,
  failing: 2,
  warning: 3,
  pending: 1,
  byType: {
    HTTP: 7,
    TCP: 2,
    SPLUNK: 3,
    GRAFANA: 2,
    ITRS: 2,
    APPDYNAMICS: 2,
    UI_TEST: 2
  },
  byCSI: {
    '174523': 5,  // Trading Platform Services
    '170456': 4,  // Customer Digital Platform  
    '169834': 3,  // Payment Gateway Infrastructure
    '171205': 2,  // Risk Management Systems
    '168942': 1,  // Core Banking Platform
    '172954': 1,  // Security Operations Platform
    '172087': 1,  // Production Tools
    '173621': 1   // Mobile Banking Platform
  }
};
'@
}

# File 99: src/services/mocks/mockData/csiData.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/mockData/csiData.ts'
  SizeBytes    = 10042
  Sha256       = '31afc369f143f1a6af21d34cfe24a3726d8dab18f4c7c496194769c78e8c23e5'
  Content      = @'
export interface MockCSI {
  id: string;
  name: string;
  description: string;
  owner: string;
  environment: 'Production' | 'Staging' | 'Development' | 'UAT';
  businessUnit: string;
  status: 'Active' | 'Deprecated' | 'Development';
  applications: MockApplication[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MockApplication {
  id: string;
  name: string;
  type: 'REST API' | 'Microservice' | 'Database' | 'Web Application' | 'Batch Job' | 'Message Queue';
  version: string;
  status: 'Running' | 'Stopped' | 'Error' | 'Maintenance';
  endpoints?: string[];
}

export const mockCSIs: MockCSI[] = [
  {
    id: '174523',
    name: 'Trade Processing System',
    description: 'Core trading system for equity and fixed income transactions',
    owner: 'Trading Technology Team',
    environment: 'Production',
    businessUnit: 'Markets & Securities Services',
    status: 'Active',
    applications: [
      {
        id: 'app-001',
        name: 'Trade API Gateway',
        type: 'REST API',
        version: 'v2.1.4',
        status: 'Running',
        endpoints: [
          'https://api.trade.internal/health',
          'https://api.trade.internal/orders',
          'https://api.trade.internal/settlements'
        ]
      },
      {
        id: 'app-002',
        name: 'Trade Settlement Service',
        type: 'Microservice',
        version: 'v1.8.2',
        status: 'Running'
      },
      {
        id: 'app-003',
        name: 'Trade Database',
        type: 'Database',
        version: 'PostgreSQL 14.9',
        status: 'Running'
      }
    ],
    tags: ['trading', 'critical', 'high-volume', 'real-time'],
    createdAt: '2023-06-15T09:00:00Z',
    updatedAt: '2024-01-10T14:30:00Z'
  },
  {
    id: '168942',
    name: 'Market Data System',
    description: 'Real-time market data processing and distribution platform',
    owner: 'Market Data Engineering',
    environment: 'Production',
    businessUnit: 'Markets & Securities Services',
    status: 'Active',
    applications: [
      {
        id: 'app-004',
        name: 'Market Data Processor',
        type: 'Microservice',
        version: 'v3.2.1',
        status: 'Running'
      },
      {
        id: 'app-005',
        name: 'Price Feed API',
        type: 'REST API',
        version: 'v2.0.3',
        status: 'Running',
        endpoints: [
          'https://api.marketdata.internal/prices',
          'https://api.marketdata.internal/quotes'
        ]
      },
      {
        id: 'app-006',
        name: 'Market Data Cache',
        type: 'Database',
        version: 'Redis 7.0.8',
        status: 'Running'
      }
    ],
    tags: ['market-data', 'real-time', 'high-throughput', 'low-latency'],
    createdAt: '2023-05-20T10:00:00Z',
    updatedAt: '2024-01-08T16:45:00Z'
  },
  {
    id: '170456',
    name: 'Customer Portal',
    description: 'Online banking portal for retail and corporate customers',
    owner: 'Digital Banking Team',
    environment: 'Production',
    businessUnit: 'Global Consumer Banking',
    status: 'Active',
    applications: [
      {
        id: 'app-007',
        name: 'Portal Web Application',
        type: 'Web Application',
        version: 'v5.1.2',
        status: 'Running',
        endpoints: [
          'https://online.citi.com',
          'https://online.citi.com/api/auth'
        ]
      },
      {
        id: 'app-008',
        name: 'Customer API Service',
        type: 'REST API',
        version: 'v4.0.1',
        status: 'Running'
      },
      {
        id: 'app-009',
        name: 'Session Management Service',
        type: 'Microservice',
        version: 'v2.3.5',
        status: 'Running'
      }
    ],
    tags: ['customer-facing', 'web', 'authentication', 'high-availability'],
    createdAt: '2023-03-10T11:00:00Z',
    updatedAt: '2024-01-12T09:15:00Z'
  },
  {
    id: '171205',
    name: 'Risk Management Platform',
    description: 'Enterprise risk assessment and monitoring platform',
    owner: 'Risk Technology Team',
    environment: 'Production',
    businessUnit: 'Risk Management',
    status: 'Active',
    applications: [
      {
        id: 'app-010',
        name: 'Risk Calculation Engine',
        type: 'Batch Job',
        version: 'v1.9.0',
        status: 'Running'
      },
      {
        id: 'app-011',
        name: 'Risk API Gateway',
        type: 'REST API',
        version: 'v3.1.7',
        status: 'Running'
      },
      {
        id: 'app-012',
        name: 'Risk Data Warehouse',
        type: 'Database',
        version: 'Oracle 19c',
        status: 'Running'
      }
    ],
    tags: ['risk', 'compliance', 'batch-processing', 'analytics'],
    createdAt: '2023-08-01T08:00:00Z',
    updatedAt: '2024-01-14T13:20:00Z'
  },
  {
    id: '169834',
    name: 'Payment Processing Network',
    description: 'Global payment processing and settlement network',
    owner: 'Payments Engineering',
    environment: 'Production',
    businessUnit: 'Treasury & Trade Solutions',
    status: 'Active',
    applications: [
      {
        id: 'app-013',
        name: 'Payment Gateway',
        type: 'REST API',
        version: 'v4.2.1',
        status: 'Running'
      },
      {
        id: 'app-014',
        name: 'Settlement Engine',
        type: 'Microservice',
        version: 'v2.7.3',
        status: 'Running'
      },
      {
        id: 'app-015',
        name: 'Payment Queue',
        type: 'Message Queue',
        version: 'Apache Kafka 3.4',
        status: 'Running'
      }
    ],
    tags: ['payments', 'settlement', 'messaging', 'global'],
    createdAt: '2023-07-12T07:30:00Z',
    updatedAt: '2024-01-11T15:45:00Z'
  },
  {
    id: '172954',
    name: 'Credit Card Processing',
    description: 'Credit card transaction processing and fraud detection system',
    owner: 'Cards Technology Team',
    environment: 'Production',
    businessUnit: 'Global Consumer Banking',
    status: 'Active',
    applications: [
      {
        id: 'app-016',
        name: 'Transaction Processor',
        type: 'Microservice',
        version: 'v6.1.0',
        status: 'Running'
      },
      {
        id: 'app-017',
        name: 'Fraud Detection API',
        type: 'REST API',
        version: 'v3.4.2',
        status: 'Running'
      }
    ],
    tags: ['credit-cards', 'fraud-detection', 'real-time', 'high-volume'],
    createdAt: '2023-04-05T12:00:00Z',
    updatedAt: '2024-01-09T11:30:00Z'
  },
  {
    id: '173621',
    name: 'Mobile Banking Platform',
    description: 'Mobile banking APIs and services for iOS and Android clients',
    owner: 'Mobile Banking Team',
    environment: 'Production',
    businessUnit: 'Digital Banking',
    status: 'Active',
    applications: [
      {
        id: 'app-018',
        name: 'Mobile Banking API',
        type: 'REST API',
        version: 'v2.3.0',
        status: 'Running',
        endpoints: [
          'https://api.mobile.citi.com/v2/health',
          'https://api.mobile.citi.com/v2/auth'
        ]
      },
      {
        id: 'app-019',
        name: 'Push Notification Service',
        type: 'Microservice',
        version: 'v1.5.2',
        status: 'Running'
      }
    ],
    tags: ['mobile-banking', 'digital-channels', 'customer-facing', 'high-availability'],
    createdAt: '2023-09-01T10:00:00Z',
    updatedAt: '2025-01-07T10:52:00Z'
  }
  ,
  {
    id: '176001',
    name: 'Treasury Liquidity Platform',
    description: 'Real-time liquidity monitoring and forecasting across accounts and currencies',
    owner: 'Treasury Engineering',
    environment: 'Production',
    businessUnit: 'Treasury & Trade Solutions',
    status: 'Active',
    applications: [
      {
        id: 'app-020',
        name: 'Liquidity API',
        type: 'REST API',
        version: 'v1.4.0',
        status: 'Running',
        endpoints: [
          'https://liquidity.api.internal/health',
          'https://liquidity.api.internal/positions'
        ]
      },
      {
        id: 'app-021',
        name: 'Liquidity Metrics Processor',
        type: 'Microservice',
        version: 'v2.3.1',
        status: 'Running'
      }
    ],
    tags: ['treasury', 'liquidity', 'real-time', 'critical'],
    createdAt: '2024-08-15T10:00:00Z',
    updatedAt: '2025-01-07T10:55:00Z'
  },
  {
    id: '176002',
    name: 'Fraud Detection Platform',
    description: 'Streaming fraud detection and scoring for card and account transactions',
    owner: 'Fraud Analytics Team',
    environment: 'Production',
    businessUnit: 'Risk Management',
    status: 'Active',
    applications: [
      {
        id: 'app-022',
        name: 'Fraud Scoring API',
        type: 'REST API',
        version: 'v3.0.2',
        status: 'Running',
        endpoints: [
          'https://fraud.api.internal/health',
          'https://fraud.api.internal/score'
        ]
      },
      {
        id: 'app-023',
        name: 'Fraud Feature Pipeline',
        type: 'Microservice',
        version: 'v1.7.4',
        status: 'Running'
      }
    ],
    tags: ['fraud', 'streaming', 'analytics', 'critical'],
    createdAt: '2024-09-10T09:00:00Z',
    updatedAt: '2025-01-07T10:58:00Z'
  }
];

export const mockUsers = [
  {
    id: 'user-001',
    name: 'David Chen',
    email: 'bruno.buger@citi.com',
    role: 'SRE Engineer',
    teams: ['Trading Technology Team'],
    permissions: ['174523', '168942']
  },
  {
    id: 'user-002',
    name: 'Priya Sharma',
    email: 'bruno.buger@citi.com',
    role: 'L2 Support Analyst',
    teams: ['Trading Technology Team', 'Digital Banking Team'],
    permissions: ['174523', '170456']
  },
  {
    id: 'user-003',
    name: 'Maria Garcia',
    email: 'matthew.robinson@citi.com',
    role: 'Operations Analyst',
    teams: ['Market Data Engineering'],
    permissions: ['168942']
  },
  {
    id: 'user-004',
    name: 'Robert Kim',
    email: 'emanuel.stanciu@citi.com',
    role: 'IT Director',
    teams: ['Trading Technology Team', 'Risk Technology Team'],
    permissions: ['174523', '171205']
  }
];
'@
}

# File 100: src/services/mocks/mockData/reportsData.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/mockData/reportsData.ts'
  SizeBytes    = 7570
  Sha256       = '2bd7d566e5ff3ea955ce152e6d517b372725ea7f73492b0617fe7e08355295cc'
  Content      = @'
export interface MockReport {
  id: string;
  name: string;
  description: string;
  selectedChecks: string[];
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
    time: string;
    timezone: string;
    enabled: boolean;
    daysOfWeek?: number[];
    daysOfMonth?: number[];
    cron?: string;
  };
  recipients: string[];
  template: 'standard' | 'executive' | 'detailed' | 'alert-digest' | 'trend-analysis';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastSent?: string;
  status: 'active' | 'paused' | 'draft';
  sections?: Array<{
    id: string;
    title: string;
    kind: 'manual' | 'rule';
    checkIds?: string[];
    rule?: {
      csiIds?: string[];
      tags?: string[];
      types?: string[];
      status?: string[];
      timeframe?: '' | '5m' | '15m' | '1h' | '24h';
      sort?: '' | 'failing-first' | 'recently-failed' | 'alphabetical';
      limit?: number;
    };
  }>;
}

export const mockReports: MockReport[] = [
  {
    id: 'report-001',
    name: 'Daily Trading System Health',
    description: 'Daily summary of critical trading system health checks',
    selectedChecks: ['check-001', 'check-002', 'check-003'],
    schedule: {
      frequency: 'daily',
      time: '06:00',
      timezone: 'EST',
      enabled: true
    },
    recipients: [
      'emanuel.stanciu@citi.com',
      'trading-ops@citi.com',
      'bruno.buger@citi.com'
    ],
    template: 'standard',
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-15T08:30:00Z',
    createdBy: 'bruno.buger@citi.com',
    lastSent: '2024-01-15T06:00:00Z',
    status: 'active'
  },
  {
    id: 'report-002',
    name: 'Weekly Infrastructure Overview',
    description: 'Comprehensive weekly report on infrastructure health across all systems',
    selectedChecks: ['check-001', 'check-002', 'check-004', 'check-005'],
    schedule: {
      frequency: 'weekly',
      time: '09:00',
      timezone: 'EST',
      enabled: true,
      daysOfWeek: [1] // Monday
    },
    recipients: [
      'emanuel.stanciu@citi.com',
      'infrastructure-team@citi.com',
      'operations-leads@citi.com'
    ],
    template: 'detailed',
    createdAt: '2024-01-08T10:00:00Z',
    updatedAt: '2024-01-14T12:00:00Z',
    createdBy: 'matthew.robinson@citi.com',
    lastSent: '2024-01-14T09:00:00Z',
    status: 'active'
  },
  {
    id: 'report-003',
    name: 'Customer Portal Status',
    description: 'Real-time status report for customer-facing applications',
    selectedChecks: ['check-006', 'check-007'],
    schedule: {
      frequency: 'daily',
      time: '18:00',
      timezone: 'EST',
      enabled: false
    },
    recipients: [
      'customer-ops@citi.com',
      'bruno.buger@citi.com'
    ],
    template: 'standard',
    createdAt: '2024-01-12T14:00:00Z',
    updatedAt: '2024-01-12T14:00:00Z',
    createdBy: 'bruno.buger@citi.com',
    status: 'paused',
    sections: [
      { id: 'section-1', title: 'Critical Services', kind: 'rule', rule: { status: ['FAILING', 'WARNING'], sort: 'failing-first', limit: 10 } },
      { id: 'section-2', title: 'Core Checks', kind: 'manual', checkIds: ['check-001','check-002'] }
    ]
  }
];

export interface MockReportExecution {
  id: string;
  reportId: string;
  executionTime: string;
  status: 'success' | 'failed' | 'partial';
  recipientCount: number;
  checksIncluded: number;
  checksFailures: number;
  generationDuration: number;
  emailContent?: string;
}

export const mockReportExecutions: MockReportExecution[] = [
  {
    id: 'exec-report-001',
    reportId: 'report-001',
    executionTime: '2024-01-15T06:00:00Z',
    status: 'success',
    recipientCount: 3,
    checksIncluded: 3,
    checksFailures: 1,
    generationDuration: 2340,
    emailContent: `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Checks Report</title>
  <style>body { margin:0; padding:0; }</style>
  </head>
  <body style="margin:0;padding:0;background:#F3F4F6;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F3F4F6;padding:20px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #E5E7EB;background:#0F172A;color:#ffffff;">
                <div style="font-size:16px;font-weight:700;">Checks Report</div>
                <div style="font-size:12px;opacity:0.85;">Jan 15, 2024, 6:00 AM EST</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;">
                <div style="font-size:18px;color:#111827;font-weight:700;margin-bottom:4px;">Daily Trading System Health</div>
                <div style="font-size:13px;color:#6B7280;margin-bottom:12px;">Overall Status: <span style="color:#ED6C02;font-weight:700;">WARNING</span></div>
                <div style="font-size:12px;color:#6B7280;margin-bottom:12px;">Schedule: daily at 06:00 EST</div>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;">
                  <thead>
                    <tr>
                      <th colspan="2" style="text-align:left;padding:8px 12px;background:#F5F7FA;color:#374151;border:1px solid #eee;border-bottom:none;font-size:14px;">Selected Checks</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;">Trade API Health Check<div style="color:#757575;font-size:12px;">CSI 123456</div></td>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;"><span style="display:inline-block;padding:4px 8px;border-radius:16px;background:#2E7D32;color:#fff;font-size:12px;">PASSING</span></td>
                    </tr>
                    <tr>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;">Database Connection Pool<div style="color:#757575;font-size:12px;">CSI 123456</div></td>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;"><span style="display:inline-block;padding:4px 8px;border-radius:16px;background:#2E7D32;color:#fff;font-size:12px;">PASSING</span></td>
                    </tr>
                    <tr>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;">Trade Settlement Log Analysis<div style="color:#757575;font-size:12px;">CSI 123456</div></td>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;"><span style="display:inline-block;padding:4px 8px;border-radius:16px;background:#ED6C02;color:#fff;font-size:12px;">WARNING</span></td>
                    </tr>
                  </tbody>
                </table>
                <div style="border-top:1px solid #E5E7EB;margin-top:12px;padding-top:12px;font-size:12px;color:#6B7280;">Total Checks: 3</div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 20px;background:#F9FAFB;border-top:1px solid #E5E7EB;color:#6B7280;font-size:11px;">Generated by PUT Checks</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  }
];
'@
}

# File 101: src/services/mocks/mockData/studioData.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/mockData/studioData.ts'
  SizeBytes    = 6941
  Sha256       = '0fc9e309c93908dbb81b05e6517698aece0e7e069b47e9e97ca462850c10b583'
  Content      = @'
export interface MockUITest {
  id: string;
  name: string;
  csiId: string;
  description: string;
  steps: string[];
  configuration: {
    browser: 'chrome' | 'firefox' | 'safari' | 'edge';
    viewport: {
      width: number;
      height: number;
    };
    timeout: number;
    waitStrategy: 'none' | 'networkidle' | 'domcontentloaded';
  };
  variables?: Array<{ name: string; type: 'plain' | 'number' | 'boolean' | 'secret'; required?: boolean; description?: string }>;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastRunStatus?: 'success' | 'failed' | 'timeout';
  lastRunAt?: string;
}

export interface MockUITestExecution {
  id: string;
  testId: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startTime: string;
  endTime?: string;
  duration?: number;
  stepResults: Array<{
    stepIndex: number;
    status: 'pending' | 'running' | 'pass' | 'fail';
    message?: string;
    screenshot?: string;
    timestamp: string;
  }>;
  videoUrl?: string;
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    stepIndex?: number;
  }>;
  error?: string;
}

export const mockUITests: MockUITest[] = [
  {
    id: 'ui-test-001',
    name: 'Customer Login Flow Test',
    csiId: '111111',
    description: 'End-to-end test of the customer login process',
    steps: [
      'Go to "https://online.citi.com"',
      'Click "Sign On"',
      'Wait for the text "User ID" to appear',
      'Type "testuser123" in the "User ID" field',
      'Click "Continue"',
      'Wait for the text "Password" to appear',
      'Check that the URL contains "login"'
    ],
    configuration: {
      browser: 'chrome',
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      waitStrategy: 'networkidle'
    },
    variables: [
      { name: 'USERNAME', type: 'plain', required: true },
      { name: 'PASSWORD', type: 'secret', required: true },
    ],
    status: 'active',
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-01-15T09:00:00Z',
    createdBy: 'bruno.buger@citi.com'
  },
  {
    id: 'ui-test-002',
    name: 'Trade Booking Workflow',
    csiId: '123456',
    description: 'Test the complete trade booking process in the trading interface',
    steps: [
      'Go to "https://trading.internal.citi.com"',
      'Login with credentials',
      'Click "New Trade"',
      'Select "Equity" from dropdown',
      'Type "AAPL" in symbol field',
      'Enter quantity "100"',
      'Select "Market" order type',
      'Click "Submit Trade"',
      'Wait for confirmation message',
      'Check that trade ID is displayed'
    ],
    configuration: {
      browser: 'chrome',
      viewport: { width: 1440, height: 900 },
      timeout: 45000,
      waitStrategy: 'networkidle'
    },
    variables: [
      { name: 'SYMBOL', type: 'plain', required: true },
      { name: 'QUANTITY', type: 'number', required: true },
    ],
    status: 'draft',
    createdAt: '2024-01-14T15:30:00Z',
    updatedAt: '2024-01-14T15:30:00Z',
    createdBy: 'bruno.buger@citi.com'
  }
];

export const mockUITestExecutions: MockUITestExecution[] = [
  {
    id: 'exec-ui-001',
    testId: 'ui-test-001',
    status: 'completed',
    startTime: '2024-01-15T10:30:00Z',
    endTime: '2024-01-15T10:31:15Z',
    duration: 75000,
    stepResults: [
      {
        stepIndex: 0,
        status: 'pass',
        message: 'Successfully navigated to https://online.citi.com',
        timestamp: '2024-01-15T10:30:05Z'
      },
      {
        stepIndex: 1,
        status: 'pass',
        message: 'Clicked "Sign On" button',
        timestamp: '2024-01-15T10:30:12Z'
      },
      {
        stepIndex: 2,
        status: 'pass',
        message: 'Found text "User ID" on page',
        timestamp: '2024-01-15T10:30:18Z'
      },
      {
        stepIndex: 3,
        status: 'pass',
        message: 'Typed "testuser123" in User ID field',
        timestamp: '2024-01-15T10:30:25Z'
      },
      {
        stepIndex: 4,
        status: 'pass',
        message: 'Clicked "Continue" button',
        timestamp: '2024-01-15T10:30:32Z'
      },
      {
        stepIndex: 5,
        status: 'pass',
        message: 'Found text "Password" on page',
        timestamp: '2024-01-15T10:30:45Z'
      },
      {
        stepIndex: 6,
        status: 'pass',
        message: 'URL contains "login" - verification successful',
        timestamp: '2024-01-15T10:30:48Z'
      }
    ],
    videoUrl: '/assets/videos/sample-ui-test.mp4',
    logs: [
      {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'Starting UI test execution: Customer Login Flow Test'
      },
      {
        timestamp: '2024-01-15T10:30:01Z',
        level: 'info',
        message: 'Browser session started (Chrome 120.0.6099.129)'
      },
      {
        timestamp: '2024-01-15T10:30:02Z',
        level: 'info',
        message: 'Viewport set to 1920x1080'
      },
      {
        timestamp: '2024-01-15T10:30:05Z',
        level: 'info',
        message: 'Step 1: Navigating to https://online.citi.com',
        stepIndex: 0
      },
      {
        timestamp: '2024-01-15T10:30:10Z',
        level: 'info',
        message: 'Page loaded successfully (2.1s)',
        stepIndex: 0
      },
      {
        timestamp: '2024-01-15T10:30:12Z',
        level: 'info',
        message: 'Step 2: Looking for "Sign On" button',
        stepIndex: 1
      },
      {
        timestamp: '2024-01-15T10:30:14Z',
        level: 'info',
        message: 'Button found and clicked',
        stepIndex: 1
      },
      {
        timestamp: '2024-01-15T10:30:18Z',
        level: 'info',
        message: 'Step 3: Waiting for "User ID" text',
        stepIndex: 2
      },
      {
        timestamp: '2024-01-15T10:30:20Z',
        level: 'info',
        message: 'Text found on page',
        stepIndex: 2
      },
      {
        timestamp: '2024-01-15T10:30:25Z',
        level: 'info',
        message: 'Step 4: Typing in User ID field',
        stepIndex: 3
      },
      {
        timestamp: '2024-01-15T10:30:32Z',
        level: 'info',
        message: 'Step 5: Clicking Continue button',
        stepIndex: 4
      },
      {
        timestamp: '2024-01-15T10:30:45Z',
        level: 'info',
        message: 'Step 6: Password field appeared',
        stepIndex: 5
      },
      {
        timestamp: '2024-01-15T10:30:48Z',
        level: 'info',
        message: 'Step 7: URL verification successful',
        stepIndex: 6
      },
      {
        timestamp: '2024-01-15T10:31:15Z',
        level: 'info',
        message: 'Test execution completed successfully (75s total)'
      }
    ]
  }
];

// Mock video file paths for testing
export const mockVideoAssets = {
  'sample-ui-test.mp4': '/assets/videos/sample-ui-test.mp4',
  'trade-booking-test.mp4': '/assets/videos/trade-booking-test.mp4'
};
'@
}

# File 102: src/services/mocks/mockData/templatesData.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/mockData/templatesData.ts'
  SizeBytes    = 3420
  Sha256       = '62f400eabd65dfc572a4159a3c94366f87b0eba4fe9e3ac371f4f387e208d5ec'
  Content      = @'
export type TemplateType = 'HTTP' | 'TCP' | 'SPLUNK' | 'GRAFANA' | 'ITRS' | 'APPDYNAMICS' | 'UI_TEST';

export interface CheckTemplate {
  id: string;
  type: TemplateType;
  title: string;
  description: string;
  tags: string[];
  estimatedSetup: 'easy' | 'medium' | 'advanced';
  defaults: Record<string, any>;
}

export const mockCheckTemplates: CheckTemplate[] = [
  {
    id: 'tpl-http-latency-200',
    type: 'HTTP',
    title: 'HTTP Latency & 200 OK',
    description: 'Checks a public endpoint for 200 OK and acceptable latency.',
    tags: ['http', 'latency', 'availability'],
    estimatedSetup: 'easy',
    defaults: {
      endpoint: 'https://api.example.com/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 30,
      retries: 2,
      validateSSL: true,
      followRedirects: true,
      headers: {
        'Accept': 'application/json',
      },
    },
  },
  {
    id: 'tpl-tcp-port-availability',
    type: 'TCP',
    title: 'TCP Port Availability',
    description: 'Validates connectivity to a host:port with a short timeout.',
    tags: ['tcp', 'network'],
    estimatedSetup: 'easy',
    defaults: {
      host: 'db.internal.example',
      port: 5432,
      timeout: 15,
    },
  },
  {
    id: 'tpl-splunk-error-threshold',
    type: 'SPLUNK',
    title: 'Splunk Error Count Threshold',
    description: 'Flags when error events exceed a threshold within a time range.',
    tags: ['splunk', 'logs', 'errors'],
    estimatedSetup: 'medium',
    defaults: {
      splunkQuery: 'search index=prod source="app.log" level=ERROR earliest=-15m | stats count',
      timeRange: '15m',
      expectedCount: 0,
      countOperator: '>',
      splunkIndex: 'prod',
    },
  },
  {
    id: 'tpl-grafana-metric-threshold',
    type: 'GRAFANA',
    title: 'Grafana Metric Threshold',
    description: 'Triggers when a chosen metric crosses a threshold for a duration.',
    tags: ['grafana', 'metrics', 'threshold'],
    estimatedSetup: 'medium',
    defaults: {
      grafanaDashboard: 'api-performance',
      grafanaPanel: 'latency-panel',
      metric: 'avg(http_request_duration_seconds)',
      threshold: 0.5,
      thresholdOperator: '>'
    },
  },
  {
    id: 'tpl-itrs-sampler-ok',
    type: 'ITRS',
    title: 'ITRS Sampler OK',
    description: 'Monitors a specific ITRS sampler path for OK status.',
    tags: ['itrs', 'sampler'],
    estimatedSetup: 'medium',
    defaults: {
      itrsSampler: 'Gateway > Entity > Sampler > Dataview',
      itrsExpectedStatus: 'OK',
    },
  },
  {
    id: 'tpl-appdynamics-health-rule',
    type: 'APPDYNAMICS',
    title: 'AppDynamics Health Rule',
    description: 'Watches an AppDynamics health rule for violations.',
    tags: ['appdynamics', 'apm'],
    estimatedSetup: 'medium',
    defaults: {
      appDynamicsApp: 'customer-portal-prod',
      healthRule: 'response-time-violation',
    },
  },
  {
    id: 'tpl-ui-login-flow',
    type: 'UI_TEST',
    title: 'UI Login Flow',
    description: 'Verifies a simple login flow using Checks Studio.',
    tags: ['ui-test', 'login', 'studio'],
    estimatedSetup: 'advanced',
    defaults: {
      // For UI_TEST we prefill the Studio Test selection if available and suggest variables
      uiTestId: 'ui-test-001',
      uiVariables: {
        USERNAME: { kind: 'plain', value: '' },
        PASSWORD: { kind: 'secret', secretId: '' },
      },
      timeout: 30,
    },
  },
];



'@
}

# File 103: src/services/mocks/server.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/services/mocks/server.ts'
  SizeBytes    = 177
  Sha256       = 'b4da5099e93fca2759eb280fb8b6db90e2631c9a1893c2e46512b6d40139d0b5'
  Content      = @'
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Setup server for Node.js environment (testing)
export const server = setupServer(...handlers);
'@
}

# File 104: src/store/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/store/index.ts'
  SizeBytes    = 3706
  Sha256       = 'fbcaec0530185fd5e4a5494ae3ca9baa9381602e023f5fd00d44a88a8c143888'
  Content      = @'
import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import checksSlice from './slices/checksSlice';
import csiSlice from './slices/csiSlice';
import studioSlice from './slices/studioSlice';
import reportsSlice from './slices/reportsSlice';
import uiSlice from './slices/uiSlice';
import dashboardSlice from './slices/dashboardSlice';

export const store = configureStore({
  reducer: {
    checks: checksSlice,
    csi: csiSlice,
    studio: studioSlice,
    reports: reportsSlice,
    ui: uiSlice,
    dashboard: dashboardSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for serialization checks
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        // Ignore these field paths in all actions
        ignoredActionsPaths: ['meta.arg', 'payload.timestamp'],
        // Ignore these paths in the state
        ignoredPaths: ['items.dates'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks for use throughout the application
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Lightweight persistence for dashboard preferences (Phase 3 groundwork)
const PERSIST_VERSION = 'v1';
const PINNED_KEY = `checks.pinnedCsiIds.${PERSIST_VERSION}`;
const SEARCH_CTX_KEY = `checks.searchContext.${PERSIST_VERSION}`;

async function hydrateDashboardPreferences() {
  try {
    const pinnedRaw = window.localStorage.getItem(PINNED_KEY);
    if (pinnedRaw) {
      const pinned = JSON.parse(pinnedRaw);
      if (Array.isArray(pinned)) {
        store.dispatch({ type: 'dashboard/setPinnedCsiIds', payload: pinned });
      }
    } else {
      // Seed smart defaults from mock users (Priya) when available
      try {
        const mod = await import('../services/mocks/mockData/csiData');
        const priya = (mod as any).mockUsers?.find((u: any) => u.email === 'bruno.buger@citi.com');
        if (priya?.permissions && Array.isArray(priya.permissions)) {
          store.dispatch({ type: 'dashboard/setPinnedCsiIds', payload: priya.permissions.slice(0, 4) });
        }
      } catch {
        // ignore if mock data not available in host mode
      }
    }

    const ctxRaw = window.localStorage.getItem(SEARCH_CTX_KEY);
    if (ctxRaw) {
      const ctx = JSON.parse(ctxRaw);
      if (ctx && typeof ctx === 'object' && ('csiId' in ctx)) {
        store.dispatch({ type: 'dashboard/setSearchContext', payload: { csiId: ctx.csiId } });
        // Set filters separately to respect reducer constraints
        store.dispatch({ type: 'dashboard/setSearchFilters', payload: { environment: ctx.environment ?? null, tags: ctx.tags ?? [], tagMode: ctx.tagMode ?? 'AND' } });
      }
    }
  } catch {
    // no-op
  }
}

function persistDashboardPreferences(state: RootState) {
  try {
    const pinned = state.dashboard.pinnedCsiIds;
    window.localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
    const ctx = state.dashboard.searchContext;
    window.localStorage.setItem(SEARCH_CTX_KEY, JSON.stringify(ctx));
  } catch {
    // no-op
  }
}

// Hydrate immediately in browser
if (typeof window !== 'undefined') {
  hydrateDashboardPreferences();
  let last = store.getState().dashboard;
  store.subscribe(() => {
    const current = store.getState().dashboard;
    if (current !== last) {
      last = current;
      persistDashboardPreferences(store.getState());
    }
  });
}
'@
}

# File 105: src/store/slices/checksSlice.test.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/store/slices/checksSlice.test.ts'
  SizeBytes    = 820
  Sha256       = '3cfa2e6234cd9c82a520b4c0680ae69603f04c2678ff57f100703d998f63fe4f'
  Content      = @'
import { describe, it, expect, vi, beforeEach } from 'vitest';
import checksReducer, { fetchChecks } from './checksSlice';

describe('checksSlice', () => {
  it('should return initial state', () => {
    const state = checksReducer(undefined as any, { type: '@@INIT' } as any);
    expect(state.loading).toBe('idle');
    expect(Array.isArray(state.data)).toBe(true);
  });

  it('should handle fetchChecks.pending and fulfilled', () => {
    const pending = checksReducer(undefined as any, fetchChecks.pending('', {} as any));
    expect(pending.loading).toBe('loading');
    const payload = { data: [], total: 0 } as any;
    const fulfilled = checksReducer(pending, fetchChecks.fulfilled(payload, '', {} as any));
    expect(fulfilled.loading).toBe('succeeded');
    expect(fulfilled.totalCount).toBe(0);
  });
});



'@
}

# File 106: src/store/slices/checksSlice.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/store/slices/checksSlice.ts'
  SizeBytes    = 11179
  Sha256       = 'c516922e5ef52cafda785b75e26d1cc7c0c621f59e93e54279efa2e2ec8fd063'
  Content      = @'
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { CheckEntity, CreateCheckRequest, CheckFilters, ExecutionResult } from '../../types/checks/checkTypes';
import { AsyncState } from '../../types/common/commonTypes';
import { checksApi } from '@services/api/checksApi';

interface ChecksState extends AsyncState<CheckEntity[]> {
  selectedCheck: CheckEntity | null;
  filters: CheckFilters;
  totalCount: number;
  currentPage: number;
  executionResults: Record<string, ExecutionResult>;
  executingChecks: string[];
  upcomingExecutions: Array<{ checkId: string; checkName: string; nextExecution: string; csiName: string }>;
  schedulingChecks: string[];
}

const initialState: ChecksState = {
  data: [],
  loading: 'idle',
  error: null,
  lastFetched: null,
  selectedCheck: null,
  filters: {
    csiId: null,
    status: null,
    type: null,
    searchQuery: '',
    tags: [],
  },
  totalCount: 0,
  currentPage: 1,
  executionResults: {},
  executingChecks: [],
  upcomingExecutions: [],
  schedulingChecks: [],
};

// Async thunks
export const fetchChecks = createAsyncThunk(
  'checks/fetchChecks',
  async (params: { page?: number; limit?: number; filters?: Partial<CheckFilters> }) => {
    const response = await checksApi.getChecks(params);
    return response;
  }
);

export const fetchCheckById = createAsyncThunk(
  'checks/fetchCheckById',
  async (id: string) => {
    const response = await checksApi.getCheckById(id);
    return response;
  }
);

export const createCheck = createAsyncThunk(
  'checks/createCheck',
  async (checkData: CreateCheckRequest) => {
    const response = await checksApi.createCheck(checkData);
    return response;
  }
);

export const executeCheck = createAsyncThunk(
  'checks/executeCheck',
  async (id: string) => {
    const response = await checksApi.executeCheck(id);
    return { checkId: id, result: response };
  }
);

export const deleteCheck = createAsyncThunk(
  'checks/deleteCheck',
  async (id: string) => {
    await checksApi.deleteCheck(id);
    return id;
  }
);

export const updateCheckSchedule = createAsyncThunk(
  'checks/updateCheckSchedule',
  async ({ id, schedule }: { id: string; schedule: { enabled: boolean; frequency?: string; cron?: string } }) => {
    const response = await checksApi.updateCheckSchedule(id, schedule);
    return response;
  }
);

export const pauseCheck = createAsyncThunk(
  'checks/pauseCheck',
  async (id: string) => {
    const response = await checksApi.pauseCheck(id);
    return response;
  }
);

export const resumeCheck = createAsyncThunk(
  'checks/resumeCheck',
  async (id: string) => {
    const response = await checksApi.resumeCheck(id);
    return response;
  }
);

export const fetchUpcomingExecutions = createAsyncThunk(
  'checks/fetchUpcomingExecutions',
  async (limit: number = 20) => {
    const response = await checksApi.getUpcomingExecutions(limit);
    return response;
  }
);

const checksSlice = createSlice({
  name: 'checks',
  initialState,
  reducers: {
    setSelectedCheck: (state, action: PayloadAction<CheckEntity | null>) => {
      state.selectedCheck = action.payload;
    },
    
    updateFilters: (state, action: PayloadAction<Partial<CheckFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
      state.currentPage = 1; // Reset to first page when filters change
    },
    
    clearFilters: (state) => {
      state.filters = initialState.filters;
      state.currentPage = 1;
    },
    
    clearError: (state) => {
      state.error = null;
    },
    
    setCurrentPage: (state, action: PayloadAction<number>) => {
      state.currentPage = action.payload;
    },
    
    updateCheckStatus: (state, action: PayloadAction<{ id: string; status: any }>) => {
      const check = state.data.find(c => c.id === action.payload.id);
      if (check) {
        check.status = action.payload.status;
        check.lastExecution = new Date().toISOString();
      }
    },
    
    clearExecutionResults: (state) => {
      state.executionResults = {};
    },
  },
  
  extraReducers: (builder) => {
    builder
      // fetchChecks
      .addCase(fetchChecks.pending, (state) => {
        state.loading = 'loading';
        state.error = null;
      })
      .addCase(fetchChecks.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.data = action.payload.data;
        state.totalCount = action.payload.total || 0;
        state.lastFetched = new Date().toISOString();
      })
      .addCase(fetchChecks.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to fetch checks';
      })
      
      // fetchCheckById
      .addCase(fetchCheckById.pending, (state) => {
        state.loading = 'loading';
      })
      .addCase(fetchCheckById.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.selectedCheck = action.payload;
        const idx = state.data.findIndex(c => c.id === action.payload.id);
        if (idx === -1) {
          state.data.push(action.payload);
        } else {
          state.data[idx] = action.payload;
        }
      })
      .addCase(fetchCheckById.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to fetch check';
      })
      
      // createCheck
      .addCase(createCheck.pending, (state) => {
        state.loading = 'loading';
        state.error = null;
      })
      .addCase(createCheck.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.data.push(action.payload);
        state.totalCount += 1;
      })
      .addCase(createCheck.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to create check';
      })
      
      // executeCheck
      .addCase(executeCheck.pending, (state, action) => {
        const checkId = action.meta.arg;
        if (!state.executingChecks.includes(checkId)) {
          state.executingChecks.push(checkId);
        }
      })
      .addCase(executeCheck.fulfilled, (state, action) => {
        const { checkId, result } = action.payload;
        state.executingChecks = state.executingChecks.filter(id => id !== checkId);
        state.executionResults[checkId] = result;
        
        // Update check status based on execution result
        const check = state.data.find(c => c.id === checkId);
        if (check) {
          check.status = result.status === 'SUCCESS' ? 'PASSING' : 
                        result.status === 'WARNING' ? 'WARNING' : 'FAILING';
          check.lastExecution = result.endTime;
        }
      })
      .addCase(executeCheck.rejected, (state, action) => {
        const checkId = action.meta.arg;
        state.executingChecks = state.executingChecks.filter(id => id !== checkId);
        state.error = action.error.message || 'Failed to execute check';
      })
      
      // deleteCheck
      .addCase(deleteCheck.pending, (state) => {
        state.loading = 'loading';
      })
      .addCase(deleteCheck.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.data = state.data.filter(check => check.id !== action.payload);
        state.totalCount -= 1;
        
        // Clear selected check if it was deleted
        if (state.selectedCheck?.id === action.payload) {
          state.selectedCheck = null;
        }
      })
      .addCase(deleteCheck.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to delete check';
      })
      
      // updateCheckSchedule
      .addCase(updateCheckSchedule.pending, (state, action) => {
        const checkId = action.meta.arg.id;
        if (!state.schedulingChecks.includes(checkId)) {
          state.schedulingChecks.push(checkId);
        }
      })
      .addCase(updateCheckSchedule.fulfilled, (state, action) => {
        const updatedCheck = action.payload;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== updatedCheck.id);
        
        // Update check in data array
        const checkIndex = state.data.findIndex(c => c.id === updatedCheck.id);
        if (checkIndex !== -1) {
          state.data[checkIndex] = updatedCheck;
        }
        
        // Update selected check if it's the same
        if (state.selectedCheck?.id === updatedCheck.id) {
          state.selectedCheck = updatedCheck;
        }
      })
      .addCase(updateCheckSchedule.rejected, (state, action) => {
        const checkId = action.meta.arg.id;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== checkId);
        state.error = action.error.message || 'Failed to update schedule';
      })
      
      // pauseCheck
      .addCase(pauseCheck.pending, (state, action) => {
        const checkId = action.meta.arg;
        if (!state.schedulingChecks.includes(checkId)) {
          state.schedulingChecks.push(checkId);
        }
      })
      .addCase(pauseCheck.fulfilled, (state, action) => {
        const updatedCheck = action.payload;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== updatedCheck.id);
        
        const checkIndex = state.data.findIndex(c => c.id === updatedCheck.id);
        if (checkIndex !== -1) {
          state.data[checkIndex] = updatedCheck;
        }
      })
      .addCase(pauseCheck.rejected, (state, action) => {
        const checkId = action.meta.arg;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== checkId);
        state.error = action.error.message || 'Failed to pause check';
      })
      
      // resumeCheck
      .addCase(resumeCheck.pending, (state, action) => {
        const checkId = action.meta.arg;
        if (!state.schedulingChecks.includes(checkId)) {
          state.schedulingChecks.push(checkId);
        }
      })
      .addCase(resumeCheck.fulfilled, (state, action) => {
        const updatedCheck = action.payload;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== updatedCheck.id);
        
        const checkIndex = state.data.findIndex(c => c.id === updatedCheck.id);
        if (checkIndex !== -1) {
          state.data[checkIndex] = updatedCheck;
        }
      })
      .addCase(resumeCheck.rejected, (state, action) => {
        const checkId = action.meta.arg;
        state.schedulingChecks = state.schedulingChecks.filter(id => id !== checkId);
        state.error = action.error.message || 'Failed to resume check';
      })
      
      // fetchUpcomingExecutions
      .addCase(fetchUpcomingExecutions.fulfilled, (state, action) => {
        state.upcomingExecutions = action.payload.data;
      })
      .addCase(fetchUpcomingExecutions.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch upcoming executions';
      });
  },
});

export const {
  setSelectedCheck,
  updateFilters,
  clearFilters,
  clearError,
  setCurrentPage,
  updateCheckStatus,
  clearExecutionResults,
} = checksSlice.actions;

export default checksSlice.reducer;
'@
}

# File 107: src/store/slices/csiSlice.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/store/slices/csiSlice.ts'
  SizeBytes    = 7606
  Sha256       = '29eb520f422bd9178a98e0473112ed52d752514ff3e27b0c2b47aa3ed05e98c2'
  Content      = @'
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { CSI, CSIMetrics, CSIHealthSummary, CSIFilters } from '../../types/csi/csiTypes';
import { AsyncState } from '../../types/common/commonTypes';

import { csiApi } from '@/services/api/csiApi';

interface TagState {
  selected: string[];
  available: string[];
  loading: boolean;
  error: string | null;
  filterMode: 'AND' | 'OR';
}

interface CSIState extends AsyncState<CSI[]> {
  selectedCSI: string | null; // CSI ID
  metrics: Record<string, CSIMetrics>;
  healthSummaries: CSIHealthSummary[];
  filters: CSIFilters;
  tags: TagState;
  metricsLoading: boolean;
  metricsError: string | null;
  lastMetricsUpdate: string | null;
}

const initialState: CSIState = {
  data: [],
  loading: 'idle',
  error: null,
  lastFetched: null,
  selectedCSI: null,
  metrics: {},
  healthSummaries: [],
  filters: {
    searchQuery: ''
  },
  tags: {
    selected: [],
    available: [],
    loading: false,
    error: null,
    filterMode: 'AND'
  },
  metricsLoading: false,
  metricsError: null,
  lastMetricsUpdate: null
};

// Async thunks for CSI operations
export const fetchCSIs = createAsyncThunk(
  'csi/fetchCSIs',
  async (filters?: CSIFilters) => {
    const params: any = {
      search: filters?.searchQuery,
      businessUnit: filters?.businessUnit,
      environment: filters?.environment,
      status: filters?.status,
    };
    return await csiApi.listCsis(params);
  }
);

export const fetchCSIMetrics = createAsyncThunk(
  'csi/fetchCSIMetrics',
  async (csiIds?: string[]) => {
    // For prototype, re-use `/csi/:id/health` to compose metrics as needed.
    // If ids provided, fetch each; else return empty (not essential for Home).
    const ids = csiIds || [];
    const results: Record<string, CSIMetrics> = {} as any;
    await Promise.all(
      ids.map(async (id) => {
        try {
          const health = await csiApi.getCsiHealth(id);
          results[id] = {
            csiId: id,
            totalChecks: health.totalChecks,
            passingChecks: health.passingChecks,
            failingChecks: health.failingChecks,
            warningChecks: health.warningChecks,
            overallHealth: 0,
            lastUpdated: new Date().toISOString(),
            criticalAlertsCount: 0,
            avgResponseTime: 0,
            uptime: 0,
            totalExecutions: 0,
            successRate: 0,
          };
        } catch {}
      })
    );
    return { data: results, lastUpdated: new Date().toISOString() };
  }
);

export const fetchCSIHealthSummaries = createAsyncThunk(
  'csi/fetchCSIHealthSummaries',
  async () => {
    // Not essential for Home; keep stub empty
    return { data: [], timestamp: new Date().toISOString() } as any;
  }
);

export const fetchCSIById = createAsyncThunk(
  'csi/fetchCSIById',
  async (csiId: string) => {
    return await csiApi.getCsiById(csiId);
  }
);

// New async thunk for fetching tags
export const fetchTags = createAsyncThunk(
  'csi/fetchTags',
  async (params?: { csiId?: string }) => {
    // Use checks MSW to derive tags in handlers in future. For now keep local derivation via checks dataset only.
    const { mockChecks } = await import('../../services/mocks/mockData/checksData');
    const all = new Set<string>();
    const src = params?.csiId ? mockChecks.filter((c) => c.csiId === params.csiId) : mockChecks;
    src.forEach((c) => c.tags.forEach((t) => all.add(t)));
    return Array.from(all).sort();
  }
);

const csiSlice = createSlice({
  name: 'csi',
  initialState,
  reducers: {
    setSelectedCSI: (state, action: PayloadAction<string | null>) => {
      state.selectedCSI = action.payload;
      // Clear selected tags when CSI changes
      if (state.selectedCSI !== action.payload) {
        state.tags.selected = [];
      }
    },
    
    setSelectedTags: (state, action: PayloadAction<string[]>) => {
      state.tags.selected = action.payload;
    },
    
    setTagFilterMode: (state, action: PayloadAction<'AND' | 'OR'>) => {
      state.tags.filterMode = action.payload;
    },
    
    updateFilters: (state, action: PayloadAction<Partial<CSIFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    
    clearFilters: (state) => {
      state.filters = initialState.filters;
      state.selectedCSI = null;
      state.tags.selected = [];
    },
    
    clearTagFilters: (state) => {
      state.tags.selected = [];
    },
    
    clearError: (state) => {
      state.error = null;
      state.metricsError = null;
      state.tags.error = null;
    },
    
    updateCSIMetrics: (state, action: PayloadAction<{ csiId: string; metrics: Partial<CSIMetrics> }>) => {
      const { csiId, metrics } = action.payload;
      if (state.metrics[csiId]) {
        state.metrics[csiId] = { ...state.metrics[csiId], ...metrics };
      }
    },
    
    refreshMetrics: (state) => {
      state.lastMetricsUpdate = new Date().toISOString();
    }
  },
  
  extraReducers: (builder) => {
    builder
      // fetchCSIs
      .addCase(fetchCSIs.pending, (state) => {
        state.loading = 'loading';
        state.error = null;
      })
      .addCase(fetchCSIs.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.data = action.payload.data;
        state.lastFetched = new Date().toISOString();
        
        // Auto-select first CSI if none selected and force selection is enabled
        if (!state.selectedCSI && action.payload.data.length > 0) {
          state.selectedCSI = action.payload.data[0].id;
        }
      })
      .addCase(fetchCSIs.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to fetch CSIs';
      })
      
      // fetchCSIMetrics
      .addCase(fetchCSIMetrics.pending, (state) => {
        state.metricsLoading = true;
        state.metricsError = null;
      })
      .addCase(fetchCSIMetrics.fulfilled, (state, action) => {
        state.metricsLoading = false;
        state.metrics = { ...state.metrics, ...action.payload.data };
        state.lastMetricsUpdate = action.payload.lastUpdated;
      })
      .addCase(fetchCSIMetrics.rejected, (state, action) => {
        state.metricsLoading = false;
        state.metricsError = action.error.message || 'Failed to fetch CSI metrics';
      })
      
      // fetchCSIHealthSummaries
      .addCase(fetchCSIHealthSummaries.fulfilled, (state, action) => {
        state.healthSummaries = action.payload.data;
      })
      
      // fetchCSIById
      .addCase(fetchCSIById.fulfilled, (state, action) => {
        const existingIndex = state.data.findIndex(csi => csi.id === action.payload.id);
        if (existingIndex >= 0) {
          state.data[existingIndex] = action.payload;
        } else {
          state.data.push(action.payload);
        }
      })
      
      // fetchTags
      .addCase(fetchTags.pending, (state) => {
        state.tags.loading = true;
        state.tags.error = null;
      })
      .addCase(fetchTags.fulfilled, (state, action) => {
        state.tags.loading = false;
        state.tags.available = action.payload;
      })
      .addCase(fetchTags.rejected, (state, action) => {
        state.tags.loading = false;
        state.tags.error = action.error.message || 'Failed to fetch tags';
      });
  },
});

export const {
  setSelectedCSI,
  setSelectedTags,
  setTagFilterMode,
  updateFilters,
  clearFilters,
  clearTagFilters,
  clearError,
  updateCSIMetrics,
  refreshMetrics
} = csiSlice.actions;

export default csiSlice.reducer;
'@
}

# File 108: src/store/slices/dashboardSlice.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/store/slices/dashboardSlice.ts'
  SizeBytes    = 10050
  Sha256       = '4bc09b5c6f2c07c9a0a276ee31c713b5fdbe29c4b34fd6941175098f421e442f'
  Content      = @'
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AsyncState } from '@/types/common/commonTypes';
import type {
  DashboardSummary,
  AttentionItem,
  ActivityItem,
  ReportSnapshotItem,
  SearchResultItem,
} from '@/types/dashboard/dashboardTypes';
import { dashboardApi } from '@/services/api/dashboardApi';

interface DashboardState {
  summary: AsyncState<DashboardSummary | null>;
  attention: AsyncState<AttentionItem[]>;
  activity: AsyncState<ActivityItem[]>;
  upcoming: AsyncState<any[]>;
  reports: AsyncState<ReportSnapshotItem[]>;
  search: AsyncState<SearchResultItem[]>;
  pinnedCsiIds: string[];
  searchContext: {
    csiId: string | null;
    environment: string | null;
    tags: string[];
    tagMode: 'AND' | 'OR';
  };
}

const createAsyncState = <T,>(data: T): AsyncState<T> => ({
  data,
  loading: 'idle',
  error: null,
  lastFetched: null,
});

const initialState: DashboardState = {
  summary: createAsyncState<DashboardSummary | null>(null),
  attention: createAsyncState<AttentionItem[]>([]),
  activity: createAsyncState<ActivityItem[]>([]),
  upcoming: createAsyncState<any[]>([]),
  reports: createAsyncState<ReportSnapshotItem[]>([]),
  search: createAsyncState<SearchResultItem[]>([]),
  pinnedCsiIds: [],
  searchContext: { csiId: null, environment: null, tags: [], tagMode: 'AND' },
};

export const fetchDashboardSummary = createAsyncThunk(
  'dashboard/fetchSummary',
  async (_, { getState }) => {
    const state = getState() as any;
    const csiId = state.dashboard.searchContext.csiId;
    return await dashboardApi.getDashboardSummary({ csiId });
  }
);

export const fetchAttention = createAsyncThunk(
  'dashboard/fetchAttention',
  async (params: { limit?: number; csiId?: string | null } | undefined, { getState }) => {
    const state = getState() as any;
    const csiId = params?.csiId ?? state.dashboard.searchContext.csiId;
    return await dashboardApi.getAttention({ ...params, csiId });
  }
);

export const fetchActivity = createAsyncThunk(
  'dashboard/fetchActivity',
  async (params: { scope?: 'ALL' | 'MINE'; hours?: number; csiId?: string | null } | undefined, { getState }) => {
    const state = getState() as any;
    const csiId = params?.csiId ?? state.dashboard.searchContext.csiId;
    return await dashboardApi.getActivity({ ...params, csiId });
  }
);

export const fetchUpcomingSchedules = createAsyncThunk(
  'dashboard/fetchUpcomingSchedules',
  async (params: { limit?: number; csiId?: string | null } | undefined, { getState }) => {
    const state = getState() as any;
    const csiId = params?.csiId ?? state.dashboard.searchContext.csiId;
    return await dashboardApi.getUpcomingSchedules({ ...params, csiId });
  }
);

export const fetchReportsSnapshot = createAsyncThunk(
  'dashboard/fetchReportsSnapshot',
  async (params: { limit?: number; csiId?: string | null } | undefined, { getState }) => {
    const state = getState() as any;
    const csiId = params?.csiId ?? state.dashboard.searchContext.csiId;
    return await dashboardApi.getReportsSnapshot({ ...params, csiId });
  }
);

export const searchAll = createAsyncThunk(
  'dashboard/searchAll',
  async (
    args: { query: string; context?: { csiId?: string | null } }
  ) => {
    return await dashboardApi.searchAll(args.query, args.context);
  }
);

export const acknowledgeCheck = createAsyncThunk(
  'dashboard/acknowledgeCheck',
  async (id: string) => {
    return await dashboardApi.acknowledgeCheck(id);
  }
);

export const assignCheck = createAsyncThunk(
  'dashboard/assignCheck',
  async ({ id, userId }: { id: string; userId: string }) => {
    return await dashboardApi.assignCheck(id, userId);
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setPinnedCsiIds: (state, action: PayloadAction<string[]>) => {
      state.pinnedCsiIds = action.payload;
    },
    pinCsi: (state, action: PayloadAction<string>) => {
      if (!state.pinnedCsiIds.includes(action.payload)) {
        state.pinnedCsiIds.push(action.payload);
      }
    },
    unpinCsi: (state, action: PayloadAction<string>) => {
      state.pinnedCsiIds = state.pinnedCsiIds.filter((id) => id !== action.payload);
    },
    optimisticallyRemoveAttentionItem: (state, action: PayloadAction<string>) => {
      state.attention.data = state.attention.data.filter((i) => i.id !== action.payload);
    },
    restoreAttentionItem: (state, action: PayloadAction<AttentionItem>) => {
      const exists = state.attention.data.some((i) => i.id === action.payload.id);
      if (!exists) {
        state.attention.data.unshift(action.payload);
      }
    },
    setSearchContext: (
      state,
      action: PayloadAction<{ csiId: string | null }>
    ) => {
      state.searchContext = {
        csiId: action.payload.csiId,
        environment: null,
        tags: [],
        tagMode: 'AND',
      };
    },
    clearSearchContext: (state) => {
      state.searchContext = { csiId: null, environment: null, tags: [], tagMode: 'AND' };
    },
    setSearchFilters: (
      state,
      action: PayloadAction<{
        environment?: string | null;
        tags?: string[];
        tagMode?: 'AND' | 'OR';
      }>
    ) => {
      state.searchContext.environment =
        action.payload.environment === undefined ? state.searchContext.environment : (action.payload.environment || null);
      state.searchContext.tags = action.payload.tags !== undefined ? action.payload.tags : state.searchContext.tags;
      state.searchContext.tagMode = action.payload.tagMode || state.searchContext.tagMode;
    },
    clearSearchFilters: (state) => {
      state.searchContext.environment = null;
      state.searchContext.tags = [];
      state.searchContext.tagMode = 'AND';
    },
  },
  extraReducers: (builder) => {
    builder
      // summary
      .addCase(fetchDashboardSummary.pending, (state) => {
        state.summary.loading = 'loading';
        state.summary.error = null;
      })
      .addCase(fetchDashboardSummary.fulfilled, (state, action) => {
        state.summary.loading = 'succeeded';
        state.summary.data = action.payload;
        state.summary.lastFetched = new Date().toISOString();
      })
      .addCase(fetchDashboardSummary.rejected, (state, action) => {
        state.summary.loading = 'failed';
        state.summary.error = action.error.message || 'Failed to load summary';
      })
      // attention
      .addCase(fetchAttention.pending, (state) => {
        state.attention.loading = 'loading';
        state.attention.error = null;
      })
      .addCase(fetchAttention.fulfilled, (state, action) => {
        state.attention.loading = 'succeeded';
        state.attention.data = action.payload.data;
        state.attention.lastFetched = new Date().toISOString();
      })
      .addCase(fetchAttention.rejected, (state, action) => {
        state.attention.loading = 'failed';
        state.attention.error = action.error.message || 'Failed to load attention items';
      })
      // activity
      .addCase(fetchActivity.pending, (state) => {
        state.activity.loading = 'loading';
        state.activity.error = null;
      })
      .addCase(fetchActivity.fulfilled, (state, action) => {
        state.activity.loading = 'succeeded';
        state.activity.data = action.payload.data;
        state.activity.lastFetched = new Date().toISOString();
      })
      .addCase(fetchActivity.rejected, (state, action) => {
        state.activity.loading = 'failed';
        state.activity.error = action.error.message || 'Failed to load activity';
      })
      // upcoming
      .addCase(fetchUpcomingSchedules.pending, (state) => {
        state.upcoming.loading = 'loading';
        state.upcoming.error = null;
      })
      .addCase(fetchUpcomingSchedules.fulfilled, (state, action) => {
        state.upcoming.loading = 'succeeded';
        state.upcoming.data = action.payload.data;
        state.upcoming.lastFetched = new Date().toISOString();
      })
      .addCase(fetchUpcomingSchedules.rejected, (state, action) => {
        state.upcoming.loading = 'failed';
        state.upcoming.error = action.error.message || 'Failed to load upcoming schedules';
      })
      // reports
      .addCase(fetchReportsSnapshot.pending, (state) => {
        state.reports.loading = 'loading';
        state.reports.error = null;
      })
      .addCase(fetchReportsSnapshot.fulfilled, (state, action) => {
        state.reports.loading = 'succeeded';
        state.reports.data = action.payload.data;
        state.reports.lastFetched = new Date().toISOString();
      })
      .addCase(fetchReportsSnapshot.rejected, (state, action) => {
        state.reports.loading = 'failed';
        state.reports.error = action.error.message || 'Failed to load reports snapshot';
      })
      // search
      .addCase(searchAll.pending, (state) => {
        state.search.loading = 'loading';
        state.search.error = null;
      })
      .addCase(searchAll.fulfilled, (state, action) => {
        state.search.loading = 'succeeded';
        state.search.data = action.payload.data;
        state.search.lastFetched = new Date().toISOString();
      })
      .addCase(searchAll.rejected, (state, action) => {
        state.search.loading = 'failed';
        state.search.error = action.error.message || 'Search failed';
      })
      // acknowledge/assign optimistic updates
      .addCase(acknowledgeCheck.fulfilled, (state, action) => {
        // remove item from attention if acknowledged; mock returns id
        const id = action.meta.arg;
        state.attention.data = state.attention.data.filter((i) => i.id !== id);
      })
      .addCase(assignCheck.fulfilled, (state) => {
        // no-op for now; UI may show toast
      });
  },
});

export const { setPinnedCsiIds, pinCsi, unpinCsi, optimisticallyRemoveAttentionItem, restoreAttentionItem, setSearchContext, clearSearchContext, setSearchFilters, clearSearchFilters } = dashboardSlice.actions;
export default dashboardSlice.reducer;


'@
}

# File 109: src/store/slices/reportsSlice.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/store/slices/reportsSlice.ts'
  SizeBytes    = 10292
  Sha256       = 'b2b7a298cf5801d1e3196079b49ecfc76bb6e177aa252aa4ff8877f6df3f2f4e'
  Content      = @'
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AsyncState } from '../../types/common/commonTypes';
import type { ReportEntity, ReportConfiguration, ReportPreviewResponse, ReportSection, ReportExecution } from '@/types/reports/reportTypes';
import { reportsApi } from '@/services/api/reportsApi';

interface ReportsState extends AsyncState<ReportEntity[]> {
  currentReport: ReportConfiguration;
  previewContent: string | null;
  generatingPreview: boolean;
  executionsByReportId?: Record<string, any[]>;
  errorsById?: Record<string, number | string>;
}

const initialState: ReportsState = {
  data: [],
  loading: 'idle',
  error: null,
  lastFetched: null,
  currentReport: {
    name: '',
    description: '',
    selectedChecks: [],
    sections: [],
    schedule: {
      frequency: 'daily',
      time: '09:00',
      timezone: 'EST',
      enabled: true,
    },
    recipients: [],
    template: 'standard',
  },
  previewContent: null,
  generatingPreview: false,
  executionsByReportId: {},
  errorsById: {},
};

// Async thunks
export const fetchReports = createAsyncThunk(
  'reports/fetchReports',
  async (params: { status?: string; page?: number; limit?: number } | undefined) => {
    const resp = await reportsApi.listReports(params);
    return resp;
  }
);

export const createReport = createAsyncThunk(
  'reports/createReport',
  async (payload: import('@/services/api/reportsApi').CreateReportPayload) => {
    const created = await reportsApi.createReport(payload);
    return created;
  }
);

export const updateReport = createAsyncThunk(
  'reports/updateReport',
  async ({ id, payload }: { id: string; payload: Partial<import('@/services/api/reportsApi').CreateReportPayload> }) => {
    const updated = await reportsApi.updateReport(id, payload);
    return updated;
  }
);

export const generatePreview = createAsyncThunk(
  'reports/generatePreview',
  async (id: string) => {
    const resp: ReportPreviewResponse = await reportsApi.previewReport(id);
    // Expose HTML for iframe rendering without changing state shape
    try {
      (window as any).__REPORT_HTML_PREVIEW__ = resp?.html;
    } catch {}
    return resp;
  }
);

export const fetchReportById = createAsyncThunk(
  'reports/fetchReportById',
  async (id: string, { rejectWithValue }) => {
    try {
      const resp = await reportsApi.getById(id);
      return resp;
    } catch (e: any) {
      const status = e?.response?.status ?? 'error';
      return rejectWithValue({ id, status });
    }
  }
);

export const fetchReportExecutions = createAsyncThunk(
  'reports/fetchReportExecutions',
  async (id: string) => {
    const resp = await reportsApi.getExecutions(id);
    return { id, executions: resp.data } as { id: string; executions: any[] };
  }
);

export const pauseReport = createAsyncThunk(
  'reports/pauseReport',
  async (id: string) => {
    const updated = await reportsApi.pauseReport(id);
    return updated;
  }
);

export const resumeReport = createAsyncThunk(
  'reports/resumeReport',
  async (id: string) => {
    const updated = await reportsApi.resumeReport(id);
    return updated;
  }
);

export const duplicateReport = createAsyncThunk(
  'reports/duplicateReport',
  async (id: string) => {
    const copy = await reportsApi.duplicateReport(id);
    return copy;
  }
);

export const sendTestReport = createAsyncThunk(
  'reports/sendTestReport',
  async ({ id, to }: { id: string; to?: string }) => {
    const res = await reportsApi.sendTest(id, to);
    return { id, ...res } as { id: string; ok: boolean; sentAt: string };
  }
);

export const deleteReportThunk = createAsyncThunk(
  'reports/deleteReport',
  async (id: string) => {
    await reportsApi.deleteReport(id);
    return id;
  }
);

export const runReportNow = createAsyncThunk(
  'reports/runNow',
  async (id: string) => {
    const res = await reportsApi.runNow(id);
    return res as { ok: boolean; execution: ReportExecution; report: ReportEntity };
  }
);

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    // Optimistic toggles for pause/resume from UI listings
    toggleReportStatusOptimistic: (state, action: PayloadAction<{ id: string; status: 'active' | 'paused' }>) => {
      const idx = state.data.findIndex((r) => r.id === action.payload.id);
      if (idx !== -1) {
        state.data[idx] = { ...state.data[idx], status: action.payload.status } as any;
      }
    },
    updateCurrentReport: (state, action: PayloadAction<Partial<ReportConfiguration>>) => {
      state.currentReport = { ...state.currentReport, ...action.payload };
    },
    
    resetCurrentReport: (state) => {
      state.currentReport = initialState.currentReport;
    },
    
    setPreviewContent: (state, action: PayloadAction<string | null>) => {
      state.previewContent = action.payload;
    },
    
    setGeneratingPreview: (state, action: PayloadAction<boolean>) => {
      state.generatingPreview = action.payload;
    },
    
    addCheckToReport: (state, action: PayloadAction<string>) => {
      if (!state.currentReport.selectedChecks.includes(action.payload)) {
        state.currentReport.selectedChecks.push(action.payload);
      }
    },
    
    removeCheckFromReport: (state, action: PayloadAction<string>) => {
      state.currentReport.selectedChecks = state.currentReport.selectedChecks.filter(
        id => id !== action.payload
      );
    },
    addSection: (state, action: PayloadAction<ReportSection>) => {
      const sections = state.currentReport.sections || [];
      state.currentReport.sections = [...sections, action.payload];
    },
    updateSection: (state, action: PayloadAction<ReportSection>) => {
      const sections = state.currentReport.sections || [];
      state.currentReport.sections = sections.map((s) => (s.id === action.payload.id ? action.payload : s));
    },
    removeSection: (state, action: PayloadAction<string>) => {
      const sections = state.currentReport.sections || [];
      state.currentReport.sections = sections.filter((s) => s.id !== action.payload);
    },
    reorderSections: (state, action: PayloadAction<{ from: number; to: number }>) => {
      const sections = state.currentReport.sections || [];
      const updated = [...sections];
      const [moved] = updated.splice(action.payload.from, 1);
      updated.splice(action.payload.to, 0, moved);
      state.currentReport.sections = updated;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReports.pending, (state) => {
        state.loading = 'loading';
        state.error = null;
      })
      .addCase(fetchReports.fulfilled, (state, action) => {
        state.loading = 'succeeded';
        state.data = action.payload.data;
        state.lastFetched = new Date().toISOString();
      })
      .addCase(fetchReports.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message || 'Failed to load reports';
      })
      .addCase(createReport.fulfilled, (state, action) => {
        state.data.push(action.payload);
      })
      .addCase(updateReport.fulfilled, (state, action) => {
        const idx = state.data.findIndex(r => r.id === action.payload.id);
        if (idx !== -1) state.data[idx] = action.payload;
      })
      .addCase(generatePreview.pending, (state) => {
        state.generatingPreview = true;
        state.previewContent = null;
      })
      .addCase(generatePreview.fulfilled, (state, action) => {
        state.generatingPreview = false;
        state.previewContent = action.payload.preview;
      })
      .addCase(generatePreview.rejected, (state, action) => {
        state.generatingPreview = false;
        state.error = action.error.message || 'Failed to generate preview';
      })
      .addCase(fetchReportById.fulfilled, (state, action) => {
        const idx = state.data.findIndex((r) => r.id === action.payload.id);
        if (idx === -1) state.data.push(action.payload);
        // hydrate currentReport for editing flows if desired
        if (state.errorsById) delete state.errorsById[action.payload.id];
      })
      .addCase(fetchReportById.rejected, (state, action) => {
        const payload = action.payload as any;
        if (payload && payload.id) {
          if (!state.errorsById) state.errorsById = {};
          state.errorsById[payload.id] = payload.status || 'error';
        }
      })
      .addCase(fetchReportExecutions.fulfilled, (state, _action) => {
        const { id, executions } = _action.payload as any;
        if (!state.executionsByReportId) state.executionsByReportId = {};
        state.executionsByReportId[id] = executions;
      })
      .addCase(pauseReport.fulfilled, (state, action) => {
        const idx = state.data.findIndex((r) => r.id === action.payload.id);
        if (idx !== -1) state.data[idx] = action.payload;
      })
      .addCase(resumeReport.fulfilled, (state, action) => {
        const idx = state.data.findIndex((r) => r.id === action.payload.id);
        if (idx !== -1) state.data[idx] = action.payload;
      })
      .addCase(duplicateReport.fulfilled, (state, action) => {
        state.data.push(action.payload);
      })
      .addCase(deleteReportThunk.fulfilled, (state, action) => {
        state.data = state.data.filter((r) => r.id !== action.payload);
      })
      .addCase(runReportNow.fulfilled, (state, action) => {
        const { report, execution } = action.payload;
        const idx = state.data.findIndex((r) => r.id === report.id);
        if (idx !== -1) state.data[idx] = report;
        if (!state.executionsByReportId) state.executionsByReportId = {};
        const list = state.executionsByReportId[report.id] || [];
        state.executionsByReportId[report.id] = [execution, ...list];
      });
  }
});

export const {
  updateCurrentReport,
  resetCurrentReport,
  setPreviewContent,
  setGeneratingPreview,
  addCheckToReport,
  removeCheckFromReport,
  addSection,
  updateSection,
  removeSection,
  reorderSections,
} = reportsSlice.actions;

// Export specific action creators explicitly when needed for IDE/linter consistency
export const toggleReportStatusOptimistic = reportsSlice.actions.toggleReportStatusOptimistic;

export default reportsSlice.reducer;
'@
}

# File 110: src/store/slices/studioSlice.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/store/slices/studioSlice.ts'
  SizeBytes    = 5119
  Sha256       = 'f46ef4da88b2bb2b784fd22e914f2c164524e4d3d1695832edc7e79d1a0ab874'
  Content      = @'
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { TestIR } from '@/types/studio/studioTypes';

interface StudioState {
  testSteps: string[];
  isExecuting: boolean;
  executionLogs: Array<{
    timestamp: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    stepIndex?: number;
  }>;
  stepResults: Array<{
    stepIndex: number;
    status: 'pending' | 'running' | 'pass' | 'fail';
    message?: string;
    timestamp: string;
  }>;
  videoUrl: string | null;
  currentStep: number;
  testConfiguration: {
    browser: 'chrome' | 'firefox' | 'safari' | 'edge';
    viewport: { width: number; height: number };
    timeout: number;
    waitStrategy: 'none' | 'networkidle' | 'domcontentloaded';
  };
  testIR: TestIR | null;
  generatedCode: string;
  autoSyncCode: boolean;
}

const initialState: StudioState = {
  testSteps: [],
  isExecuting: false,
  executionLogs: [],
  stepResults: [],
  videoUrl: null,
  currentStep: -1,
  testConfiguration: {
    browser: 'chrome',
    viewport: { width: 1920, height: 1080 },
    timeout: 30000,
    waitStrategy: 'networkidle',
  },
  testIR: null,
  generatedCode: '',
  autoSyncCode: true,
};

const studioSlice = createSlice({
  name: 'studio',
  initialState,
  reducers: {
    updateTestSteps: (state, action: PayloadAction<string[]>) => {
      state.testSteps = action.payload;
      // Reset results when steps change
      state.stepResults = [];
      state.videoUrl = null;
      state.currentStep = -1;
    },

    setExecuting: (state, action: PayloadAction<boolean>) => {
      state.isExecuting = action.payload;
      if (action.payload) {
        // Clear previous results when starting execution
        state.executionLogs = [];
        state.stepResults = state.testSteps.map((_, index) => ({
          stepIndex: index,
          status: 'pending',
          timestamp: new Date().toISOString(),
        }));
        state.currentStep = 0;
      }
    },

    addExecutionLog: (state, action: PayloadAction<StudioState['executionLogs'][0]>) => {
      state.executionLogs.push(action.payload);
    },

    setExecutionLogs: (state, action: PayloadAction<StudioState['executionLogs']>) => {
      state.executionLogs = action.payload;
    },

    updateStepResult: (
      state,
      action: PayloadAction<{ stepIndex: number; status: 'pending' | 'running' | 'pass' | 'fail'; message?: string }>
    ) => {
      const stepResult = state.stepResults.find((r) => r.stepIndex === action.payload.stepIndex);
      if (stepResult) {
        stepResult.status = action.payload.status;
        stepResult.message = action.payload.message;
        stepResult.timestamp = new Date().toISOString();
      }
    },

    setAllStepResults: (
      state,
      action: PayloadAction<Array<{ stepIndex: number; status: 'pending' | 'running' | 'pass' | 'fail'; message?: string }>>
    ) => {
      // Replace or upsert per provided entries
      const indexByStep: Record<number, number> = {};
      state.stepResults.forEach((r, i) => { indexByStep[r.stepIndex] = i; });
      for (const entry of action.payload) {
        const i = indexByStep[entry.stepIndex];
        if (i !== undefined) {
          state.stepResults[i].status = entry.status;
          state.stepResults[i].message = entry.message;
          state.stepResults[i].timestamp = new Date().toISOString();
        } else {
          state.stepResults.push({
            stepIndex: entry.stepIndex,
            status: entry.status,
            message: entry.message,
            timestamp: new Date().toISOString(),
          });
        }
      }
    },

    setCurrentStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },

    setVideoUrl: (state, action: PayloadAction<string | null>) => {
      state.videoUrl = action.payload;
    },

    updateConfiguration: (state, action: PayloadAction<Partial<StudioState['testConfiguration']>>) => {
      state.testConfiguration = { ...state.testConfiguration, ...action.payload };
    },

    setTestIR: (state, action: PayloadAction<TestIR | null>) => {
      state.testIR = action.payload;
    },

    setGeneratedCode: (state, action: PayloadAction<string>) => {
      state.generatedCode = action.payload;
    },

    setAutoSyncCode: (state, action: PayloadAction<boolean>) => {
      state.autoSyncCode = action.payload;
    },

    resetStudio: (state) => {
      state.testSteps = [];
      state.isExecuting = false;
      state.executionLogs = [];
      state.stepResults = [];
      state.videoUrl = null;
      state.currentStep = -1;
      state.testIR = null;
      state.generatedCode = '';
      state.autoSyncCode = true;
    },

    clearLogs: (state) => {
      state.executionLogs = [];
    },
  },
});

export const {
  updateTestSteps,
  setExecuting,
  addExecutionLog,
  setExecutionLogs,
  updateStepResult,
  setAllStepResults,
  setCurrentStep,
  setVideoUrl,
  updateConfiguration,
  setTestIR,
  setGeneratedCode,
  setAutoSyncCode,
  resetStudio,
  clearLogs,
} = studioSlice.actions;

export default studioSlice.reducer;



'@
}

# File 111: src/store/slices/uiSlice.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/store/slices/uiSlice.ts'
  SizeBytes    = 3787
  Sha256       = '1f0c5d6f934372f6a0964674bed2da012ac98cccb63d3006306ace3bb1a63f16'
  Content      = @'
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DeploymentMode } from '../../types/common/commonTypes';

interface UIState {
  deploymentMode: DeploymentMode;
  sidebarCollapsed: boolean;
  currentModule: string;
  currentPage: string;
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
  }>;
  loading: {
    global: boolean;
    [key: string]: boolean;
  };
  modals: {
    [key: string]: boolean;
  };
  theme: {
    mode: 'light' | 'dark';
    primaryColor: string;
  };
}

const initialState: UIState = {
  deploymentMode: 'standalone',
  sidebarCollapsed: false,
  currentModule: 'checks',
  currentPage: 'dashboard',
  notifications: [],
  loading: {
    global: false,
  },
  modals: {},
  theme: {
    mode: 'light',
    primaryColor: '#0056C7', // Citibank blue
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setDeploymentMode: (state, action: PayloadAction<DeploymentMode>) => {
      state.deploymentMode = action.payload;
    },
    
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
    
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    
    setCurrentPage: (state, action: PayloadAction<string>) => {
      state.currentPage = action.payload;
    },
    
    addNotification: (state, action: PayloadAction<Omit<UIState['notifications'][0], 'id' | 'timestamp' | 'read'>>) => {
      const notification = {
        ...action.payload,
        id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        read: false,
      };
      state.notifications.unshift(notification);
      
      // Keep only the last 50 notifications
      if (state.notifications.length > 50) {
        state.notifications = state.notifications.slice(0, 50);
      }
    },
    
    markNotificationAsRead: (state, action: PayloadAction<string>) => {
      const notification = state.notifications.find(n => n.id === action.payload);
      if (notification) {
        notification.read = true;
      }
    },
    
    markAllNotificationsAsRead: (state) => {
      state.notifications.forEach(n => n.read = true);
    },
    
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    
    clearNotifications: (state) => {
      state.notifications = [];
    },
    
    setLoading: (state, action: PayloadAction<{ key: string; loading: boolean }>) => {
      state.loading[action.payload.key] = action.payload.loading;
    },
    
    setGlobalLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.global = action.payload;
    },
    
    setModalOpen: (state, action: PayloadAction<{ key: string; open: boolean }>) => {
      state.modals[action.payload.key] = action.payload.open;
    },
    
    closeAllModals: (state) => {
      state.modals = {};
    },
    
    setThemeMode: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme.mode = action.payload;
    },
    
    setPrimaryColor: (state, action: PayloadAction<string>) => {
      state.theme.primaryColor = action.payload;
    },
  },
});

export const {
  setDeploymentMode,
  setSidebarCollapsed,
  toggleSidebar,
  setCurrentPage,
  addNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification,
  clearNotifications,
  setLoading,
  setGlobalLoading,
  setModalOpen,
  closeAllModals,
  setThemeMode,
  setPrimaryColor,
} = uiSlice.actions;

export default uiSlice.reducer;
'@
}

# File 112: src/test/setup.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/test/setup.ts'
  SizeBytes    = 1485
  Sha256       = '58053b61fcae6a2876c626b29cce687803b63632756c36643ed7de20234293bb'
  Content      = @'
import '@testing-library/jest-dom';
import { expect, afterEach, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Clean up after each test case
afterEach(() => {
  cleanup();
});

// Mock Service Worker setup for tests
let mockWorker: any;

beforeAll(async () => {
  const { server } = await import('@services/mocks/server');
  mockWorker = server;
  mockWorker.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  mockWorker?.resetHandlers();
});

afterAll(() => {
  mockWorker?.close();
});

// Global test utilities
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  root: Element | null = null;
  rootMargin: string = '';
  thresholds: ReadonlyArray<number> = [];
  
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
} as any;
'@
}

# File 113: src/theme/index.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/theme/index.ts'
  SizeBytes    = 3196
  Sha256       = 'be05f8a7b9edbea51fb8f0b11844a7ed9ad48d96ec2b7540afef348a14345e65'
  Content      = @'
import { createTheme } from '@mui/material/styles';

// PUT Platform Design System Theme
// Shared across all PUT modules for consistent branding and UX
export const theme = createTheme({
  palette: {
    primary: {
      main: '#2359de', // PUT Platform primary blue
      light: '#4D94FF',
      dark: '#0056C7',
    },
    secondary: {
      main: '#6B7280',
      light: '#A0AEC0', 
      dark: '#4A5568',
    },
    success: {
      main: '#10B981',
      light: '#34D399',
      dark: '#059669',
    },
    warning: {
      main: '#F59E0B',
      light: '#FCD34D',
      dark: '#D97706',
    },
    error: {
      main: '#EF4444',
      light: '#F87171',
      dark: '#DC2626',
    },
    info: {
      main: '#3B82F6',
      light: '#60A5FA',
      dark: '#2563EB',
    },
    background: {
      default: '#eff5f7', // PUT Platform background
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A2332',
      secondary: '#6B7280',
    },
  },
  typography: {
    fontFamily: [
      'Inter',
      'Helvetica Neue', 
      'Arial',
      '-apple-system',
      'BlinkMacSystemFont',
      'sans-serif'
    ].join(','),
    h1: {
      fontWeight: 800,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontWeight: 700,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
    body1: {
      lineHeight: 1.6,
    },
    body2: {
      lineHeight: 1.6,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '@media (prefers-reduced-motion: reduce)': {
          '*': {
            animation: 'none !important',
            transition: 'none !important',
            scrollBehavior: 'auto !important',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
          transition: 'transform 120ms ease',
          '&:active': { transform: 'translateY(1px)' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
          borderRadius: 16,
          border: '1px solid #E5E7EB',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
        },
        rounded: {
          borderRadius: 16,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiFormControl: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
  },
});

export default theme;
'@
}

# File 114: src/types/checks/checkTypes.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/types/checks/checkTypes.ts'
  SizeBytes    = 2826
  Sha256       = '21abd8656e1a4ad19368da01c965ef253acbd9716c5760aed2736dfc92d585e7'
  Content      = @'
export type CheckType = 'HTTP' | 'TCP' | 'SPLUNK' | 'GRAFANA' | 'ITRS' | 'APPDYNAMICS' | 'UI_TEST';
export type CheckStatus = 'PASSING' | 'FAILING' | 'WARNING' | 'PENDING' | 'UNKNOWN';
export type ExecutionStatus = 'SUCCESS' | 'FAILURE' | 'WARNING' | 'TIMEOUT';

export interface CheckEntity {
  id: string;
  name: string;
  type: CheckType;
  csiId: string;
  csiName: string;
  status: CheckStatus;
  lastExecution: string | null;
  nextExecution: string | null;
  configuration: CheckConfiguration;
  schedule: CheckSchedule;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  description?: string;
  environment?: string;
}

export interface CheckConfiguration {
  // HTTP Configuration
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  expectedStatus?: number;
  timeout?: number;

  // TCP Configuration
  host?: string;
  port?: number;

  // Splunk Configuration
  query?: string;
  timeRange?: string;
  threshold?: ThresholdConfig;

  // Grafana Configuration
  datasource?: string;
  duration?: string;

  // ITRS Configuration
  gateway?: string;
  sampler?: string;
  dataitem?: string;
  expectedValue?: string;

  // AppDynamics Configuration
  application?: string;
  healthRule?: string;
  tier?: string;

  // UI Test Configuration
  uiTest?: {
    testId: string;
    variables?: Record<string, { kind: 'plain' | 'secret' | 'number' | 'boolean'; value?: string | number; secretId?: string }>;
    overrides?: {
      browser?: 'chrome' | 'firefox' | 'safari' | 'edge';
      viewport?: { width: number; height: number };
      timeout?: number;
    };
  };
}

export interface ThresholdConfig {
  operator: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'contains';
  value: number | string;
  duration?: string;
}

export interface CheckSchedule {
  frequency: string;
  timezone: string;
  enabled: boolean;
  daysOfWeek?: number[];
  time?: string;
  cron?: string;
}

export interface CreateCheckRequest {
  name: string;
  type: CheckType;
  csiId: string;
  description?: string;
  configuration: CheckConfiguration;
  schedule: CheckSchedule;
  tags?: string[];
}

export interface UpdateCheckRequest extends Partial<CreateCheckRequest> {
  id: string;
}

export interface ExecutionResult {
  id: string;
  checkId: string;
  status: ExecutionStatus;
  startTime: string;
  endTime: string;
  duration: number;
  output: string;
  metadata: Record<string, any>;
  error?: string;
}

export interface CheckFilters {
  csiId: string | null;
  status: CheckStatus | null;
  type: CheckType | null;
  searchQuery: string;
  tags?: string[];
}

export interface CheckStatistics {
  total: number;
  passing: number;
  failing: number;
  warning: number;
  pending: number;
  scheduled: number;
}
'@
}

# File 115: src/types/common/commonTypes.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/types/common/commonTypes.ts'
  SizeBytes    = 973
  Sha256       = 'b152f492542616ac93531981598807678a2f74ff9326d9c4e7c48d5b1a869103'
  Content      = @'
export interface ApiResponse<T> {
  data: T;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  hasMore?: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface FilterParams {
  search?: string;
  [key: string]: any;
}

export type LoadingState = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface AsyncState<T> {
  data: T;
  loading: LoadingState;
  error: string | null;
  lastFetched: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  teams: string[];
  permissions: string[];
}

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  description?: string;
  badge?: string | number;
}

export type DeploymentMode = 'standalone' | 'federated';

export interface AppConfig {
  apiBaseUrl: string;
  enableMSW: boolean;
  debugMode: boolean;
  version: string;
  buildDate: string;
}
'@
}

# File 116: src/types/csi/csiTypes.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/types/csi/csiTypes.ts'
  SizeBytes    = 1451
  Sha256       = '18e954cdd82601b7b0f78f6cfe4d9bbf6719c7f7e55c4a2bfec43180e7923bba'
  Content      = @'
export interface CSI {
  id: string;
  name: string;
  description: string;
  businessUnit: string;
  criticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  owner: string;
  tags: string[];
  environment: 'Production' | 'Staging' | 'Development';
  status: 'OPERATIONAL' | 'DEGRADED' | 'DOWN' | 'MAINTENANCE';
  createdAt: string;
  updatedAt: string;
}

export interface CSIMetrics {
  csiId: string;
  totalChecks: number;
  passingChecks: number;
  failingChecks: number;
  warningChecks: number;
  overallHealth: number; // percentage 0-100
  lastUpdated: string;
  criticalAlertsCount: number;
  avgResponseTime: number; // in milliseconds
  uptime: number; // percentage 0-100
  totalExecutions: number;
  successRate: number; // percentage 0-100
}

export interface CSIHealthSummary {
  csi: CSI;
  metrics: CSIMetrics;
  recentIncidents: number;
  maintenanceWindows: number;
  lastHealthCheck: string;
}

export interface CSIFilters {
  businessUnit?: string;
  criticality?: CSI['criticality'];
  environment?: CSI['environment'];
  status?: CSI['status'];
  searchQuery?: string;
  tags?: string[];
  tagMode?: 'AND' | 'OR';
}

// API Response types
export interface CSIListResponse {
  data: CSI[];
  total: number;
  page: number;
  limit: number;
}

export interface CSIMetricsResponse {
  data: Record<string, CSIMetrics>;
  lastUpdated: string;
}

export interface CSIHealthResponse {
  data: CSIHealthSummary[];
  timestamp: string;
}
'@
}

# File 117: src/types/dashboard/dashboardTypes.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/types/dashboard/dashboardTypes.ts'
  SizeBytes    = 1159
  Sha256       = '939316dbf5c25fd445b9df11c761d076f55c93b3312544b5422b440999844e96'
  Content      = @'
export interface HealthKPI {
  totalChecks: number;
  passing: number;
  failing: number;
  warning: number;
  uptimePercent: number;
}

export interface DashboardSummary {
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  lastUpdated: string | null;
  counts: { passing: number; warning: number; failing: number; muted: number };
}

export interface AttentionItem {
  id: string;
  name: string;
  csiId: string;
  csiName: string;
  status: 'FAILING' | 'WARNING';
  since: string;
  reason?: string;
}

export interface ActivityItem {
  id: string;
  type: 'EXECUTION' | 'EDIT' | 'ASSIGN' | 'COMMENT';
  timestamp: string;
  title: string;
  description?: string;
  csiName?: string;
  path: string;
}

export interface ReportSnapshotItem {
  id: string;
  name: string;
  nextScheduledAt?: string;
  lastStatus?: string;
}

export interface SearchResultItem {
  id: string;
  type: 'check' | 'csi' | 'report' | 'studio' | 'CHECK' | 'REPORT';
  title: string;
  subtitle?: string;
  path: string;
}

export interface DashboardSearchState {
  loading: 'idle' | 'loading' | 'succeeded' | 'failed';
  data: SearchResultItem[];
  error: string | null;
}



'@
}

# File 118: src/types/reports/reportTypes.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/types/reports/reportTypes.ts'
  SizeBytes    = 2016
  Sha256       = 'eed890f69eca813c3b68593fc687c28a7b84b03c3c395fdecaead82f7d619e3c'
  Content      = @'
export type ReportStatus = 'active' | 'paused' | 'draft';

export type ReportTemplate = 'standard' | 'executive' | 'detailed' | 'alert-digest' | 'trend-analysis';

export interface ReportSchedule {
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  time: string;
  timezone: string;
  enabled: boolean;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  cron?: string;
}

export interface ReportEntity {
  id: string;
  name: string;
  description: string;
  selectedChecks: string[];
  schedule: ReportSchedule;
  recipients: string[];
  template: ReportTemplate;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastSent?: string;
  status: ReportStatus;
}

export interface ReportConfiguration {
  name: string;
  description: string;
  selectedChecks: string[];
  schedule: ReportSchedule;
  recipients: string[];
  template: ReportTemplate;
  sections?: ReportSection[];
}

export interface ReportPreviewResponse {
  preview: string;
  generatedAt: string;
  html?: string;
}

export type ReportExecutionStatus = 'success' | 'failed' | 'partial';

export interface ReportExecution {
  id: string;
  reportId: string;
  executionTime: string;
  status: ReportExecutionStatus;
  recipientCount: number;
  checksIncluded: number;
  checksFailures: number;
  generationDuration: number; // milliseconds
  emailContent?: string;
}

// Report sections enable grouped content within a report
export type ReportSectionKind = 'manual' | 'rule';

export interface ManualReportSection {
  id: string;
  title: string;
  kind: 'manual';
  checkIds: string[];
}

export interface RuleConfig {
  csiIds?: string[];
  tags?: string[];
  types?: string[];
  status?: string[];
  timeframe?: '' | '5m' | '15m' | '1h' | '24h';
  sort?: '' | 'failing-first' | 'recently-failed' | 'alphabetical';
  limit?: number;
}

export interface RuleReportSection {
  id: string;
  title: string;
  kind: 'rule';
  rule: RuleConfig;
}

export type ReportSection = ManualReportSection | RuleReportSection;


'@
}

# File 119: src/types/studio/studioTypes.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/types/studio/studioTypes.ts'
  SizeBytes    = 1830
  Sha256       = 'a5849b57b448a3b84c4af0742b1371f1bbf7ed0530863b1cbc163b68d2281ced'
  Content      = @'
export type StepActionType =
  | 'go_to'
  | 'click'
  | 'type'
  | 'wait_for_text'
  | 'check_url_contains';

export interface SecretRef {
  id: string;
  label: string;
  scope: 'project' | 'org' | 'user';
  last4?: string;
  createdAt: string;
}

export type VariableValue =
  | { kind: 'plain'; value: string }
  | { kind: 'secret'; ref: SecretRef };

export interface VariableDefinition {
  name: string; // e.g., USERNAME, PASSWORD
  value: VariableValue;
}

export interface StepIRBase {
  id: string; // stable identifier for mapping
  index: number;
  originalText: string;
}

export interface GoToStepIR extends StepIRBase {
  type: 'go_to';
  url: string;
}

export interface ClickStepIR extends StepIRBase {
  type: 'click';
  targetText?: string; // e.g., Login
  roleHint?: 'button' | 'link' | 'checkbox' | 'textbox' | 'combobox' | 'menuitem' | 'none';
}

export interface TypeStepIR extends StepIRBase {
  type: 'type';
  targetFieldText?: string; // e.g., User ID
  value: { raw?: string; varName?: string; secretId?: string };
}

export interface WaitForTextStepIR extends StepIRBase {
  type: 'wait_for_text';
  text: string;
  timeoutMs?: number;
}

export interface CheckUrlContainsStepIR extends StepIRBase {
  type: 'check_url_contains';
  substring: string;
}

export type StepIR =
  | GoToStepIR
  | ClickStepIR
  | TypeStepIR
  | WaitForTextStepIR
  | CheckUrlContainsStepIR;

export interface TestIR {
  meta: {
    name: string;
    csiId?: string;
    description?: string;
  };
  environment: string; // Development, Staging, etc.
  configuration: {
    browser: 'chrome' | 'firefox' | 'safari' | 'edge';
    viewport: { width: number; height: number };
    timeout: number;
    waitStrategy: 'none' | 'networkidle' | 'domcontentloaded';
  };
  variables: VariableDefinition[];
  steps: StepIR[];
}



'@
}

# File 120: src/types/tags/tagTypes.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/types/tags/tagTypes.ts'
  SizeBytes    = 784
  Sha256       = '115aa5873de84e9832c87e17d35e129e22f67da55bc89712ab412eca17ef90bc'
  Content      = @'
export interface Tag {
  name: string;
  category?: string;
  description?: string;
  color?: string;
}

export interface TagStats {
  tag: string;
  count: number;
  percentage?: number;
}

export interface TagFilters {
  category?: string;
  searchQuery?: string;
  csiId?: string;
}

export interface TagSuggestion {
  tag: string;
  relevanceScore: number;
  reason: string;
}

// API Response types
export interface TagListResponse {
  data: string[];
  total: number;
  csiId?: string;
  timestamp: string;
}

export interface TagStatsResponse {
  data: TagStats[];
  totalTags: number;
  totalChecks: number;
  csiId?: string;
  timestamp: string;
}

export interface TagSuggestionsResponse {
  data: string[];
  selectedTags: string[];
  csiId?: string;
  timestamp: string;
}
'@
}

# File 121: src/utils/constants/appConfig.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/utils/constants/appConfig.ts'
  SizeBytes    = 2484
  Sha256       = '894a364791dacdd46f64aa0a03cbbac4ed39f0246c11b57c6445af3b62869296'
  Content      = @'
import { AppConfig } from '../../types/common/commonTypes';

// Safe access to Vite env in both Vite and Webpack builds
const viteEnv: Record<string, any> = (() => {
  try {
    return (import.meta as any)?.env ?? {};
  } catch {
    return {};
  }
})();

const getStringEnv = (key: string, fallback?: string): string | undefined => {
  const val = viteEnv[key];
  if (typeof val === 'string' && val.length > 0) return val;
  // Fallback to process.env only when available (e.g., SSR/build tools)
  try {
    if (typeof process !== 'undefined' && (process as any).env) {
      const p = (process as any).env[key];
      if (typeof p === 'string' && p.length > 0) return p;
    }
  } catch {}
  return fallback;
};

const getBoolEnv = (key: string, defaultTrue = true): boolean => {
  const raw = getStringEnv(key);
  if (raw === undefined) return defaultTrue;
  return !(raw === 'false' || raw === '0');
};

export const APP_CONFIG: AppConfig = {
  apiBaseUrl: getStringEnv('VITE_API_BASE_URL', '/api') || '/api',
  enableMSW: getBoolEnv('VITE_ENABLE_MSW', true),
  debugMode: getStringEnv('VITE_DEBUG_MODE') === 'true',
  version: '1.0.0',
  buildDate: new Date().toISOString(),
};

export const API_ENDPOINTS = {
  // Checks endpoints
  CHECKS: '/checks',
  CHECK_BY_ID: (id: string) => `/checks/${id}`,
  EXECUTE_CHECK: (id: string) => `/checks/${id}/execute`,
  CHECK_EXECUTIONS: (id: string) => `/checks/${id}/executions`,

  // CSI endpoints
  CSI: '/csi',
  CSI_BY_ID: (id: string) => `/csi/${id}`,
  CSI_APPLICATIONS: (id: string) => `/csi/${id}/applications`,
  CSI_HEALTH: (id: string) => `/csi/${id}/health`,
  CSI_SEARCH: '/csi/search',
  CSI_BUSINESS_UNITS: '/csi/business-units',
  CSI_USER_PERMISSIONS: '/csi/user-permissions',

  // Reports endpoints
  REPORTS: '/reports',
  REPORT_BY_ID: (id: string) => `/reports/${id}`,
  REPORT_PREVIEW: (id: string) => `/reports/${id}/preview`,
  REPORT_EXECUTIONS: (id: string) => `/reports/${id}/executions`,

  // Studio endpoints
  STUDIO_TESTS: '/studio/tests',
  STUDIO_TEST_BY_ID: (id: string) => `/studio/tests/${id}`,
  STUDIO_EXECUTE: (id: string) => `/studio/tests/${id}/execute`,
  STUDIO_EXECUTION: (id: string) => `/studio/executions/${id}`,
  STUDIO_VALIDATE_STEPS: '/studio/validate-steps',
} as const;

export const WEBSOCKET_EVENTS = {
  EXECUTION_LOGS: 'execution_logs',
  CHECK_STATUS_UPDATES: 'check_status_updates',
  STUDIO_PROGRESS: 'studio_progress',
  REPORT_GENERATION: 'report_generation',
} as const;
'@
}

# File 122: src/utils/constants/navigationConfig.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/utils/constants/navigationConfig.ts'
  SizeBytes    = 1060
  Sha256       = '6b54bd2371f9f3e56efe503e49fd2c0aa9b90692d06a24a0359d405219ca2a13'
  Content      = @'
import { NavigationItem } from '../../types/common/commonTypes';

export const CHECKS_NAVIGATION: NavigationItem[] = [
  {
    id: 'home',
    label: 'Home',
    path: '/checks',
    icon: 'home',
    description: 'Attention, CSIs, and upcoming',
  },
  {
    id: 'all-checks',
    label: 'All Checks',
    path: '/checks/all',
    icon: 'checklist',
    description: 'Manage and monitor all checks',
  },
  {
    id: 'create-check',
    label: 'Create Check',
    path: '/checks/create',
    icon: 'add_circle',
    description: 'Build new health checks',
  },
  {
    id: 'checks-studio',
    label: 'Checks Studio',
    path: '/checks/studio',
    icon: 'movie',
    description: 'UI test automation studio',
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/checks/reports',
    icon: 'assessment',
    description: 'Analytics and reporting',
  },
];

// Navigation registration for @put/core-components
export const CHECKS_MODULE_CONFIG = {
  moduleId: 'checks',
  moduleLabel: 'Checks',
  version: '1.0.0',
  navigation: CHECKS_NAVIGATION,
};
'@
}

# File 123: src/utils/navigation/navigationSetup.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/utils/navigation/navigationSetup.ts'
  SizeBytes    = 2252
  Sha256       = 'ff13f525133f45f3e6a8915471df2f6e1c319bb80d0a1f4d19b996967dc674c5'
  Content      = @'
import { navigationRegistry } from '@put/core-components';

// Register the checks module navigation
export const registerChecksNavigation = () => {
  navigationRegistry.register({
    moduleId: 'checks',
    moduleLabel: 'Checks',
    moduleIcon: 'monitor_heart',
    version: '1.0.0',
    navigation: [
      { id: 'home', label: 'Home', path: '/checks', icon: 'home', description: 'Attention, CSIs, and upcoming' },
      // CSIs entry removed
      
      {
        id: 'studio',
        label: 'Studio',
        path: '/checks/studio/tests',
        icon: 'science',
        description: 'UI testing studio',
        children: [
          { id: 'studio-tests', label: 'Tests', path: '/checks/studio/tests', icon: 'science' },
          { id: 'studio-runs', label: 'Runs', path: '/checks/studio/runs', icon: 'movie' },
        ],
      },
      {
        id: 'checks',
        label: 'Checks',
        path: '/checks/all',
        icon: 'checklist',
        description: 'View and manage checks',
      },
      {
        id: 'reports',
        label: 'Reports',
        path: '/checks/reports',
        icon: 'assessment',
        description: 'Reporting checks',
      },
      // Activity and Schedules intentionally removed from sidebar
    ]
  });
};

// Helper function to get current page ID from path
export const getCurrentPageId = (pathname: string): string => {
  if (pathname === '/checks' || pathname === '/') return 'home';
  // CSIs removed
  // Checks parent should highlight when in checks area
  if (pathname.startsWith('/checks/all')) return 'checks';
  if (pathname.startsWith('/checks/create')) return 'checks';
  // templates removed
  // Studio sub-nav
  if (pathname.startsWith('/checks/studio/runs')) return 'studio-runs';
  if (pathname.startsWith('/checks/studio/tests')) return 'studio-tests';
  if (pathname.startsWith('/checks/studio')) return 'studio-tests';
  // Reports parent should highlight when in reports area
  if (pathname.startsWith('/checks/reports/new')) return 'reports';
  if (pathname.startsWith('/checks/reports/') && pathname.endsWith('/edit')) return 'reports';
  if (pathname.startsWith('/checks/reports')) return 'reports';
  // Standalone (activity and schedules removed)
  return 'dashboard';
};
'@
}

# File 124: src/utils/studio/codegen/pythonGenerator.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/utils/studio/codegen/pythonGenerator.ts'
  SizeBytes    = 2986
  Sha256       = 'c98990e307b2a2b2d0b84d6d086c98a77f04f30e9a1415a3be39ac1a77775b8f'
  Content      = @'
import type { TestIR, StepIR } from '@/types/studio/studioTypes';

function escapePythonString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function emitHeader(ir: TestIR): string[] {
  const lines: string[] = [];
  lines.push('# Generated by Checks Studio');
  lines.push('# target: Playwright (Python)');
  lines.push('from playwright.sync_api import sync_playwright, expect');
  lines.push('import os');
  lines.push('');
  lines.push('def Secret(id: str) -> str:');
  lines.push('    # Placeholder: resolved server-side during execution');
  lines.push('    return f"${{SECRET:{id}}}"');
  lines.push('');
  lines.push('def run_test():');
  lines.push('    with sync_playwright() as p:');
  lines.push(`        browser = p.chromium.launch(headless=True)`);
  lines.push('        context = browser.new_context(viewport={' + `"width": ${ir.configuration.viewport.width}, "height": ${ir.configuration.viewport.height}` + '})');
  lines.push('        page = context.new_page()');
  return lines;
}

function emitFooter(): string[] {
  return [
    '        context.close()',
    '        browser.close()',
    '',
    'if __name__ == "__main__":',
    '    run_test()',
  ];
}

function emitStep(step: StepIR): string[] {
  const lines: string[] = [];
  lines.push(`        # step:id=${step.id} type=${step.type}`);
  switch (step.type) {
    case 'go_to':
      lines.push(`        page.goto("${escapePythonString(step.url)}")`);
      break;
    case 'click': {
      const hint = step.roleHint ? `, role="${step.roleHint}"` : '';
      if (step.targetText) {
        lines.push(`        page.get_by_text("${escapePythonString(step.targetText)}"${hint}).click()`);
      } else {
        lines.push('        # WARNING: click target not specified');
      }
      break; }
    case 'type': {
      const target = step.targetFieldText
        ? `page.get_by_label("${escapePythonString(step.targetFieldText)}")`
        : 'page.locator("input")';
      let valueExpr = '""';
      if (step.value.secretId) {
        valueExpr = `Secret("${step.value.secretId}")`;
      } else if (step.value.varName) {
        valueExpr = `os.environ.get("${escapePythonString(step.value.varName)}", "")`;
      } else if (step.value.raw) {
        valueExpr = `"${escapePythonString(step.value.raw)}"`;
      }
      lines.push(`        ${target}.fill(${valueExpr})`);
      break; }
    case 'wait_for_text':
      lines.push(`        expect(page.get_by_text("${escapePythonString(step.text)}")).to_be_visible()`);
      break;
    case 'check_url_contains':
      lines.push(`        assert "${escapePythonString(step.substring)}" in page.url`);
      break;
  }
  lines.push('');
  return lines;
}

export function generatePythonFromIR(ir: TestIR): string {
  const lines: string[] = [];
  lines.push(...emitHeader(ir));
  for (const step of ir.steps) {
    lines.push(...emitStep(step));
  }
  lines.push(...emitFooter());
  return lines.join('\n');
}



'@
}

# File 125: src/utils/studio/ir/parseSteps.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/utils/studio/ir/parseSteps.ts'
  SizeBytes    = 3034
  Sha256       = '06f66122f57eeef592555f7b663c42350cfd0508ac3f02a5ad15cdc83372768c'
  Content      = @'
import type { StepIR, TestIR } from '@/types/studio/studioTypes';

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function parsePlainStepsToIR(lines: string[]): StepIR[] {
  return lines.map((line, index) => {
    const text = line.trim();
    const lower = text.toLowerCase();

    // Go to URL
    if (lower.startsWith('go to ') || lower.startsWith('navigate to ')) {
      const url = text.replace(/^go to\s+|^navigate to\s+/i, '').replace(/^"|"$/g, '');
      return { id: nextId('go'), index, originalText: line, type: 'go_to', url } as StepIR;
    }

    // Click
    if (lower.startsWith('click')) {
      // Click "Login" button
      const m = text.match(/click\s+"(.+?)"/i);
      const targetText = m ? m[1] : undefined;
      return { id: nextId('click'), index, originalText: line, type: 'click', targetText } as StepIR;
    }

    // Type
    if (lower.startsWith('type')) {
      // Type "foo" in the "User ID" field
      const valueMatch = text.match(/type\s+"(.+?)"/i);
      const fieldMatch = text.match(/in\s+the\s+"(.+?)"/i);
      const rawVal = valueMatch ? valueMatch[1] : '';
      const targetFieldText = fieldMatch ? fieldMatch[1] : undefined;
      // Recognize token formats: <var NAME> or <secret SECRET_ID>
      const varToken = rawVal.match(/^<var\s+([A-Z0-9_\-]+)>$/i);
      const secretToken = rawVal.match(/^<secret\s+([A-Za-z0-9_\-]+)>$/i);
      const value = secretToken
        ? { secretId: secretToken[1] }
        : varToken
        ? { varName: varToken[1] }
        : { raw: rawVal };
      return {
        id: nextId('type'),
        index,
        originalText: line,
        type: 'type',
        targetFieldText,
        value,
      } as StepIR;
    }

    // Wait for text
    if (lower.startsWith('wait for')) {
      const m = text.match(/wait for\s+the\s+text\s+"(.+?)"/i) || text.match(/wait for\s+"(.+?)"/i);
      const toWait = m ? m[1] : text.replace(/^wait for\s+/i, '');
      return { id: nextId('wait'), index, originalText: line, type: 'wait_for_text', text: toWait } as StepIR;
    }

    // Check URL contains
    if (lower.startsWith('check that the url contains') || lower.startsWith('check url contains')) {
      const m = text.match(/contains\s+"(.+?)"/i);
      const substr = m ? m[1] : text.replace(/.*contains\s+/i, '');
      return { id: nextId('url'), index, originalText: line, type: 'check_url_contains', substring: substr } as StepIR;
    }

    // Fallback: mark as wait_for_text for now
    return { id: nextId('unknown'), index, originalText: line, type: 'wait_for_text', text: text } as StepIR;
  });
}

export function buildDefaultTestIR(name: string, stepsLines: string[]): TestIR {
  return {
    meta: { name },
    environment: 'Development',
    configuration: {
      browser: 'chrome',
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      waitStrategy: 'networkidle',
    },
    variables: [],
    steps: parsePlainStepsToIR(stepsLines),
  };
}



'@
}

# File 126: src/utils/tagUtils.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/utils/tagUtils.ts'
  SizeBytes    = 8997
  Sha256       = '64ad659c5a08fdcf3770c8fdecc44048cd0a2d1af7cb39f1f6e2b07e3752581c'
  Content      = @'
/**
 * Tag utility functions for handling prefixed tags
 * Tags follow the format: prefix:value (e.g., application:trading-api, team:platform-engineering)
 */

export interface TagCategory {
  prefix: string;
  label: string;
  description: string;
  color: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info' | 'default';
  icon?: string;
}

// Define tag categories with their prefixes
export const TAG_CATEGORIES: TagCategory[] = [
  {
    prefix: 'application',
    label: 'Application',
    description: 'The application or system this check monitors',
    color: 'primary',
    icon: 'Apps'
  },
  {
    prefix: 'team',
    label: 'Team',
    description: 'The team responsible for this check',
    color: 'secondary',
    icon: 'Group'
  },
  {
    prefix: 'lob',
    label: 'Line of Business',
    description: 'The business line this check supports',
    color: 'success',
    icon: 'Business'
  },
  {
    prefix: 'priority',
    label: 'Priority',
    description: 'The priority level of this check',
    color: 'error',
    icon: 'PriorityHigh'
  },
  {
    prefix: 'type',
    label: 'Type',
    description: 'The type of check or monitoring',
    color: 'info',
    icon: 'Category'
  },
  {
    prefix: 'component',
    label: 'Component',
    description: 'The specific component being monitored',
    color: 'warning',
    icon: 'Extension'
  },
  {
    prefix: 'platform',
    label: 'Platform',
    description: 'The platform or technology stack',
    color: 'default',
    icon: 'Devices'
  },
  {
    prefix: 'customer',
    label: 'Customer',
    description: 'Customer-facing impact',
    color: 'primary',
    icon: 'Person'
  },
  {
    prefix: 'compliance',
    label: 'Compliance',
    description: 'Regulatory or compliance requirements',
    color: 'error',
    icon: 'Gavel'
  },
  {
    prefix: 'audit',
    label: 'Audit',
    description: 'Audit requirements',
    color: 'warning',
    icon: 'AssignmentTurnedIn'
  },
  {
    prefix: 'exchange',
    label: 'Exchange',
    description: 'Trading exchange or market',
    color: 'info',
    icon: 'TrendingUp'
  },
  {
    prefix: 'test-type',
    label: 'Test Type',
    description: 'Type of test execution',
    color: 'secondary',
    icon: 'Science'
  }
];

// Common tag values for each category
export const COMMON_TAG_VALUES = {
  application: [
    'trading-api',
    'trading-platform',
    'payment-gateway',
    'core-banking',
    'online-banking',
    'mobile-banking',
    'risk-management',
    'compliance-audit',
    'security-ops',
    'automation-platform',
    'infrastructure-services',
    'bi-platform',
    'customer-portal',
    'settlement-engine',
    'market-data-api'
  ],
  team: [
    'platform-engineering',
    'database-ops',
    'sre',
    'payments-team',
    'core-systems',
    'customer-experience',
    'qa-automation',
    'devops',
    'infrastructure',
    'cybersecurity',
    'risk-analytics',
    'compliance-ops',
    'monitoring-ops',
    'performance-eng',
    'mobile-dev'
  ],
  lob: [
    'capital-markets',
    'retail-banking',
    'enterprise-banking',
    'transaction-services',
    'risk-compliance',
    'digital-channels',
    'technology-infrastructure',
    'enterprise-security',
    'enterprise-data'
  ],
  priority: [
    'critical',
    'high',
    'medium',
    'low',
    'business-critical',
    'customer-facing',
    'regulatory'
  ],
  type: [
    'api',
    'ui-test',
    'performance',
    'infrastructure',
    'monitoring',
    'analytics',
    'siem',
    'tcp-check',
    'splunk-query',
    'grafana-metrics',
    'itrs-monitor',
    'appdynamics',
    'api-check',
    'log-analysis',
    'apm'
  ],
  component: [
    'database',
    'cache',
    'gateway',
    'db-pool',
    'network',
    'storage',
    'market-data',
    'incident-response',
    'reporting'
  ],
  platform: [
    'ios',
    'android',
    'web',
    'mobile'
  ],
  customer: [
    'internal',
    'external'
  ],
  compliance: [
    'sox',
    'regulatory',
    'pci-dss',
    'gdpr'
  ],
  audit: [
    'required',
    'optional',
    'quarterly',
    'annual'
  ],
  exchange: [
    'nyse',
    'nasdaq',
    'lse',
    'tsx',
    'cboe'
  ],
  'test-type': [
    'unit',
    'integration',
    'e2e',
    'smoke',
    'regression'
  ]
};

/**
 * Parse a prefixed tag into its components
 * @param tag The full tag string (e.g., "application:trading-api")
 * @returns Object with prefix and value, or null if not a prefixed tag
 */
export function parseTag(tag: string): { prefix: string; value: string } | null {
  const parts = tag.split(':');
  if (parts.length !== 2) {
    return null;
  }
  return {
    prefix: parts[0].toLowerCase(),
    value: parts[1]
  };
}

/**
 * Get the category configuration for a tag prefix
 * @param prefix The tag prefix to look up
 * @returns The category configuration or undefined
 */
export function getTagCategory(prefix: string): TagCategory | undefined {
  return TAG_CATEGORIES.find(cat => cat.prefix === prefix.toLowerCase());
}

/**
 * Format a tag for display
 * @param tag The full tag string
 * @returns Formatted display string
 */
export function formatTagDisplay(tag: string): string {
  const parsed = parseTag(tag);
  if (!parsed) {
    return tag;
  }
  
  const category = getTagCategory(parsed.prefix);
  if (!category) {
    return tag;
  }
  
  // Convert value from kebab-case to Title Case
  const formattedValue = parsed.value
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return formattedValue;
}

/**
 * Get the color for a tag based on its prefix
 * @param tag The full tag string
 * @returns MUI color variant
 */
export function getTagColor(tag: string): TagCategory['color'] {
  const parsed = parseTag(tag);
  if (!parsed) {
    return 'default';
  }
  
  const category = getTagCategory(parsed.prefix);
  return category?.color || 'default';
}

/**
 * Group tags by their prefix
 * @param tags Array of tag strings
 * @returns Object with tags grouped by prefix
 */
export function groupTagsByPrefix(tags: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  
  tags.forEach(tag => {
    const parsed = parseTag(tag);
    if (parsed) {
      if (!grouped[parsed.prefix]) {
        grouped[parsed.prefix] = [];
      }
      grouped[parsed.prefix].push(parsed.value);
    } else {
      // Handle unprefixed tags
      if (!grouped['other']) {
        grouped['other'] = [];
      }
      grouped['other'].push(tag);
    }
  });
  
  return grouped;
}

/**
 * Filter tags by prefix
 * @param tags Array of tag strings
 * @param prefix The prefix to filter by
 * @returns Array of tags with the specified prefix
 */
export function filterTagsByPrefix(tags: string[], prefix: string): string[] {
  return tags.filter(tag => {
    const parsed = parseTag(tag);
    return parsed && parsed.prefix === prefix.toLowerCase();
  });
}

/**
 * Generate tag suggestions based on prefix
 * @param prefix The tag prefix
 * @returns Array of suggested complete tags
 */
export function getTagSuggestions(prefix: string): string[] {
  const values = COMMON_TAG_VALUES[prefix as keyof typeof COMMON_TAG_VALUES];
  if (!values) {
    return [];
  }
  
  return values.map(value => `${prefix}:${value}`);
}

/**
 * Validate if a tag follows the correct format
 * @param tag The tag to validate
 * @returns Boolean indicating if the tag is valid
 */
export function isValidTag(tag: string): boolean {
  const parsed = parseTag(tag);
  if (!parsed) {
    return false;
  }
  
  // Check if the prefix is recognized
  const category = getTagCategory(parsed.prefix);
  if (!category) {
    return false;
  }
  
  // Value should not be empty and should follow kebab-case convention
  const valueRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  return valueRegex.test(parsed.value);
}

/**
 * Create a new prefixed tag
 * @param prefix The tag prefix
 * @param value The tag value
 * @returns The formatted tag string
 */
export function createTag(prefix: string, value: string): string {
  // Convert value to kebab-case if needed
  const kebabValue = value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  
  return `${prefix.toLowerCase()}:${kebabValue}`;
}

/**
 * Sort tags by category priority
 * @param tags Array of tag strings
 * @returns Sorted array of tags
 */
export function sortTagsByCategory(tags: string[]): string[] {
  const categoryOrder = TAG_CATEGORIES.map(cat => cat.prefix);
  
  return tags.sort((a, b) => {
    const parsedA = parseTag(a);
    const parsedB = parseTag(b);
    
    if (!parsedA && !parsedB) return 0;
    if (!parsedA) return 1;
    if (!parsedB) return -1;
    
    const indexA = categoryOrder.indexOf(parsedA.prefix);
    const indexB = categoryOrder.indexOf(parsedB.prefix);
    
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    
    return indexA - indexB;
  });
}
'@
}

# File 127: src/vite-env.d.ts
$Files += [pscustomobject]@{
  RelativePath = 'src/vite-env.d.ts'
  SizeBytes    = 232
  Sha256       = 'f7faff1458bccb3a03f5cc025c42abb367c612b2a16eaa58cda1a6c3e339e770'
  Content      = @'
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ENABLE_MSW?: string
  readonly VITE_DEBUG_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
'@
}

# File 128: tsconfig.json
$Files += [pscustomobject]@{
  RelativePath = 'tsconfig.json'
  SizeBytes    = 1191
  Sha256       = '41a5be1927d76ca64ef1b512282ad8af20cab0d48cf0266c3ffe782dfef6994e'
  Content      = @'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    
    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    
    /* Linting */
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    
    /* Path mapping */
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@components/*": ["components/*"],
      "@pages/*": ["pages/*"],
      "@hooks/*": ["hooks/*"],
      "@services/*": ["services/*"],
      "@types/*": ["types/*"],
      "@utils/*": ["utils/*"],
      "@store/*": ["store/*"],
      "@assets/*": ["assets/*"]
    },
    
    /* Additional options */
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "src/**/*.d.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "build"
  ]
}
'@
}

# File 129: tsconfig.node.json
$Files += [pscustomobject]@{
  RelativePath = 'tsconfig.node.json'
  SizeBytes    = 301
  Sha256       = '8db4f16fdceba2ce7d654231a1a88fb53a8cf046eb5a1968872fd9a01c5c37da'
  Content      = @'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "webpack.config.cjs"]
}
'@
}

# File 130: vite.config.ts
$Files += [pscustomobject]@{
  RelativePath = 'vite.config.ts'
  SizeBytes    = 1269
  Sha256       = '9ce204e12747a6362d376125458b0fb2a8fe01f6595eb7106fe28adc857d7bbc'
  Content      = @'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    open: true,
    hmr: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@store': path.resolve(__dirname, './src/store'),
      '@assets': path.resolve(__dirname, './src/assets'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled'],
    force: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
        },
      },
    },
  },
});
'@
}

# File 131: vitest.config.ts
$Files += [pscustomobject]@{
  RelativePath = 'vitest.config.ts'
  SizeBytes    = 1371
  Sha256       = '6a059df14bcf5cdadc31344346eff4ab235263daa98a9fb67bfd7dfa2b1e6cc0'
  Content      = @'
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/',
        'build/',
        'src/assets/',
        'src/services/mocks/mockData/',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 85,
          statements: 85,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@store': path.resolve(__dirname, './src/store'),
      '@assets': path.resolve(__dirname, './src/assets'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
    global: 'globalThis',
  },
});
'@
}

# File 132: webpack.config.cjs
$Files += [pscustomobject]@{
  RelativePath = 'webpack.config.cjs'
  SizeBytes    = 0
  Sha256       = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  Content      = @'

'@
}

# File 133: webpack.config.js
$Files += [pscustomobject]@{
  RelativePath = 'webpack.config.js'
  SizeBytes    = 4730
  Sha256       = 'bf0adc4da9dfbfa585a78790da9bb02b4328eba023e8609bd6bf789e6f6e492e'
  Content      = @'
import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { ModuleFederationPlugin } = webpack.container;
const isDevelopment = process.env.NODE_ENV !== 'production';

/** @type {import('webpack').Configuration} */
const config = {
  mode: isDevelopment ? 'development' : 'production',
  entry: path.resolve(process.cwd(), 'src', 'index.tsx'),
  devtool: isDevelopment ? 'eval-source-map' : 'source-map',
  output: {
    path: path.resolve(process.cwd(), 'dist'),
    filename: isDevelopment ? '[name].bundle.js' : '[name].[contenthash].js',
    chunkFilename: isDevelopment ? '[name].chunk.js' : '[name].[contenthash].chunk.js',
    // Use absolute root in dev to avoid nested path chunk loading issues
    publicPath: isDevelopment ? 'http://localhost:3002/' : 'auto',
    clean: true,
  },
  resolve: {
    extensions: ['.mjs', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      '@components': path.resolve(process.cwd(), 'src/components'),
      '@pages': path.resolve(process.cwd(), 'src/pages'),
      '@hooks': path.resolve(process.cwd(), 'src/hooks'),
      '@services': path.resolve(process.cwd(), 'src/services'),
      '@types': path.resolve(process.cwd(), 'src/types'),
      '@utils': path.resolve(process.cwd(), 'src/utils'),
      '@store': path.resolve(process.cwd(), 'src/store'),
      // Use built output of local linked package to avoid bundling its dev deps
      '@put/core-components': path.resolve(process.cwd(), '../put-core-components/dist'),
      react: path.resolve(process.cwd(), 'node_modules/react'),
      'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom'),
      'process/browser': require.resolve('process/browser'),
      process: require.resolve('process/browser'),
    },
    fallback: {
      process: require.resolve('process/browser'),
      buffer: require.resolve('buffer'),
      stream: require.resolve('stream-browserify'),
    },
    fullySpecified: false,
    symlinks: false,
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: { jsx: 'react-jsx' },
          },
        },
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      { test: /\.(png|jpg|jpeg|gif|svg|ico)$/, type: 'asset/resource' },
      { test: /\.(woff|woff2|eot|ttf|otf)$/, type: 'asset/resource' },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'checks',
      filename: 'remoteEntry.js',
      exposes: {
        './Module': './src/ChecksModule',
        // Expose MSW handlers so the host can start mocks at its origin
        './mocks': './src/services/mocks/handlers/index.ts',
      },
      shared: {
        react: { singleton: true, requiredVersion: false, strictVersion: false },
        'react-dom': { singleton: true, requiredVersion: false, strictVersion: false },
        '@put/core-components': { singleton: true, requiredVersion: false },
        'react-router-dom': { singleton: true, requiredVersion: '^6.21.0' },
        '@mui/material': { singleton: true, requiredVersion: '^5.15.0' },
        '@mui/icons-material': { singleton: true, requiredVersion: '^5.15.0' },
        '@emotion/react': { singleton: true, requiredVersion: '^11.11.0' },
        '@emotion/styled': { singleton: true, requiredVersion: '^11.11.0' },
      },
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      title: 'PUT Checks Module',
      inject: true,
      scriptLoading: 'defer',
    }),
    new webpack.ProvidePlugin({ process: 'process/browser', Buffer: ['buffer', 'Buffer'] }),
    isDevelopment && new ReactRefreshWebpackPlugin(),
  ].filter(Boolean),
  devServer: {
    port: 3002,
    host: 'localhost',
    historyApiFallback: {
      index: '/',
      disableDotRule: true,
    },
    hot: true,
    compress: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
    static: { directory: path.join(process.cwd(), 'public'), publicPath: '/' },
  },
  optimization: {
    // Module Federation remotes work best without splitChunks to avoid
    // async ordering issues that can cause eager shared consumption errors
    splitChunks: false,
    runtimeChunk: false,
    moduleIds: 'deterministic',
  },
  performance: {
    hints: isDevelopment ? false : 'warning',
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  },
};

export default config;



'@
}

# === DIRECTORY AND FILE CREATION SECTION ===
try {
  $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $DestinationRoot = (Get-Location).Path
  $ProjectRoot = Join-Path $DestinationRoot $ProjectName
  Write-Host ('[i] Creating project root: ' + $ProjectRoot)
  if (-not (Test-Path -Path $ProjectRoot)) { New-Item -ItemType Directory -Path $ProjectRoot -Force | Out-Null }

  # Create directories first
  $dirCount = 0
  foreach ($d in @('public', 'src', 'src/components', 'src/components/common', 'src/components/common/FilterBar', 'src/components/common/ScopeBar', 'src/components/home', 'src/components/layout', 'src/components/layout/ChecksLayout', 'src/components/layout/LayoutProvider', 'src/components/reports', 'src/components/scheduling', 'src/components/shared', 'src/components/shared/ErrorBoundary', 'src/components/shared/States', 'src/components/studio', 'src/data', 'src/pages', 'src/pages/ActivityPage', 'src/pages/AllChecksPage', 'src/pages/CSIOverviewPage', 'src/pages/CSIsDirectoryPage', 'src/pages/CheckDetailsPage', 'src/pages/ChecksStudioPage', 'src/pages/ChecksTemplatesPage', 'src/pages/CreateCheckPage', 'src/pages/DashboardPage', 'src/pages/HomePage', 'src/pages/Reports', 'src/pages/ReportsPage', 'src/pages/SchedulesPage', 'src/pages/StudioRunsPage', 'src/pages/StudioTestsPage', 'src/services', 'src/services/api', 'src/services/mocks', 'src/services/mocks/handlers', 'src/services/mocks/mockData', 'src/store', 'src/store/slices', 'src/test', 'src/theme', 'src/types', 'src/types/checks', 'src/types/common', 'src/types/csi', 'src/types/dashboard', 'src/types/reports', 'src/types/studio', 'src/types/tags', 'src/utils', 'src/utils/constants', 'src/utils/navigation', 'src/utils/studio', 'src/utils/studio/codegen', 'src/utils/studio/ir')) {
    $fullDir = Join-Path $ProjectRoot $d
    if (-not (Test-Path -Path $fullDir)) { New-Item -ItemType Directory -Path $fullDir -Force | Out-Null }
    $dirCount++
    Write-Host ("[dir] Created/ensured: $dirCount of $ExpectedTotalDirectories :: " + $fullDir)
  }

  # Write files
  $i = 0
  foreach ($f in $Files) {
    $i++
    $target = Join-Path $ProjectRoot $f.RelativePath
    $parent = Split-Path -Path $target -Parent
    if (-not (Test-Path -Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    try {
      $f.Content | Out-File -LiteralPath $target -Encoding $EncodingChoice
      Write-Host ("[file] Created file $i of $ExpectedTotalFiles :: " + $f.RelativePath)
    } catch {
      Write-Host ("[error] Failed to create: " + $f.RelativePath + " :: " + $_.Exception.Message) -ForegroundColor Red
    }
  }

  $Stopwatch.Stop()
  Write-Host ("[i] Creation completed in " + [math]::Round($Stopwatch.Elapsed.TotalSeconds,2) + "s") -ForegroundColor Green

  # === FINAL VALIDATION ===
  $missing = @()
  $contentDiff = @()
  foreach ($f in $Files) {
    $target = Join-Path $ProjectRoot $f.RelativePath
    if (-not (Test-Path -Path $target)) { $missing += $f.RelativePath; continue }
    try {
      $disk = Get-Content -LiteralPath $target -Raw -ErrorAction Stop
      # Normalize newlines to LF for consistent comparison
      $diskNorm = $disk -replace "`r`n", "`n"
      $memNorm  = $f.Content -replace "`r`n", "`n"
      if ($diskNorm -ne $memNorm) { $contentDiff += $f.RelativePath }
    } catch {
      Write-Host ("[warn] Could not validate content for: " + $f.RelativePath + " :: " + $_.Exception.Message) -ForegroundColor Yellow
    }
  }

  $createdFiles = Get-ChildItem -LiteralPath $ProjectRoot -File -Recurse | Measure-Object | Select-Object -ExpandProperty Count
  $createdDirs  = Get-ChildItem -LiteralPath $ProjectRoot -Directory -Recurse | Measure-Object | Select-Object -ExpandProperty Count
  Write-Host ("[verify] Expected files: $ExpectedTotalFiles | Created: $createdFiles")
  Write-Host ("[verify] Expected dirs:  $ExpectedTotalDirectories | Created: $createdDirs")

  if ($missing.Count -gt 0) {
    Write-Host '[!] Missing files:' -ForegroundColor Red
    $missing | ForEach-Object { Write-Host ('  - ' + $_) }
  }
  if ($contentDiff.Count -gt 0) {
    Write-Host '[!] Content differences (after newline normalization):' -ForegroundColor Yellow
    $contentDiff | ForEach-Object { Write-Host ('  - ' + $_) }
  }

  Write-Host '[i] Final directory tree:' -ForegroundColor Cyan
  Get-ChildItem -LiteralPath $ProjectRoot -Recurse | ForEach-Object {
    $rel = $_.FullName.Substring($ProjectRoot.Length + 1)
    $depth = ($rel -split '[\/]').Count
    $indent = ('  ' * ([Math]::Max($depth - 1, 0)))
    if (Test-Path -LiteralPath $_.FullName -PathType Container) {
      Write-Host ($indent + '[D] ' + $rel)
    } else {
      Write-Host ($indent + '[F] ' + $rel)
    }
  }

  if ($missing.Count -eq 0 -and $createdFiles -eq $ExpectedTotalFiles -and $contentDiff.Count -eq 0) {
    Write-Host '[SUCCESS] 100% completion verified.' -ForegroundColor Green
  } else {
    Write-Host '[WARN] Validation reported issues. See details above.' -ForegroundColor Yellow
  }

} catch {
  Write-Host ('[fatal] ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}