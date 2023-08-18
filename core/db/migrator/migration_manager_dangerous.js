const fs = require('fs');
const path = require('path');

const ModelFactory = require('../../lib/model_factory.js');
const Migration = require('./migration.js');
const MigrationManagerDangerousFilesystem = require('./migration_manager_dangerous_filesystem.js');

const deepEqual = require('deep-equal');

/**
 * Contains functions for database manipulation
 * Prefixed with Dangerous to warn against usage in typical ORM settings
 */
class MigrationManagerDangerous {

  constructor (migrator) {
    this.parent = migrator;
    this.filesystem = new MigrationManagerDangerousFilesystem(this);
  }

  /**
   * Resets the schema and filesystem migrations
   */
  reset () {
    this.parent._Schema.clear();
    this.filesystem.clear();
  }

  /**
   * Clears entire database
   */
  async annihilate () {
    let result = await this.parent._Schema.db.transact(
      [
        this.parent._Schema.db.adapter.generateClearDatabaseQuery()
      ].join(';')
    );
    this.parent.log(`Annihilated database`);
    return result;
  }

  /**
   * Drops all existing migrations
   */
  async drop () {
    let result = await this.parent._Schema.db.transact(
      [
        this.parent._Schema.db.adapter.generateDropTableQuery(this.parent._Schema.constructor.migrationsTable, true),
      ].join(';')
    );
    this.parent.log(`Table "${this.parent._Schema.constructor.migrationsTable}" dropped migrations`);
    return result;
  }

  /**
   * Truncates (clears) all existing migrations but leaves table intact
   */
  async truncate () {
    let result = await this.parent._Schema.db.transact(
      [
        this.parent._Schema.db.adapter.generateTruncateTableQuery(this.parent._Schema.constructor.migrationsTable),
      ].join(';')
    );
    this.parent.log(`Table "${this.parent._Schema.constructor.migrationsTable}" cleared migrations`);
    return result;
  }

  /**
   * Prepares database for migrations
   */
  async prepare () {
    let result = await this.parent._Schema.db.transact(
      [
        this.parent._Schema.db.adapter.generateDropTableQuery(this.parent._Schema.constructor.migrationsTable, true),
        this.parent._Schema.db.adapter.generateCreateTableQuery(this.parent._Schema.constructor.migrationsTable, [
          {name: 'id', type: 'int', properties: {nullable: false, primary_key: true}},
          {name: 'name', type: 'string'},
          {name: 'schema', type: 'json'},
          {name: 'commands', type: 'json'},
          {name: 'created_at', type: 'datetime'}
        ])
      ].join(';')
    );
    this.parent.log(`Table "${this.parent._Schema.constructor.migrationsTable}" prepared for new migrations`);
    return result;
  }

  /**
   * Saves current schema state into an empty migration table
   */
  async initialize () {
    let json = this.parent._Schema.schema;
    let queryResult = await this.parent._Schema.db.query(`SELECT COUNT(id) AS count_id FROM "${this.parent._Schema.constructor.migrationsTable}"`, []);
    let row = queryResult.rows[0];
    if (row.count_id) {
      throw new Error(`Could not initialize: non-empty migration table "${this.parent._Schema.constructor.migrationsTable}" (${row.count_id} entries)`);
    }
    let migration = this.filesystem.initialize(json);
    let result = await this.commit(migration);
    this.parent.log(`Table "${this.parent._Schema.constructor.migrationsTable}" initialized from migration(id=${json.migration_id})`);
    return migration;
  }

  //
  // /**
  //  * Reconstitutes database state according to the migration state
  //  */
  // async reconstitute () {
  //   let queryResult = await this.parent._Schema.db.query(`SELECT id, name, schema FROM "${this.parent._Schema.constructor.migrationsTable}" ORDER BY "id" DESC LIMIT 1`, []);
  //   let row = queryResult.rows[0];
  //   if (!row) {
  //     throw new Error(`Could not reconstitute: Migration table "${this.parent._Schema.constructor.migrationsTable}" empty, try running migrations or recording the schema`);
  //   }
  //   if (row.id !== this.parent._Schema.getMigrationId()) {
  //     throw new Error(`Could not reconstitute: Migration table "${this.parent._Schema.constructor.migrationsTable}" id mismatch (database: ${row.id}, bootstrapper: ${this.parent._Schema.getMigrationId()})`);
  //   }
  //   if (!deepEqual(row.schema, this.parent._Schema.schema)) {
  //     throw new Error(`Could not reconstitute: Migration table "${this.parent._Schema.constructor.migrationsTable}" schema mismatch for migration(id=${row.id}, name=${row.name})`);
  //   }
  //   let modelObject = this.parent._Schema.schema.models;
  //   let models = Object.keys(modelObject).map(name => modelObject[name]);
  //   let indices = this.parent._Schema.schema.indices;
  //   let queries = [];
  //   queries = queries.concat(models.map(model => this.parent._Schema.db.adapter.generateCreateTableQuery(model.name, model.columns)));
  //   queries = queries.concat(indices.map(index => this.parent._Schema.db.adapter.generateCreateIndexQuery(index.table, index.column, index.type)));
  //   let result = await this.parent._Schema.db.transact(queries.join(';'));
  //   this.parent.log(`Reconstituted from migration(id=${this.parent._Schema.getMigrationId()}, name=${row.name})`);
  //   return result;
  // }

  /**
   * Seeds the database with initial data
   */
  async seed (seed = [{}]) {
    if (!Array.isArray(seed)) {
      seed = [seed];
    }
    let results;
    try {
      results = await ModelFactory.createFromModels(
        this.parent._Schema.Models,
        seed
      );
    } catch (e) {
      console.error(e);
      throw new Error(`Could not seed: ${e.message}`);
    }
    const summary = {};
    let total = 0;
    seed.forEach(seedEntry => {
      let modelNames = Object.keys(seedEntry);
      modelNames.forEach(name => {
        summary[name] = summary[name] || 0;
        summary[name] += seedEntry[name].length;
        total += seedEntry[name].length;
      });
    });
    const textSummary = Object.keys(summary).sort().map(name => {
      return ` + "${name}" (x${summary[name]})`;
    }).join('\n');
    this.parent.log(`Seeded ${total} entries${total ? ':\n' + textSummary :  ''}`);
    return results;
  }

  /**
   * Destroys the existing database,
   */
  async bootstrap (seed) {
    await this.annihilate();
    await this.prepare();
    await this.initialize();
    // await this.reconstitute();
    if (seed) {
      await this.seed(seed);
    }
  }

  /**
   * Commits a migration to the database
   */
  async commit (migration) {
    let migrationJSON;
    if (migration instanceof Migration) {
      migrationJSON = migration.toJSON();
      if (migration.originalId !== this.parent._Schema.schema.migration_id) {
        throw new Error(
          `Could not commit migration: Out-of-date\n` +
          `The migration provided was based on migration id: ${migration.originalId}\n` +
          `The current schema has migration id: ${this.parent._Schema.schema.migration_id}\n` +
          `Please create a new migration based on the current schema.`
        );
      }
    } else {
      try {
        migrationJSON = Migration.validateMigration(migration, this.parent._Schema.db);
      } catch (e) {
        throw new Error(
          `Could not commit migration: Invalid\n` +
          e.message
        );
      }
    }
    let queries = migrationJSON.up.map(command => {
      return this.parent[command[0]].apply(this.parent, command.slice(1));
    });
    queries.push(
      [
        this.parent._Schema.db.adapter.generateInsertQuery(
          this.parent._Schema.constructor.migrationsTable,
          ['id', 'name', 'commands', 'schema', 'created_at']
        ),
        [
          migrationJSON.id,
          migrationJSON.name,
          migrationJSON,
          this.parent._Schema.schema,
          new Date()
        ]
      ]
    );
    try {
      let migrationResult = await this.parent._Schema.db.transact(queries);
    } catch (e) {
      this.parent.error(`Error during migration: ${e.message}`, e);
      migrationJSON.down.map(command => {
        this.parent[command[0]].apply(this.parent, command.slice(1));
      });
      throw e;
    }
    this.parent._Schema.update(migrationJSON.id);
    this.filesystem.writeSchema(this.parent._Schema);
    this.parent.log(`Ran migration(id=${migrationJSON.id}, name=${migrationJSON.name}) successfully! (${migrationJSON.up.map(cmd => cmd[0]).join(', ')})`);
    return true;
  }

  async getMigrations () {
    let result;
    try {
      result = await this.parent._Schema.db.query(`SELECT "id", "name", "commands", "schema", "created_at" FROM "${this.parent._Schema.constructor.migrationsTable}" ORDER BY "id" ASC`, []);
    } catch (e) {
      console.error(e);
      throw new Error(`Could not get database migrations: ${e.message}`);
    }
    return result.rows.map(row => row.commands);
  }

  diffMigrations (filesystemMigrations, databaseMigrations) {
    for (let i = 1; i < filesystemMigrations.length; i++) {
      let prevMigration = filesystemMigrations[i - 1];
      let migration = filesystemMigrations[i];
      if (prevMigration.id >= migration.id) {
        throw new Error(
          `Filesystem migrations out of order: (id=${migration.id}) located after (id=${prevMigration.id})\n` +
          `Please ensure filesystem migrations are in alphanumeric order.`
        )
      }
    }
    let migrationDiffs = [];
    let migrationLookup = {};
    filesystemMigrations.forEach(migration => {
      let migrationDiff = {
        migration: migration,
        filesystem: true,
        database: false,
        mismatch: false
      };
      migrationLookup[migration.id] = migrationDiff;
      migrationDiffs.push(migrationDiff);
    });
    databaseMigrations.forEach(migration => {
      let migrationDiff = migrationLookup[migration.id];
      if (migrationDiff) {
        if (migrationDiff.database) {
          throw new Error(`Duplicate database migration: (id=${migration.id})`);
        }
        migrationDiff.database = true;
        if (!deepEqual(migrationDiff.migration, migration)) {
          migrationDiff.mismatch = true
        }
      } else {
        migrationDiff = {
          migration: migration,
          filesystem: false,
          database: true,
          mismatch: false
        };
        migrationLookup[migration.id] = migrationDiff;
        let nextIndex = migrationDiffs.findIndex(migrationDiff => {
          return migrationDiff.migration.id > migration.id;
        });
        if (nextIndex === -1) {
          migrationDiffs.push(migrationDiff);
        } else {
          migrationDiffs = [].concat(
            migrationDiffs.slice(0, nextIndex),
            migrationDiff,
            migrationDiffs.slice(nextIndex)
          );
        }
      }
    });
    return migrationDiffs;
  }

  prettyPrintDiffs (migrationDiffs) {
    return migrationDiffs.map(migrationDiff => {
      let migration = migrationDiff.migration;
      let filename = Migration.generateFilename(migration.id, migration.name);
      if (migrationDiff.mismatch) {
        return `? ${filename}`;
      } else if (migrationDiff.filesystem && migrationDiff.database) {
        return `  ${filename}`;
      } else if (migrationDiff.filesystem) {
        return `+ ${filename}`;
      } else if (migrationDiff.database) {
        return `- ${filename}`;
      } else {
        throw new Error(`Unknown diff state: ${filename}`);
      }
    }).join('\n');
  }

  /**
   * Gets migration diffs in easy-to-read text format
   */
  async getTextDiffs () {
    let filesystemMigrations = this.filesystem.getMigrations();
    let migrations = await this.getMigrations();
    let migrationDiffs = this.diffMigrations(filesystemMigrations, migrations);
    return this.prettyPrintDiffs(migrationDiffs);
  }

  /**
   * Get migration state
   * Valid states are ["mismatch", "database_ahead", "unsynced", "filesystem_ahead", "synced"]
   * mismatch:      Migration the DB has is not the same as a migration filesystem has
   *                = restoreFromDatabase to copy from database, or rollbackSync + migrate
   * database_ahead:  DB ahead of filesystem storage, can fast-forward
   *                = restoreFromDatabase to copy from database or rollbackSync + migrate (noop)
   * unsynced:      DB and filesystem have various mismatches
   *                = restoreFromDatabase to copy from database or rollbackSync + migrate
   * filesystem_ahead:   Filesystem is ahead of DB, usually means you pulled from git
   *                = migrate
   * synced:        All good!
   */
  async getMigrationState () {

    // First we get filesystem and database migrations
    let filesystemMigrations = this.filesystem.getMigrations();
    let databaseMigrations = await this.getMigrations();

    // Now we diff them, returns {migration: {}, filesystem: bool, database: bool, mismatch: bool}
    let migrationDiffs = this.diffMigrations(filesystemMigrations, databaseMigrations);

    // Find the first time a migration is NOT in filesystem
    // OR the migrations don't match
    let mismatchIndex = migrationDiffs.findIndex(migrationDiff => {
      return !migrationDiff.filesystem || migrationDiff.mismatch;
    });

    // Pick that diff out specifically, null if not found
    let mismatchDiff = migrationDiffs[mismatchIndex] || null; // accounts for -1

    // Find the last migration that is in filesystem but not in database
    // We look at every diff before mismatchDiff and find the first one that's
    // in filesystem storage but not in database
    let prevDiffs = migrationDiffs.slice(0);
    if (mismatchDiff) {
      prevDiffs = prevDiffs.slice(0, mismatchIndex);
    }
    let unstoredDiffIndex = prevDiffs
      .findIndex(migrationDiff => migrationDiff.filesystem && !migrationDiff.database);
    let storedDiff = prevDiffs.length
        ? unstoredDiffIndex > -1
          ? (prevDiffs[unstoredDiffIndex - 1] || null)
          : prevDiffs[prevDiffs.length - 1]
        : null;
    let lastMigrationId = storedDiff ? storedDiff.migration.id : -1;
    let mismatchMigrationId = mismatchDiff ? mismatchDiff.migration.id : -1;

    if (mismatchDiff) {
      let migration = mismatchDiff.migration;
      let endDiffs = migrationDiffs.slice(mismatchIndex);
      if (mismatchDiff.mismatch) {
        return {
          status: 'mismatch',
          lastMigrationId: lastMigrationId,
          mismatchMigrationId: mismatchMigrationId,
          databaseMigrations: endDiffs.map(diff => diff.migration)
        };
      } else if (mismatchDiff.database) {
        let databaseOnlyEndDiffs = endDiffs.filter(migrationDiff => {
          return !migrationDiff.filesystem && migrationDiff.database &&
            !migrationDiff.mismatch;
        });
        if (endDiffs.length === databaseOnlyEndDiffs.length) {
          return {
            status: 'database_ahead',
            lastMigrationId: lastMigrationId,
            mismatchMigrationId: mismatchMigrationId,
            databaseMigrations: endDiffs.map(diff => diff.migration)
          };
        } else {
          return {
            status: 'unsynced',
            lastMigrationId: lastMigrationId,
            mismatchMigrationId: mismatchMigrationId,
            databaseMigrations: endDiffs.map(diff => diff.migration)
          };
        }
      }
    } else if (lastMigrationId > -1) {
      let pendingMigrations = filesystemMigrations.slice(
        filesystemMigrations.findIndex(migration => migration.id > lastMigrationId)
      );
      mismatchMigrationId = pendingMigrations[0].id;
      return {
        status: 'filesystem_ahead',
        lastMigrationId: lastMigrationId,
        mismatchMigrationId: mismatchMigrationId,
        filesystemMigrations: pendingMigrations
      };
    } else {
      return {
        status: 'synced',
        mismatchMigrationId: mismatchMigrationId,
        lastMigrationId: lastMigrationId
      };
    }
  }

  /**
   * Runs migrations by committing them to database.
   * By default runs all pending filesystem migrations.
   */
  async migrate (steps = null) {
    if (steps !== null) {
      if (typeof steps !== 'number' || parseInt(steps) !== steps || steps < 1) {
        throw new Error('steps must be a number >= 1');
      }
    }
    let migrationState = await this.getMigrationState();
    switch (migrationState.status) {

      default:
        throw new Error(`Invalid migration state status: "${migrationState.status}"`);
        break;

      case 'mismatch':
        throw new Error(
          `"mismatch"\nMigration (id=${migrationState.mismatchMigrationId}) stored in database does not match filesystem migration.\n` +
          `Before migrating, please first run rollbackSync to rollback database state to last matching filesystem state` +
          (migrationState.lastMigrationId > -1 ? ` (id=${migrationState.lastMigrationId}).` : '.')
        );
        break;

      case 'database_ahead':
        throw new Error(
          `"database_ahead"\nMigration (id=${migrationState.mismatchMigrationId}) stored in database does not exist in filesystem migrations.\n` +
          `Before migrating, please first run rollbackSync to rollback database state to last matching filesystem state` +
          (migrationState.lastMigrationId > -1 ? ` (id=${migrationState.lastMigrationId}).` : '.') +
          `\nAlternatively, you can filesystem.fastForward to pull the database state to the filesystem state.`
        );
        break;

      case 'unsynced':
        throw new Error(
          `"unsynced"\nOne or more migrations stored in database are out of sync with filesystem migrations.\n` +
          `Before migrating, please first run rollbackSync to rollback database state to last matching filesystem state` +
          (migrationState.lastMigrationId > -1 ? ` (id=${migrationState.lastMigrationId}).` : '.')
        );
        break;

      case 'filesystem_ahead':
        let commitMigrations = migrationState.filesystemMigrations;
        let len = steps !== null ? steps : commitMigrations.length;
        for (let i = 0; i < len; i++) {
          let migration = commitMigrations[i];
          await this.commit(migration);
        }
        this.parent.log('Migration complete!');
        return commitMigrations;
        break;

      case 'synced':
        this.parent.log('Already synced!');
        return [];
        break;

    }
  }

  /**
   * Rolls back migrations on database, must provide steps.
   */
  async rollback (steps = 1) {
    if (typeof steps !== 'number' || parseInt(steps) !== steps || steps < 1) {
      throw new Error('steps must be a number >= 1');
    }
    let migrations = await this.getMigrations();
    let rollbacks = [];
    for (let i = 0; i < steps; i++) {
      let migration = migrations.pop();
      rollbacks.push({
        migration: migration,
        prevId: (migrations[migrations.length -1 ] || {}).id || null
      });
    }
    for (let i = 0; i < rollbacks.length; i++) {
      let rollback = rollbacks[i];
      let migration = rollback.migration;
      let queries = migration.down.map(command => {
        return this.parent[command[0]].apply(this.parent, command.slice(1));
      });
      queries.push(
        [
          this.parent._Schema.db.adapter.generateDeleteQuery(
            this.parent._Schema.constructor.migrationsTable,
            ['id']
          ),
          [
            migration.id
          ]
        ]
      );
      try {
        let rollbackResult = await this.parent._Schema.db.transact(queries);
      } catch (e) {
        this.parent.error(`Error during rollback: ${e.message}`, e);
        migrationJSON.up.map(command => {
          this.parent[command[0]].apply(this.parent, command.slice(1));
        });
        throw e;
      }
      this.parent._Schema.update(rollback.prevId);
      this.parent.log(`Rolled back migration(id=${migration.id}, name=${migration.name}) successfully! (${migration.down.map(cmd => cmd[0]).join(', ')})`);
    }
    this.filesystem.writeSchema(this.parent._Schema);
    this.parent.log(`Rollback complete!`);
    return true;
  }

  /**
   * Rolls back to a specific migrationId
   */
  async rollbackTo (migrationId) {
    migrationId = migrationId !== null ? parseInt(migrationId) : migrationId;
    let migrations = await this.getMigrations();
    let foundIndex = migrations.findIndex(migration => migration.id === migrationId);
    if (foundIndex === -1) {
      throw new Error(`Could not rollback to migration(id=${JSON.stringify(migrationId)}), not found in database.`);
    }
    if (foundIndex === migrations.length - 1) {
      this.parent.log(`Could not rollback: already at migration(id=${JSON.stringify(migrationId)})`);
      return false;
    } else {
      let steps = migrations.length - 1 - foundIndex;
      return this.rollback(steps);
    }
  }

  /**
   * Rolls back to a specific migrationId
   */
  async rollbackSync () {
    let migrationState = await this.getMigrationState();
    let migrationId = migrationState.lastMigrationId;
    if (migrationId === -1) {
      throw new Error(`Could not rollbackSync: no valid matching migrationId between filesystem and database`);
    }
    return this.rollbackTo(migrationId);
  }

};

module.exports = MigrationManagerDangerous;
