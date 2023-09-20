const fs = require('fs');

const inflect = require('i')();

const Logger = require('./logger.js');

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
    RelationshipGraph: require('./lib/relationship_graph.js')
  };

  constructor () {
    super('Instant', 'blue');
    this.__initialize__();
  }

  __initialize__ () {
    this._databases = {
      'main': null,
      'readonly': null
    };
    this.Config = new this.constructor.Core.DB.ConfigManager();
    this._Schema = null;
    this._Migrator = null;
    this._Generator = null;
    this._Models = {};
  }

  filesystemRoot () {
    return this.constructor.Core.DB.SchemaManager.rootDirectory;
  }

  isFilesystemInitialized () {
    return !!fs.existsSync(this.filesystemRoot());
  }

  /**
   * Connect to a database and loads a schema
   * If `schema` is provided as null, will intentionally not load a schema;
   * you can use this to use Instant as a simple database client with built-in
   * transaction support without model functionality
   * @param {Object|String} cfg Connection configuration for the main db
   * @param {Object|String} schema Schema details, see #loadSchema()
   */
  async connect (cfg, schema) {
    let db = await this.addDatabase('main', cfg);
    if (schema !== null) {
      await this.loadSchema(schema);
    } else {
      await this.loadSchema(this.constructor.Core.DB.SchemaManager.emptySchema());
    }
    return db;
  }

  /**
   * Creates a standalone SSH tunnel to a database, if applicable
   * @param {Object|String} cfg Connection configuration for the main db
   */
  async tunnel (cfg) {
    const db = new this.constructor.Core.DB.Database('tunnel');
    db.enableLogs(this._logLevel); // Pass through logging
    return db.tunnel(cfg);
  }

  __checkConnection__ () {
    if (!this._databases['main']) {
      throw new Error(`You are not connected to a main database: use .connect()`);
    }
    return true;
  }

  __checkSchema__ () {
    if (!this._Schema) {
      throw new Error(`You have not specified a schema: use .loadSchema()`);
    }
  }

  disconnect () {
    let names = Object.keys(this._databases)
      .filter(name => name !== 'main' && this._databases[name])
      .forEach(name => this.closeDatabase(name));
    this._databases['main'] && this.closeDatabase('main');
    this.__initialize__();
    return true;
  }

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
  }

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
   * If src is a string beginning with "/", "./" or "../", it will attempt
   * to load the schema from a local file - you can use this to cache your
   * schema and speed up connections
   * If src is any other string, it will treat it like a URL and try
   * to download the schema from the URL provided
   * If src is an object, it will load the schema directly from the object
   * @param {Object|String|undefined} schema Schema to load
   */
  async loadSchema (src) {
    this.__checkConnection__();
    const db = this._databases['main'];
    let json;
    if (this._Schema) {
      throw new Error(`Schema already loaded`);
    }
    if (src === void 0) {
      // If we don't provide an argument, we'll try to automatically determine
      // the schema from the database
      let tmpSchema = new this.constructor.Core.DB.SchemaManager(db, this.constructor.Core.DB.SchemaManager.emptySchema());
      let tmpMigrator = new this.constructor.Core.DB.MigrationManager(tmpSchema);
      this.log(`Checking to see if schema is cached...`);
      if (tmpSchema.isCacheAvailable()) {
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
    this._Schema = new this.constructor.Core.DB.SchemaManager(db, json);
    this._Migrator = new this.constructor.Core.DB.MigrationManager(this._Schema);
    this._Migrator.enableLogs(this._logLevel); // Pass through logging
    this._Generator = new this.constructor.Core.ModelGenerator();
    this._Generator.enableLogs(this._logLevel); // Pass through logging
    return this._Schema;
  }

  get Schema () {
    this.__checkConnection__();
    this.__checkSchema__();
    return this._Schema;
  }

  get Migrator () {
    this.__checkConnection__();
    this.__checkSchema__();
    return this._Migrator;
  }

  get Generator () {
    this.__checkConnection__();
    this.__checkSchema__();
    return this._Generator;
  }

  Model (name) {
    this.__checkConnection__();
    this.__checkSchema__();
    return this._Schema.getModel(name);
  }

};

const output = function () {
  return new InstantORM();
};
output.InstantORM = InstantORM;
module.exports = output;
