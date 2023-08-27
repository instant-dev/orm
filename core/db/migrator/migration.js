const fs = require('fs');
const path = require('path');

const SchemaManager = require('../schema_manager.js');

const Logger = require('../../logger.js');

const deepEqual = require('deep-equal');

const pad0 = (str, len) => {
  str = str + '';
  if (len < str.length) {
    throw new Error(`Can not pad "${str}" to length ${len}, too long`);
  }
  return '0'.repeat(len - str.length) + str;
};

class Migration extends Logger {

  constructor (id, name, Schema, Migrator, parent = null, direction = 1) {
    super('Migration', 'cyan');
    if (!(Schema instanceof SchemaManager)) {
      throw new Error('Migration requires valid SchemaManager');
    }
    if (direction !== 1 && direction !== -1) {
      throw new Error(`Direction can only be 1 (up) or -1 (down)`);
    }
    this._Schema = Schema;
    this._Migrator = Migrator;
    this.originalId = Schema.getMigrationId();
    this.id = this.constructor.validateMigrationId(id);
    this.name = this.constructor.validateMigrationName(name);
    this.parent = parent || null;
    this.direction = direction;
    if (!this.parent) {
      this.up = new Migration(id, 'up', Schema, Migrator, this, 1);
      this.down = new Migration(id, 'down', Schema, Migrator, this, -1);
    } else {
      this.commands = [];
    }
  }

  toJSON () {
    if (!this.parent) {
      return {
        id: this.id,
        name: this.name,
        up: JSON.parse(JSON.stringify(this.up.commands)),
        down: JSON.parse(JSON.stringify(this.down.commands)),
      };
    } else {
      throw new Error('Can not .toJSON on individual up / down migrations.');
    }
  }

  getFilename () {
    return this.constructor.generateFilename(this.id, this.name);
  }

  getFilepath () {
    return path.join(this._Schema.constructor.getDirectory('migrations'), this.getFilename());
  }

  addCommand (list) {
    list = this.constructor.validateCommand(list, this._Schema.db);
    if (this.direction === 1) {
      this.commands.push(list);
      // Update the schema used for this migration
      let fn = this._Schema[list[0]];
      if (!fn) {
        throw new Error(`Could not find function Schema#${list[0]}()`);
      }
      fn.apply(this._Schema, list.slice(1));
    } else {
      this.commands.unshift(list);
    }
  }

  setSchema (schema) {
    if (!this.parent) {
      if (!this.name) {
        this.name = 'set_schema';
      }
      let oldSchema = JSON.parse(JSON.stringify(this._Schema.schema));
      this.up.setSchema(schema);
      this.down.setSchema(oldSchema);
    } else {
      this.addCommand(['setSchema', schema]);
    }
  }

  createTable (table, arrFieldData) {
    if (!this.parent) {
      if (!this.name) {
        this.name = `create_${table}`;
      }
      this.up.createTable(table, arrFieldData);
      this.down.dropTable(table);
    } else {
      this.addCommand(['createTable', table, arrFieldData]);
    }
  }

  dropTable (table) {
    if (!this.parent) {
      if (!this.name) {
        this.name = `drop_${table}`;
      }
      this.up.dropTable(table);
      this.down.createTable(table, arrFieldData);
    } else {
      this.addCommand(['dropTable', table]);
    }
  }

  renameTable (table, newTable) {
    if (!this.parent) {
      if (!this.name) {
        this.name = `rename_${table}_to_${newTable}`;
      }
      this.up.renameTable(table, newTable);
      this.down.renameTable(newTable, table);
    } else {
      this.addCommand(['renameTable', table, newTable]);
    }
  }

  alterColumn (table, column, type, properties) {
    if (!this.parent) {
      if (!this.name) {
        this.name = `alter_${table}_${column}`;
      }
      let model = this._Schema.findTable(table, true);
      let oldColumn = model.columns.find(c => c.name === column);
      let oldType = oldColumn.type;
      let oldProperties = oldColumn.properties;
      this.up.alterColumn(table, column, type, properties);
      this.down.alterColumn(table, column, oldType, oldProperties);
    } else {
      this.addCommand(['alterColumn', table, column, type, properties]);
    }
  }

  addColumn (table, column, type, properties) {
    if (!this.parent) {
      if (!this.name) {
        this.name = `add_${table}_column_${column}`;
      }
      this.up.addColumn(table, column, type, properties);
      this.down.dropColumn(table, column);
    } else {
      this.addCommand(['addColumn', table, column, type, properties]);
    }
  }

  dropColumn (table, column) {
    if (!this.parent) {
      if (!this.name) {
        this.name = `drop_${table}_column_${column}`;
      }
      let model = this._Schema.findTable(table, true);
      let oldColumn = model.columns.find(c => c.name === column);
      let oldType = oldColumn.type;
      let oldProperties = oldColumn.properties;
      this.up.dropColumn(table, column);
      this.down.addColumn(table, column, oldType, oldProperties);
    } else {
      this.addCommand(['dropColumn', table, column]);
    }
  }

  renameColumn (table, column, newColumn) {
    if (!this.name) {
      this.name = `rename_${table}_column_${column}_to_${newColumn}`;
    }
    if (!this.parent) {
      this.up.renameColumn(table, column, newColumn);
      this.down.renameColumn(table, newColumn, column);
    } else {
      this.addCommand(['renameColumn', table, column, newColumn]);
    }
  }

  createIndex (table, column, type) {
    if (!this.name) {
      this.name = `create_index_on_${table}_column_${column}`;
    }
    if (!this.parent) {
      this.up.createIndex(table, column, type);
      this.down.dropIndex(table, column);
    } else {
      this.addCommand(['createIndex', table, column, type]);
    }
  }

  dropIndex (table, column) {
    if (!this.name) {
      this.name = `drop_index_on_${table}_column_${column}`;
    }
    if (!this.parent) {
      let index = this._Schema.findIndexEntry(table, column, true);
      let oldType = index.type;
      this.up.dropIndex(table, column);
      this.down.createIndex(table, column, oldType);
    } else {
      this.addCommand(['dropIndex', table, column]);
    }
  }

  createForeignKey (table, column, parentTable, parentColumn, behavior) {
    if (!this.name) {
      this.name = `add_foreign_key_on_${table}_column_${column}`;
    }
    if (!this.parent) {
      this.up.createForeignKey(table, column, parentTable, parentColumn, behavior);
      this.down.dropForeignKey(table, column);
    } else {
      this.addCommand(['createForeignKey', table, column, parentTable, parentColumn, behavior]);
    }
  }

  dropForeignKey (table, column) {
    if (!this.name) {
      this.name = `drop_foreign_key_on_${table}_column_${column}`;
    }
    if (!this.parent) {
      let foreignKey = this._Schema.findForeignKey(table, column, true);
      this.up.dropForeignKey(table, column);
      this.down.createForeignKey(table, column, foreignKey.parentTable, foreignKey.parentColumn, foreignKey.behavior);
    } else {
      this.addCommand(['dropForeignKey', table, column]);
    }
  }

  /**
   * ===
   * Static methods used for command validation
   * ===
   */

  // Commands we can run to migrate, map directly to functions in this class
  static allowedCommands = {
    setSchema: ['schema:schema'],
    createTable: ['table:string', 'arrFieldData:column[]'],
    dropTable: ['table:string'],
    renameTable: ['table:string', 'newTable:string'],
    alterColumn: ['table:string', 'column:string', 'type:columnType', 'properties:?columnProperties'],
    addColumn: ['table:string', 'column:string', 'type:columnType', 'properties:?columnProperties'],
    dropColumn: ['table:string', 'column:string'],
    renameColumn: ['table:string', 'column:string', 'newColumn:string'],
    createIndex: ['table:string', 'column:string', 'type:?indexType'],
    dropIndex: ['table:string', 'column:string'],
    createForeignKey: ['table:string', 'column:string', 'parentTable:string', 'parentColumn:string', 'behavior:?foreignKeyBehavior'],
    dropForeignKey: ['table:string', 'column:string']
  };

  // Validations for the specific types to make sure commands will work
  static validateCommandTypes = {
    'schema': function (v, db) {
      return SchemaManager.validate(v);
    },
    'string': function (v, db) {
      if (!v || typeof v !== 'string') {
        throw new Error(`Invalid argument: expecting non-empty string`);
      }
      return v;
    },
    'boolean': function (v, db) {
      if (typeof v !== 'boolean') {
        throw new Error(`Invalid argument: expecting boolean`);
      }
      return v;
    },
    'object': function (v, db) {
      if (typeof v !== 'object' || v.constructor !== Object) {
        throw new Error(`Invalid argument: expecting object`);
      }
      return v;
    },
    'columnType': function (v, db) {
      if (!(v in db.adapter.simpleTypes)) {
        if (db.adapter.allTypes.indexOf(v) === -1) {
          throw new Error(
            `Must be a string representing an aliased type: "${Object.keys(db.adapter.simpleTypes).join('", "')}"\n` +
            `Or a ${db.adapter.name} type: "${db.adapter.allTypes.join('", "')}"`
          )
        }
      }
      return v;
    },
    'indexType': function (v, db) {
      if (db.adapter.indexTypes.indexOf(v) === -1) {
        throw new Error(
         `Must be a string representing a valid ${db.adapter.name} index: "${db.adapter.indexTypes.join('", "')}"`
        )
      }
      return v;
    },
    'columnProperties': function (v, db) {
      let properties = JSON.parse(JSON.stringify(v));
      if (
        typeof properties !== 'object' ||
        properties.constructor !== Object
      ) {
        throw new Error(`Invalid properties: must be an object`);
      }
      Object.keys(properties).forEach(key => {
        if (!(key in db.adapter.typePropertyDefaults)) {
         throw new Error(`Invalid properties: does not support key "${key}"`);
        }
      });
      if (Object.keys(properties).length === 0) {
        return null;
      } else {
        return properties;
      }
    },
    'column': function (v, db) {
      let column = JSON.parse(JSON.stringify(v));
      if (Object.keys(column).length > 3) {
        throw new Error(`Invalid column: can only contain "name", "type", "properties"`);
      }
      if (!column['name'] || typeof column['name'] !== 'string') {
        throw new Error(`Invalid column: missing string "name"`);
      }
      column['type'] = this.columnType(column['type'], db);
      if ('properties' in column) {
        column['properties'] = this.columnProperties(column['properties'], db);
        let keyLength = 0;
        let defaultProperties = (
          db.adapter.simpleTypes[column['type']] || {}
        ).properties || {};
        Object.keys(column['properties']).forEach(key => {
          if (column['properties'][key] === defaultProperties[key]) {
            delete column['properties'][key];
          } else {
            keyLength++;
          }
        });
        // Clean up empty properties
        if (keyLength === 0) {
          delete column['properties'];
        }
      }
      return column;
    },
    'foreignKeyBehavior': function (v, db) {
      let behavior = JSON.parse(JSON.stringify(v));
      if (
        typeof behavior !== 'object' ||
        behavior.constructor !== Object
      ) {
        throw new Error(`Invalid behavior: must be an object`);
      }
      Object.keys(behavior).forEach(key => {
        if (!(key in db.adapter.foreignKeyBehaviorDefaults)) {
         throw new Error(`Invalid behavior: does not support key "${key}"`);
        }
        if (behavior[key] === db.adapter.foreignKeyBehaviorDefaults[key]) {
          delete behavior[key];
        }
      });
      if (Object.keys(behavior).length === 0) {
        return null;
      } else {
        return behavior;
      }
    }
  }

  /**
  * Validate a specific command and cleans empty parameters
  * Expects format ['createTable', 'table_name', [{name: 'field', type: 'string'}]]
  */
  static validateCommand (cmd, db) {
    let command = JSON.parse(JSON.stringify(cmd));
    if (!Array.isArray(command)) {
      throw new Error(`Invalid migration command: expecting Array`);
    }
    let name = command[0];
    let def = this.allowedCommands[name];
    if (!def) {
      throw new Error(`Invalid migration command: "${name}"`);
    }
    let args = command.slice(1);
    while (args.length < def.length) {
      args.push(void 0);
    }
    if (args.length > def.length) {
      throw new Error(`Invalid migration command: "${name}", was expecting ${def.length} arguments, got ${args.length}`);
    }
    def.forEach((defEntry, i) => {
      let parts = defEntry.split(':');
      let argName = parts[0];
      let type = parts[1];
      let originalType = type;
      let optional = false;
      let array = false;
      if (type.startsWith('?')) {
        optional = true;
        type = type.slice(1);
      }
      if (type.endsWith('[]')) {
        array = true;
        type = type.slice(0, -2);
      }
      if (!this.validateCommandTypes[type]) {
        throw new Error(
          `Invalid migration command "${name}" at argument[${i}]: ${argName}\n` +
          `Internal error: No validator for type ${type}`
        );
      }
      let sArg = JSON.stringify(args[i]);
      if (!optional && (args[i] === null || args[i] === void 0)) {
        throw new Error(
          `Invalid migration command "${name}" at argument[${i}]: ${argName}\n` +
          `Expected ${originalType}, received null or undefined`
        );
      } else if (array) {
        if (!Array.isArray(args[i])) {
          throw new Error(
            `Invalid migration command "${name}" at argument[${i}]: ${argName}\n` +
            `Expected array, received value: ${sArg}`
          );
        } else {
          args[i].forEach((arg, j) => {
            let result = false;
            try {
              args[i][j] = this.validateCommandTypes[type](arg, db);
            } catch (e) {
              throw new Error(
                `Invalid migration command "${name}" at argument[${i}]: ${argName}\n` +
                `Expected ${type}, received ${JSON.stringify(arg)} (${typeof arg})\n` +
                e.message
              );
            }
          });
        }
      } else if (args[i] !== null && args[i] !== undefined) {
        try {
          args[i] = this.validateCommandTypes[type](args[i], db);
        } catch (e) {
          throw new Error(
            `Invalid migration command "${name}" at argument[${i}]: ${argName}\n` +
            `Expected ${type}, received ${JSON.stringify(args[i])} (${typeof args[i]})\n` +
            e.message
          );
        }
      }
    });
    command = [name].concat(args);
    while (
      command[command.length - 1] === null ||
      command[command.length - 1] === void 0
    ) {
      command.pop();
    }
    return command;
  }

  static validateMigrationId (id) {
    if (
      !id ||
      typeof id !== 'number' ||
      parseInt(id) !== id ||
      id < 1 ||
      id > Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(`Migration id must be a valid integer between ${1} and ${Number.MAX_SAFE_INTEGER}`);
    }
    return id;
  }

  static generateFilename (id, name) {
    return [
      this.padMigrationId(id),
      name
    ].filter(v => v).join('__') + '.json';
  }

  static generateMigrationId () {
    return parseInt(
      pad0(new Date().getUTCFullYear(), 4) +
      pad0(new Date().getUTCMonth() + 1, 2) +
      pad0(new Date().getUTCDate(), 2) +
      pad0(new Date().getUTCHours(), 2) +
      pad0(new Date().getUTCMinutes(), 2) +
      pad0(new Date().getUTCSeconds(), 2)
    );
  }

  static padMigrationId (id) {
    id = this.validateMigrationId(id);
    return pad0(id, 14);
  }

  static validateMigrationName (name) {
    if (
      typeof name !== 'string' ||
      !name.match(/^[a-z0-9 _\-]*$/gi)
    ) {
      throw new Error(`Migration name must be a string containing only a-z (lowercase), 0-9, -, _`);
    }
    return name;
  }

  static validateMigration (json, db) {
    json = JSON.parse(JSON.stringify(json));
    if (Object.keys(json).length > 4) {
      throw new Error(`Invalid migration: expected only keys "id", "up" and "down"`);
    }
    if (!('id' in json)) {
      throw new Error(`Invalid migration: missing "id"`);
    }
    json['id'] = this.validateMigrationId(json['id']);
    if (!('name' in json)) {
      throw new Error(`Invalid migration: missing "name"`);
    }
    if (!json['name'] || typeof json['name'] !== 'string') {
      throw new Error(`Invalid migration: "name" be a non-empty string`);
    }
    if (!('up' in json)) {
      throw new Error(`Invalid migration: "up" must be an Array`);
    } else {
      json['up'] = json['up'].map(command => this.validateCommand(command, db));
    }
    if (!('down' in json)) {
      throw new Error(`Invalid migration: "down" must be an Array`);
    } else {
      json['down'] = json['down'].map(command => this.validateCommand(command, db));
    }
    return json;
  }

};

module.exports = Migration;
