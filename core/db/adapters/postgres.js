const inflect = require('i')();
const uuid = require('uuid');
const pg = require('pg');
const fs = require('fs');
pg.types.setTypeParser(20, v => v === null ? null : parseInt(v)); // 64-bit int
pg.types.setTypeParser(1700, v => v === null ? null : parseFloat(v)); // NUMERIC

const SQLAdapter = require('../sql_adapter.js');
const Transaction = require('../transaction.js');
const utilities = require('../../lib/utilities.js');

const POSTGRES_ERROR_CODES = {
  '23000': 'integrity_constraint_violation',
  '23001': 'restrict_violation',
  '23502': 'not_null_violation',
  '23503': 'foreign_key_violation',
  '23505': 'unique_violation',
  '23514': 'check_violation',
  '23P01': 'exclusion_violation',
  '3D000': 'database_does_not_exist'
};

class PostgresAdapter extends SQLAdapter {

  name = 'postgres';

  constructor (db, cfg) {
    super();
    cfg = this.parseConfig(cfg);
    this.db = db;
    this._config = cfg;
    this._tunnel = null;
    this._pool = null;
  }

  close () {
    this._pool.end();
    this._tunnel && this._tunnel.close();
    this.db.log('Closed');
  }

  async connect () {
    let cfg = this._config;
    if (cfg.tunnel) {
      let result = await this.connectToTunnel(cfg);
      cfg = result.config;
      this._tunnel = result.tunnel;
    }
    this.db.log(`Connecting to ${this.name}${this._config.database ? ` database "${this._config.database}"` : ``} as role "${this._config.user}" on ${this._config.host}:${this._config.port} ...`);
    this._pool = new pg.Pool(cfg);
    let client = await this.createClient();
    client.release();
    this.db.log(`Successfully connected to ${this.name}${this._config.database ? ` database "${this._config.database}"` : ``}!`);
    return true;
  }

  async connectToTunnel () {
    let config = JSON.parse(JSON.stringify(this._config));
    let tunnel = null;
    if (config.tunnel) {
      let tnl = await this.db.createTunnelFromConfig(config);
      tunnel = tnl.tunnel;
      delete config.tunnel;
      config.host = 'localhost';
      config.port = tnl.port;
      config.ssl = false;
    } else {
      throw new Error(`Could not connect to tunnel: no valid tunnel provided in config`);
    }
    return {config, tunnel};
  }

  /**
  * Error translation
  */
  readErrorCode (code) {
    return POSTGRES_ERROR_CODES[code] || 'sql_error';
  }

  /**
  * Transaction Functions
  */

  createTransaction (isSerializable = false) {
    return new Transaction(this, isSerializable);
  }

  async createClient () {
    let client;
    try {
      client = await this._pool.connect();
    } catch (err) {
      let code = err.code;
      let thrownError;
      if (code === 'ECONNREFUSED') {
        thrownError = new Error(`Database connection refused, your credentials may be invalid or the host may be down.`);
      } else if (POSTGRES_ERROR_CODES[code] === 'database_does_not_exist') {
        thrownError = new Error(`Database "${this._config.database}" does not exist.`);
      } else {
        thrownError = err;
      }
      throw thrownError;
    }
    return client;
  }

  async executeClient (client, identifier, query, params) {
    let result;
    let t;
    this.db.queryLog(`<${identifier}>`, query, params);
    const start = new Date().valueOf();
    try {
      result = await client.query(query, params);
      t = new Date().valueOf() - start;
      this.db.querySuccess(`<${identifier}> success (${t}ms)`);
    } catch (err) {
      t = new Date().valueOf() - start;
      this.db.queryError(`<${identifier}> failed (${t}ms): ${err.message}`, err);
      throw new Error(err.message);
    }
    return result;
  }

  async beginClient (client, identifier = `Txn`) {
    return this.executeClient(client, identifier, 'BEGIN', []);
  }

  async beginSerializableClient (client, identifier = `Txn`) {
    return this.executeClient(client, identifier, 'BEGIN ISOLATION LEVEL SERIALIZABLE', []);
  }

  async queryClient (client, query, params, identifier = `Txn`) {
    return this.executeClient(client, identifier, query, params);
  }

  async rollbackClient (client, identifier = `Txn`) {
    return this.executeClient(client, identifier, 'ROLLBACK', []);
  }

  async commitClient (client, identifier = `Txn`) {
    return this.executeClient(client, identifier, 'COMMIT', []);
  }

  /* Utility functions */

  async transact (preparedArray, txn = null) {
    if (!preparedArray.length) {
      throw new Error('Must give valid array of statements (with or without parameters)');
    }
    if (typeof preparedArray === 'string') {
      preparedArray = preparedArray.split(';')
        .filter(v => !!v)
        .map(v => [v]);
    }
    const newTransaction = !txn;
    if (newTransaction) {
      txn = new Transaction(this);
    }
    if (!(txn instanceof Transaction)) {
      throw new Error(`Invalid transaction`);
    }
    const requests = preparedArray.map(queryData => {
      if (typeof queryData === 'string') {
        queryData = [queryData];
      }
      if (!Array.isArray(queryData)) {
        throw new Error(`Invalid query: ${queryData}`);
      }
      let query = queryData[0];
      let params = queryData[1] || [];
      return {query, params};
    });
    const results = [];
    while (requests.length) {
      const request = requests.shift();
      try {
        const result = await txn.query(request.query, request.params);
        results.push(result);
      } catch (err) {
        if (newTransaction) {
          await txn.rollback();
        }
        let error = new Error(err.message);
        throw error;
      }
    }
    if (newTransaction) {
      await txn.commit();
    }
    return results;
  }

  /* Standalone query */

  async query (query, params) {
    if (arguments.length < 2) {
      throw new Error('.query requires 2 arguments');
    }
    if (!(params instanceof Array)) {
      throw new Error('params must be a valid array');
    }
    let client;
    let result;
    try {
      const identifier = `Query ${uuid.v4().split('-')[0]}`;
      const start = new Date().valueOf();
      client = await this.createClient();
      result = await this.queryClient(client, query, params, identifier);
      client.release();
    } catch (err) {
      if (client) {
        client.release();
      }
      throw err;
    }
    return result;
  }

  /* Command functions... */

  async drop (databaseName) {
    let result = await this.query(this.generateDropDatabaseQuery(databaseName), []);
    this.db.log(`Dropped database "${databaseName}"`);
    return result;
  }

  async create (databaseName) {
    let result = await this.query(this.generateCreateDatabaseQuery(databaseName), []);
    this.db.log(`Created empty database "${databaseName}"`);
    return result;
  }

  /* retrieves a schema */
  async introspect (migrationsTable) {
    let structureResult = await this.query(`
      SELECT
        "t"."table_schema" as "schema",
        "t"."table_name" as "name",
        ARRAY(
          SELECT
            JSON_BUILD_OBJECT(
              'name', "c"."column_name",
              'type', "c"."data_type",
              'sequence', (
                SELECT
                  JSON_BUILD_OBJECT(
                    'name', "s"."sequence_name",
                    'minimum_value', "s"."minimum_value",
                    'maximum_value', "s"."maximum_value",
                    'increment', "s"."increment",
                    'start_value', "s"."start_value",
                    'last_value', "pgs"."last_value"
                  )
                FROM
                  "information_schema"."sequences" AS "s"
                JOIN "pg_sequences" AS "pgs" ON
                    "pgs"."sequencename" = "s"."sequence_name"
                WHERE
                  ("s"."sequence_schema" || '.' || "s"."sequence_name") = pg_get_serial_sequence("t"."table_name", "c"."column_name")
                LIMIT 1
              ),
              'properties', JSON_BUILD_OBJECT(
                'nullable', (CASE WHEN "c"."is_nullable" = 'YES' THEN TRUE ELSE FALSE END),
                'maxLength', "c"."character_maximum_length"
              )
            ) AS "column"
          FROM
            "information_schema"."columns" AS "c"
          WHERE
            "c"."table_name" = "t"."table_name"
          ORDER BY
            "c"."ordinal_position" ASC
        ) AS "columns",
        ARRAY(
          SELECT
            JSON_BUILD_OBJECT(
              'name', "pgc"."conname",
              'type', "pgc"."contype",
              'column_name', (CASE WHEN ("pgc"."contype" = 'f') THEN "kcu"."column_name" ELSE "ccu"."column_name" END),
              'reference_table', (CASE WHEN ("pgc"."contype" = 'f') THEN "ccu"."table_name" ELSE (null) END),
              'reference_column', (CASE WHEN ("pgc"."contype" = 'f') THEN "ccu"."column_name" ELSE (null) END)
            )
          FROM
            "pg_catalog"."pg_constraint" AS "pgc"
          JOIN "pg_catalog"."pg_namespace" AS "nsp" ON "nsp"."oid" = "pgc"."connamespace"
          JOIN "pg_catalog"."pg_class" AS "cls" ON "pgc"."conrelid" = "cls"."oid"
          JOIN "information_schema"."key_column_usage" AS "kcu" ON "kcu"."constraint_name" = "pgc"."conname"
          LEFT JOIN "information_schema"."constraint_column_usage" AS "ccu" ON "pgc"."conname" = "ccu"."constraint_name"
          AND "nsp"."nspname" = "ccu"."constraint_schema"
          WHERE
            "kcu"."table_name" = "t"."table_name" AND
            "pgc"."contype" IN ('f', 'p', 'u')
        ) AS "constraints"
      FROM
        "information_schema"."tables" AS "t"
      WHERE
        "t"."table_type" = 'BASE TABLE' AND
        "t"."table_schema" NOT IN ('pg_catalog', 'information_schema') AND
        "t"."table_schema" = 'public' AND
        "t"."table_name" <> $1
      ORDER BY
        "t"."table_name" ASC
    `, [migrationsTable]);
    let indexResult = await this.query(`
      SELECT
        "pgi"."indexname" AS "name",
        "pgi"."tablename" AS "table",
        CAST(ARRAY(
          SELECT
            "pgat"."attname" AS "name"
          FROM
            "pg_catalog"."pg_attribute" AS "pgat"
          WHERE
            "pgat"."attrelid" = "pgt"."oid" AND
            "pgat"."attnum" = ANY("pgix"."indkey")
        ) AS text[]) AS "columns",
        "pga"."amname" AS "type",
        "pgix"."indisunique" AS "unique",
        "pgi"."indexdef" AS "definition"
      FROM
        "pg_catalog"."pg_indexes" AS "pgi"
      JOIN
        "pg_catalog"."pg_class" AS "pgc"
      ON
        "pgc"."relname" = "pgi"."indexname" AND
        "pgc"."relkind" = 'i'
      JOIN
        "pg_catalog"."pg_am" AS "pga"
      ON
        "pga"."oid" = "pgc"."relam"
      JOIN
        "pg_catalog"."pg_index" AS "pgix" ON
        "pgix"."indexrelid" = "pgc"."oid"
      JOIN
        "pg_catalog"."pg_class" AS "pgt"
      ON
        "pgt".oid = "pgix"."indrelid"
      WHERE
        "pgi"."schemaname" NOT IN ('pg_catalog', 'information_schema') AND
        "pgi"."schemaname" = 'public' AND
        "pgi"."tablename" <> $1
    `, [migrationsTable]);

    let tables = structureResult.rows;
    let indices = indexResult.rows;
    let foreignKeys = [];
    let schema = {
      migration_id: null,
      foreign_keys: [],
      indices: [],
      tables: {}
    };

    // First prepare models...
    const typePropertyDefaults = this.db.adapter.typePropertyDefaults;
    tables.forEach(table => {
      let model = schema.tables[table.name] = {
        name: table.name,
        columns: table.columns.map(column => {
          let c = {
            name: column.name,
            type: column.type,
            properties: {}
          };
          // Set appropriate properties
          Object.keys(column.properties).forEach(prop => {
            if (
              (prop in typePropertyDefaults) &&
              typePropertyDefaults[prop] !== column.properties[prop]
            ) {
              c.properties[prop] = column.properties[prop];
            }
          });
          if (column.sequence) {
            c.properties.auto_increment = true;
          }
          return c;
        })
      };
      table.constraints.forEach(constraint => {
        let column = model.columns.find(column => column.name === constraint.column_name);
        if (constraint.type === 'p') {
          column.properties.primary_key = true;
        } else if (constraint.type === 'u') {
          column.properties.unique = true;
        } else if (constraint.type === 'f') {
          foreignKeys.push({
            table: table.name,
            column: constraint.column_name,
            parentTable: constraint.reference_table,
            parentColumn: constraint.reference_column
          });
        }
      });
      // Now clean up and format columns
      model.columns = model.columns.map(column => {
        let typeName = column.type;
        let convertedName = this.db.adapter.databaseToSimpleTypes[typeName];
        if (typeof convertedName === 'function') {
          column = convertedName(column);
        } else if (convertedName) {
          column.type = convertedName;
        }
        if (Object.keys(column.properties).length === 0) {
          delete column.properties;
        }
        return column;
      });
    });

    // Now prepare indices...
    // TODO: We can probably work with more robust indices in the future
    // Support a .name and .definition field that allow custom indices
    schema.indices = indices
      .filter(index => !index.unique) // Not unique is auto-created by pk / unique properties
      .filter(index => index.columns.length === 1) // More columns = custom
      .filter(index => index.definition.endsWith(` USING ${index.type} (${index.columns[0]})`)) // Custom logic = custom
      .filter(index => index.name !== this.db.adapter.generateIndex(index.table, index.columns[0])) // Custom name = custom
      .map(index => {
        return {
          table: index.table,
          column: index.columns[0],
          type: index.type
        }
      })
      .sort((a, b) => {
        let aid = [a.table, a.column, a.type].join('|');
        let bid = [b.table, b.column, b.type].join('|');
        return aid > bid ? 1 : -1;
      });

    // Now prepare foreign keys...
    schema.foreign_keys = foreignKeys.sort((a, b) => {
      let aid = [a.table, a.column, a.parentTable, a.parentColumn].join('|');
      let bid = [b.table, b.column, b.parentTable, b.parentColumn].join('|');
      return aid > bid ? 1 : -1;
    });

    return schema;
  }

  async createExtension (name) {
    const extension = await this.getExtension(name);
    if (!extension) {
      throw new Error(`Extension "${name}" is not available to create. Are you sure it is set up correctly?`);
    } else if (extension.installed_version) {
      return extension;
    } else {
      await this.query(`CREATE EXTENSION ${extension.name}`, []);
      return this.getExtension(name);
    }
  }

  async dropExtension (name) {
    const extension = await this.getExtension(name);
    if (!extension) {
      throw new Error(`Extension "${name}" is not available to drop. Are you sure it is set up correctly?`);
    } else if (!extension.installed_version) {
      return extension;
    } else {
      await this.query(`DROP EXTENSION ${extension.name}`, []);
      return this.getExtension(name);
    }
  }

  async getExtension (name) {
    const extensions = await this.listExtensions();
    const extension = extensions.find(ext => ext.name === name);
    return extension;
  }

  async listExtensions () {
    const result = await this.query(`
      SELECT
        "name",
        "default_version",
        "installed_version",
        "comment"
      FROM
        "pg_available_extensions"
    `, []);
    const extensions = result.rows.map(row => {
      return {
        name: row.name,
        description: row.comment,
        default_version: row.default_version,
        installed_version: row.installed_version || null
      };
    });
    return extensions;
  }

  /* generate functions */

  generateArray (arr) {

    return '{' + arr.join(',') + '}';

  }

  generateConnectionString (host, port, database, user, password) {

    if (!host || !port || !database) {
      return '';
    }

    return 'postgres://' + user + ':' + password + '@' + host + ':' + port + '/' + database;

  }

  createDefaultConfig () {
    return {
      host: 'localhost',
      database: 'postgres',
      user: 'postgres',
      password: '',
      port: 5432,
      ssl: false,
      in_vpc: false,
      tunnel: null
    };
  }

  parseConnectionString (connectionString, cfg = null) {
    cfg = cfg || this.createDefaultConfig();
    const match = connectionString.match(/^postgres:\/\/([A-Za-z0-9_]+)(?:\:([A-Za-z0-9_\-]+))?@([A-Za-z0-9_\.\-]+):(\d+)\/([A-Za-z0-9_]+)(\?ssl(?:mode)?=(?:true|false|unauthorized))?$/);
    if (match) {
      cfg.user = match[1];
      cfg.password = match[2];
      cfg.host = match[3];
      cfg.port = match[4];
      cfg.database = match[5];
      if (match[6] === '?ssl=true' || match[6] === '?sslmode=true') {
        cfg.ssl = true;
      } else if (match[6] === '?ssl=unauthorized' || match[6] === '?sslmode=unauthorized') {
        cfg.ssl = 'unauthorized'
      } else {
        cfg.ssl = false;
      }
    }
    return cfg;
  }

  parseConfig (oldCfg = {}) {
    let cfg = this.createDefaultConfig();
    const readCfg = JSON.parse(JSON.stringify(oldCfg));
    Object.keys(cfg).forEach(key => {
      cfg[key] = key in readCfg ? readCfg[key] : null;
    });
    if (cfg.tunnel) {
      if (
        typeof cfg.tunnel.private_key === 'string' &&
        !cfg.tunnel.private_key.match(/^-----BEGIN (\w+ )?PRIVATE KEY-----/)
      ) {
        try {
          cfg.tunnel.private_key = fs.readFileSync(cfg.tunnel.private_key).toString();
        } catch (e) {
          throw new Error(`Could not read private key file: ${e.message}`);
        }
      }
      if (!cfg.tunnel.user) {
        throw new Error(`Missing SSH tunnel "user" in database configuration`);
      }
      if (!cfg.tunnel.host) {
        throw new Error(`Missing SSH tunnel "host" in database configuration`);
      }
    }
    if (readCfg.connectionString) {
      cfg = this.parseConnectionString(readCfg.connectionString, cfg);
    }
    if (cfg.ssl === 'unauthorized') {
      cfg.ssl = {rejectUnauthorized: false};
    }
    return cfg;
  }

  generateClearDatabaseQuery () {

    return [
      'DROP SCHEMA public CASCADE',
      'CREATE SCHEMA public'
    ].join(';')

  }

  generateCreateDatabaseQuery (name) {

    return [
      'CREATE DATABASE',
      this.escapeField(name)
    ].join(' ');

  }

  generateDropDatabaseQuery (name) {

    return [
      'DROP DATABASE IF EXISTS',
      this.escapeField(name)
    ].join(' ');

  }

  generateColumn (columnName, columnType, columnProperties) {

    return [
      this.escapeField(columnName),
      columnType + (columnProperties.length !== null ? `(${columnProperties.length})` : ''),
      columnProperties.array ? 'ARRAY' : '',
      (columnProperties.primary_key || !columnProperties.nullable) ? 'NOT NULL' : ''
    ].filter(function(v) { return !!v; }).join(' ');

  }

  generateAlterColumn (columnName, columnType, columnProperties) {

    return [
      'ALTER COLUMN',
      this.escapeField(columnName),
      'TYPE',
      columnType,
      columnProperties.array ? 'ARRAY' : '',
    ].filter(function(v) { return !!v; }).join(' ');

  }

  generateAlterColumnSetNull (columnName, columnType, columnProperties) {

    return [
      'ALTER COLUMN',
      this.escapeField(columnName),
      (columnProperties.primary_key || !columnProperties.nullable) ? 'SET' : 'DROP',
      'NOT NULL'
    ].join(' ');

  }

  generateAlterColumnDropDefault (columnName, columnType, columnProperties) {

    return [
      'ALTER COLUMN',
      this.escapeField(columnName),
      'DROP DEFAULT'
    ].join(' ');

  }

  generateAlterColumnSetDefaultSeq (columnName, seqName) {
    return [
      'ALTER COLUMN ',
        this.escapeField(columnName),
      ' SET DEFAULT nextval(\'',
        seqName,
      '\')'
    ].join('');
  }

  generateIndex (table, columnName) {
    return this.generateConstraint(table, columnName, 'index');
  }

  generateConstraint (table, columnName, suffix) {
    return this.escapeField([table, columnName, suffix].join('_'));
  }

  generatePrimaryKey (table, columnName) {
    return ['CONSTRAINT ', this.generateConstraint(table, columnName, 'pk'), ' PRIMARY KEY(', this.escapeField(columnName), ')'].join('');
  }

  generateUniqueKey (table, columnName) {
    return ['CONSTRAINT ', this.generateConstraint(table, columnName, 'unique'), ' UNIQUE(', this.escapeField(columnName), ')'].join('');
  }

  generateAlterTableRename (table, newTableName, columns) {

    let self = this;

    return [
      [
        'ALTER TABLE',
          this.escapeField(table),
        'RENAME TO',
          this.escapeField(newTableName)
      ].join(' '),
    ].concat(
      this.getPrimaryKeys(columns).map(function(columnData) {
        return [
          'ALTER TABLE',
            self.escapeField(newTableName),
          'RENAME CONSTRAINT',
            self.generateConstraint(table, columnData.name, 'pk'),
          'TO',
            self.generateConstraint(newTableName, columnData.name, 'pk')
        ].join(' ');
      }),
      this.getUniqueKeys(columns).map(function(columnData) {
        return [
          'ALTER TABLE',
            self.escapeField(newTableName),
          'RENAME CONSTRAINT',
            self.generateConstraint(table, columnData.name, 'unique'),
          'TO',
            self.generateConstraint(newTableName, columnData.name, 'unique')
        ].join(' ');
      }),
      this.getAutoIncrementKeys(columns).map(function(columnData) {
        return self.generateRenameSequenceQuery(table, columnData.name, newTableName, columnData.name);
      })
    ).join(';');
  }

  generateAlterTableColumnType (table, columnName, columnType, columnProperties) {

    let queries = [
      [
        'ALTER TABLE',
          this.escapeField(table),
          this.generateAlterColumn(columnName, columnType, columnProperties)
      ].join(' '),
      [
        'ALTER TABLE',
          this.escapeField(table),
          this.generateAlterColumnSetNull(columnName, columnType, columnProperties)
      ].join(' '),
      [
        'ALTER TABLE',
          this.escapeField(table),
          this.generateAlterColumnDropDefault(columnName)
      ].join(' '),
      this.generateDropSequenceQuery(table, columnName)
    ]

    if (columnProperties.auto_increment) {
      queries.push(this.generateCreateSequenceQuery(table, columnName));
      queries.push([
        'ALTER TABLE',
          this.escapeField(table),
          this.generateAlterColumnSetDefaultSeq(columnName, this.generateSequence(table, columnName))
      ].join(' '));
    }

    return queries.join(';');

  }

  generateAlterTableAddPrimaryKey (table, columnName) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'ADD',
        this.generatePrimaryKey(table, columnName)
    ].join(' ');

  }

  generateAlterTableDropPrimaryKey (table, columnName) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'DROP CONSTRAINT IF EXISTS',
        this.generateConstraint(table, columnName, 'pk')
    ].join(' ');

  }

  generateAlterTableAddUniqueKey (table, columnName) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'ADD',
        this.generateUniqueKey(table, columnName)
    ].join(' ');

  }

  generateAlterTableDropUniqueKey (table, columnName) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'DROP CONSTRAINT IF EXISTS',
        this.generateConstraint(table, columnName, 'unique')
    ].join(' ');

  }

  generateAlterTableAddColumn (table, columnName, columnType, columnProperties) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'ADD COLUMN',
        this.generateColumn(columnName, columnType, columnProperties)
    ].join(' ');

  }

  generateAlterTableDropColumn (table, columnName) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'DROP COLUMN IF EXISTS',
        this.escapeField(columnName)
    ].join(' ');

  }

  generateAlterTableRenameColumn (table, columnName, newColumnName) {

    return [
      'ALTER TABLE',
        this.escapeField(table),
      'RENAME COLUMN',
        this.escapeField(columnName),
      'TO',
      this.escapeField(newColumnName)
    ].join(' ');

  }

  generateCreateIndex (table, columnName, indexType) {

    if (this.indexTypes.indexOf(indexType) === -1) {
      throw new Error(`Invalid index type: "${indexType}"`);
    }

    let indexName = columnName;
    let usingValue = this.escapeField(columnName);

    if (columnName.indexOf(this.columnDepthDelimiter) != -1) {
      // turn ex: recipie->name into recipe_name
      indexName = columnName.replace(new RegExp(this.columnDepthDelimiter, 'i'), '_');
      usingValue = `(${columnName})`;
    }
    return [
      'CREATE INDEX',
        this.generateIndex(table, indexName),
      'ON',
        this.escapeField(table),
      'USING',
        indexType,
      ['(', usingValue, ')'].join('')
    ].join(' ');

  }

  generateDropIndex (table, columnName) {

    return [
      'DROP INDEX', this.generateIndex(table, columnName)
    ].join(' ');

  }

  generateSequence (table, columnName) {
    return this.generateConstraint(table, columnName, 'seq');
  }

  generateCreateSequenceQuery (table, columnName) {

    return [
      [
        'CREATE SEQUENCE',
          this.generateSequence(table, columnName),
        'START 1',
        'OWNED BY',
          [this.escapeField(table), this.escapeField(columnName)].join('.')
      ].join(' '),
      [
        'SELECT setval(\'',
          this.generateSequence(table, columnName),
        '\', GREATEST(COALESCE(MAX(',
          this.escapeField(columnName),
        '), 0), 0) + 1, false) FROM ',
          this.escapeField(table)
      ].join('')
    ].join(';');

  }

  generateForeignKeyQuery (table, columnName, parentTable, parentColumnName, behavior) {
    behavior = behavior || {};
    return (behavior.mock)
      ? ''
      : [
        'ALTER TABLE',
          this.escapeField(table),
        'ADD CONSTRAINT',
          `${this.generateConstraint(table, columnName, `_fk`)}`,
        'FOREIGN KEY',
          `(${this.escapeField(columnName)})`,
        'REFERENCES',
          `${this.escapeField(parentTable)} (${parentColumnName})`,
        (behavior.cascade ? `ON DELETE CASCADE` : '')
      ].join(' ').trim();
  }

  generateDropForeignKeyQuery (table, columnName) {
    return [
      'ALTER TABLE',
        this.escapeField(table),
      'DROP CONSTRAINT IF EXISTS',
        `${this.generateConstraint(table, columnName, `_fk`)}`,
    ].join(' ');
  }

  generateRenameSequenceQuery (table, columnName, newTable, newColumnName) {

    return [
      'ALTER SEQUENCE',
        this.generateSequence(table, columnName),
      'RENAME TO',
        this.generateSequence(newTable, newColumnName)
    ].join(' ');

  }

  generateDropSequenceQuery (table, columnName) {
    return [
      'DROP SEQUENCE IF EXISTS',
      this.generateSequence(table, columnName)
    ].join(' ');
  }

  generateCreateTableQuery (table, columns) {

    // Create sequences along with table
    let self = this;

    return [
      super.generateCreateTableQuery(table, columns),
      this.getAutoIncrementKeys(columns).map(function(columnData) {
        return [
          self.generateCreateSequenceQuery(table, columnData.name),
          [
            'ALTER TABLE',
              self.escapeField(table),
              self.generateAlterColumnSetDefaultSeq(columnData.name, self.generateSequence(table, columnData.name))
          ].join(' ')
        ].join(';');
      })
    ].join(';');

  }

  generateLimitClause (limitObj) {

    return (!limitObj) ? '' :
      (limitObj.count ? ` LIMIT ${limitObj.count}` : '') +
      (limitObj.offset ? ` OFFSET ${limitObj.offset}` : '');

  }

  preprocessWhereObj (table, whereObj) {

    let whereObjArray = []
    whereObj.forEach(where => {
      if (utilities.isObject(where.value)) {
        Object.keys(where.value).forEach(k => {
          let newWhere = {};
          Object.keys(where).forEach(key => newWhere[key] = where[key]);
          newWhere.columnName = `${where.columnName}${this.whereDepthDelimiter}'${k}'`;
          newWhere.value = where.value[k];
          whereObjArray.push(newWhere);
        });
      } else if (!this.comparatorExpectsArray[where.comparator] && Array.isArray(where.value)) {
        whereObjArray = whereObjArray.concat(
          where.value.map(value => {
            return Object.keys(where)
              .filter(key => key !== 'value')
              .reduce((newWhere, key) => {
                newWhere[key] = where[key];
                return newWhere;
            }, {value: value});
          })
        );
      } else {
        whereObjArray.push(where);
      }
    });

    return whereObjArray;

  }

}

PostgresAdapter.prototype.sanitizeType = {
  boolean: v => {
    return ['f', 't'][v | 0];
  },
  json: v => {
    return JSON.stringify(v);
  },
  vector: v => {
    return JSON.stringify(v);
  }
};

PostgresAdapter.prototype.escapeFieldCharacter = '"';
PostgresAdapter.prototype.columnDepthDelimiter = '->';
PostgresAdapter.prototype.whereDepthDelimiter = '->>';

PostgresAdapter.prototype.indexTypes = [
  'btree',
  'hash',
  'gist',
  'gin'
];

PostgresAdapter.prototype.documentTypes = [
  'json'
];

PostgresAdapter.prototype.comparators = {
  is: field => `${field} = __VAR__`,
  not: field => `${field} <> __VAR__`,
  lt: field => `${field} < __VAR__`,
  lte: field => `${field} <= __VAR__`,
  gt: field => `${field} > __VAR__`,
  gte: field => `${field} >= __VAR__`,
  contains: field => `${field} LIKE '%' || __VAR__ || '%'`,
  icontains: field => `${field} ILIKE '%' || __VAR__ || '%'`,
  startswith: field => `${field} LIKE __VAR__ || '%'`,
  istartswith: field => `${field} ILIKE __VAR__ || '%'`,
  endswith: field => `${field} LIKE '%' || __VAR__`,
  iendswith: field => `${field} ILIKE '%' || __VAR__`,
  like: field => `${field} LIKE __VAR__`,
  ilike: field => `${field} ILIKE __VAR__`,
  is_null: field => `${field} IS NULL`,
  is_true: field => `${field} IS TRUE`,
  is_false: field => `${field} IS FALSE`,
  not_null: field => `${field} IS NOT NULL`,
  not_true: field => `${field} IS NOT TRUE`,
  not_false: field => `${field} IS NOT FALSE`,
  in: field => `ARRAY[${field}] <@ __VAR__`,
  not_in: field => `NOT (ARRAY[${field}] <@ __VAR__)`,
  json: (field, value) => {
    return `${field.replace(/"/g,"")} = __VAR__`;
  },
  jsoncontains: (field) => {
    return `${field.replace(/"/g,"")} ? __VAR__`;
  }
};

// Simple types for legibility, translated in DB
PostgresAdapter.prototype.simpleTypes = {
  serial: {
    dbName: 'bigint',
    properties: {
      primary_key: true,
      nullable: false,
      auto_increment: true
    }
  },
  int: {
    dbName: 'bigint'
  },
  float: {
    dbName: 'float'
  },
  string: {
    dbName: 'varchar'
  },
  text: {
    dbName: 'text'
  },
  datetime: {
    dbName: 'timestamp'
  },
  boolean: {
    dbName: 'boolean'
  },
  json: {
    dbName: 'jsonb'
  }
};

// https://www.postgresql.org/docs/current/datatype.html
PostgresAdapter.prototype.allTypes = [
  'bigint', 'int8',
  'bigserial', 'serial8',
  'bit',
  'bit varying', 'varbit',
  'boolean', 'bool',
  'box',
  'bytea',
  'character', 'char',
  'character varying', 'varchar',
  'cidr',
  'circle',
  'date',
  'double precision', 'float8',
  'inet',
  'integer', 'int', 'int4',
  'interval',
  'json',
  'jsonb',
  'line',
  'lseg',
  'macaddr',
  'macaddr8',
  'money',
  'numeric',
  'path',
  'pg_lsn',
  'pg_snapshot',
  'point',
  'polygon',
  'real', 'float4',
  'smallint', 'int2',
  'smallserial', 'serial2',
  'serial', 'serial4',
  'text',
  'time', 'time without time zone',
  'time with time zone',
  'timestamp', 'timestamp without time zone',
  'timestamp with time zone',
  'tsquery',
  'tsvector',
  'txid_snapshot',
  'uuid',
  'xml'
];

// extension-specific types
PostgresAdapter.prototype.extensionTypesMap = {
  'vector': [
    'vector'
  ]
};

PostgresAdapter.prototype.typePropertyRequirements = {
  'vector': {
    length: v => {
      if (!v || parseInt(v) !== v || v <= 0) {
        return 'must be an integer greater than 0'
      } else {
        return true;
      }
    }
  }
};

// When introspecting a database, convert to simple types for legibility
PostgresAdapter.prototype.databaseToSimpleTypes = {
  'bigint': (column) => {
    if (
      column.properties.primary_key === true &&
      column.properties.nullable === false &&
      column.properties.auto_increment === true
    ) {
      column.type = 'serial';
      delete column.properties.primary_key;
      delete column.properties.nullable;
      delete column.properties.auto_increment;
      return column;
    } else {
      column.type = 'int';
      return column;
    }
  },
  'integer': (column) => {
    if (
      column.properties.primary_key === true &&
      column.properties.nullable === false &&
      column.properties.auto_increment === true
    ) {
      column.type = 'serial';
      delete column.properties.primary_key;
      delete column.properties.nullable;
      delete column.properties.auto_increment;
      return column;
    } else {
      column.type = 'int';
      return column;
    }
  },
  'serial': 'serial',
  'bigserial': 'serial',
  'character varying': 'string',
  'double precision': 'float',
  'timestamp': 'datetime',
  'timestamp without time zone': 'datetime',
  'timestamp with time zone': 'datetime',
  'jsonb': 'json',
  'json': 'json'
};

PostgresAdapter.prototype.supportsForeignKey = true;

module.exports = PostgresAdapter;
