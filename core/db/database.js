const Logger = require('../logger.js');

const colors = require('colors/safe');
const { createTunnel } = require('tunnel-ssh');

class Database extends Logger {

  static defaultAdapter = 'postgres';
  static availableAdapters = {
    'postgres': require('./adapters/postgres.js')
  };

  static getAdapter (name) {
    return this.availableAdapters[name];
  }

  static getDefaultAdapter () {
    return this.availableAdapters[this.defaultAdapter];
  }

  constructor (name = 'main') {
    super(`Database[${name}]`, 'green');
    this._useLogColor = 0;
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
    const Adapter = (
      this.constructor.getAdapter(cfg.adapter) ||
      this.constructor.getDefaultAdapter()
    );
    this.adapter = new Adapter(this, cfg);
    await this.adapter.connect();
    return true;
  }

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
