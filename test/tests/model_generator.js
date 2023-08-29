module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;
  const fs = require('fs');
  const path = require('path');

  const Instant = Instantiator();
  // Instant.enableLogs(2);

  describe('InstantORM.Core.ModelGenerator', async () => {

    before(async () => {
      await Instant.connect(Databases['main']);
      Instant.Generator.destroyModels();
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

    it('should do a thing', async () => {

      Instant.Generator.extend('my_model');
      expect(true).to.exist;

    });

  });

};
