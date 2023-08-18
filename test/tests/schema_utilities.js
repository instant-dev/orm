module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;
  const fs = require('fs');
  const path = require('path');

  const Instant = Instantiator();
  // Instant.enableLogs(2);

  describe('InstantORM.Core.DB.SchemaUtilities', async () => {

    before(async () => {
      await Instant.connect(Databases['main']);
      Instant.Schema.utilities.clearModels();
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

      Instant.Schema.utilities.writeModel('my_model');
      expect(true).to.exist;

    });

  });

};
