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

  constructor (adapter, isSerializable = false) {
    this.adapter = adapter;
    this._uuid = uuid.v4();
    this._serializable = isSerializable;
    this._status = TXN_STATUS.READY;
    this._client = null;
  }

  toString () {
    return `Txn ${this._uuid.split('-')[0]}`;
  }

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
      this._client = await this.adapter._pool.connect();
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

  async query (sql, params) {
    await this.__check__(TXN_STATUS.IN_PROGRESS);
    return this.adapter.queryClient(this._client, sql, params, this.toString());
  }

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
