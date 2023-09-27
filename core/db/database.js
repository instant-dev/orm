const Logger = require('../logger.js');

const colors = require('colors/safe');
const { createTunnel } = require('tunnel-ssh');
const Transaction = require('./transaction.js');

/**
 * Manages database connection
 */
class Database extends Logger {

  static defaultAdapter = 'postgres';
  static availableAdapters = {
    'postgres': require('./adapters/postgres.js')
  };

  /**
   * Retrieves an Adapter
   * @param {string} name 
   * @returns {import('./sql_adapter')}
   */
  static getAdapter (name) {
    return this.availableAdapters[name];
  }

  /**
   * Retrieves the default adapter
   * @returns {import('./sql_adapter')}
   */
  static getDefaultAdapter () {
    return this.availableAdapters[this.defaultAdapter];
  }

  /**
   * Creates a new Database instance
   * @param {string} name 
   */
  constructor (name = 'main') {
    super(`Database[${name}]`, 'green');
  }

  /**
   * List all types the database can use
   * @returns {Array}
   */
  listTypes () {
    let simpleTypes = Object.keys(this.adapter.simpleTypes);
    let allTypes = this.adapter.allTypes.filter(type => simpleTypes.indexOf(type) === -1);
    return [].concat(
      simpleTypes.map(name => ({name, source: `alias`})),
      allTypes.map(name => ({name, source: `${this.adapter.name} built-in`}))
    );
  }

  /**
   * Connects to a database
   * @param {string|import('../types').DatabaseConfig} cfg 
   * @returns {Promise<boolean>}
   */
  async connect (cfg) {
    if (typeof cfg === 'string') {
      cfg = {connectionString: cfg};
    }
    const Adapter = (
      this.constructor.getAdapter(cfg.adapter) ||
      this.constructor.getDefaultAdapter()
    );
    this.adapter = new Adapter(this, cfg);
    await this.adapter.connect();
    return true;
  }

  /**
   * Creates a standalone SSH tunnel without connecting a database
   * @param {string|import('../types').DatabaseConfig}
   * @returns {Promise<object>}
   */
  async tunnel (cfg) {
    if (typeof cfg === 'string') {
      cfg = {connectionString: cfg};
    }
    const Adapter = (
      this.constructor.getAdapter(cfg.adapter) ||
      this.constructor.getDefaultAdapter()
    );
    const adapter = new Adapter(this, cfg);
    return adapter.connectToTunnel();
  }

  /**
   * Creates a tunnel from a config object
   * @private
   * @param {import('../types').DatabaseConfig} cfg 
   * @returns {Promise<object>}
   */
  async createTunnelFromConfig (cfg) {
    let tnl;
    try {
      tnl = await this.createTunnel(
        cfg.host,
        cfg.port,
        cfg.tunnel.private_key,
        cfg.tunnel.user,
        cfg.tunnel.host,
        cfg.tunnel.port
      );
    } catch (e) {
      console.error(e);
      throw new Error(
        `Could not connect to "${cfg.host}:${cfg.port}" via SSH tunnel "${cfg.tunnel.user}@${cfg.tunnel.host}:${cfg.tunnel.port || 22}":\n` +
        (e.message || e.code)
      );
    }
    return tnl;
  }

  /**
   * Creates an SSH tunnel using multiple retries
   * @private
   * @param {string} host 
   * @param {string|number} port 
   * @param {?string} privateKey 
   * @param {?string} sshUser 
   * @param {?string} sshHost 
   * @param {?string} sshPort 
   * @returns {Promise<object>}
   */
  async createTunnel (host, port, privateKey, sshUser, sshHost, sshPort) {
    sshPort = sshPort || 22
    let tnl;
    let localPort = 2345;
    let retries = 100;
    this.log(`Attempting to create SSH tunnel ...`);
    this.log(`From: "localhost"`);
    this.log(`Via:  "${sshUser}@${sshHost}:${sshPort}"`);
    this.log(`To:   "${host}:${port}"`);
    while (!tnl) {
      try {
        let [server, conn] = await createTunnel(
          {
            autoClose: true
          },
          {
            port: localPort
          },
          {
            host: sshHost,
            username: sshUser,
            port: sshPort,
            privateKey: Buffer.from(privateKey)
          },
          {
            srcAddr: 'localhost',
	          srcPort: localPort,
            dstAddr: host,
            dstPort: port,
          }
        );
        tnl = server;
      } catch (err) {
        if (retries > 0 && err.message.startsWith('listen EADDRINUSE:')) {
          localPort++;
          retries--;
          if (retries <= 0) {
            throw new Error(`Could not create SSH tunnel: Maximum retries reached`);
          }
        } else {
          throw err;
        }
      }
    }
    this.log(`Created SSH tunnel from "localhost:${localPort}" to "${host}:${port}"!`);
    return {
      tunnel: tnl,
      port: localPort
    };
  }

  /**
   * Terminates database connection
   * @returns {boolean}
   */
  close () {
    this.adapter.close.apply(this.adapter, arguments);
    return true;
  }

  /**
   * Creates a new Transaction
   *   For information on serializable transactions, see:
   *   https://www.postgresql.org/docs/current/transaction-iso.html#XACT-SERIALIZABLE
   * @param {?boolean} isSerializable Whether or not the transaction is serializable
   * @returns {Transaction}
   */
  createTransaction (isSerializable = false) {
    return this.adapter.createTransaction(isSerializable);
  };

  /**
   * Queries the database directly
   * @param {string} sql SQL query to run
   * @param {Array} parameters Parameters to assign to the query: $1, $2, $3
   * @returns {Promise<object>}
   */
  async query () {
    return this.adapter.query.apply(this.adapter, arguments);
  }

  /**
   * Runs a series of queries in a transaction
   * @param {Array<string|[string,Array<object>]>} statements
   * @returns {Promise<Array<object>>}
   */
  async transact () {
    return this.adapter.transact.apply(this.adapter, arguments);
  }

  /**
   * Drop a database
   * @private
   * @param {string} name
   * @returns {Promise<object>}
   */
  async drop (databaseName) {
    return this.adapter.drop.apply(this.adapter,  [databaseName]);
  }

  /**
   * Create a database
   * @private
   * @param {string} name
   * @returns {Promise<object>}
   */
  async create (databaseName) {
    return this.adapter.create.apply(this.adapter,  [databaseName]);
  }

}

module.exports = Database;
