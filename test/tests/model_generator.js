module.exports = (InstantORM, Databases) => {

  const expect = require('chai').expect;
  const fs = require('fs');
  const path = require('path');

  const Instant = new InstantORM();
  // Instant.enableLogs(2);

  describe('InstantORM.Core.ModelGenerator', async () => {

    before(async () => {
      await Instant.connect(Databases['main']);
      Instant.Generator.destroyModels();
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
    });

    after(async () => {
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      await Instant.disconnect();
    });

    it('should extend my model', async () => {

      Instant.Generator.extend('my_model');
      const file = fs.readFileSync('./_instant/models/my_model.mjs');
      expect(file).to.exist;

    });

  });

};
