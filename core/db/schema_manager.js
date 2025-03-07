const Database = require('./database.js');
const Model = require('../lib/model.js');

const fs = require('fs');
const path = require('path');
const inflect = require('i')();

class SchemaManager {

  static rootDirectory = './_instant';
  static rootDatabaseConfigFile = 'db.json';
  static rootDatabaseSeedFile = 'seed.json';
  static migrationsTable = '_instant_migrations';
  static migrationsDirectory = 'migrations';
  static cacheDirectory = 'cache';
  static cacheSchemaFile = 'schema.json';
  static modelsDirectory = 'models';

  /**
   * Makes sure a directory we want to use exists
   */
  static checkdir (pathname = '.') {
    let cwd = process.cwd();
    if (!fs.existsSync(pathname)) {
      let paths = pathname.split('/');
      for (let i = 0; i < paths.length; i++) {
        let dirpath = path.join(cwd, ...paths.slice(0, i + 1));
        if (!fs.existsSync(dirpath)) {
          try {
            fs.mkdirSync(dirpath);
          } catch (e) {
            console.error(e);
            throw new Error(`Could not write directory "${dirpath}": ${e.message}`);
          }
        }
      }
    }
  }

  static getDirectory (type) {
    if (type === 'root') {
      return path.join(this.rootDirectory);
    } else if (type === 'migrations') {
      return path.join(this.rootDirectory, this.migrationsDirectory);
    } else if (type === 'cache') {
      return path.join(this.rootDirectory, this.cacheDirectory);
    } else if (type === 'models') {
      return path.join(this.rootDirectory, this.modelsDirectory);
    } else {
      throw new Error(`Directory "${type}" not supported`);
    }
  }

  static emptySchema () {
    return {
      migration_id: null,
      indices: [],
      foreign_keys: [],
      tables: {}
    };
  }

  static validate (json) {
    if (!json || typeof json !== 'object' || json.constructor !== Object) {
      throw new Error(`Invalid schema: ${json}`);
    }
    json = JSON.parse(JSON.stringify(json)); // create a copy
    let keys = Object.keys(json);
    if (Object.keys(json).length > 4) {
      throw new Error(`Invalid schema: can only contain "migration_id", "indices", "foreign_keys", "tables"`);
    }
    if (!('migration_id' in json)) {
      throw new Error(`Invalid schema: missing "migration_id"`);
    }
    if (
      json['migration_id'] !== null &&
      (
        typeof json['migration_id'] !== 'number' ||
        parseInt(json['migration_id'] !== json['migration_id'])
      )
    ) {
      throw new Error(`Invalid schema: "migration_id" must be null or an integer`);
    }
    if (!('indices' in json)) {
      throw new Error(`Invalid schema: missing "indices"`);
    }
    if (!Array.isArray(json['indices'])) {
      throw new Error(`Invalid schema: "indices" must be an array`);
    }
    json['indices'].forEach((index, i) => {
      if (Object.keys(index).length > 3) {
        throw new Error(`Invalid schema: indices[${i}] can only contain "table", "column", "type"`);
      }
      if (!index['table'] || typeof index['table'] !== 'string') {
        throw new Error(`Invalid schema: indices[${i}] missing string "table"`);
      }
      if (!index['column'] || typeof index['column'] !== 'string') {
        throw new Error(`Invalid schema: indices[${i}] missing string "column"`);
      }
      if (!index['type'] || typeof index['type'] !== 'string') {
        throw new Error(`Invalid schema: indices[${i}] missing string "type"`);
      }
    });
    if (!('foreign_keys' in json)) {
      throw new Error(`Invalid schema: missing "foreign_keys"`);
    }
    if (!Array.isArray(json['foreign_keys'])) {
      throw new Error(`Invalid schema: "foreign_keys" must be an array`);
    }
    json['foreign_keys'].forEach((foreignKey, i) => {
      foreignKey['behavior'] = foreignKey['behavior'] || {};
      if (Object.keys(foreignKey).length > 5) {
        throw new Error(`Invalid schema: foreign_keys[${i}] can only contain "table", "column", "parentTable", "parentColumn", "behavior"`);
      }
      if (!foreignKey['table'] || typeof foreignKey['table'] !== 'string') {
        throw new Error(`Invalid schema: foreign_keys[${i}] missing string "table"`);
      }
      if (!foreignKey['column'] || typeof foreignKey['column'] !== 'string') {
        throw new Error(`Invalid schema: foreign_keys[${i}] missing string "column"`);
      }
      if (!foreignKey['parentTable'] || typeof foreignKey['parentTable'] !== 'string') {
        throw new Error(`Invalid schema: foreign_keys[${i}] missing string "parentTable"`);
      }
      if (!foreignKey['parentColumn'] || typeof foreignKey['parentColumn'] !== 'string') {
        throw new Error(`Invalid schema: foreign_keys[${i}] missing string "parentColumn"`);
      }
      if (!foreignKey['parentColumn'] || typeof foreignKey['parentColumn'] !== 'string') {
        throw new Error(`Invalid schema: foreign_keys[${i}] missing string "parentColumn"`);
      }
      if (
        !foreignKey['behavior'] ||
        typeof foreignKey['behavior'] !== 'object' ||
        foreignKey['behavior'].constructor !== Object
      ) {
        throw new Error(`Invalid schema: foreign_keys[${i}]["behavior"] must be an object`);
      }
      if (Object.keys(foreignKey['behavior']).length === 0) {
        delete foreignKey['behavior'];
      }
    });
    if (!('tables' in json)) {
      throw new Error(`Invalid schema: missing "tables"`);
    }
    let tables = json['tables'];
    if (!tables || typeof tables !== 'object' || tables.constructor !== Object) {
      throw new Error(`Invalid schema: "tables" must be an object`);
    }
    Object.keys(tables).forEach(name => {
      let table = tables[name];
      if (!table || typeof table !== 'object' || table.constructor !== Object) {
        throw new Error(`Invalid schema: tables["${name}"] must be an object`);
      }
      if (Object.keys(table).length > 2) {
        throw new Error(`Invalid schema: tables["${name}"] can only contain "table", "columns"`);
      }
      if (!table['name'] || typeof table['name'] !== 'string') {
        throw new Error(`Invalid schema: tables["${name}"] missing string "name"`);
      }
      if (!Array.isArray(table['columns'])) {
        throw new Error(`Invalid schema: tables["${name}"] missing array "columns"`);
      }
      table['columns'].forEach((column, i) => {
        if (!('properties' in column)) {
          column['properties'] = {};
        }
        if (Object.keys(column).length > 3) {
          throw new Error(`Invalid schema: tables["${name}"].columns[${i}] can only contain "name", "type", "properties"`);
        }
        if (!column['name'] || typeof column['name'] !== 'string') {
          throw new Error(`Invalid schema: tables["${name}"].columns[${i}] missing string "name"`);
        }
        if (!column['type'] || typeof column['type'] !== 'string') {
          throw new Error(`Invalid schema: tables["${name}"].columns[${i}] missing string "type"`);
        }
        if (
          !column['properties'] ||
          typeof column['properties'] !== 'object' ||
          column['properties'].constructor !== Object
        ) {
          throw new Error(`Invalid schema: tables["${name}"].columns[${i}]["properties"] must be an object`);
        }
        if (Object.keys(column['properties']).length === 0) {
          delete column['properties'];
        }
      });
    });
    return json;
  }

  static readSchemaFile (pathname) {
    let file;
    let json;
    try {
      file = fs.readFileSync(pathname);
    } catch (e) {
      console.error(e);
      throw new Error(`Could not load schema from file: "${pathname}"`)
    }
    try {
      json = JSON.parse(file.toString());
    } catch (e) {
      console.error(e);
      throw new Error(`Could not parse schema from file: "${pathname}"`)
    }
    return this.validate(json);
  }

  constructor (db, vectorManager = null, pluginsManager = null) {
    if (!(db instanceof Database)) {
      throw new Error('Migrator requires valid database instance');
    }
    this.db = db;
    this.schema = this.constructor.emptySchema();
    this.Models = {};
    this.vectorManager = vectorManager;
    this.pluginsManager = pluginsManager;
  }

  getCacheFilename () {
    return path.join(
      this.constructor.getDirectory('cache'),
      this.constructor.cacheSchemaFile
    );
  }

  isCacheAvailable () {
    return fs.existsSync(this.getCacheFilename());
  }

  toJSON () {
    return JSON.parse(JSON.stringify(this.schema));
  }

  async readModels (schema, modelsFn) {
    let Models = {};
    if (fs.existsSync(this.constructor.getDirectory('models'))) {
      let filenames = fs.readdirSync(this.constructor.getDirectory('models'));
      let cwd = process.cwd();
      for (const filename of filenames) {
        let _Model;
        let pathname = path.join(cwd, this.constructor.getDirectory('models'), filename);
        try {
          _Model = (await import(pathname)).default;
        } catch (e) {
          console.error(e);
          throw new Error(`Could not load model from "${pathname}":\n${e.message}`);
        }
        if (!Model.isPrototypeOf(_Model)) {
          throw new Error(
            `Model in "${pathname}" invalid: does not extend InstantORM.Core.Model\n` +
            `Are you sure it's being exported correctly?`
          );
        } else if (!_Model.tableName) {
          throw new Error(`Model in "${pathname}" invalid: missing static "tableName"`);
        }
        Models[_Model.tableName] = _Model;
      }
    }
    return Models;
  }

  async setSchema (schema) {
    this.schema = this.constructor.validate(schema);
    this.Models = {};
    const Models = await this.readModels(this.schema);
    Object.keys(this.schema.tables).forEach(name => {
      let className = inflect.classify(name);
      const _Model = Models[name]
        ? {[className]: class extends Models[name] {}}[className]
        : {[className]: class extends Model {}}[className];
      _Model.setDatabase(this.db);
      _Model.setTableSchema(this.schema.tables[name]);
      _Model.setModelReference(this.getModel.bind(this));
      _Model.setVectorManager(this.vectorManager);
      _Model.setPluginsManager(this.pluginsManager);
      this.Models[name] = _Model;
    });
    this.schema.foreign_keys.forEach(foreignKey => {
      let _Model = this.Models[foreignKey.table];
      let _Parent = this.Models[foreignKey.parentTable];
      if (!_Model) {
        throw new Error(`Invalid foreign key: "${foreignKey.table}" not found`);
      }
      if (!_Parent) {
        throw new Error(`Invalid foreign key: "${foreignKey.parentTable}" not found`);
      }
      let behavior = foreignKey.behavior || {};
      _Model.joinsTo(
        _Parent,
        {
          via: foreignKey.column,
          using: foreignKey.parentColumn,
          multiple: !_Model.getColumnProperties(foreignKey.column).unique,
          as: behavior.alias || null,
          name: behavior.parentAlias || null
        }
      );
    });
  }

  getModel (name) {
    let model = this.Models[name];
    if (!model) {
      let nameSingular = inflect.singularize(name);
      let lowerName = name.toLowerCase();
      let lowerNameSingular = nameSingular.toLowerCase();
      let lowerTableName = inflect.underscore(inflect.pluralize(name));
      let lowerTableSingular = inflect.singularize(lowerTableName);
      let lowerTableNameSingular = inflect.underscore(inflect.pluralize(nameSingular));
      let check = {};
      check[lowerName] = true;
      check[lowerNameSingular] = true;
      check[lowerTableName] = true;
      check[lowerTableSingular] = true;
      check[lowerTableNameSingular] = true;
      let models = Object.keys(this.schema.tables).filter(name => {
        return check[name.toLowerCase()];
      });
      if (models.length > 1) {
        throw new Error(`Model "${name}" is ambiguous, please specify: "${models.join('", "')}"`);
      } else {
        model = this.Models[models[0]];
      }
    }
    if (!model) {
      throw new Error(`Could not find model "${name}"`);
    }
    return model;
  }

  async clear () {
    await this.setSchema(this.constructor.emptySchema());
  }

  async update (id) {
    this.setMigrationId(id || this.schema.migration_id);
    return this.setSchema(this.schema);
  }

  getMigrationId () {
    return this.schema.migration_id;
  }

  setMigrationId (id) {
    if (id !== null && (typeof id !== 'number' || parseInt(id) !== id)) {
      throw new Error(`Invalid migration_id: ${id}`);
    }
    this.schema.migration_id = id;
    return id;
  }

  listTableNames () {
    return Object.keys(this.schema.tables);
  }

  listTables () {
    const tables = this.schema.tables;
    return this.listTableNames().map(name => {
      const sourceModel = tables[name];
      let table = {};
      table.name = name;
      Object.keys(sourceModel).forEach(key => {
        table[key] = sourceModel[key];
      });
      return table;
    });
  }

  listIndices () {
    return this.schema.indices.slice();
  }

  findTable (table, validate) {
    let tables = this.schema.tables;
    let key = Object.keys(tables).find(name => tables[name].name === table);
    let t = tables[key];
    if (!t && validate) {
      throw new Error(`Table "${table}" does not exist in your schema`);
    }
    return t || null;
  }

  findTableColumn (table, column, validate) {
    let t = this.findTable(table, validate);
    let c = (t || {columns: []}).columns.find(c => c.name === column);
    if (!c && validate) {
      throw new Error(`Table "${table}" column "${column}" does not exist in your schema`);
    }
    return c || null;
  }

  findIndexEntry (table, column, validate) {
    let index = this.schema.indices.find(index => {
      return index.table === table && index.column === column;
    });
    if (!index && validate) {
      throw new Error(`No index for table "${table}" column "${column}" found`);
    }
    return index;
  }

  findForeignKey (table, column, validate) {
    let foreignKey = this.schema.foreign_keys.find(foreignKey => {
      return foreignKey.table === table && foreignKey.column === column;
    });
    if (!foreignKey && validate) {
      throw new Error(`No foreign key for table "${table}" column "${column}" found`);
    }
    return foreignKey;
  }

  createTable (table, arrColumnData) {

    // Make sure we copy the data so we don't alter original data
    arrColumnData = JSON.parse(JSON.stringify(arrColumnData));

    if (this.schema.tables[table]) {
      throw new Error('Table with name "' + table + '" already exists in your schema');
    }

    let columns = arrColumnData.map(v => v.name);

    if (columns.indexOf('id') === -1) {
      arrColumnData.unshift({name: 'id', type: 'serial'});
    }

    if (columns.indexOf('created_at') === -1) {
      arrColumnData.push({name: 'created_at', type: 'datetime'});
    }

    if (columns.indexOf('updated_at') === -1) {
      arrColumnData.push({name: 'updated_at', type: 'datetime'});
    }

    this.schema.tables[table] = {
      name: table,
      columns: arrColumnData
    };

    return arrColumnData;

  }

  dropTable (table) {
    this.findTable(table, true);
    delete this.schema.tables[table];
    return true;
  }

  renameTable (table, newTable) {

    this.findTable(table, true);
    this.schema.tables[table].table = newTable;
    this.schema.tables[newTable] = this.schema.tables[table];
    delete this.schema.tables[table];
    return this.schema.tables[newTable];

  }

  alterColumn (table, column, type, properties) {

    if (properties && properties.primary_key) {
      delete properties.unique;
    }

    let tables = this.schema.tables;
    let tableKey = Object.keys(tables).filter(function(t) {
      return tables[t].name === table;
    }).pop();

    if (!tableKey) {
      throw new Error('Table "' + table + '" does not exist');
    }

    let schemaFieldData = tables[tableKey].columns.filter(function(v) {
      return v.name === column;
    }).pop();

    if (!schemaFieldData) {
      throw new Error('Column "' + column + '" of table "' + table + '" does not exist');
    }

    if (type) {
      schemaFieldData.type = type;
    }

    return true;

  }

  addColumn (table, column, type, properties) {

    if (properties && properties.primary_key) {
      delete properties.unique;
    }

    let tables = this.schema.tables;
    let tableKey = Object.keys(tables).filter(function(t) {
      return tables[t].name === table;
    }).pop();

    if (!tableKey) {
      throw new Error('Table "' + table + '" does not exist');
    }

    let tableSchema = tables[tableKey];

    let schemaFieldData = tableSchema.columns.filter(function(v) {
      return v.name === column;
    }).pop();

    if (schemaFieldData) {
      throw new Error('Column "' + column + '" of table "' + table + '" already exists');
    }

    let columnData = {
      name: column,
      type: type
    };

    if (properties) {
      columnData.properties = properties;
    }

    tableSchema.columns.push(columnData);

    return true;

  }

  dropColumn (table, column) {

    let tables = this.schema.tables;
    let tableKey = Object.keys(tables).filter(function (t) {
      return tables[t].name === table;
    }).pop();

    if (!tableKey) {
      throw new Error('Table "' + table + '" does not exist');
    }

    let tableSchema = tables[tableKey];

    let columnIndex = tableSchema.columns.map(function(v, i) { return v.name; }).indexOf(column);

    if (columnIndex === -1) {
      throw new Error('Column "' + column + '" of table "' + table + '" does not exist');
    }

    tableSchema.columns.splice(columnIndex, 1);

    return true;

  }

  renameColumn (table, column, newColumn) {

    let tables = this.schema.tables;
    let tableKey = Object.keys(tables).filter(function(t) {
      return tables[t].name === table;
    }).pop();

    if (!tableKey) {
      throw new Error('Table "' + table + '" does not exist');
    }

    let tableSchema = tables[tableKey];

    let schemaFieldData = tableSchema.columns.filter(function(v) {
      return v.name === column;
    }).pop();

    if (!schemaFieldData) {
      throw new Error('Column "' + column + '" of table "' + table + '" already exists');
    }

    schemaFieldData.name = newColumn;

    return true;

  }

  createIndex (table, column, type) {

    this.findTable(table, true);
    if (this.schema.indices.filter(function(v) {
      return v.table === table && v.column === column;
    }).length) {
      throw new Error(`Index already exists on column "${column}" of table "${table}"`);
    }
    this.schema.indices.push({table, column, type});
    this.schema.indices.sort((a, b) => {
      let aid = [a.table, a.column, a.type].join('|');
      let bid = [b.table, b.column, b.type].join('|');
      return aid > bid ? 1 : -1;
    });
    return true;

  }

  dropIndex (table, column) {

    this.schema.indices = this.schema.indices.filter(function(v) {
      return !(v.table === table && v.column === column);
    });
    return true;

  }

  createForeignKey (table, columnName, parentTable, parentColumnName, behavior) {

    this.findTableColumn(table, columnName, true);
    this.findTableColumn(parentTable, parentColumnName, true);

    const foundKey = this.schema.foreign_keys.find(fk => {
      return fk.table === table &&
        fk.column === columnName
    });

    if (foundKey) {
      throw new Error(`Foreign key for "${table}"."${columnName}" already exists in your schema.`);
    }

    let foreignKey = {
      table: table,
      column: columnName,
      parentTable: parentTable,
      parentColumn: parentColumnName
    };

    if (behavior && Object.keys(behavior).length) {
      foreignKey.behavior = JSON.parse(JSON.stringify(behavior));
    }

    const referenceCheck = {};
    let referenceChain = [];
    let parentForeignKey = foreignKey;
    // Concat current key in to check for circular references
    let foreignKeys = this.schema.foreign_keys.concat(foreignKey);
    while (parentForeignKey) {
      referenceChain.push(`"${parentForeignKey.table}"."${parentForeignKey.column}"`);
      if (referenceCheck[parentForeignKey.table]) {
        throw new Error(
          `Foreign key circular reference for "${foreignKey.table}"."${foreignKey.column}":\n` +
          referenceChain.join(' -> ')
        );
      } else {
        referenceCheck[parentForeignKey.table] = true;
      }
      parentForeignKey = foreignKeys.find(fk => {
        return fk.table === parentForeignKey.parentTable;
      });
    }

    this.schema.foreign_keys.push(foreignKey);
    this.schema.foreign_keys.sort((a, b) => {
      let aid = [a.table, a.column, a.parentTable, a.parentColumn].join('|');
      let bid = [b.table, b.column, b.parentTable, b.parentColumn].join('|');
      return aid > bid ? 1 : -1;
    });
    return true;

  }

  dropForeignKey (table, columnName) {

    this.schema.foreign_keys = this.schema.foreign_keys.filter(function(v) {
      return !(v.table === table && v.column === columnName);
    });
    return true;

  }

}

module.exports = SchemaManager;
