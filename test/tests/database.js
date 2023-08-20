module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;

  const Instant = Instantiator();

  describe('InstantORM.Core.DB.Database', async () => {

    let db;

    let myTable = {
      name: 'test_objects',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'test', type: 'string'},
        {name: 'created_at', type: 'datetime'},
        {name: 'reference_id', type: 'int'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let myReferenceTable = {
      name: 'reference',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'test', type: 'string'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };


    let myTableWithJson = {
      name: 'json_reference',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'test', type: 'string'},
        {name: 'content', type: 'json'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    before(async () => {

      db = new Instantiator.InstantORM.Core.DB.Database();

    });


    after(async () => {
      db.close();
      Instant.disconnect();
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    describe('#connect', async () => {

      it('should connect to my.Config database "main"', async () => {

        expect(db.connect(Databases['main'])).to.equal(true);

      });

    });

    describe('#query', async () => {

      it('should throw an error if no params given', async () => {

        let e = null;

        try {
          await db.query();
        } catch (err) {
          e = err;
        }

        expect(e).to.not.equal(null);

      });

      it('should throw an error if params not an array', async () => {

        let e = null;

        try {
          await db.query('SELECT 1', true);
        } catch (err) {
          e = err;
        }

        expect(e).to.not.equal(null);

      });

      it('should run a basic SELECT query', async () => {

        let result = await db.query('SELECT 1 AS __num__', []);

        expect(result.rows[0].__num__).to.equal(1);

      });

    });

    describe('#adapter', async () => {

      it('should be able to create a table', async () => {

        await db.transact(
          [
            db.adapter.generateCreateTableQuery(myTable.name, myTable.columns),
            db.adapter.generateCreateTableQuery(myReferenceTable.name, myReferenceTable.columns),
            db.adapter.generateCreateTableQuery(myTableWithJson.name, myTableWithJson.columns)
          ].join(';')
        );

      });

      it('should be able to add a foreign key constraint', async () => {

        await db.query(
          db.adapter.generateForeignKeyQuery(myTable.name, myTable.columns[0].name, myReferenceTable.name, myReferenceTable.columns[0].name),
          []
        );

      });

      it('should not be able to drop a table that has a constraint', async () => {

        let e = null;

        try {
          await db.query(
            db.adapter.generateDropTableQuery(myReferenceTable.name),
            []
          );
        } catch (err) {
          e = err;
        }

        expect(e).to.exist;

      });

      it('should be able to drop a foreign key constraint', async () => {

        await db.query(
          db.adapter.generateDropForeignKeyQuery(myTable.name, myTable.columns[0].name, myReferenceTable.name, myReferenceTable.columns[0].name),
          []
        );

      });


      it('should be able to drop tables', async () => {

        await db.transact(
          [
            db.adapter.generateDropTableQuery(myTable.name),
            db.adapter.generateDropTableQuery(myReferenceTable.name),
            db.adapter.generateDropTableQuery(myTableWithJson.name)
          ].join(';')
        );

      });

    });

  });

};
