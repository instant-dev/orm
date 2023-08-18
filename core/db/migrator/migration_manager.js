const SchemaManager = require('../schema_manager.js');
const MigrationManagerDangerous = require('./migration_manager_dangerous.js');
const Migration = require('./migration.js');

const Logger = require('../../logger.js');

const deepEqual = require('deep-equal');

class MigrationManager extends Logger {

  constructor (Schema) {
    super('MigrationManager', 'magenta');
    if (!(Schema instanceof SchemaManager)) {
      throw new Error('MigrationManager requires valid SchemaManager');
    }
    this._Schema = Schema;
    this._Dangerous = null;
  }

  /**
   * Getter for dangerous (database-altering) functionality
   */
  get Dangerous () {
    if (!this._Dangerous) {
      throw new Error(`Dangerous mode disabled. Are you sure you want to use this?`);
    }
    return this._Dangerous;
  }

  enableDangerous () {
    this._Dangerous = new MigrationManagerDangerous(this);
  }

  disableDangerous () {
    this._Dangerous = null;
  }

  /**
   * ============================
   *  Schema retrieval functions
   * ============================
   */

  async isEnabled () {
    let result = await this._Schema.db.query(
      `SELECT "table_name" FROM "information_schema"."tables" WHERE "table_schema" = 'public' AND "table_name" = $1`,
      [this._Schema.migrationsTable]
    );
    return !!(result.rows[0] && result.rows[0].table_name === this._Schema.migrationsTable);
  }

  async getMigrations () {
    let result = await this._Schema.db.query(
      `SELECT "${this._Schema.migrationsTable}"."id", "${this._Schema.migrationsTable}"."schema", "${this._Schema.migrationsTable}"."commands" FROM "${this._Schema.migrationsTable}" ORDER BY "id" ASC LIMIT 1`,
      []
    );
    return result.rows;
  }

  async getLatestSchema () {
    let result = await this._Schema.db.query(
      `SELECT "${this._Schema.migrationsTable}"."schema" FROM "${this._Schema.migrationsTable}" ORDER BY "id" DESC LIMIT 1`,
      []
    );
    if (!result.rows.length) {
      return null;
    } else {
      return this._Schema.constructor.validate(result.rows[0].schema);
    }
  }

  /**
   * Introspect the schema directly from the database
   */
  async getIntrospectSchema () {
    let schema = await this._Schema.db.adapter.introspect(this._Schema.migrationsTable);
    return this._Schema.constructor.validate(schema);
  }

  /**
   * =====================
   *  Create a migration
   * =====================
   */

  async create (id, name = '') {
    if (!id) {
      id = Migration.generateMigrationId();
    }
    id = Migration.validateMigrationId(id);
    let isEnabled = await this.isEnabled();
    if (!isEnabled) {
      throw new Error(`Could not create new migration: Your database does not yet have migrations enabled. Try running "prepare".`);
    }
    let migrations = await this.getMigrations();
    if (!migrations.length) {
      throw new Error(`Could not create new migration: Your database does not yet have migrations initialized. Try running "initialize".`);
    }
    let initJSON = SchemaManager.emptySchema();
    // If the first commands entry is empty, it was initialized
    // This should always be the case, but let's gracefully handle it if it's not
    if (!migrations[0].commands) {
      initJSON = migrations[0].schema;
      migrations = migrations.slice(1);
    }
    // NOTE: Must create tmpSchema, we make changes as we add commands
    const tmpSchema = new SchemaManager(this._Schema.db, initJSON);
    migrations.forEach(migrationJSON => {
      if (!migrationJSON.commands) {
        throw new Error(`Could not create new migration: Invalid migration in database for migration(id=${migrationJSON.id}):\nMigration commands empty.`);
      }
      migrationJSON.commands.up.forEach(command => {
        try {
          Migration.validateCommand(command, this.db);
        } catch (e) {
          throw new Error(`Could not create new migration: Invalid command in database for migration(id=${migrationJSON.id}):\n` + e.message);
        }
        tmpSchema[command[0]].apply(tmpSchema, command.slice(1));
      });
    });
    if (!deepEqual(tmpSchema.schema, this._Schema.schema)) {
      throw new Error(
        `Could not create new migration: your current schema doesn't match the database schema.\n` +
        `This usually means you loaded an alternate schema for testing ` +
        `or one for a different Database.`
      );
    }
    let migration = new Migration(id, name, tmpSchema, this);
    migration.enableLogs(this._logLevel);
    return migration;
  }

  /**
   * =====================
   *  Migration functions
   * =====================
   */

  setSchema (schema) {
    this._Schema.setSchema(schema);
    let tableObject = this._Schema.schema.tables;
    let tables = Object.keys(tableObject).map(name => tableObject[name]);
    let indices = this._Schema.schema.indices;
    let queries = [];
    queries = queries.concat(tables.map(table => this._Schema.db.adapter.generateCreateTableQuery(table.name, table.columns)));
    queries = queries.concat(indices.map(index => this._Schema.db.adapter.generateCreateIndexQuery(index.table, index.column, index.type)));
    return queries.join(';')
  }

  createTable (table, arrFieldData) {
    arrFieldData = this._Schema.createTable(table, arrFieldData);
    return this._Schema.db.adapter.generateCreateTableQuery(table, arrFieldData);
  }

  dropTable (table) {
    this._Schema.dropTable(table);
    return this._Schema.db.adapter.generateDropTableQuery(table);
  }

  renameTable (table, newTableName, renameModel, newModelName) {
    let modelSchema = this._Schema.renameTable(table, newTableName, renameModel, newModelName);
    return this._Schema.db.adapter.generateAlterTableRename(table, newTableName, modelSchema.columns);
  }

  alterColumn (table, column, type, properties) {
    properties = properties || {};
    this._Schema.alterColumn(table, column, type, properties);
    return this._Schema.db.adapter.generateAlterTableQuery(table, column, type, properties);
  }

  addColumn (table, column, type, properties) {
    properties = properties || {};
    this._Schema.addColumn(table, column, type, properties);
    return this._Schema.db.adapter.generateAlterTableAddColumnQuery(table, column, type, properties);
  }

  dropColumn (table, column) {
    this._Schema.dropColumn(table, column);
    return this._Schema.db.adapter.generateAlterTableDropColumnQuery(table, column);
  }

  renameColumn (table, column, newColumn) {
    this._Schema.renameColumn(table, column, newColumn);
    return this._Schema.db.adapter.generateAlterTableRenameColumnQuery(table, column, newColumn);
  }

  createIndex (table, column, type) {
    type = type || this._Schema.db.adapter.indexTypes[0];
    let index = this._Schema.createIndex(table, column, type);
    return this._Schema.db.adapter.generateCreateIndexQuery(table, column, type);
  }

  dropIndex (table, column) {
    this._Schema.dropIndex(table, column);
    return this._Schema.db.adapter.generateDropIndexQuery(table, column);
  }

  // TODO: Experimental. Currently unused.
  addForeignKey (table, referenceTable) {
    if (this._Schema.db.adapter.supportsForeignKey) {
      this._Schema.addForeignKey(table, referenceTable);
      return this._Schema.db.adapter.generateSimpleForeignKeyQuery(table, referenceTable);
    } else {
      throw new Error(`${this._Schema.db.adapter.constructor.name} does not support foreign keys`);
    }
  }

  // TODO: Experimental. Currently unused.
  dropForeignKey (table, referenceTable) {
    if (this._Schema.db.adapter.supportsForeignKey) {
      this._Schema.dropForeignKey(table, referenceTable);
      return this._Schema.db.adapter.generateDropSimpleForeignKeyQuery(table, referenceTable);
    } else {
      throw new Error(`${this._Schema.db.adapter.constructor.name} does not support foreign keys`);
    }
  }

};

module.exports = MigrationManager;
