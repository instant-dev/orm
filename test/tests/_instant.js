module.exports = (InstantORM, Databases) => {

  const expect = require('chai').expect;

  const Instant = new InstantORM();
  // Instant.enableLogs(2);

  describe('Instant', async () => {

    const migrationId = 1; // Will set this in tests

    const schema = {
      migration_id: null,
      foreign_keys: [],
      indices: [
        {table: 'parents', column: 'shirt', type: 'btree'}
      ],
      tables: {
        parents: {
          name: 'parents',
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
        children: {
          name: 'children',
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
      await Instant.connect(Databases['main'], null);
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

    describe('InstantORM.Core.DB.MigrationManager (bootstrap)', async () => {

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
          let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.constructor.migrationsTable}"`, []);
        } catch (e) {
          expect(e).to.exist;
        }

      });

      it('should prepare the database for migrations', async () => {

        await Instant.Migrator.Dangerous.prepare();
        let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.constructor.migrationsTable}"`, []);
        expect(result.rows.length).to.equal(0);

      });

      it('should successfully initialize with migration_id = null in schema', async () => {

        await Instant.Migrator.Dangerous.initialize();
        let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.constructor.migrationsTable}"`, []);

        expect(result.rows.length).to.equal(1);

      });

      it('should successfully save the current schema with migration_id set', async () => {

        await Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();
        let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.constructor.migrationsTable}"`, []);

        expect(result.rows.length).to.equal(1);

        let row = result.rows[0];

        expect(row.id).to.equal(1);
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
        expect(error.message).to.contain('Could not initialize');

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

        await Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.constructor.migrationsTable}"`, []);
        expect(result.rows.length).to.equal(0);

      });

      it('should fail to find models before db initialized', async () => {

        await Instant.Schema.setSchema(schema);
        const modelNames = Instant.Schema.listTableNames();

        expect(modelNames.length).to.be.greaterThan(0);

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

        await Instant.Migrator.Dangerous.initialize(Instant.Schema.toJSON());
        let result = await Instant.database().query(`SELECT * FROM "${Instant.Schema.constructor.migrationsTable}"`, []);

        expect(result.rows.length).to.equal(1);

        let row = result.rows[0];

        expect(row.id).to.equal(1);
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
        expect(error.message).to.contain('Could not initialize');

      });

      it('should succeed at finding models after db initialized', async () => {

        const modelNames = Instant.Schema.listTableNames();

        expect(modelNames.length).to.be.greaterThan(0);

        for (let i = 0; i < modelNames.length; i++) {
          let name = modelNames[i];
          let model = Instant.Model(name);
          let result = await Instant.database().query(`SELECT * FROM "${model.table()}"`, []);
          expect(result).to.exist;
        }

      });

      it('should bootstrap database from schema', async () => {

        let results = await Instant.Migrator.Dangerous.bootstrap();
        const modelNames = Instant.Schema.listTableNames();

        expect(modelNames.length).to.be.greaterThan(0);

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

        const parents = await Parent.query().select();

        expect(parents).to.exist;
        expect(parents.length).to.equal(1);
        expect(parents[0].get('name')).to.equal('Keith');
        expect(parents[0].get('id')).to.equal(1);

      });

      it('should bootstrap again and create a model', async () => {

        await Instant.Migrator.Dangerous.bootstrap();
        const Parent = Instant.Model('Parent');
        const parent = await Parent.create({name: 'Keith'});

        expect(parent).to.exist;
        expect(parent.get('name')).to.equal('Keith');
        expect(parent.get('id')).to.equal(1);

        const parents = await Parent.query().select();

        expect(parents).to.exist;
        expect(parents.length).to.equal(1);
        expect(parents[0].get('name')).to.equal('Keith');
        expect(parents[0].get('id')).to.equal(1);

      });

      it('should bootstrap from a seed', async () => {

        const seed = {
          parents: [
            {name: 'Hurley'},
            {name: 'Boone'}
          ],
          children: [
            {name: 'Locke', parent_id: 2},
            {name: 'Sayid', parent_id: 1}
          ]
        };

        await Instant.Migrator.Dangerous.bootstrap(seed);
        const Parent = Instant.Model('Parent');
        const Child = Instant.Model('Child');

        const parents = await Parent.query().select();
        const children = await Child.query().select();

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

        expect(schema.tables['parents']).to.exist;
        expect(schema.tables['children']).to.exist;
        expect(schema).to.deep.equal(Instant.Schema.schema);

      });

      it('should introspect the current database correctly', async () => {

        let schema = await Instant.Migrator.getIntrospectSchema();

        // introspected schema always returns null
        schema.migration_id = 1;

        expect(schema).to.deep.equal(Instant.Schema.toJSON());

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

        expect(schema).to.deep.equal(originalSchema);

      });

      it('should drop migrations and load from introspected schema', async () => {

        let originalSchema = await Instant.Schema.toJSON();

        Instant.Migrator.enableDangerous();
        await Instant.Migrator.Dangerous.drop();

        Instant.disconnect();
        await Instant.connect(Databases['main']);
        let schema = await Instant.Schema.toJSON();
        schema.migration_id = 1;

        expect(schema).to.deep.equal(originalSchema);

      });

    });

  });

};
