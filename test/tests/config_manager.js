module.exports = (InstantORM, Databases) => {

  const expect = require('chai').expect;

  const Instant = new InstantORM();
  // Instant.enableLogs(4);

  describe('InstantORM.Core.DB.ConfigManager', async () => {

    const ConfigManager = Instant.constructor.Core.DB.ConfigManager;

    before(async () => {
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      await Instant.disconnect();
      Instant.Config.destroy();
    });

    after(async () => {
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      await Instant.disconnect();
      Instant.Config.destroy();
    });

    describe('Validation', async () => {

      it('fails validation on empty config', async () => {

        let cfg = null;
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('empty');

      });

      it('fails validation on connectionString + other key', async () => {

        let cfg = {
          connectionString: 'hello',
          second_key: false
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('other keys');

      });

      it('fails validation on connectionString = non-string', async () => {

        let cfg = {
          connectionString: true
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('non-empty string');

      });

      it('fails validation on connectionString = empty string', async () => {

        let cfg = {
          connectionString: ''
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('non-empty string');

      });

      it('fails validation on invalid key', async () => {

        let cfg = {
          invalid_key: ''
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('Invalid key "invalid_key"');

      });

      it('fails validation on missing keys', async () => {

        let cfg = {};
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"host"');
        expect(error.message).to.contain('non-empty string');

      });

      it('fails validation on port < 1', async () => {

        let cfg = {
          host: 'a',
          port: -2,
          user: 'b',
          password: 'c',
          database: 'd'
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"port"');
        expect(error.message).to.contain('1 - 65535');

      });

      it('fails validation on port > 65535', async () => {

        let cfg = {
          host: 'a',
          port: 65536,
          user: 'b',
          password: 'c',
          database: 'd'
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"port"');
        expect(error.message).to.contain('1 - 65535');

      });

      it('fails validation on port is float', async () => {

        let cfg = {
          host: 'a',
          port: 20.7,
          user: 'b',
          password: 'c',
          database: 'd'
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"port"');
        expect(error.message).to.contain('1 - 65535');

      });

      it('fails validation on port is string', async () => {

        let cfg = {
          host: 'a',
          port: 'abcdef',
          user: 'b',
          password: 'c',
          database: 'd'
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"port"');
        expect(error.message).to.contain('1 - 65535');

      });

      it('fails validation on password non-string', async () => {

        let cfg = {
          host: 'a',
          port: '5432',
          user: 'b',
          password: true,
          database: 'd'
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"password"');
        expect(error.message).to.contain('must be a string');

      });

      it('fails validation on ssl <> true, false, "unauthorized"', async () => {

        let cfg = {
          host: 'a',
          port: '5432',
          user: 'b',
          password: 'c',
          database: 'd',
          ssl: 27
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"ssl"');
        expect(error.message).to.contain('true, false or "unauthorized"');

      });

      it('succeeds at basic validation', async () => {

        let cfg = {
          host: 'a',
          port: '5432',
          user: 'b',
          password: 'c',
          database: 'd'
        };

        let newCfg = ConfigManager.validate(cfg);

        expect(newCfg).to.exist;
        expect(newCfg).to.not.equal(cfg);
        expect(newCfg.host).to.equal(cfg.host);
        expect(newCfg.port).to.equal(parseInt(cfg.port));
        expect(newCfg.user).to.equal(cfg.user);
        expect(newCfg.password).to.equal(cfg.password);
        expect(newCfg.database).to.equal(cfg.database);
        expect(newCfg.ssl).to.equal(false);

      });

      it('succeeds at basic validation with numeric port', async () => {

        let cfg = {
          host: 'a',
          port: 5432,
          user: 'b',
          password: 'c',
          database: 'd'
        };

        let newCfg = ConfigManager.validate(cfg);

        expect(newCfg).to.exist;
        expect(newCfg).to.not.equal(cfg);
        expect(newCfg.host).to.equal(cfg.host);
        expect(newCfg.port).to.equal(cfg.port);
        expect(newCfg.user).to.equal(cfg.user);
        expect(newCfg.password).to.equal(cfg.password);
        expect(newCfg.database).to.equal(cfg.database);
        expect(newCfg.ssl).to.equal(false);

      });

      it('succeeds at basic validation with ssl "unauthorized"', async () => {

        let cfg = {
          host: 'a',
          port: 5432,
          user: 'b',
          password: 'c',
          database: 'd',
          ssl: 'unauthorized'
        };

        let newCfg = ConfigManager.validate(cfg);

        expect(newCfg).to.exist;
        expect(newCfg).to.not.equal(cfg);
        expect(newCfg.host).to.equal(cfg.host);
        expect(newCfg.port).to.equal(cfg.port);
        expect(newCfg.user).to.equal(cfg.user);
        expect(newCfg.password).to.equal(cfg.password);
        expect(newCfg.database).to.equal(cfg.database);
        expect(newCfg.ssl).to.deep.equal('unauthorized');

      });

      it('succeeds at basic validation with ssl {"rejectUnauthorized": false}', async () => {

        let cfg = {
          host: 'a',
          port: 5432,
          user: 'b',
          password: 'c',
          database: 'd',
          ssl: {rejectUnauthorized: false}
        };

        let newCfg = ConfigManager.validate(cfg);

        expect(newCfg).to.exist;
        expect(newCfg).to.not.equal(cfg);
        expect(newCfg.host).to.equal(cfg.host);
        expect(newCfg.port).to.equal(cfg.port);
        expect(newCfg.user).to.equal(cfg.user);
        expect(newCfg.password).to.equal(cfg.password);
        expect(newCfg.database).to.equal(cfg.database);
        expect(newCfg.ssl).to.deep.equal({rejectUnauthorized: false});

      });

      it('fails at basic validation with ssl {"rejectUnauthorized": true}', async () => {

        let cfg = {
          host: 'a',
          port: 5432,
          user: 'b',
          password: 'c',
          database: 'd',
          ssl: {rejectUnauthorized: true}
        };
        let error;
        try {
          ConfigManager.validate(cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('"ssl"');
        expect(error.message).to.contain('true, false or "unauthorized"');

      });

    });

    describe('read / write', async () => {

      it('should fail to write invalid config', async () => {

        let cfg = {};
        let error;
        try {
          Instant.Config.write('development', 'main', cfg);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('["development"]["main"]');
        expect(Instant.Config.exists()).to.equal(false);

      });

      it('should succeed at writing valid config', async () => {

        let cfg = {
          host: 'a',
          port: 5432,
          user: 'b',
          password: 'c',
          database: 'd',
          ssl: 'unauthorized'
        };

        Instant.Config.write('development', 'main', cfg);
        let written = Instant.Config.load();

        expect(Instant.Config.exists()).to.equal(true);
        expect(written['development']['main']).to.deep.equal(cfg);
        expect(Object.keys(written).length).to.equal(1);
        expect(Object.keys(written['development']).length).to.equal(1);

      });

      it('should succeed at writing valid config with environment variables', async () => {

        let cfg = {
          host: '{{ DATABASE_HOST }}',
          port: 5432,
          user: 'b',
          password: 'c',
          database: 'd',
          ssl: 'unauthorized'
        };

        Instant.Config.write('development', 'main', cfg);

      });

      it('should fail at reading config with missing environment variable', async () => {

        let error;

        try {
          Instant.Config.read('development', 'main');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('["development"]["main"]["host"]: No environment variable matching "DATABASE_HOST" found');
        
      });

      it('should succeed at reading config with environment variable set properly', async () => {

        process.env.DATABASE_HOST = 'my-db-host.com';

        let error;
        let cfg;

        try {
          cfg = Instant.Config.read('development', 'main');
        } catch (e) {
          error = e;
        }

        expect(cfg.host).to.equal(process.env.DATABASE_HOST);

      });

      it('should succeed at reading config with environment variables sent in to read function', async () => {

        const envVars = {DATABASE_HOST: 'my-db-247.com'};

        let error;
        let cfg;

        try {
          cfg = Instant.Config.read('development', 'main', envVars);
        } catch (e) {
          error = e;
        }

        expect(cfg.host).to.equal(envVars.DATABASE_HOST);

      });

      it('should succeed at writing valid config with environment variables in port', async () => {

        let cfg = {
          host: '{{ DATABASE_HOST }}',
          port: '{{ DATABASE_PORT }}',
          user: 'b',
          password: 'c',
          database: 'd',
          ssl: 'unauthorized'
        };

        Instant.Config.write('development', 'main', cfg);

      });


      it('should destroy config', async () => {

        Instant.Config.destroy();

        expect(Instant.Config.exists()).to.equal(false);

      });

    });

  });

};
