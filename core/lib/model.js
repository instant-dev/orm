const DataTypes = require('../db/data_types.js');
const Database = require('../db/database.js');
const Transaction = require('../db/transaction.js');

const Composer = require('./composer.js');
const ModelArray = require('./model_array.js');
const utilities = require('./utilities.js');

const async = require('async');
const inflect = require('i')();
const deepEqual = require('deep-equal');

const RelationshipGraph = require('./relationship_graph.js');
const Relationships = new RelationshipGraph();

/**
* Basic Model implementation. Optionally interfaces with database.
* @class
*/
class Model {

  /**
  * @param {Object} modelData Data to load into the object
  * @param {optional boolean} fromStorage Is this model being loaded from storage? Defaults to false.
  * @param {option boolean} fromSeed Is this model being seeded?
  */
  constructor (modelData, fromStorage, fromSeed) {

    modelData = modelData || {};

    this.__initialize__();
    this.__load__(modelData, fromStorage, fromSeed);

  }

  /**
  * Finds a model with a provided id, otherwise returns a notFound error.
  * @param {number} id The id of the model you're looking for
  * @param {Transaction} txn OPTIONAL: The SQL transaction to use for this method
  */
  static async find (id, txn) {
    let db = this.prototype.db;
    let query = new Composer(this);
    let models = await query
      .transact(txn)
      .where({id: id})
      .end();
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
  */
  static async findBy (field, value, txn) {
    let db = this.prototype.db;
    let params = {};
    params[field] = value;
    let query = new Composer(this);
    let models = await query
      .transact(txn)
      .where(params)
      .end();
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
  * @param {Transaction} txn OPTIONAL: The SQL transaction to use for this method
  */
  static async create (data, txn) {
    let model = new this(data);
    return model.save(txn);
  }

  /**
  * Updates or creates a model with a provided field, value pair. Returns the first found.
  * @param {string} field Name of the field
  * @param {object} data Key-value pairs of Model creation data. Will use appropriate value to query for based on "field" parametere.
  * @param {Transaction} txn OPTIONAL: The SQL transaction to use for this method
  */
  static async updateOrCreateBy (field, data, txn) {
    try {
      let model = await this.findBy(field, data[field], txn);
      model.read(data);
      return await model.save(txn);
    } catch (e) {
      if (e.notFound) {
        return await this.create(data, txn);
      } else {
        throw e;
      }
    }
  };

  /**
  * Finds and updates a model with a specified id. Return a notFound error if model does not exist.
  * @param {number} id The id of the model you're looking for
  * @param {object} data The data to load into the object.
  * @param {Transaction} txn OPTIONAL: The SQL transaction to use for this method
  */
  static async update (id, data, txn) {
    let model = await this.find(id, txn);
    model.read(data);
    return model.save(txn);
  }

  /**
  * Finds and destroys a model with a specified id. Return a notFound error if model does not exist.
  * @param {number} id The id of the model you're looking for
  * @param {Transaction} txn OPTIONAL: The SQL transaction to use for this method
  */
  static async destroy (id, txn) {
    let model = await this.find(id, txn);
    return model.destroy(txn);
  }

  /**
  * Creates a new Composer (ORM) instance to begin a new query.
  * @param {optional Nodal.Database} readonlyDb Provide a readonly database to query from
  * @return {Nodal.Composer}
  */
  static query (readonlyDb) {
    return new Composer(this, null, readonlyDb);
  }

  /**
  * Get the model's name
  * @return {string}
  */
  static getName () {
    return this.name;
  }

  /**
  * Get the model's table name
  * @return {string}
  */
  static table () {
    return this.prototype.schema.name;
  }

  /**
  * Get the model's column data
  * @return {Array}
  */
  static columns () {
    return this.prototype.schema.columns;
  };

  /**
  * Get the model's column names (fields)
  * @return {Array}
  */
  static columnNames () {
    return this.columns().map(v => v.name);
  }

  /**
  * Get the model's column names with additional data for querying
  * @return {Array}
  */
  static columnQueryInfo (columnList) {
    let columns = columnList
      ? this.prototype.schema.columns.filter(c => columnList.indexOf(c.name) > -1)
      : this.prototype.schema.columns.slice();
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

  /**
  * Get the model's column lookup data
  * @return {Object}
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
  */
  static hasColumn (columnName) {
    return !!this.column(columnName);
  }

  /**
  * Return the column schema data for a given name
  * @param {string} columnName
  */
  static column (columnName) {
    return this.prototype._columnLookup[columnName];
  }

  /**
  * Get resource data for a model, for API responses and debug information
  * @param {Array} arrInterface Array of strings representing output columns, or singularly-keyed objects representing relationships and their interface.
  * @return {Object} Resource object for the model
  * @deprecated
  */
  static toResource (arrInterface) {

    if (!arrInterface || !arrInterface.length) {
      arrInterface = this.columnNames().concat(
        Object.keys(this.prototype._joins)
          .map(r => {
            let obj = {};
            obj[r] = this.joinInformation(r).Model.columnNames();
            return obj;
          })
      );
    }


    let columnLookup = this.columnLookup();

    let resourceColumns = arrInterface.map(r => {

      if (typeof r === 'string') {

        let field = columnLookup[r];

        if (!field) {
          return null;
        }

        let fieldData = {
          name: r,
          type: field ? field.type : 'string'
        };

        field.array && (fieldData.array = true);

        return fieldData;

      } else if (typeof r === 'object' && r !== null) {

        return null; // FIXME: Deprecated for relationships.

        let key = Object.keys(r)[0];
        let relationship = this.joinInformation(key);

        if (!relationship) {
          return null;
        }

        return relationship.Model.toResource(r[key]);

      }

    }).filter(r => r);

    return {
      name: this.name,
      type: 'resource',
      fields: resourceColumns
    };

  }

  /**
  * Set the database to be used for this model
  * @param {Nodal.Database} db
  */
  static setDatabase (db) {
    this.prototype.db = db;
  }

  /**
  * Set the schema to be used for this model
  * @param {Object} schema
  */
  static setSchema (schema) {

    if (!schema) {
      throw new Error([
        `Could not set Schema for ${this.name}.`,
        `Please make sure to run any outstanding migrations.`
      ].join('\n'));
    }

    this.prototype.schema = schema;

    this.prototype._table = this.table();
    this.prototype._columns = this.columns();
    this.prototype._columnNames = this.columnNames();
    this.prototype._columnLookup = this.columnLookup();

    this.prototype._data = this.columnNames()
      .reduce((p, c) => {
        p[c] = null;
        return p;
      }, {});

    this.prototype._changed = this.columnNames()
      .reduce((p, c) => {
        p[c] = false;
        return p;
      }, {});

  }

  static getColumnProperties (field) {
    let column = this.column(field);
    if (!column) {
      throw new Error(`Column "${field}" not found for "${this.getName()}"`);
    }
    let db = this.prototype.db;
    let columnProperties = column.properties || {};
    let inheritProperties = (db.adapter.simpleTypes[column.type] || {}).properties || {};
    let properties = {};
    Object.keys(db.adapter.typePropertyDefaults).forEach(key => {
      if (key in columnProperties) {
        properties[key] = columnProperties[key];
      } else if (key in inheritProperties) {
        properties[key] = inheritProperties[key];
      } else {
        properties[key] = db.adapter.typePropertyDefaults[key];
      }
    });
    return properties;
  }

  /**
  * FIXME
  */
  static relationships () {

    return Relationships.of(this);

  }

  /**
  * FIXME
  */
  static relationship (name) {

    this._relationshipCache = this._relationshipCache || {};
    this._relationshipCache[name] = (this._relationshipCache[name] || this.relationships().findExplicit(name));
    return this._relationshipCache[name];

  }

  /**
  * Sets a joins relationship for the Model. Sets joinedBy relationship for parent.
  * @param {class Nodal.Model} Model The Model class which your current model belongs to
  * @param {Object} [options={}]
  *   "name": The string name of the parent in the relationship (default to camelCase of Model name)
  *   "via": Which field in current model represents this relationship, defaults to `${name}_id`
  *   "as": What to display the name of the child as when joined to the parent (default to camelCase of child name)
  *   "multiple": Whether the child exists in multiples for the parent (defaults to false)
  */
  static joinsTo (Model, options) {

    return this.relationships().joinsTo(Model, options);

  }

  /**
  * Create a validator. These run synchronously and check every time a field is set / cleared.
  * @param {string} field The field you'd like to validate
  * @param {string} message The error message shown if a validation fails.
  * @param {function({any} value)} fnAction the validation to run - first parameter is the value you're testing.
  */
  static validates (field, message, fnAction) {

    if (typeof fnAction !== 'function') {
      throw new Error(`.validates expects a valid function`);
    } else if (fnAction.constructor.name === 'AsyncFunction') {
      throw new Error(`.validates expects a synchronous function, use .verifies to validate asynchronously on save`);
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

  }

  /**
  * Checks a validator synchronously.
  * @param {string} field The field you'd like to validate
  * @param {any} value The value of the field to validate
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

  }

  /**
  * Checks a verifier synchronously.
  * @param {string} field The field you'd like to verify
  * @param {any} value The value of the field you'd like to verify
  * @param {object} data Any additional field data, in key-value pairs
  * @param {function} callback Callback to execute upon completion
  */
  static verificationCheck (field, value, data, callback) {
    data = data || {};
    data[field] = value;
    return async.series(
      (this.prototype._verifications[field] || []).map(verification => {
        return cb => {
          verification.action.apply(
            this,
            verification.fields
              .map(field => data[field])
              .concat(result => cb(null, result))
          )
        };
      }),
      (err, results) => {

        if (err) {
          return callback(err);
        }

        return callback(
          null,
          results.map((result, i) => {
            return result ?
              null :
              this.prototype._verifications[field][i].message;
          }).filter(v => !!v)
        );

      }
    )
  }

  /**
  * Create a calculated field (in JavaScript). Must be synchronous.
  * @param {string} calcField The name of the calculated field
  * @param {function} fnCalculate The synchronous method to perform a calculation for.
  *   Pass the names of the (non-computed) fields you'd like to use as parameters.
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

  }

  /**
  * Hides fields from being output in .toObject() (i.e. API responses), even if asked for
  * @param {String} field
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
  * @param {String} field
  */
  static isHidden (field) {

    return this.prototype._hides[field] || false;

  }

  /**
  * Prepare model for use
  * @private
  */
  __initialize__ () {

    this._relationshipCache = {};

    this._joinsCache = {};
    this._joinsList = [];

    this._data = Object.create(this._data); // Inherit from prototype
    this._changed = Object.create(this._changed); // Inherit from prototype
    this._errors = {};
    this._errorDetails = {};

    return true;

  }

  /**
  * Loads data into the model
  * @private
  * @param {Object} data Data to load into the model
  * @param {optional boolean} fromStorage Specify if the model was loaded from storage. Defaults to false.
  * @param {optional boolean} fromSeed Specify if the model was generated from a seed. Defaults to false.
  */
  __load__ (data, fromStorage, fromSeed) {

    data = data || {};

    this._inStorage = !!fromStorage;
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
  * @param {optional Array} fieldList fields to validate
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
  * @param {string} field Field to set
  * @param {any} value Value for the field
  */
  __safeSet__ (field, value) {

    if (this.relationship(field)) {

      return this.setJoined(field, value);

    }

    if (!this.hasField(field)) {

      return;

    }

    this._data[field] = this.convert(field, value);

  }

  /**
  * Indicates whethere or not the model is currently represented in hard storage (db).
  * @return {boolean}
  */
  inStorage () {
    return this._inStorage;
  }

  /**
  * Indicates whethere or not the model is currently being created, handled by the save() method.
  * @return {boolean}
  */
  isCreating () {
    return !!this._isCreating;
  }

  /**
  * Indicates whethere or not the model is being generated from a seed.
  * @return {boolean}
  */
  isSeeding () {
    return this._isSeeding;
  }

  /**
  * Tells us whether a model field has changed since we created it or loaded it from storage.
  * @param {string} field The model field
  * @return {boolean}
  */
  hasChanged (field) {
    return field === undefined ? this.changedFields().length > 0 : !!this._changed[field];
  }

  /**
  * Provides an array of all changed fields since model was created / loaded from storage
  * @return {Array}
  */
  changedFields () {
    let changed = this._changed;
    return Object.keys(changed).filter(v => changed[v]);
  }

  /**
  * Creates an error object for the model if any validations have failed, returns null otherwise
  * @return {Error}
  */
  errorObject () {

    let error = null;

    if (this.hasErrors()) {

      let errorObject = this.getErrors();
      let message = errorObject._query || 'Validation error';

      error = new Error(message);
      error.details = errorObject;
      error.values = Object.keys(error.details).reduce((values, key) => {
        values[key] = this._data[key];
        return values;
      }, {});
      if (errorObject._query) {
        error.identifier = error.details._query[0];
      }

    }

    return error;

  }

  /**
  * Tells us whether or not the model has errors (failed validations)
  * @return {boolean}
  */
  hasErrors () {

    return Object.keys(this._errors).length > 0;

  }

  /**
  * Gives us an error object with each errored field as a key, and each value
  * being an array of failure messages from the validators
  * @return {Object}
  */
  getErrors () {
    let obj = {};
    let errors = this._errors;
    Object.keys(errors).forEach(function(key) {
      obj[key] = errors[key];
    });
    return obj;
  }

  /**
  * Reads new data into the model.
  * @param {Object} data Data to inject into the model
  * @return {this}
  */
  read (data) {

    this.fieldList()
      .concat(this._joinsList)
      .filter((key) => data.hasOwnProperty(key))
      .forEach((key) => this.set(key, data[key]));

    return this;

  }

  /**
  * Converts a value to its intended format based on its field. Returns null if field not found.
  * @param {string} field The field to use for conversion data
  * @param {any} value The value to convert
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
  */
  relationship (name) {
    return this.constructor.relationship(name);
  }

  /**
  * Sets specified field data for the model. Logs and validates the change.
  * @param {string} field Field to set
  * @param {any} value Value for the field
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

      if (
        value instanceof Array &&
        curValue instanceof Array &&
        value.length === curValue.length
      ) {

        changed = false;
        // If we have two equal length arrays, we must compare every value

        for (let i = 0; i < value.length; i++) {
          if (value[i] !== curValue[i]) {
            changed = true;
            break;
          }
        }
      }

      // If we have an object value (json), do a deterministic diff using
      // node-deep-equals
      // NOTE: Lets do an extra deep object test
      if ( utilities.isObject(value) ) {
        changed = !deepEqual( curValue, value, { strict: true});
      }

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
  */
  setJoined (field, value) {

    let relationship = this.relationship(field);

    if (Array.isArray(value) && !value.length) {
      value = new ModelArray(relationship.getModel());
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
  *  @param {string} field Name of the calculated field
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
  */
  get (field, defaultValue) {

    if (this._calculations[field]) {
      return this.calculate(field);
    }

    return this._data.hasOwnProperty(field) ? this._data[field] : defaultValue;

  }

  /**
  * Retrieves joined Model or ModelArray
  * @param {String} joinName the name of the join (list of connectors separated by __)
  */
  joined (joinName) {

    return this._joinsCache[joinName];

  }

  /**
  * Retrieve associated models joined this model from the database.
  * @param {Array} joinNames The joines model names to return
  * @param {Transaction} txn The SQL transaction used to execute this save method
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
      .transact(txn)
      .where({id: this.get('id')});
    joinNames.forEach(joinName => query = query.join(joinName));
    let models = await query.end();

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
  * Creates a plain object from the Model, with properties matching an optional interface
  * @param {Array} arrInterface Interface to use for object creation
  */
  toObject (arrInterface) {

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
        joinObject && (obj[key] = joinObject.toObject(subInterface[key]));
      } else if (this._data[key] !== undefined) {
        obj[key] = this._data[key];
      } else if (this._calculations[key] !== undefined) {
        obj[key] = this.calculate(key);
      } else if (joinObject = this._joinsCache[key]) {
        obj[key] = joinObject.toObject();
      }

    });

    return obj;

  }

  /**
  * Get the table name for the model.
  * @return {string}
  */
  tableName () {
    return this._table;
  }

  /**
  * Determine if the model has a specified field.
  * @param {string} field
  * @return {boolean}
  */
  hasField (field) {
    return !!this._columnLookup[field];
  }

  /**
  * Retrieve the schema field data for the specified field
  * @param {string} field
  * @return {Object}
  */
  getFieldData (field) {
    return this._columnLookup[field];
  }

  /**
  * Retrieve the schema data type for the specified field
  * @param {string} field
  * @return {string}
  */
  getDataTypeOf (field) {
    return DataTypes[this._columnLookup[field].type];
  }

  /**
  * Determine whether or not this field is an Array (PostgreSQL supports this)
  * @param {string} field
  * @return {boolean}
  */
  isFieldArray (field) {
    let properties = this.constructor.getColumnProperties(field);
    return properties.array;
  }

  /**
  * Determine whether or not this field is a primary key in our schema
  * @param {string} field
  * @return {boolean}
  */
  isFieldPrimaryKey (field) {
    let properties = this.constructor.getColumnProperties(field);
    return !!properties.primary_key;
  }

  /**
  * Retrieve the defaultValue for this field from our schema
  * @param {string} field
  * @return {any}
  */
  fieldDefaultValue (field) {
    let properties = this.constructor.getColumnProperties(field);
    return properties.defaultValue || null;
  }

  /**
  * Retrieve an array of fields for our model
  * @return {Array}
  */
  fieldList () {
    return this._columnNames.slice();
  }

  /**
  * Retrieve our field schema definitions
  * @return {Array}
  */
  fieldDefinitions () {
    return this._columns.slice();
  }

  /**
  * Set an error for a specified field (supports multiple errors)
  * @param {string} key The specified field for which to create the error (or '*' for generic)
  * @param {string} message The error message
  * @return {boolean}
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
  * @return {boolean}
  */
  clearError (key) {
    delete this._errors[key];
    delete this._errorDetails[key];
    return true;
  }

  __generateSaveQuery__ () {

    let query, columns;
    let db = this.db;

    if (!this.inStorage()) {

      columns = this.fieldList().filter(v => !this.isFieldPrimaryKey(v) && this.get(v) !== undefined);
      query = db.adapter.generateInsertQuery(this.schema.name, columns);

    } else {

      columns = ['id'].concat(this.changedFields().filter(v => !this.isFieldPrimaryKey(v)));
      query = db.adapter.generateUpdateQuery(this.schema.name, columns);

    }

    return {
      sql: query,
      params: columns.map(v => db.adapter.sanitize(this.getFieldData(v).type, this.get(v)))
    };

  }

  /**
  * Logic to execute before a model saves. Intended to be overwritten when inherited.
  */
  async beforeSave () {}

  /**
  * Logic to execute after a model saves. Intended to be overwritten when inherited.
  */
  async afterSave () {}

  /**
  * Save a model (execute beforeSave and afterSave)
  * @param {Transaction} txn The SQL transaction used to execute this save method
  */
  async save (txn) {
    if (this.hasErrors()) {
      throw this.errorObject();
    }
    let isNewTransaction = !txn;
    if (isNewTransaction) {
      txn = await this.db.createTransaction();
    }
    if (!this.inStorage()) {
      this._isCreating = true;
    }
    try {
      await this.__verify__(txn);
      await this.beforeSave(txn);
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
  * @param {Object} fields Key-value pairs of fields to update
  * @param {Function} callback Callback to execute upon completion
  */
  update (fields, callback) {

    callback = callback || (() => {});

    this.constructor.query()
      .where({id: this.get('id')})
      .update(fields, (err, models) => callback(err, models && models[0]));

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
          throw new Error(verification.message);
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
  * Saves model to database
  * @param {Transaction} txn OPTIONAL: SQL transaction to use for save
  * @private
  */
  async __save__ (txn) {
    let db = this.db;
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
  * @param {Transaction} txn OPTIONAL: The SQL transaction to use for this method
  */
  async destroyCascade (txn) {
    await ModelArray.from([this]).destroyCascade(txn);
  }

  /**
  * Logic to execute before a model gets destroyed. Intended to be overwritten when inherited.
  * @param {Transaction} txn OPTIONAL: The SQL transaction to use for this method
  */
  async beforeDestroy (txn) {}

  /**
  * Logic to execute after a model is destroyed. Intended to be overwritten when inherited.
  * @param {Transaction} txn OPTIONAL: The SQL transaction to use for this method
  */
  async afterDestroy (txn) {}

  /**
  * Destroys model reference in database.
  * @param {Transaction} txn OPTIONAL: The SQL transaction to use for this method
  */
  async destroy (txn) {
    await this.beforeDestroy(txn);
    await this.__destroy__(txn);
    await this.afterDestroy(txn);
    return this;
  }

  /**
  * Destroys model reference in database
  * @param {Transaction} txn OPTIONAL: The SQL transaction to use for this method
  * @private
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
    let query = db.adapter.generateDeleteQuery(this.schema.name, columns);
    try {
      await db.query(
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

Model.prototype.schema = {
  table: '',
  columns: []
};

Model.prototype._validations = {};
Model.prototype._validationsList = [];

Model.prototype._calculations = {};
Model.prototype._calculationsList = [];

Model.prototype._verificationsList = [];

Model.prototype._hides = {};

Model.prototype.data = null;

Model.prototype.db = null;

Model.prototype.externalInterface = [
  'id',
  'created_at',
  'updated_at'
];

Model.prototype.aggregateBy = {
  'id': 'count',
  'created_at': 'min',
  'updated_at': 'min'
};

module.exports = Model;
