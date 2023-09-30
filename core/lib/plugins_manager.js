const fs = require('fs');
const path = require('path');

const SchemaManager = require('../db/schema_manager.js');

class PluginsManager {

  static rootDirectory = SchemaManager.rootDirectory;
  static pluginsDirectory = 'plugins';
  static supportedEvents = ['afterConnect'];

  constructor () {
    this.plugins = [];
  }

  /**
   * @private
   */
  async __createDirectory__ (pathname) {
    let pathList = [this.constructor.rootDirectory, this.constructor.pluginsDirectory];
    if (pathname) {
      pathList = pathList.concat(pathname.split('/'));
    }
    SchemaManager.checkdir(path.join.apply(path, pathList));
  }

  pathname (filename) {
    const cwd = process.cwd();
    if (filename) {
      return path.join(this.constructor.rootDirectory, this.constructor.pluginsDirectory, filename);
    } else {
      return path.join(this.constructor.rootDirectory, this.constructor.pluginsDirectory);
    }
  }

  readdir (root) {
    const entries = fs.readdirSync(root);
    const directories = [];
    const filenames = [];
    for (const filename of entries) {
      const pathname = path.join(root, filename);
      const stat = fs.statSync(pathname);
      if (stat.isDirectory()) {
        directories.push(pathname);
      } else {
        filenames.push(pathname);
      }
    }
    directories.sort();
    return [].concat(
      [].concat.apply([], directories.map(pathname => this.readdir(pathname))),
      filenames.sort()
    );
  }

  async load () {
    this.plugins = [];
    const cwd = process.cwd();
    const pathname = this.pathname();
    if (fs.existsSync(pathname)) {
      if (!fs.statSync(pathname).isDirectory()) {
        throw new Error(
          `Could not load plugins from "${pathname}": not a valid directory`
        );
      }
      const filenames = this.readdir(pathname);
      for (const filename of filenames) {
        let filepath = path.join(cwd, filename);
        let pluginModule = await import(filepath);
        if (pluginModule.default) {
          pluginModule = pluginModule.default;
        }
        if (!pluginModule.plugin) {
          throw new Error(`Plugin "${pathname}" missing export "plugin"`);
        } else if (typeof pluginModule.plugin !== 'function') {
          throw new Error(`Plugin "${pathname}" export "plugin" invalid: must be a function`);
        }
        this.plugins.push(pluginModule.plugin);
      }
    }
  }

  async execute (Instant) {
    for (const plugin of this.plugins) {
      await plugin(Instant);
    }
  }

};

module.exports = PluginsManager;