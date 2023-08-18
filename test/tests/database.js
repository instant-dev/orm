module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;

  const Instant = Instantiator();

  describe('InstantORM.Core.DB.Database', async () => {

    let db;

    let myTable = {
      table: 'test_objects',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'test', type: 'string'},
        {name: 'created_at', type: 'datetime'},
        {name: 'reference_id', type: 'int'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let myReferenceTable = {
      table: 'reference',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'test', type: 'string'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };


    let myTableWithJson = {
      table: 'json_reference',
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
            db.adapter.generateCreateTableQuery(myTable.table, myTable.columns),
            db.adapter.generateCreateTableQuery(myReferenceTable.table, myReferenceTable.columns),
            db.adapter.generateCreateTableQuery(myTableWithJson.table, myTableWithJson.columns)
          ].join(';')
        );

      });

      it('should be able to add a foreign key constraint', async () => {

        await db.query(
          db.adapter.generateSimpleForeignKeyQuery(myTable.table, myReferenceTable.table),
          []
        );

      });

      it('should not be able to drop a table that has a constraint', async () => {

        let e = null;

        try {
          await db.query(
            db.adapter.generateDropTableQuery(myReferenceTable.table),
            []
          );
        } catch (err) {
          e = err;
        }

        expect(e).to.exist;

      });

      it('should be able to drop a foreign key constraint', async () => {

        await db.query(
          db.adapter.generateDropSimpleForeignKeyQuery(myTable.table, myReferenceTable.table),
          []
        );

      });


      it('should be able to drop tables', async () => {

        await db.transact(
          [
            db.adapter.generateDropTableQuery(myTable.table),
            db.adapter.generateDropTableQuery(myReferenceTable.table),
            db.adapter.generateDropTableQuery(myTableWithJson.table)
          ].join(';')
        );

      });

    });

  });

};
