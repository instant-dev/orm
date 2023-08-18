const Logger = require('../logger.js');

const colors = require('colors/safe');

const DEFAULT_ADAPTER = 'postgres';
const ADAPTERS = {
  'postgres': './adapters/postgres.js',
};

class Database extends Logger {

  constructor (name = 'main', adapter = null) {
    super(`Database[${name}]`, 'green');
    this.adapter = adapter || DEFAULT_ADAPTER;
    this._useLogColor = 0;
    if (!this.adapter) {
      throw new Error(`No adapter specified for Database.`);
    } else if (ADAPTERS[!this.adapter]) {
      throw new Error(`Invalid adapter specified for Database: "${this.adapter}"`);
    }
  }

  connect (cfg) {
    if (typeof cfg === 'string') {
      cfg = {connectionString: cfg};
    }
    const Adapter = require(ADAPTERS[cfg.adapter] || ADAPTERS[DEFAULT_ADAPTER]);
    this.adapter = new Adapter(this, cfg);
    return true;
  }

  close () {
    this.adapter.close.apply(this.adapter, arguments);
    return true;
  }

  createTransaction (isSerializable = false) {
    return this.adapter.createTransaction(isSerializable);
  };

  async query () {
    return this.adapter.query.apply(this.adapter, arguments);
  }

  async transact () {
    return this.adapter.transact.apply(this.adapter, arguments);
  }

  async drop () {
    return this.adapter.drop.apply(this.adapter, arguments);
  }

  async create () {
    return this.adapter.create.apply(this.adapter, arguments);
  }

}

module.exports = Database;
