const fs = require('fs');
const path = require('path');

const SchemaManager = require('../schema_manager.js');
const Migration = require('./migration.js');

class MigrationManagerDangerousFilesystem {

  constructor (self) {
    this.self = self;
  }

  /**
   * Clears filesystem migrations
   */
  clear () {
    [
      this.self.parent._Schema.constructor.getDirectory('migrations'),
      this.self.parent._Schema.constructor.getDirectory('cache')
    ].forEach(pathname => {
      if (fs.existsSync(pathname)) {
        let fileList = fs.readdirSync(pathname);
        fileList.forEach(filename => {
          let filepath = path.join(pathname, filename);
          let stat = fs.statSync(filepath);
          if (stat.isFile()) {
            fs.unlinkSync(filepath);
          }
        });
        fs.rmdirSync(pathname);
      }
    });
    this.self.parent.log(`Cleared filesystem migrations`);
  }

  /**
   * Initializes filesystem filesystem migrations
   */
  initialize (json) {
    let pathname = this.self.parent._Schema.constructor.getDirectory('migrations');
    if (fs.existsSync(pathname)) {
      throw new Error(
        `Could not initialize: "${pathname}" already exists.\n` +
        `Please run filesystem.clear and try again.`
      );
    }
    SchemaManager.checkdir(pathname);
    json = JSON.parse(JSON.stringify(json));
    let tmpSchema = new SchemaManager(this.self.parent._Schema.db, json);
    let newJSON = JSON.parse(JSON.stringify(json));
    newJSON.migration_id = (newJSON.migration_id || 0) + 1;
    const migration = new Migration(newJSON.migration_id, 'initial_migration', tmpSchema, this.self.parent);
    migration.setSchema(newJSON);
    this.write(migration);
    return migration;
  }

  /**
   * Get migrations stored locally
   */
  getMigrations () {
    let pathname = this.self.parent._Schema.constructor.getDirectory('migrations');
    if (!fs.existsSync(pathname)) {
      throw new Error(`Could not get filesystem migrations: filesystem migrations not initialized.`);
    }
    let stat = fs.statSync(pathname);
    if (!stat.isDirectory()) {
      throw new Error(`Could not get filesystem migrations: "${pathname}" is not a directory`);
    }
    let filenames = fs.readdirSync(pathname);
    let migrations = [];
    for (let i = 0; i < filenames.length; i++) {
      let filename = filenames[i];
      let json;
      let data = fs.readFileSync(path.join(pathname, filename));
      try {
        json = JSON.parse(data);
      } catch (e) {
        console.error(e);
        throw new Error(`Could not get filesystem migration: "${filename}" has invalid JSON`);
      }
      migrations.push(json);
    }
    return migrations;
  }

  /**
   * Writes a migration to the filesystem
   */
  write (migration) {
    let migrationJSON;
    if (migration instanceof Migration) {
      migrationJSON = migration.toJSON();
    } else {
      migrationJSON = Migration.validateMigration(migration, this.self.parent._Schema.db);
    }
    let filesystemMigrations = [];
    try {
      filesystemMigrations = this.getMigrations();
    } catch (e) {
      // do nothing
    }
    if (filesystemMigrations.find(json => json.id === migrationJSON.id)) {
      throw new Error(`Can not write migration to "${this.self.parent._Schema.constructor.getDirectory('migrations')}": migration with (id=${migrationJSON.id}) already exists`);
    }
    const filename = Migration.generateFilename(migrationJSON.id, migrationJSON.name);
    const fullpath = path.join(this.self.parent._Schema.constructor.getDirectory('migrations'), filename);
    const buffer = Buffer.from(JSON.stringify(migrationJSON, null, 2));
    if (!fs.existsSync(this.self.parent._Schema.constructor.getDirectory('migrations'))) {
      fs.mkdirSync(this.self.parent._Schema.constructor.getDirectory('migrations'));
    }
    if (fs.existsSync(fullpath)) {
      throw new Error(`Can not write migration to "${this.self.parent._Schema.constructor.getDirectory('migrations')}": file already exists`);
    } else if (!fs.statSync(this.self.parent._Schema.constructor.getDirectory('migrations')).isDirectory()) {
      throw new Error(`Can not write migration to "${this.self.parent._Schema.constructor.getDirectory('migrations')}": not a directory`);
    }
    fs.writeFileSync(fullpath, buffer);
    this.self.parent.log(`Wrote migration to disk at "${filename}" (${migrationJSON.up.map(cmd => cmd[0]).join(', ')})`);
    return fullpath;
  }

  /**
   * Writes a migration to the filesystem
   */
  writeSchema (schema) {
    let json;
    if (schema instanceof SchemaManager) {
      json = schema.toJSON();
    } else {
      json = SchemaManager.validate(schema);
    }
    let pathname = this.self.parent._Schema.constructor.getDirectory('cache');
    SchemaManager.checkdir(pathname);
    let filename = this.self.parent._Schema.constructor.cacheSchemaFile;
    let fullpath = path.join(pathname, filename);
    fs.writeFileSync(fullpath, JSON.stringify(json, null, 2));
    this.self.parent.log(`Wrote cache of schema to disk at "${fullpath}"`);
  }

  /**
   * Fast-forwards filesystem
   * Pulls migrations from the database to the local filesystem
   */
  async fastForward () {
    let migrationState = await this.self.getMigrationState();
    switch (migrationState.status) {

      default:
        throw new Error(`Invalid migration state status: "${migrationState.status}"`);
        break;

      case 'mismatch':
        throw new Error(
          `"mismatch"\nMigration (id=${migrationState.mismatchMigrationId}) stored in database does not match filesystem migration.\n` +
          `Before Fast-Forwarding, please first run filesystem.rewindSync to rewind filesystem state to last matching database state` +
          (migrationState.lastMigrationId > -1 ? ` (id=${migrationState.lastMigrationId}).` : '.')
        );
        break;

      case 'database_ahead':
        let writeMigrations = migrationState.databaseMigrations;
        let len = writeMigrations.length;
        for (let i = 0; i < len; i++) {
          let migration = writeMigrations[i];
          await this.write(migration);
        }
        this.self.parent.log('Fast-forward complete!');
        return writeMigrations;
        break;

      case 'unsynced':
        throw new Error(
          `"unsynced"\nOne or more migrations stored in database are out of sync with filesystem migrations.\n` +
          `Before Fast-Forwarding, please first run filesystem.rewindSync to rewind filesystem state to last matching database state` +
          (migrationState.lastMigrationId > -1 ? ` (id=${migrationState.lastMigrationId}).` : '.')
        );
        break;

      case 'filesystem_ahead':
        throw new Error(
          `"filesystem_ahead"\nMigration (id=${migrationState.mismatchMigrationId}) and above do not exist in the database.\n` +
          `If you want the filesystem state to match the database, please run filesystem.rewindSync to set it to the last matching database state` +
          (migrationState.lastMigrationId > -1 ? ` (id=${migrationState.lastMigrationId}).` : '.') +
          `\nAlternatively, you can migrate to push the filesystem state to database.`
        );
        break;

      case 'synced':
        this.self.parent.log('Already synced!');
        return [];
        break;

    }
  }

  /**
   * Rewinds (removes) migrations from filesystem
   */
  rewind (steps = 1) {
    if (typeof steps !== 'number' || parseInt(steps) !== steps || steps < 1) {
      throw new Error('steps must be a number >= 1');
    }
    let migrations = this.getMigrations();
    if (!migrations.length) {
      return false;
    } else {
      for (let i = 0; i < steps; i++) {
        let migration = migrations.pop();
        let filename = Migration.generateFilename(migration.id, migration.name);
        try {
          fs.unlinkSync(path.join(this.self.parent._Schema.constructor.getDirectory('migrations'), filename));
          this.self.parent.log(`Rewound and removed migration(id=${migration.id}, name=${migration.name}) from filesystem successfully!`);
        } catch (e) {
          this.self.parent.error(`Error during rewind: ${e.message}`, e);
          throw e;
        }
      }
      this.self.parent.log(`Rewind complete!`);
      return true;
    }
  }

  /**
   * Rewinds to a specific migrationId
   */
  rewindTo (migrationId) {
    migrationId = migrationId !== null ? parseInt(migrationId) : migrationId;
    let migrations = this.getMigrations();
    let foundIndex = migrations.findIndex(migration => migration.id === migrationId);
    if (foundIndex === -1) {
      throw new Error(`Could not rewind to migration(id=${JSON.stringify(migrationId)}), not found in filesystem.`);
    }
    if (foundIndex === migrations.length - 1) {
      this.self.parent.log(`Could not rewind: already at migration(id=${JSON.stringify(migrationId)})`);
      return false;
    } else {
      let steps = migrations.length - 1 - foundIndex;
      return this.rewind(steps);
    }
  }

  /**
   * Rewinds to a specific migrationId
   */
  async rewindSync () {
    let migrationState = await this.self.getMigrationState();
    let migrationId = migrationState.lastMigrationId;
    if (migrationId === -1) {
      throw new Error(`Could not rewindSync: no valid matching migrationId between filesystem and database`);
    }
    return this.rewindTo(migrationId);
  }

}

module.exports = MigrationManagerDangerousFilesystem;
