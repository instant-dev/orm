const ItemArray = require('./item_array.js');

/**
* Array of Models, for easy conversion to Objects
* @class
*/
class ModelArray extends ItemArray {

  /**
  * Create the ModelArray with a provided Model to use as a reference.
  * @param {import('./model')} modelConstructor Must pass the constructor for the type of ModelArray you wish to create.
  */
  constructor (modelConstructor) {

    super();
    this.Model = modelConstructor;

  }

  /**
  * Convert a normal Array into a ModelArray
  * @param {Array} arr The array of child objects
  * @returns {ModelArray}
  */
  static from (arr) {

    if (!arr.length) {
      throw new Error('Cannot create ModelArray from empty Array');
    }

    let modelArray = new this(arr[0].constructor);
    modelArray.push.apply(modelArray, arr);

    return modelArray;

  }

  /**
  * Creates an Array of plain objects from the ModelArray, with properties matching an optional interface
  * @param {Array} arrInterface Interface to use for object creation for each model
  * @returns {Array}
  */
  toJSON (arrInterface) {
    return Array.from(this).map(m => m.toJSON(arrInterface));
  }

  /**
  * Checks if ModelArray has a model in it
  * @param {import('./model')} model
  * @returns {boolean}
  */
  has (model) {
    return this.filter(m => m.get('id') === model.get('id')).length > 0;
  }

  /**
  * Calls Model#read on each Model in the ModelArray
  * @param {object}
  * @returns {boolean}
  */
  readAll (data) {
    this.forEach(model => model.read(data));
    return true;
  }

  /**
  * Calls Model#set on each Model in the ModelArray
  * @param {string} field Field to set
  * @param {any} value Value for the field
  * @returns {boolean}
  */
  setAll (field, value) {
    this.forEach(model => model.set(field, value));
    return true;
  }

  /**
  * Destroys (deletes) all models in the ModelArray from the database
  * @param {import('../db/transaction')} txn SQL transaction to use for this method
  * @returns {Promise<ModelArray>}
  */
  async destroyAll (txn) {
    if (this.filter(m => !m.inStorage()).length) {
      return callback(new Error('Not all models are in storage'))
    }
    let db = this.Model.prototype.db;
    let source = txn ? txn : db;
    let params = this.map(m => m.get('id'));
    const beforePromises = this.map(m => m.beforeDestroy(txn));
    await Promise.all(beforePromises);
    if (this.length > 0) {
      let sql = db.adapter.generateDeleteAllQuery(this.Model.table(), 'id', params);
      await source.query(sql, params);
    }
    const afterPromises = this.map(m => m.afterDestroy(txn));
    await Promise.all(afterPromises);
    this.forEach(m => m._inStorage = false);
    return this;
  }

  /**
  * Destroys model and cascades all deletes.
  * @param {import('../db/transaction')} txn SQL transaction to use for this method
  * @returns {Promise<ModelArray>}
  */
  async destroyCascade (txn) {
    if (this.filter(m => !m.inStorage()).length) {
      throw new Error('Not all models are in storage');
    }
    let db = this.Model.prototype.db;
    let source = txn ? txn : db;
    let params = Array.from(this.map(m => m.get('id')));
    let queries = [[db.adapter.generateDeleteAllQuery(this.Model.table(), 'id', params), params]];
    let children = this.Model.relationships().cascade();
    queries = queries.concat(
      children.map(p => {
        return [
          db.adapter.generateDeleteAllQuery(
            p.getModel().table(),
            'id',
            params,
            p.joins(null, this.Model.table())
          ),
          params
        ];
      })
    ).reverse();
    await source.transact(queries);
    this.forEach(m => m._inStorage = false);
    return this;
  }

  /**
  * Saves / updates all models in the ModelArray.
  * @param {import('../db/transaction')} txn SQL transaction to use for this method
  * @returns {Promise<ModelArray>}
  */
  async saveAll (txn) {
    if (!this.length) {
      return this;
    }
    let series = [];
    let newTransaction = !txn;
    if (newTransaction) {
      txn = this.Model.prototype.db.createTransaction();
    }
    const promises = [];
    try {
      for (let i = 0; i < this.length; i++) {
        let waitForModel = this[i - 1] || null;
        let model = this[i];
        promises.push(model.save(txn, waitForModel));
      }
      await Promise.all(promises);
    } catch (e) {
      if (newTransaction) {
        await txn.rollback();
      }
      throw e;
    }
    if (newTransaction) {
      await txn.commit();
    }
    return this;
  }

}

module.exports = ModelArray;
