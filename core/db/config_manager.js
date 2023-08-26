const fs = require('fs');
const path = require('path');
const deepEqual = require('deep-equal');

const SchemaManager = require('./schema_manager.js');

const Logger = require('../logger.js');

class ConfigManager extends Logger {

  constructor () {
    super('ConfigManager', 'cyan');
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
    let gitignorePathname = '.gitignore';
    if (!fs.existsSync(gitignorePathname)) {
      let gitignore = Buffer.from(pathname + '\n');
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
        fs.writeFileSync(gitignorePathname, Buffer.from(lines.join('\n')) + '\n');
        this.log(`Appended "${pathname}" to ".gitignore"`);
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
      this.constructor.validate(dbCfg);
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

  load () {
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
    Object.keys(json).forEach(env => {
      Object.keys(json[env]).forEach(name => {
        try {
          this.constructor.validate(json[env][name]);
        } catch (e) {
          throw new Error(`Database config invalid at "${pathname}" for ["${env}"]["${name}"]:\n${e.message}`);
        }
      });
    });
    return json;
  }

  read (env, name) {
    this.__check__();
    let cfg = this.load();
    if (!env || !name) {
      throw new Error(`Must provide env and name`)
    } else if (!cfg[env]) {
      throw new Error(`Environment "${env}" not found in Database config at "${pathname}"`);
    } else if (!cfg[env][name]) {
      throw new Error(`Environment "${env}" database "${name}" not found in Database config at "${pathname}"`);
      return this.constructor.validate(cfg[env][name]);
    }
  }

  static validate (cfg) {
    let vcfg = {};
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
      if (Object.keys(cfg).length > 1) {
        throw new Error(
          `Could not validate database config:\n` +
          `If "connectionString" is provided, can not provide other keys.`
        );
      }
    } else {
      let keys = ['host', 'port', 'user', 'password', 'database', 'ssl'];
      let unusedKey = Object.keys(cfg).find(key => keys.indexOf(key) === -1);
      if (unusedKey) {
        throw new Error(
          `Could not validate database config:\n` +
          `Invalid key "${unusedKey}"`
        );
      }
      keys.forEach(key => {
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
            parseInt(value) !== parseFloat(value) ||
            isNaN(parseInt(value)) ||
            parseInt(value) < 1 ||
            parseInt(value) > 65535
          ) {
            throw new Error(
              `Could not validate database config:\n` +
              `"port" must be between 1 - 65535.`
            );
          }
          vcfg[key] = parseInt(value);
        } else if (!value || typeof value !== 'string') {
          throw new Error(
            `Could not validate database config:\n` +
            `"${key}" must be a non-empty string`
          );
        } else {
          vcfg[key] = value;
        }
      });
    }
    return vcfg;
  }

}

module.exports = ConfigManager;
