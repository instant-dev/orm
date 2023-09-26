/**
 * @typedef DatabaseConfig
 * @type {object}
 * @property {string} host Hostname
 * @property {number|string} port Port
 * @property {string} user Username
 * @property {string} password Password
 * @property {?string} database Database: Must be provided to run Model queries
 * @property {?string} connectionString Optional: provide a connection string instead
 * @property {?boolean|"unauthorized"} ssl Connect with SSL
 * @property {?boolean} in_vpc Deployed in VPC: use with .tunnel
 * @property {?SSHTunnelConfig} tunnel Connect using an SSH tunnel
 */

/**
 * @typedef SSHTunnelConfig
 * @type {object}
 * @property {string} tunnel.host SSH host
 * @property {?string|number} tunnel.port SSH port, default 22
 * @property {?string} tunnel.user SSH user
 * @property {?string} tunnel.private_key Private key file, relative to root project directory
 */

exports.unused = {};