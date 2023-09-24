module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;
  const fs = require('fs');
  const path = require('path');

  const Instant = Instantiator();
  // Instant.enableLogs(4);

  describe('InstantORM.Core.DB.MigrationManager', async () => {

    before(async () => {
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
    });

    after(async () => {
      Instant.Migrator.enableDangerous();
      Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    it('should be connect to a database', async () => {

      expect(Instant.database()).to.exist;

    });

    it('should have an empty schema', async () => {

      let schema = Instant.Schema.schema;

      expect(schema.migration_id).to.equal(null);
      expect(schema.indices.length).to.equal(0);
      expect(Object.keys(schema.tables).length).to.equal(0);

    });

    it('should write an empty seed', async () => {

      Instant.Migrator.enableDangerous();
      Instant.Migrator.Dangerous.filesystem.createSeed();
      let seed = Instant.Migrator.Dangerous.filesystem.readSeed();

      expect(Instant.Migrator.Dangerous.filesystem.hasSeed()).to.equal(true);
      expect(seed).to.deep.equal([{}]);

      fs.unlinkSync(`./_instant/seed.json`);
      seed = Instant.Migrator.Dangerous.filesystem.readSeed();

      expect(Instant.Migrator.Dangerous.filesystem.hasSeed()).to.equal(false);
      expect(seed).to.equal(null);

      Instant.Migrator.Dangerous.createSeedIfNotExists();
      seed = Instant.Migrator.Dangerous.filesystem.readSeed();

      expect(Instant.Migrator.Dangerous.filesystem.hasSeed()).to.equal(true);
      expect(seed).to.deep.equal([{}]);

      Instant.Migrator.disableDangerous();

    });

    it('should show migrator disabled', async () => {

      let hasMigrationsEnabled = await Instant.Migrator.isEnabled();

      expect(hasMigrationsEnabled).to.equal(false);

    });

    it('should fail to create a migration if database is not ready', async () => {

      let errpr;

      try {
        const migration = await Instant.Migrator.create();
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.contain('migrations enabled');

    });

    it('should initialize database migrations and create first migration, but not run it', async () => {

      Instant.Migrator.enableDangerous();
      Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.prepare();
      await Instant.Migrator.Dangerous.initialize();
      const migration = await Instant.Migrator.create();

      migration.createTable('blog_posts', [{name: 'title', type: 'string'}]);
      migration.alterColumn('blog_posts', 'title', 'varchar');
      let json = migration.toJSON();

      expect(migration).to.exist;
      expect(json.id).to.exist;
      expect(json.id).to.be.a('number');
      expect(json.name).to.exist;
      expect(json.name).to.equal('create_blog_posts');
      expect(json.id.toString()).to.satisfy(v => v.startsWith(new Date().getUTCFullYear().toString()));
      expect(json.up.length).to.equal(2);
      expect(json.up[0]).to.deep.equal(['createTable', 'blog_posts', [{name: 'title', type: 'string'}]]);
      expect(json.up[1]).to.deep.equal(['alterColumn', 'blog_posts', 'title', 'varchar']);
      expect(json.down.length).to.equal(2);
      expect(json.down[0]).to.deep.equal(['alterColumn', 'blog_posts', 'title', 'string']);
      expect(json.down[1]).to.deep.equal(['dropTable', 'blog_posts']);

      expect(Instant.Schema.findTable('blog_posts')).to.not.exist;

    });

    it('should fail when provided invalid command input', async () => {

      Instant.Migrator.enableDangerous();
      Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.prepare();
      await Instant.Migrator.Dangerous.initialize();
      const migration = await Instant.Migrator.create();

      let error;

      try {
        migration.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        migration.alterColumn('blog_posts', 'title', {type: 'varchar'});
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.contain('Invalid migration command "alterColumn" at argument[2]: type');

    });

    it('should initialize database migrations and create first named migration, and run it', async () => {

      Instant.Migrator.enableDangerous();
      Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.prepare();
      await Instant.Migrator.Dangerous.initialize();
      const migration = await Instant.Migrator.create(null, 'my_first_migration');

      migration.createTable('blog_posts', [{name: 'title', type: 'string'}]);
      migration.alterColumn('blog_posts', 'title', 'varchar');

      await Instant.Migrator.Dangerous.commit(migration);

      expect(migration.toJSON().name).to.equal('my_first_migration');

      // Note: id won't be the same because migration.schema is a tmpSchema
      // that's just used to track original schema and changes
      expect(Instant.Migrator.Dangerous.parent._Schema).to.equal(Instant.Schema);
      expect(Instant.Schema.schema.migration_id).to.equal(migration.id);
      expect(Instant.Schema.schema.indices).to.deep.equal(migration._Schema.schema.indices);
      expect(Instant.Schema.schema.models).to.deep.equal(migration._Schema.schema.models);

      expect(Instant.Model('BlogPost')).to.exist;
      expect(Instant.Model('BlogPost').columnNames()).to.deep.equal(['id', 'title', 'created_at', 'updated_at']);
      expect(Instant.Model('BlogPost').columnLookup()['title'].type).to.equal('varchar');

      let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.constructor.migrationsTable}"`, []);
      expect(result.rows.length).to.equal(2);

      expect(result.rows[0].id).to.equal(1);
      expect(result.rows[1].id).to.equal(migration.id);
      expect(result.rows[1].commands).to.deep.equal(migration.toJSON());

    });

    it('should create a migration and write it to a file', async () => {

      Instant.Migrator.enableDangerous();
      Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.annihilate();
      await Instant.Migrator.Dangerous.prepare();
      const initialMigration = await Instant.Migrator.Dangerous.initialize();
      const migration = await Instant.Migrator.create(null, 'my_first_migration');

      migration.createTable('blog_posts', [{name: 'title', type: 'string'}]);
      migration.alterColumn('blog_posts', 'title', 'varchar');
      Instant.Migrator.Dangerous.filesystem.write(migration);

      let stat = fs.statSync(migration._Schema.constructor.getDirectory('migrations'));
      let filenames = fs.readdirSync(migration._Schema.constructor.getDirectory('migrations'));

      expect(stat.isDirectory()).to.equal(true);
      expect(filenames.length).to.equal(2);
      expect(filenames[0]).to.equal(`${Instantiator.InstantORM.Core.DB.Migration.padMigrationId(initialMigration.id)}__${initialMigration.name}.json`);
      expect(filenames[1]).to.equal(`${Instantiator.InstantORM.Core.DB.Migration.padMigrationId(migration.id)}__${migration.name}.json`);

      let initialFile = fs.readFileSync(path.join(migration._Schema.constructor.getDirectory('migrations'), filenames[0]));
      let initialJSON = JSON.parse(initialFile.toString());
      let file = fs.readFileSync(path.join(migration._Schema.constructor.getDirectory('migrations'), filenames[1]));
      let json = JSON.parse(file.toString());

      expect(initialJSON).to.deep.equal(initialMigration.toJSON());
      expect(json).to.deep.equal(migration.toJSON());

    });

    describe('InstantORM.Core.DB.MigrationManager (Migrations Flow)', async () => {

      it('should throw an error for no migrations directory', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();

        let error;

        try {
          let migrations = Instant.Migrator.Dangerous.filesystem.getMigrations();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('not initialized');

      });

      it('should succeed at initializing local directory and getting migrations', async () => {

        await Instant.Migrator.Dangerous.initialize();
        let migrations = Instant.Migrator.Dangerous.filesystem.getMigrations();

        expect(migrations).to.exist;
        expect(migrations.length).to.equal(1);
        expect(migrations[0].id).to.equal(1);
        expect(migrations[0].name).to.equal('initial_migration');

      });

      it('should get local and remote migrations in sync', async () => {

        let localMigrations = Instant.Migrator.Dangerous.filesystem.getMigrations();
        let remoteMigrations = await Instant.Migrator.Dangerous.getMigrations();

        expect(localMigrations).to.deep.equal(remoteMigrations);

      });

      it('should create a migration and have local be out of sync', async () => {

        const migration = await Instant.Migrator.create(null, 'my_first_migration');
        migration.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migration);

        let localMigrations = Instant.Migrator.Dangerous.filesystem.getMigrations();
        let remoteMigrations = await Instant.Migrator.Dangerous.getMigrations();

        expect(localMigrations.slice(0, 1)).to.deep.equal(remoteMigrations);
        expect(localMigrations.length).to.equal(2);
        expect(remoteMigrations.length).to.equal(1);

      });

      it('should fail to create another migration with same id', async () => {

        let error;
        let localMigrations = Instant.Migrator.Dangerous.filesystem.getMigrations();

        const migration = await Instant.Migrator.create(localMigrations[1].id, 'create_users');
        migration.createTable('users', [{name: 'username', type: 'string'}]);

        try {
          Instant.Migrator.Dangerous.filesystem.write(migration);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain(`(id=${localMigrations[1].id})`);

      });

      it('should create another migration and have local be out of sync', async () => {

        let localMigrations = Instant.Migrator.Dangerous.filesystem.getMigrations();
        let remoteMigrations = await Instant.Migrator.Dangerous.getMigrations();

        const migration = await Instant.Migrator.create(localMigrations[1].id + 1, 'create_users');
        migration.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migration);

        localMigrations = Instant.Migrator.Dangerous.filesystem.getMigrations();

        expect(localMigrations.slice(0, 1)).to.deep.equal(remoteMigrations);
        expect(localMigrations.length).to.equal(3);
        expect(remoteMigrations.length).to.equal(1);

      });

      it('should diff migrations', async () => {

        let localMigrations = Instant.Migrator.Dangerous.filesystem.getMigrations();
        let remoteMigrations = await Instant.Migrator.Dangerous.getMigrations();

        let migrationDiffs = Instant.Migrator.Dangerous.diffMigrations(localMigrations, remoteMigrations);

        expect(migrationDiffs.length).to.equal(3);
        expect(migrationDiffs[0].filesystem).to.equal(true);
        expect(migrationDiffs[0].database).to.equal(true);
        expect(migrationDiffs[0].mismatch).to.equal(false);
        expect(migrationDiffs[1].filesystem).to.equal(true);
        expect(migrationDiffs[1].database).to.equal(false);
        expect(migrationDiffs[1].mismatch).to.equal(false);
        expect(migrationDiffs[2].filesystem).to.equal(true);
        expect(migrationDiffs[2].database).to.equal(false);
        expect(migrationDiffs[2].mismatch).to.equal(false);

      });

      it('should successfully migrate', async () => {

        let commits = await Instant.Migrator.Dangerous.migrate();

        expect(commits).to.exist;
        expect(commits.length).to.equal(2);
        expect(Instant.Model('BlogPost')).to.exist;
        expect(Instant.Model('BlogPost').columnNames()).to.deep.equal(['id', 'title', 'created_at', 'updated_at']);
        expect(Instant.Model('BlogPost').columnLookup()['title'].type).to.equal('string');
        expect(Instant.Model('User')).to.exist;
        expect(Instant.Model('User').columnNames()).to.deep.equal(['id', 'username', 'created_at', 'updated_at']);
        expect(Instant.Model('User').columnLookup()['username'].type).to.equal('string');

      });

      it('should be able to reference other models', async () => {

        expect(Instant.Model('BlogPost').getModel('User')).to.equal(Instant.Model('User'));
        expect(Instant.Model('BlogPost').prototype.getModel('User')).to.equal(Instant.Model('User'));

      });

      it('should fail to migrate when "mismatch"', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        // Need to create unwritten migration here or we get an error...
        let migrationA1 = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA1.createTable('blog_posts', [{name: 'title', type: 'string'}, {name: 'content', type: 'string'}]);

        await Instant.Migrator.Dangerous.migrate();
        fs.unlinkSync(migrationA.getFilepath());

        Instant.Migrator.Dangerous.filesystem.write(migrationA1);

        let textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `? ${migrationA1.getFilename()}`,
          `  ${migrationB.getFilename()}`
        ].join('\n'));

        let error;

        try {
          await Instant.Migrator.Dangerous.migrate();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"mismatch"');
        expect(error.message).to.contain('(id=100)');
        expect(error.message).to.contain('(id=1)');

      });

      it('should fail to migrate when "database_ahead"', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        await Instant.Migrator.Dangerous.migrate();
        fs.unlinkSync(migrationB.getFilepath());

        let textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `- ${migrationB.getFilename()}`
        ].join('\n'));

        let error;

        try {
          await Instant.Migrator.Dangerous.migrate();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"database_ahead"');
        expect(error.message).to.contain('(id=200)');
        expect(error.message).to.contain('(id=100)');

      });

      it('should fail to migrate when "unsynced"', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();
        fs.unlinkSync(migrationB.getFilepath());

        let textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `- ${migrationB.getFilename()}`,
          `  ${migrationC.getFilename()}`
        ].join('\n'));

        let error;

        try {
          await Instant.Migrator.Dangerous.migrate();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"unsynced"');
        expect(error.message).to.contain('(id=100)');

      });

      it('should migrate based on number of steps', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate(1);

        let textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `+ ${migrationB.getFilename()}`,
          `+ ${migrationC.getFilename()}`
        ].join('\n'));

        await Instant.Migrator.Dangerous.migrate(2);

        textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `  ${migrationB.getFilename()}`,
          `  ${migrationC.getFilename()}`
        ].join('\n'));

      });

      it('should rollback based on number of steps', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();

        let textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(Instant.Model('BlogPost')).to.exist;
        expect(Instant.Model('User')).to.exist;
        expect(Instant.Model('Upload')).to.exist;
        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `  ${migrationB.getFilename()}`,
          `  ${migrationC.getFilename()}`
        ].join('\n'));

        await Instant.Migrator.Dangerous.rollback(1);

        textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(Instant.Model('BlogPost')).to.exist;
        expect(Instant.Model('User')).to.exist;
        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `  ${migrationB.getFilename()}`,
          `+ ${migrationC.getFilename()}`
        ].join('\n'));

        let errorA;
        try {
          Instant.Model('Upload');
        } catch (e) {
          errorA = e;
        }

        expect(errorA).to.exist;
        expect(errorA.message).to.contain('model "Upload"');

        await Instant.Migrator.Dangerous.rollback(2);

        textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `+ ${migrationA.getFilename()}`,
          `+ ${migrationB.getFilename()}`,
          `+ ${migrationC.getFilename()}`
        ].join('\n'));

        let error1;
        try {
          Instant.Model('Upload');
        } catch (e) {
          error1 = e;
        }
        let error2;
        try {
          Instant.Model('User');
        } catch (e) {
          error2 = e;
        }
        let error3;
        try {
          Instant.Model('BlogPost');
        } catch (e) {
          error3 = e;
        }

        expect(error1).to.exist;
        expect(error1.message).to.contain('model "Upload"');
        expect(error2).to.exist;
        expect(error2.message).to.contain('model "User"');
        expect(error3).to.exist;
        expect(error3.message).to.contain('model "BlogPost"');

      });

      it('should rollback to a specific migration id', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();

        let textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(Instant.Model('BlogPost')).to.exist;
        expect(Instant.Model('User')).to.exist;
        expect(Instant.Model('Upload')).to.exist;
        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `  ${migrationB.getFilename()}`,
          `  ${migrationC.getFilename()}`
        ].join('\n'));

        let error;
        try {
          await Instant.Migrator.Dangerous.rollbackTo(105);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('(id=105)');
        expect(error.message).to.contain('not found');

        await Instant.Migrator.Dangerous.rollbackTo(100);

        textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(Instant.Model('BlogPost')).to.exist;
        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `+ ${migrationB.getFilename()}`,
          `+ ${migrationC.getFilename()}`
        ].join('\n'));

        let error1;
        try {
          Instant.Model('Upload');
        } catch (e) {
          error1 = e;
        }
        let error2;
        try {
          Instant.Model('User');
        } catch (e) {
          error2 = e;
        }

        expect(error1).to.exist;
        expect(error1.message).to.contain('model "Upload"');
        expect(error2).to.exist;
        expect(error2.message).to.contain('model "User"');

      });

      it('should rollbackSync = false when already synced', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();
        let rollbackResult = await Instant.Migrator.Dangerous.rollbackSync();

        expect(rollbackResult).to.equal(false);

      });

      it('should rollbackSync = true when not synced', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();
        fs.unlinkSync(migrationB.getFilepath());

        let rollbackResult = await Instant.Migrator.Dangerous.rollbackSync();
        expect(rollbackResult).to.equal(true);

        expect(Instant.Schema.getMigrationId()).to.equal(100);
        expect(Instant.Model('BlogPost')).to.exist;

        let error1;
        try {
          Instant.Model('Upload');
        } catch (e) {
          error1 = e;
        }
        let error2;
        try {
          Instant.Model('User');
        } catch (e) {
          error2 = e;
        }

        expect(error1).to.exist;
        expect(error1.message).to.contain('model "Upload"');
        expect(error2).to.exist;
        expect(error2.message).to.contain('model "User"');

      });

      it('should successfully migrate after rollbackSync with 2nd migration deleted', async () => {

        await Instant.Migrator.Dangerous.migrate();

        expect(Instant.Schema.getMigrationId()).to.equal(300);
        expect(Instant.Model('BlogPost')).to.exist;
        expect(Instant.Model('Upload')).to.exist;

        let error;
        try {
          Instant.Model('User');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('model "User"');

      });

    });

    describe('InstantORM.Core.DB.MigrationManager.filesystem (Filesystem flow)', async () => {

      it('should fast-forward from the database', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();
        fs.unlinkSync(migrationB.getFilepath());
        fs.unlinkSync(migrationC.getFilepath());

        let writtenMigrations = await Instant.Migrator.Dangerous.filesystem.fastForward();

        expect(writtenMigrations.length).to.equal(2);
        expect(writtenMigrations[0].id).to.equal(200);
        expect(writtenMigrations[0].name).to.equal('create_users');
        expect(writtenMigrations[1].id).to.equal(300);
        expect(writtenMigrations[1].name).to.equal('create_uploads');

      });

      it('should fail to fast-forward when "mismatch"', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        // Need to create unwritten migration here or we get an error...
        let migrationA1 = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA1.createTable('blog_posts', [{name: 'title', type: 'string'}, {name: 'content', type: 'string'}]);

        await Instant.Migrator.Dangerous.migrate();

        fs.unlinkSync(migrationA.getFilepath());
        Instant.Migrator.Dangerous.filesystem.write(migrationA1);

        let error;

        try {
          await Instant.Migrator.Dangerous.filesystem.fastForward();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"mismatch"');
        expect(error.message).to.contain('(id=100)');
        expect(error.message).to.contain('(id=1)');

      });

      it('should fail to fast-forward when "unsynced"', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();
        fs.unlinkSync(migrationB.getFilepath());

        let error;

        try {
          await Instant.Migrator.Dangerous.filesystem.fastForward();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"unsynced"');
        expect(error.message).to.contain('(id=100)');

      });

      it('should fail to fast-forward when "filesystem_ahead"', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);

        await Instant.Migrator.Dangerous.migrate();

        // write after migrate...
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        let textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `+ ${migrationB.getFilename()}`
        ].join('\n'));

        let error;

        try {
          await Instant.Migrator.Dangerous.filesystem.fastForward();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"filesystem_ahead"');
        expect(error.message).to.contain('(id=200)');
        expect(error.message).to.contain('(id=100)');

      });

      it('should rewind based on number of steps', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();

        Instant.Migrator.Dangerous.filesystem.rewind(1);

        textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(Instant.Model('BlogPost')).to.exist;
        expect(Instant.Model('User')).to.exist;
        expect(Instant.Model('Upload')).to.exist;
        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `  ${migrationB.getFilename()}`,
          `- ${migrationC.getFilename()}`
        ].join('\n'));

        Instant.Migrator.Dangerous.filesystem.rewind(2);

        textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(Instant.Model('BlogPost')).to.exist;
        expect(Instant.Model('User')).to.exist;
        expect(Instant.Model('Upload')).to.exist;
        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `- ${migrationA.getFilename()}`,
          `- ${migrationB.getFilename()}`,
          `- ${migrationC.getFilename()}`
        ].join('\n'));


      });

      it('should rewind to a specific migration id', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();

        let error;
        try {
          await Instant.Migrator.Dangerous.filesystem.rewindTo(105);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('(id=105)');
        expect(error.message).to.contain('not found');

        await Instant.Migrator.Dangerous.filesystem.rewindTo(100);

        textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `- ${migrationB.getFilename()}`,
          `- ${migrationC.getFilename()}`
        ].join('\n'));

      });

      it('should filesystem.rewindSync = false when already synced', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();
        let rewindResult = await Instant.Migrator.Dangerous.filesystem.rewindSync();

        expect(rewindResult).to.equal(false);

      });

      it('should filesystem.rewindSync = true when not synced', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        const migrationB = await Instant.Migrator.create(200, 'create_users');
        migrationB.createTable('users', [{name: 'username', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        const migrationC = await Instant.Migrator.create(300, 'create_uploads');
        migrationC.createTable('uploads', [{name: 'filename', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationC);

        await Instant.Migrator.Dangerous.migrate();
        fs.unlinkSync(migrationB.getFilepath());

        let rewindResult = await Instant.Migrator.Dangerous.filesystem.rewindSync();
        expect(rewindResult).to.equal(true);

        let textDiffs = await Instant.Migrator.Dangerous.getTextDiffs();

        expect(textDiffs).to.equal([
          `  00000000000001__initial_migration.json`,
          `  ${migrationA.getFilename()}`,
          `- ${migrationB.getFilename()}`,
          `- ${migrationC.getFilename()}`
        ].join('\n'));

      });

    });

    describe('InstantORM.Core.DB.MigrationManager (Consistency)', async () => {

      it('should create serial fields without extra params (defaults included)', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        await Instant.Migrator.Dangerous.migrate();

        expect(Instant.Schema.schema).to.haveOwnProperty('tables');
        expect(Instant.Schema.schema.tables).to.haveOwnProperty('blog_posts');
        expect(Instant.Schema.schema.tables.blog_posts).to.haveOwnProperty('columns');
        expect(Instant.Schema.schema.tables.blog_posts['columns']).to.be.an('array');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][0]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][0].name).to.equal('id');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][0].type).to.equal('serial');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][0].properties).to.not.exist;

      });

    });

  });

};
