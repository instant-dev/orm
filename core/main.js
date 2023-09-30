const fs = require('fs');

const inflect = require('i')();
const { VectorManager } = require('@instant.dev/vectors');

const Logger = require('./logger.js');

/**
* Instant ORM
* @class
*/
class InstantORM extends Logger {

  static Core = {
    DB: {
      Database: require('./db/database.js'),
      SchemaManager: require('./db/schema_manager.js'),
      MigrationManager: require('./db/migrator/migration_manager.js'),
      Migration: require('./db/migrator/migration.js'),
      ConfigManager: require('./db/config_manager.js')
    },
    APIResponse: require('./lib/api_response.js'),
    GraphQuery: require('./lib/graph_query.js'),
    ItemArray: require('./lib/item_array.js'),
    Model: require('./lib/model.js'),
    ModelArray: require('./lib/model_array.js'),
    ModelFactory: require('./lib/model_factory.js'),
    ModelGenerator: require('./lib/model_generator.js'),
    RelationshipGraph: require('./lib/relationship_graph.js').RelationshipGraph,
    PluginsManager: require('./lib/plugins_manager.js'),
    VectorManager: VectorManager
  };

  /**
   * Create a new Instant ORM instance
   */
  constructor () {
    super('Instant', 'blue');
    this.__initialize__();
  }

  /**
   * @private
   */
  __initialize__ () {
    this.Config = new this.constructor.Core.DB.ConfigManager();
    this.Plugins = new this.constructor.Core.PluginsManager();
    this.Vectors = new this.constructor.Core.VectorManager();
    this.__loadEnv__();
    /**
     * @private
     */
    this._databases = {
      'main': null,
      'readonly': null
    };
    /**
     * @private
     */
    this._Schema = null;
    /**
     * @private
     */
    this._Migrator = null;
    /**
     * @private
     */
    this._Generator = null;
    /**
     * @private
     */
    this._Models = {};
  }

  /**
   * @private
   */
  __loadEnv__ () {
    const cwd = process.cwd();
    this.envFile = `.${this.Config.getProcessEnv()}.env`;
    if (fs.existsSync(this.envFile)) {
      require('dotenv').config({path: this.envFile});
      this.log(`Loaded process.env from "${this.envFile}"`);
    }
  }

  /**
   * Reads environment variables from appropriate .[environment].env file
   * @returns {array} entries
   */
  readEnv () {
    if (fs.existsSync(this.envFile)) {
      let lines = fs.readFileSync(this.envFile).toString().split('\n');
      return lines
        .filter(line => !!line.trim())
        .map(line => {
          let values = line.split('=');
          let key = values.shift();
          return {key, value: values.join('')};
        });
    } else {
      return [];
    }
  }

  /**
   * Writes an environment variable to appropriate .[environment].env file
   * @param {string} key 
   * @param {string} value 
   */
  writeEnv (key, value) {
    value = ((value || '') + '');
    let entries = this.readEnv();
    let entry = entries.find(entry => entry.key === key);
    if (entry) {
      entry.value = value;
    } else {
      entries.push({key, value});
    }
    this.log(`Writing "${key}=${value}" to "${this.envFile}" ...`);
    fs.writeFileSync(this.envFile, entries.map(entry => `${entry.key}=${entry.value}`).join('\n') + '\n');
    this.Config.appendGitIgnore(this.envFile);
  }

  /**
   * @private
   */
  __checkConnection__ () {
    if (!this._databases['main']) {
      throw new Error(`You are not connected to a main database: use .connect()`);
    }
    return true;
  }

  /**
   * @private
   */
  __checkSchema__ () {
    if (!this._Schema) {
      throw new Error(`You have not specified a schema: use .setSchema()`);
    }
  }

  /**
   * Retrieve the root installation directory
   * @returns {string}
   */
  filesystemRoot () {
    return this.constructor.Core.DB.SchemaManager.rootDirectory;
  }

  /**
   * Check if Instant Migrations have been initialized in the filesystem
   * @returns {boolean}
   */
  isFilesystemInitialized () {
    return !!fs.existsSync(this.filesystemRoot());
  }

  /**
   * Connect to a database and loads a schema
   * If cfg is not provided, will load "main" configuration from "./_instant/db.json"
   * If schema is not provided, will load schema automatically
   * If schema is provided as `null`, no schema will be loaded
   * @param {?import('./types').DatabaseConfig} cfg Connection configuration for the main db
   * @param {?object} schema Schema details, see #setSchema()
   * @returns {Promise<import('./db/database')>}
   */
  async connect (cfg, schema) {
    // Reset vectors and plugins...
    this.Vectors.__initialize__();
    await this.Plugins.load();
    if (cfg === void 0 && schema === void 0 && this._databases['main']) {
      await this.Plugins.execute(this);
      return this._databases['main'];
    } else {
      let db = await this.addDatabase('main', cfg);
      await this.Plugins.execute(this);
      if (schema === null) {
        // Load an empty schema if it's null
        await this.setSchema(this.constructor.Core.DB.SchemaManager.emptySchema());
      } else {
        // Otherwise load a schema automatically
        // Do not fall back to the cache if a config is manually provided
        const useCache = cfg === void 0;
        await this.setSchema(schema, useCache);
      }
      return db;
    }
  }

  /**
   * Creates a standalone SSH tunnel to a database, if applicable
   * @param {import('./types').DatabaseConfig} cfg Connection configuration for the main db
   */
  async tunnel (cfg) {
    const db = new this.constructor.Core.DB.Database('tunnel');
    db.enableLogs(this._logLevel); // Pass through logging
    return db.tunnel(cfg);
  }

  /**
   * Disconnects from all databases
   * @returns {boolean}
   */
  disconnect () {
    let names = Object.keys(this._databases)
      .filter(name => name !== 'main' && this._databases[name])
      .forEach(name => this.closeDatabase(name));
    this._databases['main'] && this.closeDatabase('main');
    this.__initialize__();
    return true;
  }

  /**
   * Enables logging, different levels of logging are provided
   * @param {0|1|2|3|4} logLevel DISABLED=0, ERRORS_ONLY=1, SYSTEM_LOGS=2, INFO_LOGS=3, QUERY_LOGS=4
   * @returns {0|1|2|3|4}
   */
  enableLogs (logLevel) {
    super.enableLogs(logLevel);
    Object.keys(this._databases)
      .filter(name => this._databases[name])
      .forEach(name => {
        this._databases[name].enableLogs(logLevel);
      });
    this._Migrator && this._Migrator.enableLogs(logLevel);
    this._Generator && this._Generator.enableLogs(logLevel);
    this.Config && this.Config.enableLogs(logLevel);
    return logLevel;
  }

  /**
   * Connects to another database. Must be connected via `.connect()` first.
   * If no configuration is provided, will rely on configuration in "./_instant/db.json"
   * @param {string} name Alias of the database when using .database()
   * @param {?import('./types').DatabaseConfig} cfg
   * @returns {Promise<import('./db/database')>}
   */
  async addDatabase (name, cfg) {
    if (name !== 'main') {
      this.__checkConnection__();
    }
    if (this._databases[name]) {
      throw new Error(`You are already connected to a database "${name}", please close that database first.`);
    }
    if (!cfg) {
      if (this.Config.exists()) {
        let env = this.Config.getProcessEnv();
        this.log(`Loading database configuration from: "${this.Config.pathname()}"["${env}"]["${name}"]`);
        cfg = this.Config.read(env, name);
      } else {
        throw new Error(`Missing database configuration in "${this.Config.pathname()}".`);
      }
    }
    const db = new this.constructor.Core.DB.Database(name);
    db.enableLogs(this._logLevel); // Pass through logging
    await db.connect(cfg);
    this._databases[name] = db;
    return this._databases[name];
  }

  /**
   * Disconnects from a specific database
   * @param {string} name 
   * @returns {boolean}
   */
  closeDatabase (name) {
    this.__checkConnection__();
    const db = this.database(name);
    db.close();
    if (!this._databases[name]) {
      throw new Error(`Could not close database "${name}", not connected`);
    }
    if (name === 'main' || name === 'readonly') {
      this._databases[name] = null;
    } else {
      delete this._databases[name];
    }
    return true;
  }

  /**
   * Access a database directly
   * @param {string} name alias you connected with
   * @returns {import('./db/database')}
   */
  database (name = 'main') {
    this.__checkConnection__();
    if (!this._databases[name]) {
      throw new Error(`Could not find database "${name}"`)
    }
    return this._databases[name];
  }

  /**
   * Loads a schema from a JSON object, file, URL, or directly from the db.
   * If src is undefined, it will automatically detect schema from the database;
   * first by checking "schema_migrations" table, and if that fails by
   * introspecting the database structure
   * @param {?object} schema Schema to load
   * @param {boolean} useCache Should we use the cached filesystem value, if available
   * @returns {import('./db/schema_manager')}
   */
  async setSchema (src, useCache = true) {
    this.__checkConnection__();
    const db = this._databases['main'];
    let json;
    if (this._Schema) {
      throw new Error(`Schema already loaded`);
    }
    if (src === void 0) {
      // If we don't provide an argument, we'll try to automatically determine
      // the schema from the database
      let tmpSchema = new this.constructor.Core.DB.SchemaManager(db);
      let tmpMigrator = new this.constructor.Core.DB.MigrationManager(tmpSchema);
      useCache && this.log(`Checking to see if schema is cached...`);
      if (useCache && tmpSchema.isCacheAvailable()) {
        this.log(`Schema retrieved from cache at "${tmpSchema.getCacheFilename()}"!`);
        json = this.constructor.Core.DB.SchemaManager.readSchemaFile(tmpSchema.getCacheFilename());
      } else {
        this.log(`No cached schema, checking to see if migrations enabled...`);
        let hasMigrationsEnabled = await tmpMigrator.isEnabled();
        if (hasMigrationsEnabled) {
          this.log(`Migrations enabled! Fetching schema...`);
          json = await tmpMigrator.getLatestSchema();
          if (!json) {
            this.log(`No valid migration, introspecting schema...`);
            json = await tmpMigrator.getIntrospectSchema();
            this.log(`Schema retrieved from introspection!`);
          } else {
            this.log(`Schema retrieved from migrations!`);
          }
        } else {
          this.log(`Migrations not enabled, introspecting schema...`);
          json = await tmpMigrator.getIntrospectSchema();
          this.log(`Schema retrieved from introspection!`);
        }
      }
    } else if (!src) {
      throw new Error(`Invalid schema provided: ${src}`);
    } else if (typeof src === 'string') {
      if (src.match(/^\.{0,2}\//)) {
        // If it's a filename, load it locally...
        json = this.constructor.Core.DB.SchemaManager.readSchemaFile(src);
      } else {
        // Treat it as a URL
        let url = schema;
        throw new Error(`Coming soon: load schema from URL`);
      }
    } else if (typeof src === 'object') {
      json = src;
    } else {
      throw new Error(`Invalid schema provided: ${src}`);
    }
    this._Schema = new this.constructor.Core.DB.SchemaManager(db, this.Vectors);
    await this._Schema.setSchema(json);
    this._Migrator = new this.constructor.Core.DB.MigrationManager(this._Schema);
    this._Migrator.enableLogs(this._logLevel); // Pass through logging
    this._Generator = new this.constructor.Core.ModelGenerator();
    this._Generator.enableLogs(this._logLevel); // Pass through logging
    return this._Schema;
  }

  /**
   * @returns {import('./db/schema_manager')}
   */
  get Schema () {
    this.__checkConnection__();
    this.__checkSchema__();
    return this._Schema;
  }

  /**
   * @returns {import('./db/migrator/migration_manager')}
   */
  get Migrator () {
    this.__checkConnection__();
    this.__checkSchema__();
    return this._Migrator;
  }

  /**
   * @returns {import('./lib/model_generator')}
   */
  get Generator () {
    this.__checkConnection__();
    this.__checkSchema__();
    return this._Generator;
  }

  /**
   * Retrieve a specific Model class
   * @param {string} name
   * @returns {typeof import('./lib/model')}
   */
  Model (name) {
    this.__checkConnection__();
    this.__checkSchema__();
    return this._Schema.getModel(name);
  }

  /**
   * Retrieve a specific ModelFactory to generate multiple models at once
   * @param {string} name 
   * @returns {import('./lib/model_factory')}
   */
  ModelFactory (name) {
    const Model = this.Model(name);
    const modelFactory = new this.constructor.Core.ModelFactory(Model);
    return modelFactory;
  }

};

module.exports = InstantORM;
