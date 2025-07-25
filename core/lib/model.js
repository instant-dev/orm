const DataTypes = require('../db/data_types.js');
const Database = require('../db/database.js');
const Transaction = require('../db/transaction.js');

const Composer = require('./composer.js');
const ModelArray = require('./model_array.js');
const ModelFactory = require('./model_factory.js');
const utilities = require('./utilities.js');

const inflect = require('i')();
const deepEqual = require('deep-equal');

const { RelationshipGraph, RelationshipNode, RelationshipPath, RelationshipEdge } = require('./relationship_graph.js');
const Relationships = new RelationshipGraph();

/**
* Instant ORM Model Instance
* @class
*/
class Model {

  /**
  * @param {object} modelData Data to load into the object
  * @param {?boolean} fromStorage Is this model being loaded from storage? Defaults to false.
  * @param {?boolean} fromSeed Is this model being seeded?
  */
  constructor (modelData, fromStorage, fromSeed) {

    modelData = modelData || {};

    this.__initialize__();
    this.__load__(modelData, fromStorage, fromSeed);

  }

  /**
  * Finds a model with a provided id, otherwise returns a notFound error.
  * @param {number} id The id of the model you're looking for
  * @param {?Transaction} txn SQL transaction to use for this method
  * @returns {Promise<Model>}
  */
  static async find (id, txn) {
    let db = this.prototype.db;
    let query = new Composer(this);
    let models = await query
      .where({id: id})
      .select(txn);
    if (!models.length) {
      let e = new Error(`Could not find ${this.name} with id "${id}".`);
      e.notFound = true;
      throw e;
    }
    return models[0];
  }

  /**
  * Finds a model with a provided field, value pair. Returns the first found.
  * @param {string} field Name of the field
  * @param {any} value Value of the named field to compare against
  * @returns {Promise<Model>}
  */
  static async findBy (field, value, txn) {
    let db = this.prototype.db;
    let params = {};
    params[field] = value;
    let query = new Composer(this);
    let models = await query
      .where(params)
      .select(txn);
    if (!models.length) {
      let e = new Error(`Could not find ${this.name} with ${field} "${value}".`);
      e.notFound = true;
      throw e;
    }
    return models[0];
  }

  /**
  * Creates a new model instance using the provided data.
  * @param {object} data The data to load into the object.
  * @param {?Transaction} txn SQL transaction to use for this method
  * @returns {Promise<Model>}
  */
  static async create (data, txn) {
    let model = new this(data);
    return model.save(txn);
  }

  /**
  * Updates or creates a model with a provided field, value pair. Returns the first found.
  * @param {string} field Name of the field
  * @param {object} data Key-value pairs of Model creation data. Will use appropriate value to query for based on "field" parametere.
  * @param {?Transaction} txn SQL transaction to use for this method
  * @returns {Promise<Model>}
  */
  static async updateOrCreateBy (field, data, txn) {
    try {
      let model = await this.findBy(field, data[field], txn);
      model.read(data);
      return model.save(txn);
    } catch (e) {
      if (e.notFound) {
        return this.create(data, txn);
      } else {
        throw e;
      }
    }
  };

  /**
  * Finds and updates a model with a specified id. Return a notFound error if model does not exist.
  * @param {number} id The id of the model you're looking for
  * @param {object} data The data to load into the object.
  * @param {?Transaction} txn SQL transaction to use for this method
  * @returns {Promise<Model>}
  */
  static async update (id, data, txn) {
    let model = await this.find(id, txn);
    model.read(data);
    return model.save(txn);
  }

  /**
  * Finds and destroys a model with a specified id. Return a notFound error if model does not exist.
  * @param {number} id The id of the model you're looking for
  * @param {?Transaction} txn SQL transaction to use for this method
  * @returns {Promise<Model>}
  */
  static async destroy (id, txn) {
    let model = await this.find(id, txn);
    return model.destroy(txn);
  }

  /**
  * Creates a new Composer (ORM) instance to begin a new query.
  * @param {?Nodal.Database} readonlyDb Provide a readonly database to query from
  * @returns {import('./composer')}
  */
  static query (readonlyDb) {
    return new Composer(this, null, readonlyDb);
  }

  /**
  * Get the model's name
  * @returns {string}
  */
  static getName () {
    return this.name;
  }

  /**
  * Get the model's table name
  * @returns {string}
  */
  static table () {
    return this.schema.name;
  }

  /**
  * Get the model's column data
  * @returns {Array}
  */
  static columns () {
    return this.schema.columns;
  };

  /**
  * Get the model's column names (fields)
  * @returns {Array}
  */
  static columnNames () {
    return this.columns().map(v => v.name);
  }

  /**
  * Get the model's column names with additional data for querying
  * @returns {Array}
  */
  static columnQueryInfo (columnList) {
    let columns = columnList
      ? this.schema.columns.filter(c => columnList.indexOf(c.name) > -1)
      : this.schema.columns.slice();
    return columns.map(c => {
      let nc = Object.keys(c).reduce((nc, key) => {
        nc[key] = c[key];
        return nc;
      }, {});
      nc.columnNames = [nc.name];
      nc.alias = nc.name;
      nc.transformation = v => v;
      nc.joined = false;
      return nc;
    });
  }

  static aliasedColumnQueryInfo (aliasedColumnList) {
    return aliasedColumnList.map(name => {
      return {
        name: name,
        type: 'any',
        columnNames: [name],
        alias: name,
        transformation: v => v,
        joined: false
      }
    });
  }

  /**
  * Get the model's column lookup data
  * @returns {object}
  */
  static columnLookup () {
    return this.columns().reduce((p, c) => {
      p[c.name] = c;
      return p;
    }, {});
  }

  /**
  * Check if the model has a column name in its schema
  * @param {string} columnName
  * @returns {boolean}
  */
  static hasColumn (columnName) {
    return !!this.column(columnName);
  }

  /**
  * Get the column schema data for a given name
  * @param {string} columnName
  * @returns {object}
  */
  static column (columnName) {
    return this.columnLookup()[columnName];
  }

  /**
  * Set the database to be used for this model
  * @param {import('../db/database.js')} db
  * @returns {import('../db/database.js')}
  */
  static setDatabase (db) {
    this.prototype.db = db;
    return db;
  }

  /**
  * Set the schema to be used for this model
  * @param {object} schema
  * @returns {object}
  */
  static setTableSchema (schema) {

    if (!schema) {
      throw new Error([
        `Could not set Schema for ${this.name}.`,
        `Please make sure to run any outstanding migrations.`
      ].join('\n'));
    }

    return this.schema = schema;

  }

  /**
  * Sets the static and normal .getModel method
  * @private
  * @param {function} referenceFn
  * @returns {boolean}
  */
  static setModelReference (referenceFn) {
    this.prototype.getModel = referenceFn;
    this.prototype.getModelFactory = function getModelFactory (name) {
      return new ModelFactory(referenceFn.call(this, name));
    };
    this.getModel = referenceFn;
    this.getModelFactory = function getModelFactory (name) {
      return new ModelFactory(referenceFn.call(this, name));
    };
    return true;
  }

  /**
  * Sets the vector manager
  * @private
  * @param {import('./vector_manager')} vectorManager
  * @returns {boolean}
  */
  static setVectorManager (vectorManager) {
    /**
     * @private
     */
    this.prototype._vectorManager = vectorManager;
    return true;
  }

  /**
  * Sets the plugins manager
  * @private
  * @param {import('./plugins_manager')} pluginsManager
  * @returns {boolean}
  */
  static setPluginsManager (pluginsManager) {
    this.prototype.getPlugin = (name) => pluginsManager.getPlugin(name);
    this.getPlugin = (name) => pluginsManager.getPlugin(name);
    return true;
  }

  /**
   * Gets column properties defaultValue nullable, unique, primary_key, auto_increment, array
   * @param {string} field The field on the model
   * @returns {object}
   */
  static getColumnProperties (field) {
    let column = this.column(field);
    if (!column) {
      throw new Error(`Column "${field}" not found for "${this.getName()}"`);
    }
    let db = this.prototype.db;
    let properties = {};
    let columnProperties = column.properties || {};
    if (db) {
      let inheritProperties = (db.adapter.simpleTypes[column.type] || {}).properties || {};
      Object.keys(db.adapter.typePropertyDefaults).forEach(key => {
        if (key in columnProperties) {
          properties[key] = columnProperties[key];
        } else if (key in inheritProperties) {
          properties[key] = inheritProperties[key];
        } else {
          properties[key] = db.adapter.typePropertyDefaults[key];
        }
      });
    } else {
      Object.keys(columnProperties).forEach(key => {
        properties[key] = columnProperties[key];
      });
    }
    return properties;
  }

  /**
  * Returns all valid relationships of the model
  * @returns {RelationshipNode}
  */
  static relationships () {
    return Relationships.of(this);
  }

  /**
  * Returns details on how Models are related to each other
  * @returns {RelationshipPath}
  */
  static relationship (name) {
    this._relationshipCache = this._relationshipCache || {};
    this._relationshipCache[name] = (this._relationshipCache[name] || this.relationships().findExplicit(name));
    return this._relationshipCache[name];
  }

  /**
  * Sets a joins relationship for the Model. Sets joinedBy relationship for parent.
  * @param {Model} Model The Model class which your current model belongs to
  * @param {object} options
  * @param {?string} options.name The string name of the parent in the relationship (default to camelCase of Model name)
  * @param {?string} options.via Which field in current model represents this relationship, defaults to `${name}_id`
  * @param {?string} options.as What to display the name of the child as when joined to the parent (default to camelCase of child name)
  * @param {?string} options.multiple Whether the child exists in multiples for the parent (defaults to false)
  * @returns {RelationshipEdge}
  */
  static joinsTo (Model, options) {
    return this.relationships().joinsTo(Model, options);
  }

  /**
  * Create a validator. These run synchronously and check every time a field is set / cleared.
  * @param {string} field The field you'd like to validate
  * @param {string} message The error message shown if a validation fails.
  * @param {function} fnAction the validation to run - first parameter is the value you're testing.
  * @returns {boolean}
  */
  static validates (field, message, fnAction) {

    if (typeof fnAction !== 'function') {
      throw new Error(`.validates expects a valid function`);
    } else if (fnAction.constructor.name === 'AsyncFunction') {
      throw new Error(`.validates expects synchronous function, use .verifies to validate asynchronously on save`);
    } else if (fnAction.constructor.name !== 'Function') {
      throw new Error(`.validates expects a valid function: generators are not allowed`);
    }

    if (!this.prototype.hasOwnProperty('_validations')) {
      this.prototype._validations = {};
      this.prototype._validationsList = [];
    };

    if (!this.prototype._validations[field]) {
      this.prototype._validationsList.push(field);
    }

    this.prototype._validations[field] = this.prototype._validations[field] || [];
    this.prototype._validations[field].push({message: message, action: fnAction});
    return true;

  }

  /**
  * Checks a validator synchronously.
  * @param {string} field The field you'd like to validate
  * @param {any} value The value of the field to validate
  * @returns {Array<string>}
  */
  static validationCheck (field, value) {
    return (this.prototype._validations[field] || []).map(validation => {
      return validation.action(value) ? null : validation.message;
    }).filter(v => !!v);
  }

  /**
  * Creates a verifier. These run asynchronously, support multiple fields, and check every time you try to save a Model.
  * @param {string} field The field applied to the verification.
  * @param {string} message The error message shown if a verification fails.
  * @param {function} fnAction The asynchronous verification method. The last argument passed is always a callback, and field names are determined by the argument names.
  * @returns {boolean}
  */
  static verifies (field, message, fnAction) {

    // Also support generic
    if (arguments.length === 2) {
      fnAction = message;
      message = field;
      field = null;
    }

    if (typeof fnAction !== 'function') {
      throw new Error(`.verifies expects a valid async function`);
    } else if (fnAction.constructor.name === 'Function') {
      throw new Error(`.verifies expects an asynchronous function, use .validates to validate synchronously`);
    } else if (fnAction.constructor.name !== 'AsyncFunction') {
      throw new Error(`.verifies expects a valid async function`);
    }

    if (!this.prototype.hasOwnProperty('_verifications')) {
      this.prototype._verifications = {};
      this.prototype._verificationsList = [];
    };

    const fields = utilities.getFunctionParameters(fnAction).slice(0);

    this.prototype._verificationsList.push({
      field: field,
      message: message,
      action: fnAction,
      fields: fields
    });

    if (field) {
      this.prototype._verifications[field] = this.prototype._verifications[field] || [];
      this.prototype._verifications[field].push({
        message: message,
        action: fnAction,
        fields: fields
      });
    }

    return true;

  }

  /**
  * Checks a verifier synchronously.
  * @param {string} field The field you'd like to verify
  * @param {any} value The value of the field you'd like to verify
  * @param {object} data Any additional field data, in key-value pairs
  * @returns {Promise<Array<string>>}
  */
  static async verificationCheck (field, value, data) {
    data = data || {};
    data[field] = value;
    let verifications = this.prototype._verifications[field] || [];
    let results;
    for (let i = 0; i < verifications.length; i++) {
      let verification = verifications[i];
      let result = await verification.action.apply(
        this,
        verification.fields.map(field => data[field])
      );
      results.push(result);
    }
    return results.map((result, i) => {
      return result ?
        null :
        this.prototype._verifications[field][i].message;
    }).filter(v => !!v);
  }

  /**
  * Create a calculated field that is processed in JavaScript (not SQL). Must be synchronous.
  * @param {string} calcField The name of the calculated field
  * @param {function} fnCalculate The synchronous method to perform a calculation for.
  *   Pass the names of the (non-computed) fields you'd like to use as parameters.
  * @returns {boolean}
  */
  static calculates (calcField, fnCompute) {

    if (!this.prototype.hasOwnProperty('_calculations')) {
      this.prototype._calculations = {};
      this.prototype._calculationsList = [];
    }

    if (this.prototype._calculations[calcField]) {
      throw new Error(`Calculated field "${calcField}" for "${this.name}" already exists!`);
    }

    let fields = utilities.getFunctionParameters(fnCompute);

    // TODO: reimplement, currently schema is loaded after this
    // let columnLookup = this.columnLookup();

    // if (columnLookup[calcField]) {
    //  throw new Error(`Cannot create calculated field "${calcField}" for "${this.name}", field already exists.`);
    // }

    // fields.forEach(f => {
    //   if (!columnLookup[f]) {
    //     throw new Error(`Calculation function error: "${calcField} for "${this.name}" using field "${f}", "${f}" does not exist.`)
    //   }
    // });

    this.prototype._calculations[calcField] = {
      calculate: fnCompute,
      fields: fields
    };

    this.prototype._calculationsList.push(calcField);

    return true;

  }

  /**
  * Hides fields from being output in .toJSON() (i.e. API responses), even if asked for
  * @param {string} field
  * @returns {boolean}
  */
  static hides (field) {

    if (!this.prototype.hasOwnProperty('_hides')) {
      this.prototype._hides = {};
    }

    this.prototype._hides[field] = true;
    return true;

  }

  /**
  * Tells us if a field is hidden (i.e. from API queries)
  * @param {string} field
  * @returns {boolean}
  */
  static isHidden (field) {
    return this.prototype._hides[field] || false;
  }

  /**
  * Automatically vectorizes model information on model creation and save
  * @param {string} field The vector field to store the data in
  * @param {function} fnConvert Synchronous function that composes one or more fields into a string to convert into a vector
  * @returns {boolean}
  */
  static vectorizes (field, fnConvert) {

    if (typeof fnConvert !== 'function') {
      throw new Error(`.vectorizes "fnConvert" expects a valid function`);
    } else if (fnConvert.constructor.name === 'AsyncFunction') {
      throw new Error(`.vectorizes "fnConvert" expects synchronous function`);
    } else if (fnConvert.constructor.name !== 'Function') {
      throw new Error(`.vectorizes "fnConvert" expects a valid function: generators are not allowed`);
    }

    if (!this.prototype.hasOwnProperty('_vectorizationsList')) {
      this.prototype._vectorizationsList = [];
    };

    const fields = utilities.getFunctionParameters(fnConvert).slice(0);

    this.prototype._vectorizationsList.push({
      field: field,
      fields: fields,
      convert: fnConvert
    });

    return true;

  }

  /**
  * Prepare model for use
  * @private
  */
  __initialize__ () {

    /**
     * @private
     */
    this._relationshipCache = {};
    /**
     * @private
     */
    this._joinsCache = {};
    /**
     * @private
     */
    this._joinsList = [];
    /**
     * @private
     */
    this._data = this.constructor.columnNames()
      .reduce((p, c) => {
        p[c] = null;
        return p;
      }, {});
    /**
     * @private
     */
    this._metafields = {};
    /**
     * @private
     */
    this._changed = this.constructor.columnNames()
      .reduce((p, c) => {
        p[c] = false;
        return p;
      }, {});
    /**
     * @private
     */
    this._errors = {};
    /**
     * @private
     */
    this._errorDetails = {};
    /**
     * @private
     */
    this._isCreating = false;

    return true;

  }

  /**
  * Loads data into the model
  * @private
  * @param {object} data Data to load into the model
  * @param {?boolean} fromStorage Specify if the model was loaded from storage. Defaults to false.
  * @param {?boolean} fromSeed Specify if the model was generated from a seed. Defaults to false.
  * @returns {Model}
  */
  __load__ (data, fromStorage, fromSeed) {

    data = data || {};

    /**
     * @private
     */
    this._inStorage = !!fromStorage;
    /**
     * @private
     */
    this._isSeeding = !!fromSeed;

    if (!fromStorage) {
      if (
        this.constructor.hasColumn('created_at') &&
        this.constructor.column('created_at').type === 'datetime'
      ) {
        data['created_at'] = new Date();
      }
      if (
        this.constructor.hasColumn('updated_at') &&
        this.constructor.column('updated_at').type === 'datetime'
      ) {
        data['updated_at'] = new Date();
      }
    }

    let keys = Object.keys(data);

    keys.forEach(key => {
      this.__safeSet__(key, data[key]);
      this._changed[key] = !fromStorage
    });

    this.__validate__();

    return this;

  }

  /**
  * Validates provided fieldList (or all fields if not provided)
  * @private
  * @param {?Array} fieldList fields to validate
  * @returns {boolean}
  */
  __validate__ (field) {

    let data = this._data;

    if (!field) {

      let valid = true;
      this._validationsList.forEach(field => valid = (this.__validate__(field) && valid));
      return valid;

    } else if (!this._validations[field]) {

      return true;

    }

    this.clearError(field);
    let value = this._data[field];

    return this._validations[field].filter(validation => {
      let valid = validation.action.call(null, value);
      !valid && this.setError(field, validation.message);
      return valid;
    }).length === 0;

  }

  /**
  * Sets specified field data for the model, assuming data is safe and does not log changes
  * @private
  * @param {string} field Field to set
  * @param {any} value Value for the field
  * @returns {Model|any}
  */
  __safeSet__ (field, value) {
    if (field.startsWith('__')) {
      field = field.slice(2);
      this._metafields[field] = value;
    } else if (this.relationship(field)) {
      return this.setJoined(field, value);
    } else if (!this.hasField(field)) {
      return null;
    } else {
      return this._data[field] = this.convert(field, value);
    }
  }

  /**
   * Retrieves another Model; used to import other models in lifecycle callbacks:
   * beforeSave(), afterSave(), beforeDestroy(), afterDestroy()
   * @param {string} name
   * @returns {typeof Model}
   */
  getModel (name) {
    // Gets written over
    return new this.constructor({});
  }

  /**
  * Indicates whethere or not the model is currently represented in hard storage (db).
  * @returns {boolean}
  */
  inStorage () {
    return this._inStorage;
  }

  /**
  * Indicates whethere or not the model is currently being created, handled by the save() method.
  * @returns {boolean}
  */
  isCreating () {
    return !!this._isCreating;
  }

  /**
  * Indicates whethere or not the model is being generated from a seed.
  * @returns {boolean}
  */
  isSeeding () {
    return this._isSeeding;
  }

  /**
  * Tells us whether a model field has changed since we created it or loaded it from storage.
  * @param {string} field The model field
  * @returns {boolean}
  */
  hasChanged (field) {
    return field === undefined ? this.changedFields().length > 0 : !!this._changed[field];
  }

  /**
  * Provides an array of all changed fields since model was created / loaded from storage
  * @returns {Array}
  */
  changedFields () {
    let changed = this._changed;
    return Object.keys(changed).filter(v => changed[v]);
  }

  /**
  * Creates an error object for the model if any validations have failed, returns null otherwise
  * @returns {Error}
  */
  errorObject () {

    let error = null;

    if (this.hasErrors()) {

      let errorObject = this.getErrors();
      let message = errorObject._query
        ? errorObject._query.message
        : 'Validation error';

      error = new Error(message);
      error.statusCode = 400;
      error.details = errorObject;
      error.values = Object.keys(error.details).reduce((values, key) => {
        values[key] = this._data[key];
        return values;
      }, {});
      if (errorObject._query) {
        error.identifier = error.details._query.message;
      }

    }

    return error;

  }

  /**
  * Tells us whether or not the model has errors (failed validations)
  * @returns {boolean}
  */
  hasErrors () {

    return Object.keys(this._errors).length > 0;

  }

  /**
  * Gives us an error object with each errored field as a key, and each value
  * being an array of failure messages from the validators
  * @returns {object}
  */
  getErrors () {
    let obj = {};
    let errors = this._errors;
    Object.keys(errors).forEach(key => {
      const messages = errors[key];
      const message = messages[0];
      const additional = messages.length > 1 ? messages.slice(1) : void 0;
      obj[key] = {message, invalid: true, additional};
    });
    return obj;
  }

  /**
  * Reads new data into the model.
  * @param {object} data Data to inject into the model
  * @returns {Model}
  */
  read (data) {

    this.fieldList()
      .concat(this._joinsList)
      .filter(key => key in data)
      .forEach(key => this.set(key, data[key]));

    return this;

  }

  /**
  * Converts a value to its intended format based on its field. Returns null if field not found.
  * @param {string} field The field to use for conversion data
  * @param {any} value The value to convert
  * @returns {any}
  */
  convert (field, value) {
    if (!this.hasField(field) || value === null || value === undefined) {
      return null;
    }
    let dataType = this.getDataTypeOf(field);
    if (this.isFieldArray(field)) {
      return (value instanceof Array ? value : [value]).map(v => dataType.convert(v));
    }
    return dataType.convert(value);
  }

  /**
  * Grabs the path of the given relationship from the RelationshipGraph
  * @param {string} name the name of the relationship
  * @returns {RelationshipPath}
  */
  relationship (name) {
    return this.constructor.relationship(name);
  }

  /**
  * Sets specified field data for the model. Logs and validates the change.
  * @param {string} field Field to set
  * @param {any} value Value for the field
  * @returns {any}
  */
  set (field, value) {

    if (!this.hasField(field)) {

      throw new Error('Field ' + field + ' does not belong to model ' + this.constructor.name);

    }

    let curValue = this._data[field];
    let changed = false;
    value = this.convert(field, value);

    if (value !== curValue) {
      changed = true;
    }

    this._data[field] = value;
    this._changed[field] = changed;
    changed && this.__validate__(field);

    return value;

  }

  /**
  * Set a joined object (Model or ModelArray)
  * @param {string} field The field (name of the join relationship)
  * @param {Model|ModelArray} value The joined model or array of models
  * @returns {Model|ModelArray}
  */
  setJoined (field, value) {

    let relationship = this.relationship(field);

    if (Array.isArray(value) && !value.length) {
      value = new ModelArray(relationship.getModel());
    } else if (Array.isArray(value) && !(value instanceof ModelArray)) {
      value = ModelArray.from(value);
    }

    if (!relationship.multiple()) {

      if (!(value instanceof relationship.getModel())) {

        throw new Error(`${value} is not an instance of ${relationship.getModel().name}`);

      }

    } else {

      if (!(value instanceof ModelArray) && ModelArray.Model !== relationship.getModel()) {

        throw new Error(`${value} is not an instanceof ModelArray[${relationship.getModel().name}]`);

      }

    }

    if (!this._joinsCache[field]) {
      this._joinsList.push(field);
    }

    this._joinsCache[field] = value;

    return value;

  }

  /**
  * Clear a joined object (Model or ModelArray)
  * @param {string} field The field (name of the join relationship)
  * @returns {Model|ModelArray}
  */
  clearJoined (field) {

    let relationship = this.relationship(field);

    if (!relationship) {

      throw new Error(`No relationship named "${field}" exists`);

    }

    this._joinsList = this._joinsList.filter((joinName) => {
      return joinName !== field;
    });

    let value = this._joinsCache[field];

    delete this._joinsCache[field];

    return value;

  }

  /**
  * Calculate field from calculations (assumes it exists)
  * @param {string} field Name of the calculated field
  * @returns {any}
  */
  calculate (field) {
    let calc = this._calculations[field];
    return calc.calculate.apply(
      this,
      calc.fields.map(f => this.get(f))
    );
  }

  /**
  * Retrieve field data for the model.
  * @param {string} field Field for which you'd like to retrieve data.
  * @returns {any}
  */
  get (field, defaultValue) {
    if (this._calculations[field]) {
      return this.calculate(field);
    }
    return this._data.hasOwnProperty(field) ? this._data[field] : defaultValue;
  }

  /**
  * Retrieve metafield data for the model: this data is populated via search, similarity queries
  * @param {string} field Field for which you'd like to retrieve metadata
  * @returns {any}
  */
  getMetafield (field, defaultValue) {
    return this._metafields.hasOwnProperty(field) ? this._metafields[field] : defaultValue;
  }

  /**
  * Retrieves joined Model or ModelArray
  * @param {string} joinName the name of the join (list of connectors separated by __)
  * @returns {Model|ModelArray}
  */
  joined (joinName) {
    return this._joinsCache[joinName];
  }

  /**
  * Retrieve associated models joined this model from the database.
  * @param {Array} joinNames The joines model names to return
  * @param {?Transaction} txn SQL transaction used to execute this save method
  * @returns {Promise<Array<Model|ModelArray>>}
  */
  async include (joinNames, txn) {

    let db = this.db;
    let source = txn || db;

    joinNames = joinNames.slice();
    if (!joinNames.length) {
      throw new Error('No valid relationships specified in joinNames');
    }
    let invalidJoinNames = joinNames.filter(r => !this.relationship(r));
    if (invalidJoinNames.length) {
      throw new Error(`Joins "${invalidJoinNames.join('", "')}" for model "${this.constructor.name}" do not exist.`);
    }

    let query = this.constructor.query()
      .where({id: this.get('id')});
    joinNames.forEach(joinName => query = query.join(joinName));
    let models = await query.select(txn);

    if (!models || !models.length) {
      throw new Error('Could not fetch parent');
    }

    let model = models[0];
    let joins = joinNames.map(joinName => {
      let join = model.joined(joinName);
      join && this.setJoined(joinName, join);
      return join;
    });
    return joins;

  };

  /**
   * Creates a query JSON response: includes a meta and data field for API responses
   * @param {array} arrInterface
   * @returns {object}
   */
  toQueryJSON (arrInterface) {
    let arr = ModelArray.from([this]);
    return arr.toQueryJSON(arrInterface);
  }

  /**
  * Creates a plain object from the Model, with properties matching an optional interface
  * @param {?array} arrInterface Interface to use for object creation
  * @returns {object}
  */
  toJSON (arrInterface) {

    let obj = {};

    arrInterface = arrInterface ||
      this.fieldList()
      .concat(this._calculationsList)
      .filter(key => !this._hides[key]);

    arrInterface.forEach(key => {

      if (this._hides[key]) {
        return;
      }

      let joinObject;

      if (typeof key === 'object' && key !== null) {
        let subInterface = key;
        key = Object.keys(key)[0];
        joinObject = this._joinsCache[key];
        joinObject && (obj[key] = joinObject.toJSON(subInterface[key]));
      } else if (this._data[key] !== undefined) {
        obj[key] = this._data[key];
      } else if (this._calculations[key] !== undefined) {
        obj[key] = this.calculate(key);
      } else if (joinObject = this._joinsCache[key]) {
        obj[key] = joinObject.toJSON();
      }

    });

    if (Object.keys(this._metafields).length) {
      obj['_metafields'] = this._metafields;
    }

    return obj;

  }

  /**
  * Get the table name for the model.
  * @returns {string}
  */
  tableName () {
    return this.constructor.table();
  }

  /**
  * Determine if the model has a specified field.
  * @param {string} field
  * @returns {boolean}
  */
  hasField (field) {
    return !!this.constructor.columnLookup()[field];
  }

  /**
  * Retrieve the schema field data for the specified field
  * @param {string} field
  * @returns {object}
  */
  getFieldData (field) {
    return this.constructor.columnLookup()[field];
  }

  /**
  * Retrieve the schema data type for the specified field
  * @param {string} field
  * @returns {string}
  */
  getDataTypeOf (field) {
    let type = this.constructor.columnLookup()[field].type;
    let dataType = DataTypes[type];
    if (!dataType) {
      throw new Error(`Data type "${type}" for field "${field}" not supported (reading "${this.tableName()}")`);
    }
    return dataType;
  }

  /**
  * Determine whether or not this field is an Array (PostgreSQL supports this)
  * @param {string} field
  * @returns {boolean}
  */
  isFieldArray (field) {
    let properties = this.constructor.getColumnProperties(field);
    return properties.array;
  }

  /**
  * Determine whether or not this field is a primary key in our schema
  * @param {string} field
  * @returns {boolean}
  */
  isFieldPrimaryKey (field) {
    let properties = this.constructor.getColumnProperties(field);
    return !!properties.primary_key;
  }

  /**
  * Retrieve the defaultValue for this field from our schema
  * @param {string} field
  * @returns {any}
  */
  fieldDefaultValue (field) {
    let properties = this.constructor.getColumnProperties(field);
    return properties.defaultValue || null;
  }

  /**
  * Retrieve an array of fields for our model
  * @returns {Array}
  */
  fieldList () {
    return this.constructor.columnNames().slice();
  }

  /**
  * Retrieve our field schema definitions
  * @returns {Array}
  */
  fieldDefinitions () {
    return this.constructor.columns().slice();
  }

  /**
  * Set an error for a specified field (supports multiple errors)
  * @param {string} key The specified field for which to create the error (or '*' for generic)
  * @param {string} message The error message
  * @returns {boolean}
  */
  setError (key, message, code) {
    this._errors[key] = this._errors[key] || [];
    this._errors[key].push(message);
    if (code) {
      this._errorDetails[key] = this.db.adapter.readErrorCode(code);
    }
    return true;
  }

  /**
  * Clears all errors for a specified field
  * @param {string} key The specified field for which to create the error (or '*' for generic)
  * @returns {boolean}
  */
  clearError (key) {
    delete this._errors[key];
    delete this._errorDetails[key];
    return true;
  }

  /**
   * @private
   */
  __generateSaveQuery__ () {

    let query, columns;
    let db = this.db;

    if (!this.inStorage()) {

      columns = this.fieldList().filter(v => !this.isFieldPrimaryKey(v) && this.get(v) !== undefined);
      query = db.adapter.generateInsertQuery(this.constructor.schema.name, columns);

    } else {

      columns = ['id'].concat(this.changedFields().filter(v => !this.isFieldPrimaryKey(v)));
      query = db.adapter.generateUpdateQuery(this.constructor.schema.name, columns);

    }

    return {
      sql: query,
      params: columns.map(v => db.adapter.sanitize(this.getFieldData(v).type, this.get(v)))
    };

  }

  /**
  * Logic to execute before a model saves. Intended to be overwritten when inherited.
  * @private
  */
  async beforeSave () {}

  /**
  * Logic to execute after a model saves. Intended to be overwritten when inherited.
  * @private
  */
  async afterSave () {}

  /**
  * Save a model (execute beforeSave and afterSave)
  * @param {?Transaction} txn SQL transaction used to execute this save method
  * @param {Model} waitForModel Must wait for this model to save before continuing
  * @returns {Model}
  */
  async save (txn, waitForModel = null) {
    if (this.hasErrors()) {
      throw this.errorObject();
    }
    let isNewTransaction = !txn;
    if (isNewTransaction) {
      txn = this.db.createTransaction();
    }
    if (!this.inStorage()) {
      this._isCreating = true;
    }
    try {
      await this.__verify__(txn);
      await this.beforeSave(txn);
      await this.__vectorize__(txn);
      while (waitForModel && waitForModel._isCreating) {
        await new Promise(r => setTimeout(() => r(1), 1));
      }
      await this.__save__(txn);
      await this.afterSave(txn);
    } catch (e) {
      this._isCreating = false;
      if (isNewTransaction) {
        await txn.rollback();
      }
      throw e;
    }
    this._isCreating = false;
    if (isNewTransaction) {
      await txn.commit();
    }
    return this;
  }

  /**
  * Runs an update query for this specific model instance
  * @param {object} fields Key-value pairs of fields to update
  * @returns {ModelArray}
  */
  async update (fields) {
    return this.constructor.query()
      .where({id: this.get('id')})
      .update(fields);
  }

  /**
  * Runs all verifications before saving
  * @private
  */
  async __verify__ () {
    // Run through verifications in order they were added
    for (let i = 0; i < this._verificationsList.length; i++) {
      const verification = this._verificationsList[i];
      let result = await verification.action.apply(
        this,
        verification.fields.map(field => this.get(field))
      );
      if (!result) {
        if (verification.field) {
          this.setError(verification.field, verification.message);
        } else {
          const error = new Error(verification.message);
          error.statusCode = 400;
          throw error;
        }
      } else {
        this.clearError(verification.field);
      }
    }
    if (this.hasErrors()) {
      throw this.errorObject();
    }
  }

  /**
  * Runs all vectorizations before saving
  * @private
  */
  async __vectorize__ () {
    const fns = [];
    for (let i = 0; i < this._vectorizationsList.length; i++) {
      const v = this._vectorizationsList[i];
      const hasChanged = v.fields.find(field => this.hasChanged(field));
      if (hasChanged) {
        if (!this._vectorManager) {
          throw new Error(`Could not vectorize "${v.field}" for "${this.constructor.name}": no VectorManager instance set`);
        }
        const fieldData = this.getFieldData(v.field);
        if (fieldData.type !== 'vector') {
          throw new Error(`Could not vectorize "${v.field}" for "${this.constructor.name}": not a valid vector`);
        }
        const fn = async () => {
          const str = v.convert.apply(null, v.fields.map(field => this.get(field)));
          const vector = await this._vectorManager.create(str);
          this.set(v.field, vector);
        };
        fns.push(fn);
      }
    }
    if (fns.length) {
      await Promise.all(fns.map(fn => fn()));
    }
    return true;
  }

  /**
  * Saves model to database
  * @private
  * @param {?Transaction} txn SQL transaction to use for save
  */
  async __save__ (txn) {
    if (
      this.constructor.hasColumn('updated_at') &&
      this.constructor.column('updated_at').type === 'datetime'
    ) {
      this.set('updated_at', new Date());
    }
    let query = this.__generateSaveQuery__();
    let source = txn ? txn : this.db;
    let result = null;
    try {
      result = await source.query(query.sql, query.params);
    } catch (e) {
      this.setError('_query', e.message, e.code);
    }
    if (this.hasErrors()) {
      throw this.errorObject();
    }
    if (result && result.rows && result.rows.length) {
      this.__load__(result.rows[0], true);
    }
  }

  /**
  * Destroys model and cascades all deletes.
  * @param {?Transaction} txn SQL transaction to use for this method
  * @returns {Promise<Model>}
  */
  async destroyCascade (txn) {
    let models = ModelArray.from([this])
    let result = await models.destroyCascade(txn);
    return result[0];
  }

  /**
  * Logic to execute before a model gets destroyed. Intended to be overwritten when inherited.
  * @private
  * @param {?Transaction} txn SQL transaction to use for this method
  */
  async beforeDestroy (txn) {}

  /**
  * Logic to execute after a model is destroyed. Intended to be overwritten when inherited.
  * @private
  * @param {?Transaction} txn SQL transaction to use for this method
  */
  async afterDestroy (txn) {}

  /**
  * Destroys model reference in database.
  * @param {?Transaction} txn SQL transaction to use for this method
  * @returns {Promise<Model>}
  */
  async destroy (txn) {
    await this.beforeDestroy(txn);
    await this.__destroy__(txn);
    await this.afterDestroy(txn);
    return this;
  }

  /**
  * Destroys model reference in database
  * @private
  * @param {?Transaction} txn SQL transaction to use for this method
  */
  async __destroy__ (txn) {
    let db = this.db;
    if (!(db instanceof Database)) {
      throw new Error('Must provide a valid Database to save to');
    }
    if (!this.inStorage()) {
      this.setError('_query', `Model has not been saved`);
      throw new Error(`Model has not been saved`);
    }
    let columns = this.fieldList().filter(v => this.isFieldPrimaryKey(v));
    let query = db.adapter.generateDeleteQuery(this.constructor.schema.name, columns);
    try {
      await (txn || db).query(
        query,
        columns.map(v => {
          return db.adapter.sanitize(
            this.getFieldData(v).type,
            this.get(v, true)
          );
        })
      );
    } catch (e) {
      this.setError('_query', e.message);
      throw e;
    }
    this._inStorage = false;
    return this;
  }

}

/**
 * @private
 */
Model.schema = {
  table: '',
  columns: []
};
/**
 * @private
 */
Model.prototype._validations = {};
/**
 * @private
 */
Model.prototype._validationsList = [];
/**
 * @private
 */
Model.prototype._calculations = {};
/**
 * @private
 */
Model.prototype._calculationsList = [];
/**
 * @private
 */
Model.prototype._verificationsList = [];
/**
 * @private
 */
Model.prototype._vectorizationsList = [];
/**
 * @private
 */
Model.prototype._hides = {};
/**
 * @private
 */
Model.prototype.data = null;
/**
 * @private
 */
Model.prototype.db = null;
/**
 * @private
 */
Model.prototype.externalInterface = [
  'id',
  'created_at',
  'updated_at'
];
/**
 * @private
 */
Model.prototype.aggregateBy = {
  'id': 'count',
  'created_at': 'min',
  'updated_at': 'min'
};

module.exports = Model;
