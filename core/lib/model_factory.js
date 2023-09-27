const ModelArray = require('./model_array.js');
const fs = require('fs');

/**
* Factory for creating models
* @class
*/
class ModelFactory {

  /**
  * Create the ModelFactory with a provided Model to use as a reference.
  * @param {import('./model')} modelConstructor Must pass the constructor for the type of ModelFactory you wish to create.
  */
  constructor (modelConstructor) {
    this.Model = modelConstructor;
  }

  /**
  * Loads all model constructors in your ./app/models directory into an array
  * @returns {Array} Array of model Constructors
  */
  static loadModels () {
    let dir = './app/models';
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs
      .readdirSync(dir)
      .filter(filename => filename.indexOf('.') !== 0)
      .map(filename => require(`${process.cwd()}/app/models/${filename}`))
  }

  /**
  * Creates new factories from a supplied array of Models, loading in data keyed by Model name
  * @param {Array<import('./model')>} Models Array of model constructors you wish to reference
  * @param {object} objModelData Keys are model names, values are arrays of model data you wish to create
  * @returns {Promise<object>}
  */
  static async createFromModels (Models, objModelData) {
    if (objModelData instanceof Array) {
      let results = [];
      for (let i = 0; i < objModelData.length; i++) {
        let obj = objModelData[i];
        let result = await this.createFromModels(Models, obj);
        results = results.concat(result);
      }
      return results;
    } else {
      Object.keys(objModelData)
        .forEach(name => {
          if (!Models[name]) {
            throw new Error(`No such table: "${name}"`);
          }
        });
      let ModelsFiltered = Object.keys(Models)
        .map(name => Models[name])
        .filter(Model => {
          return objModelData[Model.table()] && objModelData[Model.table()].length;
        });
      let results = await Promise.all(
        ModelsFiltered.map(Model => {
          return new this(Model).create(objModelData[Model.table()])
        })
      );
      return results;
    }
  }

  /**
  * Populates a large amount of model data from an Object.
  * @param {object} objModelData Keys are model names, values are arrays of model data you wish to create
  * @returns {Promise<object>}
  */
  static async populate (objModelData) {
    return this.createFromModels(this.loadModels(), objModelData, callback);
  }

  /**
  * Creates models from an array of Objects containing the model data
  * @param {Array<object>} arrModelData Array of objects to create model data from
  * @param {import('../db/transaction')} txn SQL transaction to use for this method
  * @returns {ModelArray}
  */
  async create (arrModelData, txn) {
    // new this.Model(data, false, true) is telling the Model that this is from a seed
    return ModelArray
      .from(arrModelData.map(data => new this.Model(data, false, true)))
      .saveAll(txn);
  }

}

module.exports = ModelFactory;
