const uuid = require('uuid');

const TXN_STATUS = {
  READY: 0,
  IN_PROGRESS: 1,
  COMPLETE: 2,
  ERROR: 3
};

/**
* The database transaction object (ORM)
* @class
*/
class Transaction {

  /**
   * Creates a new Transaction
   *   For information on serializable transactions, see:
   *   https://www.postgresql.org/docs/current/transaction-iso.html#XACT-SERIALIZABLE
   * @param {import('./sql_adapter')} adapter
   */
  constructor (adapter, isSerializable = false) {
    this.adapter = adapter;
    /**
     * @private
     */
    this._uuid = uuid.v4();
    /**
     * @private
     */
    this._serializable = isSerializable;
    /**
     * @private
     */
    this._status = TXN_STATUS.READY;
    /**
     * @private
     */
    this._client = null;
  }

  /**
   * Prints the transaction data
   * @returns {string}
   */
  toString () {
    return `Txn ${this._uuid.split('-')[0]}`;
  }

  /**
   * @private
   * @param {number} maxStatus maximum status we allow
   */
  async __check__ (maxStatus = 0) {
    if (this._status > maxStatus) {
      const statusName = Object.keys(TXN_STATUS).find(key => TXN_STATUS[key] === maxStatus);
      if (!statusName) {
        throw new Error(`Invalid max status: ${maxStatus}`);
      } else {
        throw new Error(`Can not perform after Transaction in state "${statusName}" (${maxStatus})`);
      }
    }
    if (this._status === TXN_STATUS.READY) {
      this._client = await this.adapter.createClient();
      try {
        if (!this._serializable) {
          await this.adapter.beginClient(this._client, this.toString());
        } else {
          await this.adapter.beginSerializableClient(this._client, this.toString());
        }
      } catch (e) {
        this.adapter.db.info(`<${this.toString()}> Failed: Begin error.`);
        console.error(e);
        this._status = TXN_STATUS.ERROR;
        this._client.release();
        this._client = null;
        throw e;
      }
      this._status = TXN_STATUS.IN_PROGRESS;
    }
  }

  /**
   * Queries the database directly
   * @param {string} sql SQL query to run
   * @param {Array} parameters Parameters to assign to the query: $1, $2, $3
   * @returns {Promise<object>}
   */
  async query (sql, params) {
    await this.__check__(TXN_STATUS.IN_PROGRESS);
    return this.adapter.queryClient(this._client, sql, params, this.toString());
  }

  /**
   * Runs a series of queries in a transaction
   * @param {Array<string|[string,Array<object>]>} statements
   * @returns {Promise<Array<object>>}
   */
  async transact (preparedArray) {
    return this.adapter.transact(preparedArray, this);
  }

  /**
   * Rolls back the transaction: invalidates all queries
   * @returns {Promise<object>}
   */
  async rollback () {
    await this.__check__(TXN_STATUS.IN_PROGRESS);
    let result;
    try {
      result = await this.adapter.rollbackClient(this._client, this.toString());
    } catch (e) {
      this.adapter.db.info(`<${this.toString()}> Failed: Rollback error.`);
      this._status = TXN_STATUS.ERROR;
      this._client.release();
      this._client = null;
      throw e;
    }
    this.adapter.db.info(`<${this.toString()}> Complete: rolled back successfully!`);
    this._status = TXN_STATUS.COMPLETE;
    this._client.release();
    this._client = null;
    return result;
  }

  /**
   * Commits the transaction: writes queries to the database
   * @returns {Promise<object>}
   */
  async commit () {
    await this.__check__(TXN_STATUS.IN_PROGRESS);
    let result;
    try {
      result = await this.adapter.commitClient(this._client, this.toString());
    } catch (e) {
      this.adapter.db.info(`<${this.toString()}> Failed: Commit error.`);
      this._status = TXN_STATUS.ERROR;
      this._client.release();
      this._client = null;
      throw e;
    }
    this.adapter.db.info(`<${this.toString()}> Complete: committed successfully!`);
    this._status = TXN_STATUS.COMPLETE;
    this._client.release();
    this._client = null;
    return result;
  }

}

module.exports = Transaction;
