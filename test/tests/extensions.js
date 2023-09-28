module.exports = (InstantORM, Databases) => {

  const expect = require('chai').expect;

  const Instant = new InstantORM();
  Instant.enableLogs(2);

  describe('InstantORM.Core.RelationshipGraph', async () => {

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

    it('Should disable "vector" extension', async () => {

      const extension = await Instant.Migrator.Dangerous.disableExtension('vector');

      expect(extension).to.exist;
      expect(extension.name).to.equal('vector');
      expect(extension.installed_version).to.equal(null);
     
    });

  });

};
