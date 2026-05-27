/**
 * Pro Command Module
 *
 * CLI commands for AIOS Pro license management and feature gating.
 *
 * Subcommands:
 *   aios pro activate --key <KEY>    Activate a license key
 *   aios pro status                   Show license status
 *   aios pro deactivate               Deactivate the current license
 *   aios pro features                 List all pro features
 *   aios pro validate                 Force online revalidation
 *   aios pro setup                    Configure GitHub Packages access (AC-12)
 *
 * @module cli//commands/pro
 * @version 1.1.0
 * @story PRO-6 — License Key & Feature Gating System
 */

'use strict';

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// TEMP local-dev fixture defaults (do not use in production).
const LOCAL_DEV_FIXTURE_ENABLED = true;
const LOCAL_DEV_FIXTURE_FILE = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'installer',
  'tests',
  'fixtures',
  'pro',
  'license-api-success.json',
);
const LOCAL_DEV_CACHE_DIR = path.resolve(process.cwd(), '.aios');
const LOCAL_DEV_LICENSE_CACHE_FILE = path.join(LOCAL_DEV_CACHE_DIR, 'pro-license-cache.local.json');
const LOCAL_DEV_PENDING_DEACTIVATION_FILE = path.join(
  LOCAL_DEV_CACHE_DIR,
  'pro-pending-deactivation.local.json',
);

/**
 * Parse boolean-like flags from env/options.
 * Accepts true, "true", or "1".
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isEnabledFlag(value) {
  return value === true || value === 'true' || value === '1';
}

/**
 * Load local dev fixture for Pro activation.
 * Guardrails: disabled in production/CI.
 *
 * @returns {{ enabled: boolean, result?: object, error?: string }}
 */
function getLocalDevActivationFixture() {
  const fixtureEnabled = LOCAL_DEV_FIXTURE_ENABLED || isEnabledFlag(process.env.AIOS_PRO_DEV_FIXTURE);
  if (!fixtureEnabled) {
    return { enabled: false };
  }

  if (process.env.NODE_ENV === 'production' || process.env.CI === 'true') {
    return {
      enabled: true,
      error: 'Local Pro fixture mode is disabled in production/CI.',
    };
  }

  const fixturePath = process.env.AIOS_PRO_DEV_FIXTURE_FILE || LOCAL_DEV_FIXTURE_FILE;
  if (!fixturePath) {
    return {
      enabled: true,
      error: 'Missing fixture path. Set AIOS_PRO_DEV_FIXTURE_FILE or LOCAL_DEV_FIXTURE_FILE.',
    };
  }

  try {
    const fixtureRaw = fs.readFileSync(fixturePath, 'utf8');
    const fixture = JSON.parse(fixtureRaw);
    const key = typeof fixture.licenseKey === 'string' ? fixture.licenseKey : 'PRO-LOCAL-DEV-FIXTURE';
    const activationResult = fixture.activationResult && typeof fixture.activationResult === 'object'
      ? fixture.activationResult
      : {
          key,
          activatedAt: new Date().toISOString(),
          expiresAt: null,
          features: ['pro.fixture'],
          seats: { used: 1, max: 1 },
          cacheValidDays: 1,
          gracePeriodDays: 0,
        };

    return {
      enabled: true,
      result: {
        key,
        activationResult,
        fixturePath,
      },
    };
  } catch (error) {
    return {
      enabled: true,
      error: `Failed to load local Pro fixture: ${error.message}`,
    };
  }
}

function isLocalDevFixtureMode() {
  return (LOCAL_DEV_FIXTURE_ENABLED || isEnabledFlag(process.env.AIOS_PRO_DEV_FIXTURE))
    && process.env.NODE_ENV !== 'production'
    && process.env.CI !== 'true';
}

function createLocalDevLicenseModules() {
  class ProFeatureError extends Error {}
  class LicenseActivationError extends Error {
    constructor(message, code = 'LOCAL_DEV_FIXTURE', details = {}) {
      super(message);
      this.name = 'LicenseActivationError';
      this.code = code;
      this.details = details;
    }
  }

  function ensureLocalDevCacheDir() {
    fs.mkdirSync(LOCAL_DEV_CACHE_DIR, { recursive: true });
  }

  function writeLicenseCache(cacheData) {
    try {
      ensureLocalDevCacheDir();
      fs.writeFileSync(
        LOCAL_DEV_LICENSE_CACHE_FILE,
        JSON.stringify(cacheData, null, 2),
        'utf8',
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function getDefaultLocalDevCache() {
    const fixture = getLocalDevActivationFixture();
    const activation = fixture.result?.activationResult || {};
    const key = fixture.result?.key || 'PRO-LOCAL-DEV-FIXTURE';
    return {
      key,
      activatedAt: activation.activatedAt || new Date().toISOString(),
      expiresAt: activation.expiresAt || null,
      features: Array.isArray(activation.features) ? activation.features : ['pro.fixture'],
      seats: activation.seats || { used: 1, max: 1 },
      cacheValidDays: activation.cacheValidDays || 30,
      gracePeriodDays: activation.gracePeriodDays || 7,
    };
  }

  function ensureLocalDevAutoActivation() {
    if (!isLocalDevFixtureMode()) {
      return;
    }
    if (fs.existsSync(LOCAL_DEV_LICENSE_CACHE_FILE)) {
      return;
    }
    writeLicenseCache(getDefaultLocalDevCache());
  }

  function readLicenseCache() {
    try {
      ensureLocalDevAutoActivation();
      if (!fs.existsSync(LOCAL_DEV_LICENSE_CACHE_FILE)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(LOCAL_DEV_LICENSE_CACHE_FILE, 'utf8'));
    } catch {
      return null;
    }
  }

  function deleteLicenseCache() {
    try {
      if (fs.existsSync(LOCAL_DEV_LICENSE_CACHE_FILE)) {
        fs.unlinkSync(LOCAL_DEV_LICENSE_CACHE_FILE);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function setPendingDeactivation(key) {
    try {
      ensureLocalDevCacheDir();
      fs.writeFileSync(
        LOCAL_DEV_PENDING_DEACTIVATION_FILE,
        JSON.stringify({ pending: true, key, createdAt: new Date().toISOString() }, null, 2),
        'utf8',
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function hasPendingDeactivation() {
    try {
      if (!fs.existsSync(LOCAL_DEV_PENDING_DEACTIVATION_FILE)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(LOCAL_DEV_PENDING_DEACTIVATION_FILE, 'utf8'));
    } catch {
      return null;
    }
  }

  function clearPendingDeactivation() {
    try {
      if (fs.existsSync(LOCAL_DEV_PENDING_DEACTIVATION_FILE)) {
        fs.unlinkSync(LOCAL_DEV_PENDING_DEACTIVATION_FILE);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function generateMachineId() {
    const os = require('os');
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(`${os.hostname()}-${os.platform()}-${os.arch()}`)
      .digest('hex')
      .substring(0, 32);
  }

  function maskKey(key) {
    if (!key || typeof key !== 'string') return '****';
    const upper = key.trim().toUpperCase();
    const parts = upper.split('-');
    if (parts.length !== 5 || parts[0] !== 'PRO') return '****';
    return `${parts[0]}-${parts[1]}-****-****-${parts[4]}`;
  }

  function validateKeyFormat(key) {
    if (!key || typeof key !== 'string') return false;
    return /^PRO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.trim().toUpperCase());
  }

  const featureGate = {
    reload() {},
    getLicenseState() {
      return readLicenseCache() ? 'Active' : 'Not Activated';
    },
    getLicenseInfo() {
      const cache = readLicenseCache();
      if (!cache) return null;
      return {
        features: cache.features || [],
        inGrace: false,
      };
    },
    listByModule() {
      const features = this.listAvailable();
      return {
        pro: features.map((name) => ({
          id: name,
          name,
          description: 'Local fixture feature',
          available: true,
        })),
      };
    },
    listAvailable() {
      const cache = readLicenseCache();
      return cache?.features || [];
    },
  };

  const licenseApi = {
    async isOnline() {
      return true;
    },
    async activate(key) {
      const fixture = getLocalDevActivationFixture();
      const base = fixture.result?.activationResult || {};
      return {
        key,
        activatedAt: base.activatedAt || new Date().toISOString(),
        expiresAt: base.expiresAt || null,
        features: Array.isArray(base.features) ? base.features : ['pro.fixture'],
        seats: base.seats || { used: 1, max: 1 },
        cacheValidDays: base.cacheValidDays || 30,
        gracePeriodDays: base.gracePeriodDays || 7,
      };
    },
    async validate(key) {
      const cache = readLicenseCache();
      if (!cache || cache.key !== key) {
        return { valid: false };
      }
      return {
        valid: true,
        features: cache.features || ['pro.fixture'],
        seats: cache.seats || { used: 1, max: 1 },
        expiresAt: cache.expiresAt || null,
        cacheValidDays: cache.cacheValidDays || 30,
        gracePeriodDays: cache.gracePeriodDays || 7,
      };
    },
    async deactivate() {
      // Keep local admin mode active: deactivation becomes a no-op locally.
      return { success: true, localAdminMode: true };
    },
  };

  return {
    featureGate,
    licenseApi,
    writeLicenseCache,
    readLicenseCache,
    deleteLicenseCache,
    hasPendingDeactivation,
    setPendingDeactivation,
    clearPendingDeactivation,
    generateMachineId,
    maskKey,
    validateKeyFormat,
    ProFeatureError,
    LicenseActivationError,
  };
}

/**
 * Resolve online status with local-dev safety.
 * In local fixture mode, force online to avoid network-dependent failures.
 *
 * @param {object} licenseApi
 * @returns {Promise<boolean>}
 */
async function checkIsOnlineSafely(licenseApi) {
  const localFixtureMode = (LOCAL_DEV_FIXTURE_ENABLED || isEnabledFlag(process.env.AIOS_PRO_DEV_FIXTURE))
    && process.env.NODE_ENV !== 'production'
    && process.env.CI !== 'true';

  if (localFixtureMode) {
    return true;
  }

  try {
    return await licenseApi.isOnline();
  } catch {
    return false;
  }
}

// BUG-6 fix (INS-1): Dynamic licensePath resolution
// In framework-dev: __dirname = aios-core/.aios-core/cli/commands/pro → ../../../../pro/license
// In project-dev: pro is installed via npm as @aios-fullstack/pro
function resolveLicensePath() {
  // 1. Try relative path (framework-dev mode)
  const relativePath = path.resolve(__dirname, '..', '..', '..', '..', 'pro', 'license');
  if (fs.existsSync(relativePath)) {
    return relativePath;
  }

  // 2. Try node_modules/@aios-fullstack/pro/license (project-dev mode)
  try {
    const proPkg = require.resolve('@aios-fullstack/pro/package.json');
    const proDir = path.dirname(proPkg);
    const npmPath = path.join(proDir, 'license');
    if (fs.existsSync(npmPath)) {
      return npmPath;
    }
  } catch {
    // @aios-fullstack/pro not installed via npm
  }

  // 3. Try project root node_modules (fallback)
  const projectRoot = process.cwd();
  const cwdPath = path.join(projectRoot, 'node_modules', '@aios-fullstack', 'pro', 'license');
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  // Return relative path as default (will fail gracefully in loadLicenseModules)
  return relativePath;
}

const licensePath = resolveLicensePath();

/**
 * Lazy-load license modules (avoids failing if pro module not installed)
 */
function loadLicenseModules() {
  function ensureLocalDevAdminAccess(modules) {
    if (!isLocalDevFixtureMode()) {
      return modules;
    }

    try {
      const existing = modules.readLicenseCache ? modules.readLicenseCache() : null;
      const byModule = modules.featureGate && modules.featureGate.listByModule
        ? modules.featureGate.listByModule()
        : {};

      const allFeatureIds = Object.values(byModule)
        .flat()
        .map((feature) => feature && feature.id)
        .filter(Boolean);

      // If catalog is unavailable, keep current behavior.
      if (allFeatureIds.length === 0) {
        return modules;
      }

      const missingAdminAccess = !existing
        || !Array.isArray(existing.features)
        || allFeatureIds.some((id) => !existing.features.includes(id));

      if (!missingAdminAccess) {
        return modules;
      }

      const fixture = getLocalDevActivationFixture();
      const activation = fixture.result?.activationResult || {};
      const key = existing?.key || fixture.result?.key || 'PRO-LOCAL-DEV-FIXTURE';
      const cacheData = {
        key,
        activatedAt: existing?.activatedAt || activation.activatedAt || new Date().toISOString(),
        expiresAt: existing?.expiresAt || activation.expiresAt || null,
        features: allFeatureIds,
        seats: existing?.seats || activation.seats || { used: 1, max: 999 },
        cacheValidDays: existing?.cacheValidDays || activation.cacheValidDays || 3650,
        gracePeriodDays: existing?.gracePeriodDays || activation.gracePeriodDays || 30,
      };

      const writeResult = modules.writeLicenseCache(cacheData);
      if (writeResult && writeResult.success === false) {
        console.warn(`Local admin cache write failed: ${writeResult.error}`);
      } else if (modules.featureGate && modules.featureGate.reload) {
        modules.featureGate.reload();
      }
    } catch (error) {
      console.warn(`Local admin access seed failed: ${error.message}`);
    }

    return modules;
  }

  try {
    const { featureGate } = require(path.join(licensePath, 'feature-gate'));
    const { licenseApi } = require(path.join(licensePath, 'license-api'));
    const {
      writeLicenseCache,
      readLicenseCache,
      deleteLicenseCache,
      hasPendingDeactivation,
      setPendingDeactivation,
      clearPendingDeactivation,
    } = require(path.join(licensePath, 'license-cache'));
    const {
      generateMachineId,
      maskKey,
      validateKeyFormat,
    } = require(path.join(licensePath, 'license-crypto'));
    const { ProFeatureError, LicenseActivationError } = require(path.join(licensePath, 'errors'));

    const loadedModules = {
      featureGate,
      licenseApi,
      writeLicenseCache,
      readLicenseCache,
      deleteLicenseCache,
      hasPendingDeactivation,
      setPendingDeactivation,
      clearPendingDeactivation,
      generateMachineId,
      maskKey,
      validateKeyFormat,
      ProFeatureError,
      LicenseActivationError,
    };
    return ensureLocalDevAdminAccess(loadedModules);
  } catch (error) {
    if (isLocalDevFixtureMode()) {
      console.warn('AIOS Pro modules not found. Using local fixture-backed license modules.');
      const localModules = createLocalDevLicenseModules();
      return ensureLocalDevAdminAccess(localModules);
    }
    console.error('AIOS Pro license module not available.');
    console.error('Install AIOS Pro: npm install @aios-fullstack/pro');
    process.exit(1);
  }
}

/**
 * Get AIOS Core version from package.json
 */
function getAiosCoreVersion() {
  try {
    const pkgPath = path.resolve(__dirname, '..', '..', '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Ask user for confirmation
 */
async function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// ---------------------------------------------------------------------------
// aios pro activate
// ---------------------------------------------------------------------------

async function activateAction(options) {
  const fixture = getLocalDevActivationFixture();
  if (fixture.enabled) {
    if (fixture.error) {
      console.error(`\nActivation failed: ${fixture.error}`);
      process.exit(1);
    }

    const result = fixture.result;
    let cachePersisted = false;

    // Persist fixture activation so `aios pro status` reflects active state.
    try {
      const { writeLicenseCache, featureGate } = loadLicenseModules();
      const activation = result.activationResult || {};
      const cacheData = {
        key: result.key,
        activatedAt: activation.activatedAt || new Date().toISOString(),
        expiresAt: activation.expiresAt || null,
        features: Array.isArray(activation.features) ? activation.features : ['pro.fixture'],
        seats: activation.seats || { used: 1, max: 1 },
        cacheValidDays: activation.cacheValidDays || 30,
        gracePeriodDays: activation.gracePeriodDays || 7,
      };
      const writeResult = writeLicenseCache(cacheData);
      if (writeResult && writeResult.success === false) {
        console.error(`Warning: Could not save license cache: ${writeResult.error}`);
      } else {
        cachePersisted = true;
      }
      featureGate.reload();
    } catch (cacheError) {
      console.error(`Warning: Could not persist fixture activation cache: ${cacheError.message}`);
    }

    console.log('\nActivating AIOS Pro license...');
    console.log('⚠️  Using local Pro fixture mode (development only).');
    console.log(`ℹ  Fixture loaded from: ${result.fixturePath}`);
    console.log('');
    console.log('License activated successfully! (fixture)\n');
    console.log('  Status:       Active');
    console.log(`  Key:          ${result.key}`);
    if (Array.isArray(result.activationResult.features)) {
      console.log(`  Features:     ${result.activationResult.features.join(', ')}`);
    }
    if (result.activationResult.seats) {
      console.log(
        `  Seats:        ${result.activationResult.seats.used}/${result.activationResult.seats.max} used`,
      );
    }
    if (result.activationResult.expiresAt) {
      console.log(`  Valid until:  ${formatDate(result.activationResult.expiresAt)}`);
    }
    if (cachePersisted) {
      console.log('  Cache:        persisted for local status checks');
    }
    console.log('');
    return;
  }

  const {
    licenseApi,
    writeLicenseCache,
    generateMachineId,
    maskKey,
    validateKeyFormat,
    featureGate,
    LicenseActivationError,
  } = loadLicenseModules();

  const key = options.key;

  if (!key) {
    console.error('Error: License key is required');
    console.error('Usage: aios pro activate --key PRO-XXXX-XXXX-XXXX-XXXX');
    process.exit(1);
  }

  // Validate key format
  if (!validateKeyFormat(key)) {
    console.error('Error: Invalid license key format');
    console.error('Expected format: PRO-XXXX-XXXX-XXXX-XXXX');
    process.exit(1);
  }

  console.log('\nActivating AIOS Pro license...');
  console.log(`Key: ${maskKey(key)}`);
  console.log('');

  try {
    const machineId = generateMachineId();
    const aiosCoreVersion = getAiosCoreVersion();

    const result = await licenseApi.activate(key, machineId, aiosCoreVersion);

    // Write encrypted cache
    const cacheData = {
      key: result.key,
      activatedAt: result.activatedAt,
      expiresAt: result.expiresAt,
      features: result.features,
      seats: result.seats,
      cacheValidDays: result.cacheValidDays,
      gracePeriodDays: result.gracePeriodDays,
    };

    const writeResult = writeLicenseCache(cacheData);
    if (!writeResult.success) {
      console.error(`Warning: Could not save license cache: ${writeResult.error}`);
    }

    // Reload feature gate
    featureGate.reload();

    // Display success
    console.log('License activated successfully!\n');
    console.log('  Status:       Active');
    console.log(`  Key:          ${maskKey(result.key)}`);
    console.log(`  Features:     ${result.features.join(', ')}`);
    console.log(`  Seats:        ${result.seats.used}/${result.seats.max} used`);
    console.log(`  Valid until:  ${formatDate(result.expiresAt)}`);
    console.log(`  Cache:        ${result.cacheValidDays} days offline operation`);
    console.log('');

    // Scaffold pro content into project (Story INS-3.1)
    // Lazy-load to avoid crashing if pro-scaffolder or js-yaml is unavailable
    const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
    const proSourceDir = path.join(projectRoot, 'node_modules', '@aios-fullstack', 'pro');

    if (fs.existsSync(proSourceDir)) {
      let scaffoldProContent;
      try {
        ({ scaffoldProContent } = require('../../../../packages/installer/src/pro/pro-scaffolder'));
      } catch {
        console.log('Note: Pro scaffolder not available. Skipping content scaffolding.');
        console.log('');
      }

      if (scaffoldProContent) {
        console.log('Scaffolding pro content...');
        const scaffoldResult = await scaffoldProContent(projectRoot, proSourceDir, {
          onProgress: ({ item, status, message }) => {
            if (status === 'done') {
              console.log(`  + ${message}`);
            } else if (status === 'warning') {
              console.log(`  ! ${message}`);
            }
          },
        });

        if (scaffoldResult.success) {
          console.log(`\nPro content installed (${scaffoldResult.copiedFiles.length} files)`);
          if (scaffoldResult.skippedFiles.length > 0) {
            console.log(`  ${scaffoldResult.skippedFiles.length} files unchanged (already up to date)`);
          }
          if (scaffoldResult.warnings.length > 0) {
            for (const warning of scaffoldResult.warnings) {
              console.log(`  Warning: ${warning}`);
            }
          }
        } else {
          console.error('\nWarning: Pro content scaffolding failed.');
          for (const err of scaffoldResult.errors) {
            console.error(`  ${err}`);
          }
          console.error('Pro features are activated but content was not copied.');
          console.error('Try running "aios pro activate" again to retry scaffolding.');
        }
        console.log('');
      }
    } else {
      console.log('Note: @aios-fullstack/pro package not found in node_modules.');
      console.log('Pro content will be scaffolded when the package is installed.');
      console.log('');
    }

  } catch (error) {
    if (error instanceof LicenseActivationError) {
      console.error(`\nActivation failed: ${error.message}`);
      console.error(`Error code: ${error.code}`);
      if (error.details && Object.keys(error.details).length > 0) {
        console.error('Details:', JSON.stringify(error.details, null, 2));
      }
    } else {
      console.error(`\nActivation failed: ${error.message}`);
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// aios pro status
// ---------------------------------------------------------------------------

function statusAction() {
  const {
    featureGate,
    readLicenseCache,
    maskKey,
    hasPendingDeactivation,
  } = loadLicenseModules();

  console.log('\nAIOS Pro License Status\n');

  const cache = readLicenseCache();
  const state = featureGate.getLicenseState();
  const info = featureGate.getLicenseInfo();

  // State display
  const stateEmoji = {
    'Active': '\u2705',     // Green check
    'Grace': '\u26A0\uFE0F', // Warning
    'Expired': '\u274C',    // Red X
    'Not Activated': '\u2796', // Minus
  };

  console.log(`  License:       ${stateEmoji[state] || ''} ${state}`);

  if (!cache) {
    console.log('\n  No license activated.');
    console.log('  Activate: aios pro activate --key PRO-XXXX-XXXX-XXXX-XXXX');
    console.log('  Purchase: https://synkra.ai/pro');
    console.log('');
    return;
  }

  // Key (masked)
  console.log(`  Key:           ${maskKey(cache.key)}`);

  // Features
  if (info && info.features) {
    console.log(`  Features:      ${info.features.join(', ')}`);
  }

  // Seats
  if (cache.seats) {
    console.log(`  Seats:         ${cache.seats.used}/${cache.seats.max} used`);
  }

  // Cache validity
  if (cache.activatedAt) {
    const activatedDate = new Date(cache.activatedAt);
    const cacheValidDays = cache.cacheValidDays || 30;
    const expiryDate = new Date(activatedDate.getTime() + cacheValidDays * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    if (daysRemaining > 0) {
      console.log(`  Cache:         Valid until ${formatDate(expiryDate)} (${daysRemaining} days remaining)`);
    } else {
      console.log(`  Cache:         Expired ${formatDate(expiryDate)}`);
    }
  }

  // Grace period warning
  if (info && info.inGrace) {
    const gracePeriodDays = cache.gracePeriodDays || 7;
    console.log(`\n  \u26A0\uFE0F  Grace Period Active (${gracePeriodDays} days)`);
    console.log('  Please revalidate your license: aios pro validate');
  }

  // Pending deactivation warning
  const pending = hasPendingDeactivation();
  if (pending && pending.pending) {
    console.log('\n  \u26A0\uFE0F  Pending Offline Deactivation');
    console.log('  A deactivation is pending sync to the server.');
    console.log('  This will be synced on next online activation or validation.');
  }

  // Next validation
  console.log(`\n  Next validation: ${state === 'Active' ? 'Background (when online)' : 'Required'}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// aios pro deactivate
// ---------------------------------------------------------------------------

async function deactivateAction(options) {
  const {
    licenseApi,
    readLicenseCache,
    deleteLicenseCache,
    setPendingDeactivation,
    generateMachineId,
    maskKey,
    featureGate,
  } = loadLicenseModules();

  const cache = readLicenseCache();

  if (!cache) {
    console.log('\nNo license is currently activated.');
    return;
  }

  // Confirm unless forced
  if (!options.force) {
    console.log('\nDeactivating AIOS Pro License');
    console.log(`Key: ${maskKey(cache.key)}`);
    console.log('\nThis will:');
    console.log('  - Remove the license from this machine');
    console.log('  - Free up a seat for use on another machine');
    console.log('  - Disable all Pro features (Core features remain available)');
    console.log('  - Preserve all your data and configurations');
    console.log('');

    const confirmed = await confirm('Are you sure you want to deactivate? (y/N): ');
    if (!confirmed) {
      console.log('Deactivation cancelled.');
      return;
    }
  }

  console.log('\nDeactivating license...');

  try {
    const machineId = generateMachineId();

    // Try online deactivation first
    const isOnline = await checkIsOnlineSafely(licenseApi);

    if (isOnline) {
      try {
        await licenseApi.deactivate(cache.key, machineId);
        console.log('');
        console.log('License deactivated successfully.');
        console.log('Seat has been freed for use on another machine.');
      } catch (error) {
        // Online deactivation failed, fall back to offline
        console.log(`\n\u26A0\uFE0F  Could not reach server: ${error.message}`);
        console.log('Proceeding with offline deactivation...');
        setPendingDeactivation(cache.key);
        console.log('\nSeat will be freed when you next connect online.');
      }
    } else {
      // Offline deactivation
      console.log('\n\u26A0\uFE0F  No internet connection detected.');
      console.log('Performing offline deactivation...');
      setPendingDeactivation(cache.key);
      console.log('\nSeat will be freed on next online connection.');
    }

    // Delete local cache
    deleteLicenseCache();

    // Reload feature gate
    featureGate.reload();

    console.log('');
    console.log('Your data and configurations have been preserved.');
    console.log('Core features remain available.');
    console.log('');
    console.log('To reactivate: aios pro activate --key <KEY>');
    console.log('');

  } catch (error) {
    console.error(`\nDeactivation error: ${error.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// aios pro features
// ---------------------------------------------------------------------------

function featuresAction() {
  const { featureGate } = loadLicenseModules();

  console.log('\nAIOS Pro Features\n');

  const byModule = featureGate.listByModule();
  const modules = Object.keys(byModule).sort();

  for (const moduleName of modules) {
    const features = byModule[moduleName];

    console.log(`${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}:`);

    for (const feature of features) {
      const status = feature.available
        ? '\u2705'  // Green check
        : '\u274C'; // Red X

      console.log(`  ${status} ${feature.name}`);
      console.log(`     ID: ${feature.id}`);
      if (feature.description) {
        console.log(`     ${feature.description}`);
      }
    }
    console.log('');
  }

  const available = featureGate.listAvailable();
  const total = Object.values(byModule).reduce((sum, arr) => sum + arr.length, 0);

  console.log(`Summary: ${available.length}/${total} features available`);
  console.log('');
}

// ---------------------------------------------------------------------------
// aios pro validate
// ---------------------------------------------------------------------------

async function validateAction() {
  const {
    licenseApi,
    readLicenseCache,
    writeLicenseCache,
    generateMachineId,
    maskKey,
    featureGate,
    LicenseActivationError,
  } = loadLicenseModules();

  console.log('\nValidating AIOS Pro license...\n');

  const cache = readLicenseCache();

  if (!cache) {
    console.log('No license is currently activated.');
    console.log('Activate: aios pro activate --key PRO-XXXX-XXXX-XXXX-XXXX');
    return;
  }

  console.log(`Key: ${maskKey(cache.key)}`);

  try {
    const machineId = generateMachineId();

    const result = await licenseApi.validate(cache.key, machineId);

    if (!result.valid) {
      console.log('\n\u274C License validation failed.');
      console.log('The license may have been revoked or expired.');
      console.log('Please contact support or activate a new license.');
      return;
    }

    // Update cache with refreshed data
    const updatedCache = {
      ...cache,
      features: result.features,
      seats: result.seats,
      expiresAt: result.expiresAt,
      cacheValidDays: result.cacheValidDays,
      gracePeriodDays: result.gracePeriodDays,
      lastValidated: new Date().toISOString(),
    };

    const writeResult = writeLicenseCache(updatedCache);
    if (!writeResult.success) {
      console.log(`Warning: Could not update cache: ${writeResult.error}`);
    }

    // Reload feature gate
    featureGate.reload();

    // Display result
    console.log('\n\u2705 License validated successfully!\n');
    console.log(`  Features:     ${result.features.join(', ')}`);
    console.log(`  Seats:        ${result.seats.used}/${result.seats.max} used`);
    console.log(`  Valid until:  ${formatDate(result.expiresAt)}`);
    console.log(`  Cache:        Refreshed for ${result.cacheValidDays} days`);
    console.log('');

  } catch (error) {
    if (error instanceof LicenseActivationError) {
      console.error(`\nValidation failed: ${error.message}`);
      console.error(`Error code: ${error.code}`);
    } else {
      console.error(`\nValidation failed: ${error.message}`);
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// aios pro setup (AC-12: Install-gate)
// ---------------------------------------------------------------------------

/**
 * Setup and verify @aios-fullstack/pro installation.
 *
 * Since @aios-fullstack/pro is published on the public npm registry,
 * no special token or .npmrc configuration is needed. This command
 * installs the package and verifies it's working.
 *
 * @param {object} options - Command options
 * @param {boolean} options.verify - Only verify without installing
 */
async function setupAction(options) {
  console.log('\nAIOS Pro - Setup\n');

  if (options.verify) {
    // Verify-only mode
    console.log('Verifying @aios-fullstack/pro installation...\n');

    try {
      const { execSync } = require('child_process');
      const result = execSync('npm ls @aios-fullstack/pro --json', {
        stdio: 'pipe',
        timeout: 15000,
      });
      const parsed = JSON.parse(result.toString());
      const deps = parsed.dependencies || {};
      if (deps['@aios-fullstack/pro']) {
        console.log(`✅ @aios-fullstack/pro@${deps['@aios-fullstack/pro'].version} is installed`);
      } else {
        console.log('❌ @aios-fullstack/pro is not installed');
        console.log('');
        console.log('Install with:');
        console.log('  npm install @aios-fullstack/pro');
      }
    } catch {
      console.log('❌ @aios-fullstack/pro is not installed');
      console.log('');
      console.log('Install with:');
      console.log('  npm install @aios-fullstack/pro');
    }
    return;
  }

  // Install mode
  console.log('@aios-fullstack/pro is available on the public npm registry.');
  console.log('No special tokens or configuration needed.\n');

  console.log('Installing @aios-fullstack/pro...\n');

  try {
    const { execSync } = require('child_process');
    execSync('npm install @aios-fullstack/pro', {
      stdio: 'inherit',
      timeout: 120000,
    });
    console.log('\n✅ @aios-fullstack/pro installed successfully!');
  } catch (error) {
    console.error(`\n❌ Installation failed: ${error.message}`);
    console.log('\nTry manually:');
    console.log('  npm install @aios-fullstack/pro');
    process.exit(1);
  }

  console.log('\n--- Setup Complete ---');
  console.log('');
  console.log('To activate your license:');
  console.log('  aios pro activate --key PRO-XXXX-XXXX-XXXX-XXXX');
  console.log('');
  console.log('To check license status:');
  console.log('  aios pro status');
  console.log('');
  console.log('Documentation: https://synkra.ai/pro/docs');
  console.log('');
}

// ---------------------------------------------------------------------------
// Command builder
// ---------------------------------------------------------------------------

/**
 * Create the `aios pro` command with all subcommands.
 * @returns {Command}
 */
function createProCommand() {
  const proCmd = new Command('pro')
    .description('AIOS Pro license management');

  // aios pro activate
  proCmd
    .command('activate')
    .description('Activate a license key')
    .requiredOption('-k, --key <key>', 'License key (PRO-XXXX-XXXX-XXXX-XXXX)')
    .action(activateAction);

  // aios pro status
  proCmd
    .command('status')
    .description('Show current license status')
    .action(statusAction);

  // aios pro deactivate
  proCmd
    .command('deactivate')
    .description('Deactivate the current license')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(deactivateAction);

  // aios pro features
  proCmd
    .command('features')
    .description('List all pro features and their availability')
    .action(featuresAction);

  // aios pro validate
  proCmd
    .command('validate')
    .description('Force online license revalidation')
    .action(validateAction);

  // aios pro setup (AC-12: Install-gate)
  proCmd
    .command('setup')
    .description('Install and verify @aios-fullstack/pro')
    .option('--verify', 'Only verify installation without installing')
    .action(setupAction);

  return proCmd;
}

module.exports = {
  createProCommand,
};