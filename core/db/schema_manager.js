const Database = require('./database.js');
const Model = require('../lib/model.js');

const fs = require('fs');
const inflect = require('i')();

class SchemaManager {

  migrationsTable = '_instant_migrations';
  migrationsDirectory = './_instant_migrations';

  static emptySchema () {
    return {
      migration_id: null,
      indices: [],
      tables: {}
    };
  }

  static validate (json) {
    if (!json || typeof json !== 'object' || json.constructor !== Object) {
      throw new Error(`Invalid schema: ${json}`);
    }
    json = JSON.parse(JSON.stringify(json)); // create a copy
    let keys = Object.keys(json);
    if (Object.keys(json).length > 3) {
      throw new Error(`Invalid schema: can only contain "migration_id", "indices", "tables"`);
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
          throw new Error(`Invalid schema: tables["${type}"].columns[${i}] missing string "type"`);
        }
        if (
          !column['properties'] ||
          typeof column['properties'] !== 'object' ||
          column['properties'].constructor !== Object
        ) {
          throw new Error(`Invalid schema: tables["${type}"].columns[${i}]["properties"] must be an object`);
        }
        // Clean up empty properties
        if (Object.keys(column['properties']).length === 0) {
          delete column['properties'];
        }
      });
    });
    return json;
  }

  constructor (db, schema) {
    if (!(db instanceof Database)) {
      throw new Error('Migrator requires valid database instance');
    }
    this.db = db;
    this.setSchema(schema);
  }

  setSchema (schema) {
    this.schema = this.constructor.validate(schema);
    this.Models = {};
    Object.keys(this.schema.tables).forEach(name => {
      let className = inflect.classify(name);
      const _Model = {[className]: class extends Model {}}[className];
      _Model.setDatabase(this.db);
      _Model.setSchema(this.schema.tables[name]);
      this.Models[name] = _Model;
    });
  }

  clear () {
    this.setSchema(this.constructor.emptySchema());
  }

  update (id) {
    this.setMigrationId(id);
    this.setSchema(this.schema);
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

  mergeProperties (columnData, properties) {

    properties = properties || {};

    let defaults = this.db.adapter.typePropertyDefaults;

    let oldProperties = this.db.adapter.getTypeProperties(columnData.type, columnData.properties) || {};
    let newProperties = {};

    this.db.adapter.typeProperties.forEach(function(v) {
      if (properties.hasOwnProperty(v) && properties[v] !== defaults[v]) {
        newProperties[v] = properties[v];
      } else if (oldProperties.hasOwnProperty(v) && oldProperties[v] !== defaults[v]) {
        newProperties[v] = oldProperties[v];
      }
    });

    if (Object.keys(newProperties).length) {
      columnData.properties = newProperties;
    } else {
      delete columnData.properties;
    }

    return columnData;

  }

  findTableName (table, validate) {
    let tables = this.schema.tables;
    let name = Object.keys(tables).filter(function(v) {
      return tables[v].name === table;
    }).pop();
    if (!name && validate) {
      throw new Error(`No table matching "${table}" found`);
    }
    return name;
  }

  findModelSchemaEntry (table, validate) {
    let tableName = this.findTableName(table, validate);
    return this.schema.tables[tableName];
  }

  findIndexSchemaEntry (table, column, validate) {
    let index = this.schema.indices.find(index => {
      return index.table === table && index.column === column;
    });
    if (!index && validate) {
      throw new Error(`No index for table "${table}" column "${column}" found`);
    }
  }

  createTable (table, arrColumnData) {

    // Make sure we copy the data so we don't alter original data
    arrColumnData = JSON.parse(JSON.stringify(arrColumnData));

    if (this.schema.tables[table]) {
      throw new Error('Table with name "' + table + '" already exists in your schema');
    }

    arrColumnData = arrColumnData.slice();

    let columns = arrColumnData.map(function(v) {
      return v.name;
    });

    if (columns.indexOf('id') === -1) {
      arrColumnData.unshift({name: 'id', type: 'serial'});
    }

    if (columns.indexOf('created_at') === -1) {
      arrColumnData.push({name: 'created_at', type: 'datetime'});
    }

    if (columns.indexOf('updated_at') === -1) {
      arrColumnData.push({name: 'updated_at', type: 'datetime'});
    }

    let defaults = this.db.adapter.typePropertyDefaults;

    arrColumnData.forEach(columnData => this.mergeProperties(columnData));

    this.schema.tables[table] = {
      name: table,
      columns: arrColumnData
    };

    return arrColumnData;

  }

  dropTable (table) {

    let tableClass = this.findTableName(table);

    if (!tableClass) {
      throw new Error('Table "' + table + '" does not exist in your schema');
    }

    delete this.schema.tables[tableClass];

    return true;

  }

  renameTable (table, newTableName, renameModel, newModelName) {

    let tableClass = this.findTableName(table);

    if (!tableClass) {
      throw new Error('Table "' + table + '" does not exist in your schema');
    }

    this.schema.tables[tableClass].table = newTableName;

    if (renameModel) {
      let newClass = newModelName || inflect.classify(newTableName);
      this.schema.tables[newClass] = this.schema.tables[tableClass];
      delete this.schema.tables[tableClass];
      tableClass = newClass;
    }

    return this.schema.tables[tableClass];

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

    schemaFieldData.type = type;

    this.mergeProperties(schemaFieldData, properties);

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

    if (this.schema.indices.filter(function(v) {
      return v.table === table && v.column === column;
    }).length) {
      throw new Error(`Index already exists on column "${column}" of table "${table}"`);
    }
    this.schema.indices.push({table, column, type});
    return true;

  }

  dropIndex (table, column) {

    this.schema.indices = this.schema.indices.filter(function(v) {
      return !(v.table === table && v.column === column);
    });
    return true;

  }

  addForeignKey (table, referenceTable) {

    if (!this.findTableName(table)) {
      throw new Error('Table with name "' + table + '" does not exist in your schema.');
    }

    if (!this.findTableName(referenceTable)) {
      throw new Error('Table with name "' + referenceTable + '" does not exist in your schema.');
    }

    return true;

  }

  dropForeignKey (table, referenceTable) {

    if (!this.findTableName(table)) {
      throw new Error('Table with name "' + table + '" does not exist in your schema.');
    }

    if (!this.findTableName(referenceTable)) {
      throw new Error('Table with name "' + referenceTable + '" does not exist in your schema.');
    }

    return true;

  }

  prettyPrint () {

    let tables = this.schema.tables;
    let indices = this.schema.indices;
    let hasModels = !!Object.keys(tables).length;
    let hasIndices = indices.length;

    let fileData = [
      '{',
      '',
      '  "migration_id": ' + this.schema.migrationId + ((hasModels || hasIndices) ? ',' : ''),
    ];

    if (hasIndices) {

      fileData = fileData.concat([
        '',
        '  "indices": [',
          indices.map(function(indexData) {
            return [
              '    {',
                [
                  '"table": "' + indexData.table + '"',
                  '"column": "' + indexData.column + '"',
                  (indexData.type ? '"type": "' + indexData.type+ '"' : '')
                ].filter(function(v) { return !!v; }).join(', '),
              '}',
            ].join('');
          }).join(',\n'),
        '  ]' + (hasModels ? ',' : ''),
      ]);

    }

    if (hasModels) {

      fileData = fileData.concat([
        '',
        '  "tables": {',
        '',
        Object.keys(tables).sort().map(function(t) {
          let curTable = tables[t];
          return [
            '    "' + t + '": {',
            '',
            '      "name": "' + curTable.name + '",',
            '',
            '      "columns": [',
            curTable.columns.map(function(columnData) {
              return [
                '        ',
                '{',
                  [
                    '"name": "' + columnData.name + '"',
                    '"type": "' + columnData.type + '"',
                    columnData.properties ? '"properties": ' + JSON.stringify(columnData.properties) : ''
                  ].filter(function(v) { return !!v; }).join(', '),
                '}'
              ].join('');
            }).join(',\n'),
            '      ]',
            '',
            '    }'
          ].join('\n');
        }).join(',\n\n'),
        '',
        '  }'
      ]);

    } else {

      fileData = fileData.concat([
        '',
        '  "tables": {}',
        ''
      ]);

    }

    return fileData.concat([
      '',
      '}',
      ''
    ]).join('\n');

  }

}

module.exports = SchemaManager;
