const fs = require('fs');
const path = require('path');
const deepEqual = require('deep-equal');

const SchemaManager = require('./schema_manager.js');

const Logger = require('../logger.js');

class ConfigManager extends Logger {

  constructor () {
    super('ConfigManager', 'cyan');
  }

  getProcessEnv () {
    let env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
    return env;
  }

  cachePathname () {
    return path.join(SchemaManager.rootDirectory, SchemaManager.cacheDirectory, SchemaManager.cacheSchemaFile);
  }

  pathname () {
    return path.join(SchemaManager.rootDirectory, SchemaManager.rootDatabaseConfigFile);
  }

  __check__ () {
    if (!fs.existsSync(SchemaManager.rootDirectory)) {
      SchemaManager.checkdir(SchemaManager.rootDirectory);
    }
  }

  __create__ () {
    this.__check__();
    let pathname = this.pathname();
    if (!this.exists()) {
      fs.writeFileSync(pathname, JSON.stringify({}, null, 2));
    }
    return this.appendGitIgnore(pathname);
  }
  
  appendGitIgnore (pathname) {
    let gitignorePathname = '.gitignore';
    if (!fs.existsSync(gitignorePathname)) {
      let gitignore = Buffer.from([pathname].join('\n') + '\n');
      fs.writeFileSync(gitignorePathname, gitignore);
      this.log(`Created ".gitignore" containing "${pathname}"`);
    } else {
      let gitignore = fs.readFileSync(gitignorePathname);
      let lines = gitignore.toString()
        .split(/\r?\n/gi)
        .map(line => line.trim())
        .filter(line => !!line);
      if (lines.indexOf(pathname) === -1) {
        lines.push(pathname);
        this.log(`Appending "${pathname}" to ".gitignore" ...`);
        fs.writeFileSync(gitignorePathname, Buffer.from(lines.join('\n')) + '\n');
      }
    }
    return true;
  }

  destroyCache () {
    let pathname = this.cachePathname();
    if (fs.existsSync(pathname)) {
      fs.unlinkSync(pathname);
    }
    this.log(`Destroyed cached schema at "${pathname}"!`);
  }

  destroy () {
    let pathname = this.pathname();
    if (this.exists()) {
      fs.unlinkSync(pathname);
    }
    this.log(`Destroyed database credentials at "${pathname}"!`);
  }

  exists () {
    let pathname = this.pathname();
    return !!fs.existsSync(pathname);
  }

  write (env, name, dbCfg) {
    if (!env || !name || typeof env !== 'string' || typeof name !== 'string') {
      throw new Error(`env and name must be valid strings`);
    }
    try {
      this.constructor.validate(dbCfg, true);
    } catch (e) {
      throw new Error(`Could not write config for ["${env}"]["${name}"]:\n${e.message}`);
    }
    this.__create__();
    let cfg = this.load();
    cfg[env] = cfg[env] || {};
    cfg[env][name] = dbCfg;
    let pathname = this.pathname();
    fs.writeFileSync(pathname, JSON.stringify(cfg, null, 2));
    this.log(`Wrote database credentials to "${pathname}"["${env}"]["${name}"]!`);
  }

  load (envVars = null) {
    let pathname = this.pathname();
    if (!this.exists()) {
      throw new Error(`No database config file found at "${pathname}"`);
    }
    let buffer = fs.readFileSync(pathname);
    let json;
    try {
      json = JSON.parse(buffer.toString());
    } catch (e) {
      throw new Error(`Database config invalid at "${pathname}":\n${e.message}`);
    }
    let parsed;
    try {
      parsed = this.__parseEnvFromConfig__(json, envVars);
    } catch (e) {
      throw new Error(`Database config error "${pathname}"${e.message}`);
    }
    return parsed;
  }

  __parseEnvFromConfig__ (cfg, envVars = null, allowEmpty = false) {
    const prefix = '{{';
    const suffix = '}}';
    if (cfg && typeof cfg === 'object') {
      for (const key in cfg) {
        try {
          cfg[key] = this.__parseEnvFromConfig__(cfg[key], envVars, key === 'password');
        } catch (e) {
          throw new Error(`["${key}"]${e.message}`);
        }
      }
      return cfg;
    } else if (typeof cfg === 'string') {
      if (cfg.startsWith(prefix) && cfg.endsWith(suffix)) {
        envVars = envVars || process.env;
        const key = cfg.slice(prefix.length, -suffix.length).trim();
        if (!(key in envVars)) {
          throw new Error(`: No environment variable matching "${key}" found`);
        } else if (!envVars[key] && !allowEmpty) {
          throw new Error(`: Environment variable matching "${key}" is empty`);
        }
        return envVars[key];
      } else {
        return cfg;
      }
    } else {
      return cfg;
    }
  }

  read (env, name, envVars = null) {
    let pathname = this.pathname();
    this.__check__();
    let cfg = this.load(envVars);
    if (!env || !name) {
      throw new Error(`Must provide env and name`)
    } else if (!cfg[env]) {
      throw new Error(
        `Environment "${env}" not found in Database config at "${pathname}"\n` +
        `If you are using the Instant CLI, this can be remedied with \`instant db:add --env ${env}\``
      );
    } else if (!cfg[env][name]) {
      throw new Error(
        `Environment "${env}" database "${name}" not found in Database config at "${pathname}"\n` +
        `If you are using the Instant CLI, this can be remedied with \`instant db:add --env ${env} --db ${name}\``
      );
    }
    const config = this.constructor.validate(cfg[env][name]);
    // if tunnel.in_vpc is true it means that when deployed,
    // the database environment should be in a vpc and not need a tunnel
    const currentEnv = this.getProcessEnv();
    const isLiveEnvironment = (
      currentEnv === env &&
      currentEnv !== 'development'
    );
    if (isLiveEnvironment && config.in_vpc) {
      delete config.tunnel;
    }
    return config;
  }

  static validate (cfg, allowEnvVars) {
    let vcfg = {};
    let keys = Object.keys(cfg || {});
    if (!cfg || typeof cfg !== 'object') {
      throw new Error(`Invalid config: empty`);
    } else if ('connectionString' in cfg) {
      if (typeof cfg.connectionString !== 'string' || !cfg.connectionString) {
        throw new Error(
          `Could not validate database config:\n` +
          `If "connectionString" is provided, must be a non-empty string.`
        );
      }
      vcfg.connectionString = cfg.connectionString;
      if (keys.length > 1) {
        throw new Error(
          `Could not validate database config:\n` +
          `If "connectionString" is provided, can not provide other keys.`
        );
      }
    } else {
      let expectedKeys = {
        'host': 1,
        'port': 1,
        'user': 1,
        'password': 1,
        'database': 1,
        'ssl': 1,
        'in_vpc': 1,
        'tunnel': 1
      };
      let lookupKeys = Object.keys(expectedKeys);
      let unusedKey = keys.find(key => !expectedKeys[key]);
      if (unusedKey) {
        throw new Error(
          `Could not validate database config:\n` +
          `Invalid key "${unusedKey}"`
        );
      }
      for (const key of lookupKeys) {
        let value = cfg[key];
        if (key === 'password') {
          value = (value === void 0 || value === null || value === false)
            ? ''
            : value;
          if (typeof value !== 'string') {
            throw new Error(
              `Could not validate database config:\n` +
              `"password", if provided, must be a string`
            );
          }
          vcfg[key] = value;
        } else if (key === 'ssl') {
          value = (value === void 0 || value === null)
            ? false
            : value;
          if (
            value !== false &&
            value !== true &&
            value !== 'unauthorized' &&
            !deepEqual(value, {rejectUnauthorized: false})
          ) {
            throw new Error(
              `Could not validate database config:\n` +
              `"ssl", if provided, must be true, false or "unauthorized"`
            );
          }
          vcfg[key] = value;
        } else if (key === 'port') {
          if (
            allowEnvVars &&
            typeof value === 'string' &&
            value.startsWith('{{') &&
            value.endsWith('}}')
          ) {
            vcfg[key] = value;
          } else if (
            parseInt(value) !== parseFloat(value) ||
            isNaN(parseInt(value)) ||
            parseInt(value) < 1 ||
            parseInt(value) > 65535
          ) {
            throw new Error(
              `Could not validate database config:\n` +
              `"port" must be between 1 - 65535.`
            );
          } else {
            vcfg[key] = parseInt(value);
          }
        } else if (key === 'in_vpc') {
          if (value !== void 0 && typeof value !== 'boolean') {
            throw new Error(`"in_vpc" must be true or false`);
          }
          vcfg[key] = value;
        } else if (key === 'tunnel') {
          if (value) {
            if (!value.user || typeof value.user !== 'string') {
              throw new Error(`Missing or invalid SSH tunnel "user" in database configuration`);
            }
            if (!value.host || typeof value.host !== 'string') {
              throw new Error(`Missing or invalid SSH tunnel "host" in database configuration`);
            }
            if (value.private_key && typeof value.private_key !== 'string') {
              throw new Error(`Invalid SSH tunnel "private_key" in database configuration`);
            }
            vcfg[key] = value;
          } else {
            vcfg[key] = null;
          }
        } else if (!value || typeof value !== 'string') {
          throw new Error(
            `Could not validate database config:\n` +
            `"${key}" must be a non-empty string`
          );
        } else {
          vcfg[key] = value;
        }
      }
    }
    return vcfg;
  }

}

module.exports = ConfigManager;
