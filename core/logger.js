const colors = require('colors/safe');

class Logger {

  /**
   * @private
   */
  _LOG_LEVELS = {
    DISABLED: 0,
    ERRORS_ONLY: 1,
    SYSTEM_LOGS: 2,
    INFO_LOGS: 3,
    QUERY_LOGS: 4
  };

  /**
   * @private
   */
  __logColorFuncs = [
    (str) => {
      return colors.yellow.bold(str);
    },
    (str) => {
      return colors.grey.bold(str);
    }
  ];

  constructor (name, color) {
    /**
     * @private
     */
    this._logName = name;
    /**
     * @private
     */
    this._logColor = color || 'black';
    /**
     * @private
     */
    this._logLevel = 0;
    /**
     * @private
     */
    this._useLogColor = 0;
  }

  /**
   * Enables logging, different levels of logging are provided
   * @param {0|1|2|3|4} logLevel DISABLED=0, ERRORS_ONLY=1, SYSTEM_LOGS=2, INFO_LOGS=3, QUERY_LOGS=4
   * @returns {0|1|2|3|4}
   */
  enableLogs (logLevel) {
    let level = Object.keys(this._LOG_LEVELS).find(key => this._LOG_LEVELS[key] === logLevel);
    if (!level) {
      throw new Error(
        `Invalid log level: ${logLevel}\n` +
        `Valid log levels are:\n` +
        Object.keys(this._LOG_LEVELS).map(key => `${key}=${this._LOG_LEVELS[key]}`).join('\n')
      );
    }
    this._logLevel = logLevel;
  }

  /**
   * Logs an error
   * @private
   * @param {string} message 
   * @param {Error} err 
   * @returns {boolean}
   */
  error (message, err) {
    if (this._logLevel >= this._LOG_LEVELS.ERRORS_ONLY) {
      console.log(colors.red.bold(`${this._logName} Error: `) + message);
      if (err) {
        console.error(err);
      }
      return true;
    }
    return false;
  }

  /**
   * Logs a message
   * @private
   * @param {string} message 
   * @returns {boolean}
   */
  log (msg) {
    if (this._logLevel >= this._LOG_LEVELS.SYSTEM_LOGS) {
      console.log(colors[this._logColor].bold(`${this._logName}: `) + `${msg}`);
      return true;
    }
    return false;
  }

  /**
   * Logs an info message
   * @private
   * @param {string} message 
   * @returns {boolean}
   */
  info (msg) {
    if (this._logLevel >= this._LOG_LEVELS.INFO_LOGS) {
      console.log(colors[this._logColor].bold(`${this._logName} Info: `) + `${msg}`);
      return true;
    }
    return false;
  }

  /**
   * Logs a message from a query
   * @private
   * @param {string} message 
   * @param {string} sql
   * @param {object} params
   * @returns {boolean}
   */
  queryLog (message, sql, params) {
    if (this._logLevel >= this._LOG_LEVELS.QUERY_LOGS) {
      const prefix = `${this._logName} Query: `;
      const spacer = ' '.repeat(prefix.length);
      let colorFunc = this.__logColorFuncs[this._useLogColor];
      if (message) {
        console.log(colors[this._logColor].bold(prefix) + colorFunc(message));
        console.log(spacer + colorFunc(sql));
      } else {
        console.log(colors[this._logColor].bold(prefix) + colorFunc(sql));
      }
      params && console.log(spacer + colorFunc(JSON.stringify(params)));
      this._useLogColor = (this._useLogColor + 1) % this.__logColorFuncs.length;
      return true;
    }
    return true;
  }

  /**
   * Logs a success message from a query
   * @private
   * @param {string} message 
   * @returns {boolean}
   */
  querySuccess (message) {
    if (this._logLevel >= this._LOG_LEVELS.QUERY_LOGS) {
      console.log(colors.green.bold(`${this._logName} Success: `) + message);
      return true;
    }
    return false;
  }

  /**
   * Logs an error from a query
   * @private
   * @param {string} message 
   * @param {Error} err
   * @returns {boolean}
   */
  queryError (message, err) {
    if (this._logLevel >= this._LOG_LEVELS.QUERY_LOGS) {
      console.log(colors.red.bold(`${this._logName} Error: `) + message);
      if (err) {
        console.error(err);
      }
      return true;
    }
    return false;
  }

}

module.exports = Logger;
