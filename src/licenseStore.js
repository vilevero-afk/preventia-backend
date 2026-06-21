import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const LICENSE_COLUMNS = [
  'id', 'email', 'password_hash', 'plan', 'license_type', 'billing_cycle', 'status', 'end_date',
  'max_devices', 'monthly_simple_documents_limit', 'monthly_risk_analysis_limit',
  'used_simple_documents_this_month', 'used_risk_analysis_this_month', 'current_period',
  'allowed_features', 'stripe_customer_id', 'stripe_subscription_id', 'first_name', 'last_name',
  'company_name', 'vat_number', 'billing_address', 'created_at', 'updated_at',
];

const FIELD_MAP = {
  password_hash: 'passwordHash', license_type: 'licenseType', billing_cycle: 'billingCycle',
  end_date: 'endDate', max_devices: 'maxDevices',
  monthly_simple_documents_limit: 'monthlySimpleDocumentsLimit',
  monthly_risk_analysis_limit: 'monthlyRiskAnalysisLimit',
  used_simple_documents_this_month: 'usedSimpleDocumentsThisMonth',
  used_risk_analysis_this_month: 'usedRiskAnalysisThisMonth', current_period: 'currentPeriod',
  allowed_features: 'allowedFeatures', stripe_customer_id: 'stripeCustomerId',
  stripe_subscription_id: 'stripeSubscriptionId', first_name: 'firstName', last_name: 'lastName',
  company_name: 'companyName', vat_number: 'vatNumber', billing_address: 'billingAddress',
  created_at: 'createdAt', updated_at: 'updatedAt',
};

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function publicLicense(license) {
  if (!license) return null;
  const { passwordHash: _passwordHash, password_hash: _passwordHashSnake, password: _password, ...safe } = license;
  return safe;
}

export class LicenseStore {
  constructor({ databaseUrl = process.env.DATABASE_URL, jsonPath, pool } = {}) {
    this.databaseUrl = databaseUrl || '';
    this.jsonPath = jsonPath || process.env.USER_LICENSE_STORE_PATH || path.resolve('data/user_licenses.json');
    this.pool = pool || (this.databaseUrl ? new pg.Pool({ connectionString: this.databaseUrl, ssl: sslConfig(this.databaseUrl) }) : null);
    this.mode = this.pool ? 'postgres' : 'json';
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return this;
    if (this.pool) {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_licenses (
          id text PRIMARY KEY,
          email text UNIQUE NOT NULL,
          password_hash text NOT NULL,
          plan text,
          license_type text,
          billing_cycle text,
          status text,
          end_date text,
          max_devices integer,
          monthly_simple_documents_limit integer,
          monthly_risk_analysis_limit integer,
          used_simple_documents_this_month integer DEFAULT 0,
          used_risk_analysis_this_month integer DEFAULT 0,
          current_period text,
          allowed_features jsonb,
          stripe_customer_id text,
          stripe_subscription_id text,
          first_name text,
          last_name text,
          company_name text,
          vat_number text,
          billing_address jsonb,
          created_at text,
          updated_at text
        );
        CREATE TABLE IF NOT EXISTS license_devices (
          id text PRIMARY KEY,
          user_license_id text REFERENCES user_licenses(id) ON DELETE CASCADE,
          device_id text NOT NULL,
          device_name text,
          platform text,
          app_version text,
          activated_at text,
          last_seen_at text,
          UNIQUE(user_license_id, device_id)
        );
      `);
      await this.migrateJson();
    } else if (!fs.existsSync(this.jsonPath)) {
      this.writeJson({ userLicenses: [] });
    }
    this.initialized = true;
    return this;
  }

  async migrateJson() {
    if (!fs.existsSync(this.jsonPath)) return 0;
    const licenses = this.readJson().userLicenses;
    let migrated = 0;
    for (const license of licenses) {
      if (!normalizeEmail(license.email) || !license.passwordHash) continue;
      const migratedLicense = { ...license, id: license.id || crypto.randomUUID(), email: normalizeEmail(license.email) };
      const result = await this.insertPostgres(migratedLicense, true);
      if (result) {
        migrated += 1;
        for (const device of Array.isArray(license.activatedDevices) ? license.activatedDevices : []) {
          await this.insertDevicePostgres(migratedLicense.id, device);
        }
      }
    }
    return migrated;
  }

  async list() {
    await this.init();
    if (!this.pool) return this.readJson().userLicenses;
    const { rows } = await this.pool.query('SELECT * FROM user_licenses ORDER BY created_at, id');
    return Promise.all(rows.map((row) => this.hydrateRow(row)));
  }

  async findByEmail(email) {
    await this.init();
    const normalized = normalizeEmail(email);
    if (!this.pool) return this.readJson().userLicenses.find((item) => normalizeEmail(item.email) === normalized) || null;
    const { rows } = await this.pool.query('SELECT * FROM user_licenses WHERE email = $1', [normalized]);
    return rows[0] ? this.hydrateRow(rows[0]) : null;
  }

  async findById(id) {
    await this.init();
    if (!this.pool) return this.readJson().userLicenses.find((item) => item.id === id) || null;
    const { rows } = await this.pool.query('SELECT * FROM user_licenses WHERE id = $1', [id]);
    return rows[0] ? this.hydrateRow(rows[0]) : null;
  }

  async findByStripe({ subscriptionId, customerId }) {
    await this.init();
    if (!this.pool) {
      return this.readJson().userLicenses.find((item) =>
        (subscriptionId && item.stripeSubscriptionId === subscriptionId) ||
        (customerId && item.stripeCustomerId === customerId)) || null;
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM user_licenses
       WHERE ($1::text <> '' AND stripe_subscription_id = $1)
          OR ($2::text <> '' AND stripe_customer_id = $2)
       LIMIT 1`, [subscriptionId || '', customerId || ''],
    );
    return rows[0] ? this.hydrateRow(rows[0]) : null;
  }

  async create(license) {
    await this.init();
    const { password: _clearPassword, password_hash: _snakeHash, ...input } = license;
    const record = { ...input, id: license.id || crypto.randomUUID(), email: normalizeEmail(license.email) };
    if (!record.passwordHash) throw new Error('passwordHash est obligatoire.');
    if (!this.pool) {
      const data = this.readJson();
      if (data.userLicenses.some((item) => normalizeEmail(item.email) === record.email)) return null;
      data.userLicenses.push(record);
      this.writeJson(data);
      return record;
    }
    return this.insertPostgres(record, true);
  }

  async save(license) {
    await this.init();
    const { password: _clearPassword, password_hash: _snakeHash, ...safeLicense } = license;
    if (!this.pool) {
      const data = this.readJson();
      const index = data.userLicenses.findIndex((item) => item.id === safeLicense.id);
      if (index < 0) throw new Error('Licence utilisateur introuvable.');
      data.userLicenses[index] = safeLicense;
      this.writeJson(data);
      return safeLicense;
    }
    const values = rowValues(safeLicense);
    const updates = LICENSE_COLUMNS.slice(1).map((column, index) => `${column} = $${index + 2}`).join(', ');
    const { rows } = await this.pool.query(
      `UPDATE user_licenses SET ${updates} WHERE id = $1 RETURNING *`,
      [values[0], ...values.slice(1)],
    );
    return rows[0] ? this.hydrateRow(rows[0]) : null;
  }

  async resetPassword(email, passwordHash) {
    const license = await this.findByEmail(email);
    if (!license) return null;
    license.passwordHash = passwordHash;
    license.updatedAt = new Date().toISOString();
    return this.save(license);
  }

  async addDevice(userLicense, deviceInfo = {}) {
    await this.init();
    const deviceId = String(deviceInfo.deviceId || '').trim().slice(0, 160);
    if (!deviceId) return { ok: false, error: 'Identifiant appareil requis.' };
    if (!this.pool) {
      const devices = Array.isArray(userLicense.activatedDevices) ? userLicense.activatedDevices : [];
      const existing = devices.find((device) => device.deviceId === deviceId);
      const now = new Date().toISOString();
      if (existing) {
        Object.assign(existing, cleanDevice(deviceInfo), { deviceId, lastSeenAt: now });
        userLicense.activatedDevices = devices;
        userLicense.updatedAt = now;
        await this.save(userLicense);
        return { ok: true, activated: false, license: userLicense };
      }
      if (devices.length >= Number(userLicense.maxDevices || 0)) {
        return { ok: false, error: 'Limite d’appareils atteinte pour cette licence.' };
      }
      devices.push({ ...cleanDevice(deviceInfo), deviceId, activatedAt: now, lastSeenAt: now });
      userLicense.activatedDevices = devices;
      userLicense.updatedAt = now;
      await this.save(userLicense);
      return { ok: true, activated: true, license: userLicense };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const licenseResult = await client.query('SELECT max_devices FROM user_licenses WHERE id = $1 FOR UPDATE', [userLicense.id]);
      if (!licenseResult.rows[0]) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'Licence utilisateur introuvable.' };
      }
      const existing = await client.query(
        'SELECT id FROM license_devices WHERE user_license_id = $1 AND device_id = $2', [userLicense.id, deviceId],
      );
      const now = new Date().toISOString();
      if (existing.rows[0]) {
        const info = cleanDevice(deviceInfo);
        await client.query(
          `UPDATE license_devices SET
             device_name = COALESCE(NULLIF($3, ''), device_name),
             platform = COALESCE(NULLIF($4, ''), platform),
             app_version = COALESCE(NULLIF($5, ''), app_version),
             last_seen_at = $6
           WHERE user_license_id = $1 AND device_id = $2`,
          [userLicense.id, deviceId, info.deviceName, info.platform, info.appVersion, now],
        );
        await client.query('UPDATE user_licenses SET updated_at = $2 WHERE id = $1', [userLicense.id, now]);
        await client.query('COMMIT');
        return { ok: true, activated: false, license: await this.findById(userLicense.id) };
      }
      const count = await client.query('SELECT count(*)::integer AS count FROM license_devices WHERE user_license_id = $1', [userLicense.id]);
      if (count.rows[0].count >= Number(licenseResult.rows[0].max_devices || 0)) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'Limite d’appareils atteinte pour cette licence.' };
      }
      await this.insertDevicePostgres(userLicense.id, { ...deviceInfo, deviceId, activatedAt: now, lastSeenAt: now }, client);
      await client.query('UPDATE user_licenses SET updated_at = $2 WHERE id = $1', [userLicense.id, now]);
      await client.query('COMMIT');
      return { ok: true, activated: true, license: await this.findById(userLicense.id) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async removeDevice(userLicenseId, deviceId) {
    await this.init();
    const normalized = String(deviceId || '').trim().slice(0, 160);
    const license = await this.findById(userLicenseId);
    if (!license) return null;
    if (!this.pool) {
      license.activatedDevices = (license.activatedDevices || []).filter((device) => device.deviceId !== normalized);
      license.updatedAt = new Date().toISOString();
      return this.save(license);
    }
    await this.pool.query('DELETE FROM license_devices WHERE user_license_id = $1 AND device_id = $2', [userLicenseId, normalized]);
    await this.pool.query('UPDATE user_licenses SET updated_at = $2 WHERE id = $1', [userLicenseId, new Date().toISOString()]);
    return this.findById(userLicenseId);
  }

  async close() {
    if (this.pool) await this.pool.end();
  }

  readJson() {
    try {
      if (!fs.existsSync(this.jsonPath)) return { userLicenses: [] };
      const parsed = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
      return { userLicenses: Array.isArray(parsed.userLicenses) ? parsed.userLicenses : [] };
    } catch {
      return { userLicenses: [] };
    }
  }

  writeJson(data) {
    fs.mkdirSync(path.dirname(this.jsonPath), { recursive: true });
    const userLicenses = (data.userLicenses || []).map(({ password: _password, password_hash: _hash, ...license }) => license);
    fs.writeFileSync(this.jsonPath, `${JSON.stringify({ userLicenses }, null, 2)}\n`, 'utf8');
  }

  async insertPostgres(license, ignoreConflict = false) {
    const values = rowValues(license);
    const placeholders = LICENSE_COLUMNS.map((_, index) => `$${index + 1}`).join(', ');
    const conflict = ignoreConflict ? 'ON CONFLICT DO NOTHING' : '';
    const { rows } = await this.pool.query(
      `INSERT INTO user_licenses (${LICENSE_COLUMNS.join(', ')}) VALUES (${placeholders}) ${conflict} RETURNING *`, values,
    );
    return rows[0] ? this.hydrateRow(rows[0]) : null;
  }

  async insertDevicePostgres(userLicenseId, device, queryable = this.pool) {
    const info = cleanDevice(device);
    await queryable.query(
      `INSERT INTO license_devices
       (id, user_license_id, device_id, device_name, platform, app_version, activated_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (user_license_id, device_id) DO NOTHING`,
      [device.id || crypto.randomUUID(), userLicenseId, String(device.deviceId || '').trim(), info.deviceName,
        info.platform, info.appVersion, device.activatedAt || new Date().toISOString(), device.lastSeenAt || new Date().toISOString()],
    );
  }

  async hydrateRow(row) {
    const license = fromRow(row);
    const { rows } = await this.pool.query('SELECT * FROM license_devices WHERE user_license_id = $1 ORDER BY activated_at, id', [row.id]);
    license.activatedDevices = rows.map(deviceFromRow);
    return license;
  }
}

function rowValues(license) {
  return LICENSE_COLUMNS.map((column) => {
    const key = FIELD_MAP[column] || column;
    const value = column === 'email' ? normalizeEmail(license[key]) : license[key];
    if (column === 'allowed_features') return JSON.stringify(Array.isArray(value) ? value : []);
    if (column === 'billing_address') return value ? JSON.stringify(value) : null;
    if (column.startsWith('used_')) return Number(value || 0);
    return value ?? null;
  });
}

function fromRow(row) {
  return Object.fromEntries(LICENSE_COLUMNS.map((column) => [FIELD_MAP[column] || column, row[column]]));
}

function deviceFromRow(row) {
  return {
    id: row.id, deviceId: row.device_id, deviceName: row.device_name || '', platform: row.platform || '',
    appVersion: row.app_version || '', activatedAt: row.activated_at, lastSeenAt: row.last_seen_at,
  };
}

function cleanDevice(device) {
  return {
    deviceName: String(device.deviceName || '').trim().slice(0, 120),
    platform: String(device.platform || '').trim().slice(0, 60),
    appVersion: String(device.appVersion || '').trim().slice(0, 40),
  };
}

function sslConfig(databaseUrl) {
  if (/localhost|127\.0\.0\.1/.test(databaseUrl)) return undefined;
  return { rejectUnauthorized: false };
}

export function createLicenseStore(options) {
  return new LicenseStore(options);
}
