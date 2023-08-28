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

  listTypes () {
    let simpleTypes = Object.keys(this.adapter.simpleTypes);
    let allTypes = this.adapter.allTypes.filter(type => simpleTypes.indexOf(type) === -1);
    return [].concat(
      simpleTypes.map(name => ({name, source: `alias`})),
      allTypes.map(name => ({name, source: `${this.adapter.name} built-in`}))
    );
  }

  async connect (cfg) {
    if (typeof cfg === 'string') {
      cfg = {connectionString: cfg};
    }
    const Adapter = require(ADAPTERS[cfg.adapter] || ADAPTERS[DEFAULT_ADAPTER]);
    this.adapter = new Adapter(this, cfg);
    await this.adapter.connect();
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

  async drop (databaseName) {
    return this.adapter.drop.apply(this.adapter,  [databaseName]);
  }

  async create (databaseName) {
    return this.adapter.create.apply(this.adapter,  [databaseName]);
  }

}

module.exports = Database;
