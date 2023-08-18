module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;

  const Instant = Instantiator();
  // Instant.enableLogs(2);

  describe('Instant', async () => {

    const migrationId = 1; // Will set this in tests

    const schema = {
      migration_id: null,
      indices: [
        {table: 'parents', column: 'shirt', type: 'btree'}
      ],
      models: {
        Parent: {
          table: 'parents',
          columns: [
            {name: 'id', type: 'serial'},
            {name: 'name', type: 'string', properties: {nullable: false, unique: true}},
            {name: 'shirt', type: 'string'},
            {name: 'hidden', type: 'string'},
            {name: 'pantaloons', type: 'string'},
            {name: 'created_at', type: 'datetime'},
            {name: 'updated_at', type: 'datetime'}
          ]
        },
        Child: {
          table: 'children',
          columns: [
            {name: 'id', type: 'serial'},
            {name: 'parent_id', type: 'int'},
            {name: 'name', type: 'string'},
            {name: 'age', type: 'int'},
            {name: 'is_favorite', type: 'boolean'},
            {name: 'license', type: 'string'},
            {name: 'created_at', type: 'datetime'},
            {name: 'updated_at', type: 'datetime'}
          ]
        }
      }
    };

    before(async () => {
      Instant.disconnect();
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      Instant.Migrator.Dangerous.filesystem.clear();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    after(async () => {
      Instant.disconnect();
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    it('should load a schema via #connect', async () => {

      await Instant.connect(Databases['main'], schema);
      expect(Instant.Schema).to.exist;

    });

    it('should load a schema via #loadSchema', async () => {

      Instant.disconnect();
      await Instant.connect(Databases['main'], null);
      await Instant.loadSchema(schema);

      expect(Instant.Schema).to.exist;

    });

    it('should have the correct models', async () => {

      const Parent = Instant.Model('Parent');
      expect(Parent.table()).to.equal('parents');
      expect(Parent.name).to.equal('Parent');
      expect(Parent.getName()).to.equal('Parent');
      expect(Parent.columnNames()).to.deep.equal([
        'id',
        'name',
        'shirt',
        'hidden',
        'pantaloons',
        'created_at',
        'updated_at'
      ]);

      const Child = Instant.Model('Child');
      expect(Child.table()).to.equal('children');
      expect(Child.name).to.equal('Child');
      expect(Child.getName()).to.equal('Child');
      expect(Child.columnNames()).to.deep.equal([
        'id',
        'parent_id',
        'name',
        'age',
        'is_favorite',
        'license',
        'created_at',
        'updated_at',
      ]);

    });

    describe('InstantORM.Core.DB.Migrator (bootstrap)', async () => {

      it('should fail to access Dangerous mode before being enabled', async () => {

        try {
          await Instant.Migrator.Dangerous.annihilate();
        } catch (e) {
          expect(e).to.exist;
          expect(e.message).to.contain('Dangerous mode disabled');
          expect(e.message).to.contain('you sure');
        }

      });

      it('should annihilate the database', async () => {

        Instant.Migrator.enableDangerous();
        await Instant.Migrator.Dangerous.annihilate();

        try {
          let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.migrationsTable}"`, []);
        } catch (e) {
          expect(e).to.exist;
        }

      });

      it('should prepare the database for migrations', async () => {

        await Instant.Migrator.Dangerous.prepare();
        let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.migrationsTable}"`, []);
        expect(result.rows.length).to.equal(0);

      });

      it('should successfully initialize with migration_id = null in schema', async () => {

        await Instant.Migrator.Dangerous.initialize();
        let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.migrationsTable}"`, []);

        expect(result.rows.length).to.equal(1);

      });

      it('should successfully save the current schema with migration_id set', async () => {

        Instant.Schema.setMigrationId(migrationId);
        Instant.Migrator.Dangerous.filesystem.clear();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();
        let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.migrationsTable}"`, []);

        expect(result.rows.length).to.equal(1);

        let row = result.rows[0];

        expect(row.id).to.equal(migrationId + 1);
        expect(row.schema).to.deep.equal(Instant.Schema.schema);

      });

      it('should fail to save the current schema if there is already a local directory', async () => {

        let error;

        try {
          await Instant.Migrator.Dangerous.initialize();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('prepare directory');

      });

      it('should fail to save the current schema if it already exists', async () => {

        Instant.Migrator.Dangerous.filesystem.clear();

        let error;

        try {
          await Instant.Migrator.Dangerous.initialize();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('non-empty migration');

      });

      it('should prepare the database for migrations again', async () => {

        Instant.Migrator.Dangerous.filesystem.clear();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.migrationsTable}"`, []);
        expect(result.rows.length).to.equal(0);

      });

      it('should fail to find models before db initialized', async () => {

        const modelNames = Instant.Schema.listModelNames();

        let error;

        for (let i = 0; i < modelNames.length; i++) {
          let name = modelNames[i];
          let model = Instant.Model(name);
          try {
            let result = await Instant.database().query(`SELECT * FROM "${model.table()}"`, []);
          } catch (e) {
            error = e;
            break;
          }
        }

        expect(error).to.exist;

      });

      it('should successfully initialize again', async () => {

        Instant.Schema.setMigrationId(migrationId);
        await Instant.Migrator.Dangerous.initialize();
        let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.migrationsTable}"`, []);

        expect(result.rows.length).to.equal(1);

        let row = result.rows[0];

        expect(row.id).to.equal(migrationId + 1);
        expect(row.schema).to.deep.equal(Instant.Schema.schema);

      });

      it('should fail to initialize again', async () => {

        let error;

        try {
          await Instant.Migrator.Dangerous.initialize();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('prepare directory');

      });

      it('should succeed at finding models after db initialized', async () => {

        const modelNames = Instant.Schema.listModelNames();

        for (let i = 0; i < modelNames.length; i++) {
          let name = modelNames[i];
          let model = Instant.Model(name);
          let result = await Instant.database().query(`SELECT * FROM "${model.table()}"`, []);
          expect(result).to.exist;
        }

      });

      // it('should fail to reconstitute database if schema mismatch', async () => {
      //
      //   const originalTable = Instant.Schema.schema.models['Child'].table;
      //   Instant.Schema.schema.models['Child'].table = 'fake_table';
      //
      //   try {
      //     let results = await Instant.Migrator.Dangerous.reconstitute();
      //   } catch (e) {
      //     expect(e).to.exist;
      //     expect(e.message).to.contain('schema mismatch');
      //   }
      //
      //   Instant.Schema.schema.models['Child'].table = originalTable;
      //
      // });

      it('should bootstrap database from schema', async () => {

        Instant.Migrator.Dangerous.filesystem.clear();
        let results = await Instant.Migrator.Dangerous.bootstrap();
        const modelNames = Instant.Schema.listModelNames();

        for (let i = 0; i < modelNames.length; i++) {
          let name = modelNames[i];
          let model = Instant.Model(name);
          let result = await Instant.database().query(`SELECT * FROM "${model.table()}"`, []);
          expect(result.rows.length).to.equal(0);
        }

      });

      it('should now be able to create a model', async () => {

        const Parent = Instant.Model('Parent');
        const parent = await Parent.create({name: 'Keith'});

        expect(parent).to.exist;
        expect(parent.get('name')).to.equal('Keith');
        expect(parent.get('id')).to.equal(1);

        const parents = await Parent.query().end();

        expect(parents).to.exist;
        expect(parents.length).to.equal(1);
        expect(parents[0].get('name')).to.equal('Keith');
        expect(parents[0].get('id')).to.equal(1);

      });

      it('should bootstrap again and create a model', async () => {

        Instant.Migrator.Dangerous.filesystem.clear();
        await Instant.Migrator.Dangerous.bootstrap();
        const Parent = Instant.Model('Parent');
        const parent = await Parent.create({name: 'Keith'});

        expect(parent).to.exist;
        expect(parent.get('name')).to.equal('Keith');
        expect(parent.get('id')).to.equal(1);

        const parents = await Parent.query().end();

        expect(parents).to.exist;
        expect(parents.length).to.equal(1);
        expect(parents[0].get('name')).to.equal('Keith');
        expect(parents[0].get('id')).to.equal(1);

      });

      it('should bootstrap from a seed', async () => {

        const seed = {
          Parent: [
            {name: 'Hurley'},
            {name: 'Boone'}
          ],
          Child: [
            {name: 'Locke', parent_id: 2},
            {name: 'Sayid', parent_id: 1}
          ]
        };

        Instant.Migrator.Dangerous.filesystem.clear();
        await Instant.Migrator.Dangerous.bootstrap(seed);
        const Parent = Instant.Model('Parent');
        const Child = Instant.Model('Child');

        const parents = await Parent.query().end();
        const children = await Child.query().end();

        expect(parents).to.exist;
        expect(parents.length).to.equal(2);
        expect(parents[0].get('name')).to.equal('Hurley');
        expect(parents[0].get('id')).to.equal(1);
        expect(parents[1].get('name')).to.equal('Boone');
        expect(parents[1].get('id')).to.equal(2);
        expect(children).to.exist;
        expect(children.length).to.equal(2);
        expect(children[0].get('name')).to.equal('Locke');
        expect(children[0].get('id')).to.equal(1);
        expect(children[0].get('parent_id')).to.equal(2);
        expect(children[1].get('name')).to.equal('Sayid');
        expect(children[1].get('id')).to.equal(2);
        expect(children[1].get('parent_id')).to.equal(1);

      });

    });

    describe('InstantORM.Core.DB.Schema', async () => {

      after(async () => {
        Instant.Migrator.disableDangerous();
      });

      it('should fetch current schema', async () => {

        let schema = await Instant.Migrator.getLatestSchema();

        expect(schema.models['Parent']).to.exist;
        expect(schema.models['Child']).to.exist;
        expect(schema).to.deep.equal(Instant.Schema.schema);

      });

      it('should introspect the current database correctly', async () => {

        let schema = await Instant.Migrator.getIntrospectSchema();
        schema.migration_id = 5;  // originalSchema has id = 5, db = null

        expect(schema).to.deep.equal(Instant.Schema.schema);

      });

      it('should reload schema from migrations table', async () => {

        let originalSchema = await Instant.Schema.schema;

        Instant.disconnect();
        await Instant.connect(Databases['main']);
        let schema = await Instant.Schema.schema;

        expect(schema).to.deep.equal(originalSchema);

      });

      it('should clear migrations and load from introspected schema', async () => {

        let originalSchema = await Instant.Schema.schema;

        Instant.Migrator.enableDangerous();
        await Instant.Migrator.Dangerous.filesystem.clear();

        Instant.disconnect();
        await Instant.connect(Databases['main']);
        let schema = await Instant.Schema.schema;
        schema.migration_id = 5; // originalSchema has id = 5, db = null

        expect(schema).to.deep.equal(originalSchema);

      });

      it('should drop migrations and load from introspected schema', async () => {

        let originalSchema = await Instant.Schema.schema;

        Instant.Migrator.enableDangerous();
        await Instant.Migrator.Dangerous.drop();

        Instant.disconnect();
        await Instant.connect(Databases['main']);
        let schema = await Instant.Schema.schema;
        schema.migration_id = 5; // originalSchema has id = 5, db = null

        expect(schema).to.deep.equal(originalSchema);

      });

    });

  });

};
