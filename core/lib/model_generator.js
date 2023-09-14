const SchemaManager = require('../db/schema_manager.js');
const Model = require('./model.js');

const Logger = require('../logger.js');

const fs = require('fs');
const path = require('path');
const inflect = require('i')();

// Template for copying
class __templateClass__ extends Model {

  static tableName = '__tableName__';

  // Logic to execute BEFORE the model has been saved in the DB
  //   this is executed as part of a transaction (txn)
  async beforeSave (txn) {

    /**
     * Any errors in a single .create() or .save() flow
     * will trigger an automatic rollback

     * You should pass txn into any db calls that happen here to keep
     * queries scoped to the current transaction:

     * Instance examples:
     * model.save(txn);
     * model.destroy(txn);

     * Class examples:
     * let model = Model.create(data, txn);
     * let model = Model.update(id, data, txn);
     * let model = Model.updateOrCreateBy(field, data, txn);
     * let model = Model.destroy(id, txn);

     * Composer example:
     * let models = Model.query().transact(txn).[...].select();
     * let models = Model.query().transact(txn).[...].update();

     * Typically you should avoid commits and rollbacks here,
     *   the process that created the txn should handle that
     */

  }

  // Logic to execute AFTER the model has been saved in the DB
  //   same functionality as beforeSave()
  async afterSave (txn) {

  }

}

class ModelGenerator extends Logger {

  constructor () {
    super(`ModelGenerator`, `brightBlue`);
  }

  destroyModels () {
    let pathname = SchemaManager.getDirectory('models');
    if (fs.existsSync(pathname)) {
      fs.readdirSync(pathname).forEach(filename => {
        let fullpath = path.join(pathname, filename);
        fs.unlinkSync(fullpath);
      });
    }
  }

  write (filename, output) {
    if (Buffer.isBuffer(output)) {
      output = output.toString();
    }
    if (typeof output !== 'string') {
      throw new Error(`ModelGenerator#write expects string`);
    }
    SchemaManager.checkdir(SchemaManager.getDirectory('models'));
    let pathname = path.join(SchemaManager.getDirectory('models'), filename);
    if (fs.existsSync(pathname)) {
      throw new Error(
        `Could not write generated model to disk: "${pathname}" already exists.`
      );
    }
    this.log(`Wrote model to "${pathname}"`);
    fs.writeFileSync(pathname, output);
    return pathname;
  }

  extend (tableName, className) {

    if (!tableName) {
      throw new Error(`extend requires tableName`);
    }

    tableName = tableName + '';
    let filename = inflect.singularize(tableName);
    className = (className || inflect.classify(tableName)) + '';

    let output = [
      `const { InstantORM } = require('${process.env.__INSTANT_MODEL_IMPORT || '@instant.dev/orm'}');`,
      ``,
      __templateClass__.toString()
        .replace(/__templateClass__/g, className)
        .replace(/__tableName__/g, tableName)
        .replace(/extends Model/g, 'extends InstantORM.Core.Model'),
      ``,
      `// validate a field synchronously when it is set`,
      `${className}.validates(`,
      `  'my_field',`,
      `  'must be a string',`,
      `  v => typeof v === 'string'`,
      `);`,
      ``,
      `// verify a field asynchronously before it is saved`,
      `${className}.verifies(`,
      `  'my_field',`,
      `  'must be larger than my_other_field by 50',`,
      `  async (my_field, my_other_field) => {`,
      `    await new Promise(res => setTimeout(() => res(), 100));`,
      `    return my_field - my_other_field > 50`,
      `  }`,
      `);`,
      ``,
      `// adds a calculated field, accessible via .get() or on output`,
      `${className}.calculates(`,
      `  'field_sum',`,
      `  (my_field, my_other_field) => my_field + my_other_field`,
      `);`,
      ``,
      `// hides a field: prevent output via .toJSON()`,
      `${className}.hides('hidden_field');`,
      ``,
      `module.exports = ${className};`
    ].join('\n');

    let pathname = this.write(`${filename}.js`, output);
    this.log(`Generated model "${className}" at "${pathname}" to extend table "${tableName}"`);

    return {
      table: tableName,
      className: className,
      pathname: pathname
    };

  }

}

module.exports = ModelGenerator;
