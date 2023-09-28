module.exports = (InstantORM, Databases) => {

  const expect = require('chai').expect;

  const Instant = new InstantORM();
  // Instant.enableLogs(4);

  describe('InstantORM.Core.DB.Database Extensions', async () => {

    before(async () => {
      Instant.disconnect();
      await Instant.connect(Databases['main'], null);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.disableExtension('vector');
      Instant.Migrator.Dangerous.filesystem.clear();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    after(async () => {
      Instant.disconnect();
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.disableExtension('vector');
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    it('Should find available extensions', async () => {

      await Instant.connect(Databases['main'], null);
      Instant.Migrator.enableDangerous();
      const extensions = await Instant.Migrator.Dangerous.listExtensions();

      expect(extensions).to.exist;
      expect(extensions).to.be.an('array');
     
    });

    it('Should find "vector" extension disabled', async () => {

      const extension = await Instant.Migrator.Dangerous.getExtension('vector');

      expect(extension).to.exist;
      expect(extension.name).to.equal('vector');
      expect(extension.installed_version).to.equal(null);
     
    });

    it('Should enable "vector" extension', async () => {

      const extension = await Instant.Migrator.Dangerous.enableExtension('vector');

      expect(extension).to.exist;
      expect(extension.name).to.equal('vector');
      expect(extension.installed_version).to.not.equal(null);
      expect(extension.installed_version).to.equal(extension.default_version);
     
    });

    it('Should find "vector" extension', async () => {

      const extension = await Instant.Migrator.Dangerous.getExtension('vector');

      expect(extension).to.exist;
      expect(extension.name).to.equal('vector');
      expect(extension.installed_version).to.not.equal(null);
      expect(extension.installed_version).to.equal(extension.default_version);
     
    });

    it('Should create a table with a vector embedding', async () => {
      
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.prepare();
      await Instant.Migrator.Dangerous.initialize();
      const migration = await Instant.Migrator.create(null, 'my_first_migration');

      await migration.createTable(
        'blog_comments',
        [
          {name: 'embedding', type: 'vector', properties: {length: 3}}
        ]
      );

      await Instant.Migrator.Dangerous.commit(migration);

      expect(migration.toJSON().name).to.equal('my_first_migration');

      expect(Instant.Model('BlogComment')).to.exist;
      expect(Instant.Model('BlogComment').columnNames()).to.deep.equal(['id', 'embedding', 'created_at', 'updated_at']);
      expect(Instant.Model('BlogComment').columnLookup()['embedding'].type).to.equal('vector');
      expect(Instant.Model('BlogComment').columnLookup()['embedding'].properties.length).to.equal(3);

    });

    it('Should fail to disable "vector" extension when there are dependencies', async () => {

      let extension;
      let error;
      
      try {
        extension = await Instant.Migrator.Dangerous.disableExtension('vector');
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.contain('cannot drop extension vector because other objects depend on it');
     
    });

    it('Should disable "vector" extension once table dropped', async () => {

      await Instant.database().query(`DROP TABLE blog_comments`, []);

      const extension = await Instant.Migrator.Dangerous.disableExtension('vector');

      expect(extension).to.exist;
      expect(extension.name).to.equal('vector');
      expect(extension.installed_version).to.equal(null);
     
    });

  });

};
