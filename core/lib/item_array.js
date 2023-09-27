/**
* Array of Items, for easy conversion to Objects
* @class
*/
class ItemArray extends Array {

  /**
  * Create the ItemArray
  */
  constructor () {

    super();
    /**
     * @private
     */
    this._meta = {
      total: 0,
      offset: 0
    };

  }

  /**
  * Convert a normal Array into a ItemArray
  * @param {Array} arr The array of child objects
  * @returns {ItemArray}
  */
  static from (arr) {

    let itemArray = new this();
    itemArray.push.apply(itemArray, arr);

    return itemArray;

  }

  /**
  * Sets metadata about how the ItemArray was created
  * @param {object} data values to set
  * @returns {object}
  */
  setMeta (data) {

    Object.keys(data).forEach(k => this._meta[k] = data[k]);
    return this._meta;

  }

  /**
  * Creates an Array of plain objects from the ModelArray, with properties matching an optional interface
  * @param {Array} arrInterface Interface to use for object creation for each model
  * @returns {Array<object>}
  */
  toJSON (arrInterface) {

    let keys = [];

    if (this.length) {

      keys = Object.keys(this[0]);

      if (arrInterface && arrInterface.length) {
        keys = keys.filter(k => (arrInterface.indexOf(k) !== -1));
      }

    }

    return this.map(m => {
      return keys.reduce((p, k) => {
        p[k] = m[k];
        return p;
      }, {});
    });

  }

}

module.exports = ItemArray;
