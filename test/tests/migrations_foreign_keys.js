module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;
  const fs = require('fs');
  const path = require('path');

  const Instant = Instantiator();
  // Instant.enableLogs(4);

  describe('InstantORM.Core.DB.MigrationManager (Foreign Keys)', async () => {

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

    describe('InstantORM.Core.DB.MigrationManager (Foreign Keys)', async () => {

      it('should successfully create a foreign key', async () => {

        Instant.Migrator.enableDangerous();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );
        migrationA.addForeignKey('blog_posts', 'user_id', 'users', 'id');
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        await Instant.Migrator.Dangerous.migrate();

        expect(Instant.Schema.schema).to.haveOwnProperty('tables');
        expect(Instant.Schema.schema.tables).to.haveOwnProperty('blog_posts');
        expect(Instant.Schema.schema.tables.blog_posts).to.haveOwnProperty('columns');
        expect(Instant.Schema.schema.tables.blog_posts['columns']).to.be.an('array');
        expect(Instant.Schema.schema.tables.blog_posts['columns']).to.have.length(5);
        expect(Instant.Schema.schema.tables.blog_posts['columns'][0]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][0].name).to.equal('id');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][1]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][1].name).to.equal('title');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][2]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][2].name).to.equal('user_id');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][3]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][3].name).to.equal('created_at');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][4]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][4].name).to.equal('updated_at');
        expect(Instant.Schema.schema.foreign_keys).to.exist;
        expect(Instant.Schema.schema.foreign_keys).to.be.an('array');
        expect(Instant.Schema.schema.foreign_keys).to.have.length(1);
        expect(Instant.Schema.schema.foreign_keys[0]).to.exist;
        expect(Instant.Schema.schema.foreign_keys[0].table).to.equal('blog_posts');
        expect(Instant.Schema.schema.foreign_keys[0].column).to.equal('user_id');
        expect(Instant.Schema.schema.foreign_keys[0].parentTable).to.equal('users');
        expect(Instant.Schema.schema.foreign_keys[0].parentColumn).to.equal('id');

      });

      it('should successfully drop a foreign key', async () => {

        const migrationB = await Instant.Migrator.create(200);
        migrationB.dropForeignKey('blog_posts', 'user_id');
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        await Instant.Migrator.Dangerous.migrate();

        expect(Instant.Schema.schema.foreign_keys).to.exist;
        expect(Instant.Schema.schema.foreign_keys).to.be.an('array');
        expect(Instant.Schema.schema.foreign_keys).to.have.length(0);

      });

      it('should fail to create a foreign key when table invalid', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );

        let error;

        try {
          migrationA.addForeignKey('blog_postx', 'user_id', 'users', 'id');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.include('"blog_postx"');

      });

      it('should fail to create a foreign key when column invalid', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );

        let error;

        try {
          migrationA.addForeignKey('blog_posts', 'user_idx', 'users', 'id');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.include('"blog_posts"');
        expect(error.message).to.include('"user_idx"');

      });

      it('should fail to create a foreign key when parent table invalid', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );

        let error;

        try {
          migrationA.addForeignKey('blog_posts', 'user_id', 'userx', 'id');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.include('"userx"');

      });

      it('should fail to create a foreign key when parent column invalid', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );

        let error;

        try {
          migrationA.addForeignKey('blog_posts', 'user_id', 'users', 'idx');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.include('"users"');
        expect(error.message).to.include('"idx"');

      });

      it('should fail to create a foreign key with a circular reference', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );

        let error;

        try {
          migrationA.addForeignKey('blog_posts', 'user_id', 'users', 'id');
          migrationA.addForeignKey('users', 'id', 'blog_posts', 'user_id');
        } catch (e) {
          error = e;
        }
        
        expect(error).to.exist;
        expect(error.message).to.include('Foreign key circular reference');
        expect(error.message).to.satisfy(m => m.endsWith('\n"users"."id" -> "blog_posts"."user_id" -> "users"."id"'));

      });

    });

  });

};
