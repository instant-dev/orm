const fs = require('fs');
const path = require('path');

const SchemaManager = require('../db/schema_manager.js');

class PluginsManager {

  static rootDirectory = SchemaManager.rootDirectory;
  static pluginsDirectory = 'plugins';
  static supportedEvents = ['afterConnect'];

  constructor () {
    this.events = {};
  }

  /**
   * @private
   */
  async __createDirectory__ () {
    SchemaManager.checkdir(path.join(this.constructor.rootDirectory, this.constructor.pluginsDirectory));
  }

  pathname (filename) {
    const cwd = process.cwd();
    if (filename) {
      return path.join(cwd, this.constructor.rootDirectory, this.constructor.pluginsDirectory, filename);
    } else {
      return path.join(cwd, this.constructor.rootDirectory, this.constructor.pluginsDirectory);
    }
  }

  async load () {
    this.events = {};
    const pathname = this.pathname();
    if (fs.existsSync(pathname)) {
      if (!fs.statSync(pathname).isDirectory()) {
        throw new Error(
          `Could not load plugins from "${pathname}": not a valid directory`
        );
      }
      const filenames = fs.readdirSync(pathname).sort();
      for (const filename of filenames) {
        let filepath = path.join(pathname, filename);
        let plugin = await import(filepath);
        if (plugin.default) {
          plugin = plugin.default;
        }
        if (!plugin.event) {
          throw new Error(`Plugin "${pathname}" missing export "event"`);
        } else if (!this.constructor.supportedEvents.includes(plugin.event)) {
          throw new Error(
            `Plugin "${pathname}" export "event" invalid:\n` +
            `must be one of "${this.constructor.supportedEvents.join('", "')}"`
          );
        } else if (!plugin.plugin) {
          throw new Error(`Plugin "${pathname}" missing export "plugin"`);
        } else if (typeof plugin.plugin !== 'function') {
          throw new Error(`Plugin "${pathname}" export "plugin" invalid: must be a function`);
        }
        this.events[plugin.event] = this.events[plugin.event] || [];
        this.events[plugin.event].push(plugin.plugin);
      }
    }
  }

  async execute (event, Instant) {
    if (!this.constructor.supportedEvents.includes(event)) {
      throw new Error(`Could not execute plugins for "${event}": not a supported event type`);
    }
    if  (this.events[event]) {
      for (const plugin of this.events[event]) {
        await plugin(Instant);
      }
    }
  }

};

module.exports = PluginsManager;