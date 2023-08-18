const colors = require('colors/safe');

class Logger {

  _LOG_LEVELS = {
    DISABLED: 0,
    ERRORS_ONLY: 1,
    SYSTEM_LOGS: 2,
    INFO_LOGS: 3,
    QUERY_LOGS: 4
  };

  __logColorFuncs = [
    (str) => {
      return colors.yellow.bold(str);
    },
    (str) => {
      return colors.grey.bold(str);
    }
  ];

  constructor (name, color) {
    this._logName = name;
    this._logColor = color || 'black';
    this._logLevel = 0;
    this._useLogColor = 0;
  }

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

  error (message, err) {
    if (this._logLevel >= this._LOG_LEVELS.ERRORS_ONLY) {
      console.log(colors.red.bold(`${this._logName} Error: `) + message);
      if (err) {
        console.error(err);
      }
      return true;
    }
  }

  log (msg) {
    if (this._logLevel >= this._LOG_LEVELS.SYSTEM_LOGS) {
      console.log(colors[this._logColor].bold(`${this._logName}: `) + `${msg}`);
    }
  }

  info (msg) {
    if (this._logLevel >= this._LOG_LEVELS.INFO_LOGS) {
      console.log(colors[this._logColor].bold(`${this._logName} Info: `) + `${msg}`);
    }
  }

  queryLog (message, sql, params, time) {
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
    }
    return true;
  }

  querySuccess (message) {
    if (this._logLevel >= this._LOG_LEVELS.QUERY_LOGS) {
      console.log(colors.green.bold(`${this._logName} Success: `) + message);
    }
    return true;
  }

  queryError (message, err) {
    if (this._logLevel >= this._LOG_LEVELS.QUERY_LOGS) {
      console.log(colors.red.bold(`${this._logName} Error: `) + message);
      if (err) {
        console.error(err);
      }
      return true;
    }
  }

}

module.exports = Logger;
