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

      it('should create serial fields without extra params (defaults included)', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('blog_posts', [{name: 'title', type: 'string'}]);
        migrationA;
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
