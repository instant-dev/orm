module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;

  const Instant = Instantiator();

  describe('InstantORM.Core.DB.Composer', async () => {

    let mainDb;
    let readonlyDb;

    let originalParentNames = [
      'Albert',
      'Derek',
      'Dingleberry',
      'James',
      'Joe',
      'Sally',
      'Samantha',
      'Samuel',
      'Suzy',
      'Zoolander'
    ];

    let schemaParent = {
      name: 'parents',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'name', type: 'string'},
        {name: 'shirt', type: 'string'},
        {name: 'hidden', type: 'string'},
        {name: 'pantaloons', type: 'string'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let schemaCareer = {
      name: 'careers',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'parent_id', type: 'int'},
        {name: 'title', type: 'string'},
        {name: 'is_active', type: 'boolean'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let schemaFriendship = {
      name: 'friendships',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'from_parent_id', type: 'int'},
        {name: 'to_parent_id', type: 'int'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let schemaChild = {
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
    };

    let schemaPartner = {
      name: 'partners',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'parent_id', type: 'int'},
        {name: 'name', type: 'string'},
        {name: 'job', type: 'string'},
        {name: 'full_time', type: 'boolean'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let schemaPet = {
      name: 'pets',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'parent_id', type: 'int'},
        {name: 'name', type: 'string'},
        {name: 'animal', type: 'string'},
        {name: 'added_at', type: 'datetime'},
        {name: 'is_alive', type: 'boolean'},
        {name: 'details', type: 'json'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    class Parent extends Instantiator.InstantORM.Core.Model {}

    Parent.setDatabase(mainDb);
    Parent.setSchema(schemaParent);
    Parent.hides('hidden');

    class Career extends Instantiator.InstantORM.Core.Model {};

    Career.setDatabase(mainDb);
    Career.setSchema(schemaCareer);
    Career.joinsTo(Parent, {multiple: true});

    class Friendship extends Instantiator.InstantORM.Core.Model {}

    Friendship.setDatabase(mainDb);
    Friendship.setSchema(schemaFriendship);
    Friendship.joinsTo(Parent, {name: 'fromParent', as: 'outgoingFriendships', multiple: true});
    Friendship.joinsTo(Parent, {name: 'toParent', as: 'incomingFriendships', multiple: true});

    class Child extends Instantiator.InstantORM.Core.Model {}

    Child.setDatabase(mainDb);
    Child.setSchema(schemaChild);
    Child.joinsTo(Parent, {multiple: true});

    class Partner extends Instantiator.InstantORM.Core.Model {}

    Partner.setDatabase(mainDb);
    Partner.setSchema(schemaPartner);
    Partner.joinsTo(Parent);

    class Pet extends Instantiator.InstantORM.Core.Model {}

    Pet.setDatabase(mainDb);
    Pet.setSchema(schemaPet);
    Pet.joinsTo(Parent, {multiple: true});

    before(async () => {

      mainDb = await Instant.connect(Databases['main'], null);
      readonlyDb = Instant.addDatabase('readonly', Databases['readonly']);

      let dbs = [
        Instant.database(),
        Instant.database('readonly')
      ];

      for (let i = 0; i < dbs.length; i++) {
        let db = dbs[i];
        // db.enableLogs(true);

        Parent.setDatabase(db);
        Career.setDatabase(db);
        Friendship.setDatabase(db);
        Child.setDatabase(db);
        Partner.setDatabase(db);
        Pet.setDatabase(db);

        await db.transact(
          [
            schemaParent,
            schemaCareer,
            schemaFriendship,
            schemaChild,
            schemaPartner,
            schemaPet
          ].map(schema => {
            return [
              db.adapter.generateDropTableQuery(schema.name, true),
              db.adapter.generateCreateTableQuery(schema.name, schema.columns)
            ].join(';');
          }).join(';')
        )

        let parents = originalParentNames.map((name, i) => new Parent({
          name: name,
          shirt: ['red', 'green', 'blue'][i % 3],
          pantaloons: ['jeans', 'shorts'][i % 2],
          hidden: 'abcdef'.split('')[i % 6]
        }));

        parents = Instantiator.InstantORM.Core.ModelArray.from(parents);

        parents.forEach((p, i) => {

          let id = i + 1;

          let careers = ['Freelancer', 'Poet'].map((title, n) => {
            return new Career({parent_id: id, title: title, is_active: true});
          });

          p.setJoined('careers', Instantiator.InstantORM.Core.ModelArray.from(careers));

          let children = 'ABCDEFGHIJ'.split('').map((name, n) => {
            var ageOffset = (n >= 5) ? 16 : 0;
            return new Child({
              parent_id: id,
              name: `Child${name}`,
              age: ageOffset + ((Math.random() * 30) | 0),
              is_favorite: !!(n % 2),
              license: !!ageOffset ? 'DL_APPROVED' : null
            });
          });

          p.setJoined('children', Instantiator.InstantORM.Core.ModelArray.from(children));

          let pets = ['Oliver', 'Ruby', 'Pascal'].map((name, i) => {
            return new Pet({
              parent_id: id,
              name: name,
              animal: ['Cat', 'Dog', 'Cat'][i],
              added_at: new Date(`2020-0${i + 1}-0${i + 1}T00:00:13.370Z`),
              is_alive: true,
              details: { language: name === 'Pascal' }
            });
          });

          p.setJoined('pets', Instantiator.InstantORM.Core.ModelArray.from(pets));

          let partner = new Partner({
            parent_id: id,
            name: `Partner${i}`,
            job: ['Plumber', 'Engineer', 'Nurse', 'Scientist'][i % 4],
            full_time: !!(i % 2)
          });
          p.setJoined('partner', partner);

          let friendships = new Instantiator.InstantORM.Core.ModelArray(Friendship);
          while (i--) {
            let friendship = new Friendship({from_parent_id: id, to_parent_id: i + 1});
            friendships.push(friendship);
          }

          p.setJoined('outgoingFriendships', friendships);

        });

        await parents.saveAll();
        for (let i = 0; i < parents.length; i++) {
          let parent = parents[i];
          await parent.joined('careers').saveAll();
          await parent.joined('children').saveAll();
          await parent.joined('pets').saveAll();
          await parent.joined('partner').save();
          await parent.joined('outgoingFriendships').saveAll();
        }
      }


      Parent.setDatabase(mainDb);
      Career.setDatabase(mainDb);
      Friendship.setDatabase(mainDb);
      Child.setDatabase(mainDb);
      Partner.setDatabase(mainDb);
      Pet.setDatabase(mainDb);

    });

    after(async () => {
      mainDb.close();
      readonlyDb.close();
      Instant.disconnect();
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    it('Should query all parents (10)', async () => {

      let parents = await Parent.query().end();

      expect(parents).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(parents.length).to.equal(10);

    });

    it('Should query all partners (10)', async () => {

      let partners = await Partner.query().end();

      expect(partners).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(partners.length).to.equal(10);

    });

    it('Should query all Children (100)', async () => {

      let children = await Child.query().end();

      expect(children).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(children.length).to.equal(100);

    });

    it('Should have parent lazy load models after fetching', async () => {

      let parents = await Parent.query().limit(1).end();
      let parent = parents[0];

      expect(parent.joined('children')).to.be.undefined;
      expect(parent.joined('partner')).to.be.undefined;

      let [children, partner] = await parent.include(['children', 'partner']);

      expect(children.length).to.equal(10);
      expect(partner).to.exist;
      expect(parent.joined('children')).to.equal(children);
      expect(parent.joined('partner')).to.equal(partner);

    });

    it('Should also lazy load from Child', async () => {

      let children = await Child.query()
        .limit(1)
        .end();

      expect(children.length).to.equal(1);

      let child = children[0];

      expect(child.get('parent')).to.be.undefined;

      let [parent] = await child.include(['parent']);

      expect(parent).to.exist;
      expect(child.joined('parent')).to.equal(parent);

    });

    it('Should orderBy properly (DESC)', async () => {

      let children = await Child.query()
        .orderBy('id', 'DESC')
        .end();

      expect(children).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(children.length).to.equal(100);
      expect(children[0].get('id')).to.equal(100);
    });

    it('Should orderBy a joined property properly (DESC)', async () => {

      let children = await Child.query()
        .join('parent')
        .orderBy('parent__name', 'DESC')
        .end();

      expect(children).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(children.length).to.equal(100);
      expect(children[0].joined('parent').get('name')).to.equal('Zoolander');
      expect(children[99].joined('parent').get('name')).to.equal('Albert');

    });

    it('Should limit properly (10)', async () => {

      let children = await Child.query()
        .limit(5, 10)
        .end();

      expect(children).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(children.length).to.equal(10);
      expect(children._meta.total).to.equal(100);
      expect(children._meta.offset).to.equal(5);

    });

    it('Should limit properly with an undefined offset', async () => {

      let children = await Child.query()
        .limit(void 0, 10)
        .end();

      expect(children).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(children.length).to.equal(10);
      expect(children._meta.total).to.equal(100);
      expect(children._meta.offset).to.equal(0);

    });

    it('Should limit properly (query params, offset)', async () => {

      let children = await Child.query()
        .where({__offset: 5})
        .end();

      expect(children).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(children.length).to.equal(95);
      expect(children._meta.total).to.equal(100);
      expect(children._meta.offset).to.equal(5);

    });

    it('Should limit properly (query params, count)', async () => {

      let children = await Child.query()
        .where({__count: 10})
        .end();

      expect(children).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(children.length).to.equal(10);
      expect(children._meta.total).to.equal(100);
      expect(children._meta.offset).to.equal(0);

    });

    it('Should limit properly (query params, count + offset)', async () => {

      let children = await Child.query()
        .where({__offset: 5, __count: 10})
        .end();

      expect(children).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(children.length).to.equal(10);
      expect(children._meta.total).to.equal(100);
      expect(children._meta.offset).to.equal(5);

    });

    it('Should limit and orderBy properly (ASC)', async () => {

      let children = await Child.query()
        .limit(10, 10)
        .orderBy('id', 'ASC')
        .end();

      expect(children).to.be.an.instanceOf(Instantiator.InstantORM.Core.ModelArray);
      expect(children.length).to.equal(10);
      expect(children[0].get('id')).to.equal(11);

    });

    it('Should first properly', async () => {

      let parent = await Parent.query()
        .orderBy('id', 'ASC')
        .first();

      expect(parent).to.exist;
      expect(parent.get('id')).to.equal(1);

    });

    it('Should give error on first if nothing found', async () => {

      try {
        await Parent.query()
          .where({name: 'Spongebob'})
          .first();
      } catch (e) {
        expect(e).to.exist;
      }

    });

    it('Should do an "is" where query properly', async () => {

      let parents = await Parent.query()
        .where({name: 'Zoolander'})
        .end();

      expect(parents.length).to.equal(1);
      expect(parents[0].get('name')).to.equal('Zoolander');

    });

    it('Should do an "not" where query properly', async () => {

      let parents = await Parent.query()
        .where({name__not: 'Zoolander'})
        .end();

      expect(parents.length).to.equal(9);

    });

    it('Should do a "lt" where query properly', async () => {

      let parents = await Parent.query()
        .where({name__lt: 'Zoolander'})
        .end();

      expect(parents.length).to.equal(9);

    });

    it('Should do a "lte" where query properly', async () => {

      let parents = await Parent.query()
        .where({name__lte: 'Zoolander'})
        .end();

      expect(parents.length).to.equal(10);

    });

    it('Should do a "gt" where query properly', async () => {

      let parents = await Parent.query()
        .where({name__gt: 'Albert'})
        .end();

      expect(parents.length).to.equal(9);

    });

    it('Should do a "gte" where query properly', async () => {

      let parents = await Parent.query()
        .where({name__gte: 'Albert'})
        .end();

      expect(parents.length).to.equal(10);

    });

    it('Should do a "contains" where query properly', async () => {

      let parents = await Parent.query()
        .where({name__contains: 'am'}) // James, Samantha, Samuel
        .end();

      expect(parents.length).to.equal(3);

    });

    it('Should do an "icontains" where query properly', async () => {

      let parents = await Parent.query()
        .where({name__icontains: 'z'}) // Suzy, Zoolander
        .end();

      expect(parents.length).to.equal(2);

    });

    it('Should do an "startswith" where query properly', async () => {

      let parents = await Parent.query()
        .where({name__startswith: 'Sam'}) // Samantha, Samuel
        .end();

      expect(parents.length).to.equal(2);

    });

    it('Should do an "endswith" where query properly', async () => {

      let parents = await Parent.query()
        .where({name__endswith: 'y'}) // Dingleberry, Sally, Suzy
        .end();

      expect(parents.length).to.equal(3);

    });

    it('Should do an "iendswith" where query properly', async () => {

      let parents = await Parent.query()
        .where({name__iendswith: 'Y'}) // Dingleberry, Sally, Suzy
        .end();

      expect(parents.length).to.equal(3);

    });

    it('Should allow for OR queries', async () => {

      let parents = await Parent.query()
        .where({name: 'Zoolander'}, {name: 'Albert'})
        .end();

      expect(parents.length).to.equal(2);

    });

    it('Should where by "hidden" field', async () => {

      let parents = await Parent.query()
        .where({hidden: 'a'})
        .end();

      expect(parents.length).to.be.lessThan(10);

    });

    it('Should safeWhere and ignore "hidden" field', async () => {

      let parents = await Parent.query()
        .safeWhere({hidden: 'a'})
        .end();

      expect(parents.length).to.equal(10);

    });

    it('Should safeWhere and ignore "hidden" field with modifier', async () => {

      let parents = await Parent.query()
        .safeWhere({hidden__not: 'a'})
        .end();

      expect(parents.length).to.equal(10);

    });

    it('Should find all children with parent id = "1", by id', async () => {

      let children = await Child.query()
        .where({parent_id: 1})
        .end();

      expect(children.length).to.equal(10);

    });

    it('Should find all children with parent id = "1", by joining', async () => {

      let children = await Child.query()
        .join('parent')
        .where({parent__id: 1})
        .end();

      expect(children.length).to.equal(10);

    });

    it('Should find all children with parent name = "Zoolander", by joining', async () => {

      let children = await Child.query()
        .join('parent')
        .where({parent__name: 'Zoolander'})
        .end();

      expect(children.length).to.equal(10);

    });

    it('Should find all parents with children id <= 15, by joining', async () => {

      let parents = await Parent.query()
        .join('children')
        .where({children__id__lte: 15})
        .end();

      expect(parents.length).to.equal(2);
      expect(parents[0].joined('children').length).to.equal(10);
      expect(parents[1].joined('children').length).to.equal(10);

    });

    it('Should find all parents with children id <= 15, by joining with restrictions', async () => {

      let parents = await Parent.query()
        .join('children', {id__lte: 15})
        .where({children__id__lte: 15})
        .end();

      expect(parents.length).to.equal(2);
      expect(parents[0].joined('children').length).to.equal(10);
      expect(parents[1].joined('children').length).to.equal(5);

    });

    it('Should find all parents with children id <= 15, by joining with more restrictions', async () => {

      let parents = await Parent.query()
        .join('children', {id__lte: 15, id__gte: 11})
        .where({children__id__lte: 15})
        .end();

      expect(parents.length).to.equal(2);
      expect(parents[0].joined('children').length).to.equal(0);
      expect(parents[1].joined('children').length).to.equal(5);

    });

    it('Should find all parents with children id <= 15, by joining with parent restrictions', async () => {

      let parents = await Parent.query()
        .join('children', {parent__id: 1})
        .where({children__id__lte: 15})
        .end();

      expect(parents.length).to.equal(2);
      expect(parents[0].joined('children').length).to.equal(10);
      expect(parents[1].joined('children').length).to.equal(0);

    });

    it('Should find all parents with children id <= 15, by joining with parent restrictions that joins another field', async () => {

      let parents = await Parent.query()
        .join('children', {parent__children__id__in: [1, 2, 3]})
        .where({children__id__lte: 15})
        .end();

      expect(parents.length).to.equal(2);
      expect(parents[0].joined('children').length).to.equal(10);
      expect(parents[1].joined('children').length).to.equal(0);

    });

    it('Should join children and partners both to parents', async () => {

      let parents = await Parent.query()
        .join('children')
        .join('partner')
        .end();

      expect(parents.length).to.equal(10);

    });

    it('Should join children and partners both to parents, and where each', async () => {

      let parents = await Parent.query()
        .join('children')
        .where({children__id__lte: 25})
        .join('partner')
        .where({partner__name: 'Partner0'}, {partner__name: 'Partner1'})
        .end();

      expect(parents.length).to.equal(2);

    });

    it('Should where from both relationships, but keep 10 children per parent', async () => {

      let parents = await Parent.query()
        .join('children')
        .where({children__id__lte: 25})
        .join('partner')
        .where({partner__name: 'Partner0'}, {partner__name: 'Partner1'})
        .end();

      expect(parents.length).to.equal(2);
      expect(parents[0].joined('children').length).to.equal(10);
      expect(parents[1].joined('children').length).to.equal(10);

    });

    it('Should join children and partners both to parents, and where each, with an additional where of the first join', async () => {

      let parents = await Parent.query()
        .join('children')
        .where({children__id__lte: 25})
        .join('partner')
        .where({partner__name: 'Partner0'}, {partner__name: 'Partner1'})
        .where({children__id__gte: 15})
        .end();

      expect(parents.length).to.equal(1);

    });

    it('Should limit based on the Parent, not joined fields', async () => {

      let parents = await Parent.query()
        .join('children')
        .where({children__id__lte: 70})
        .limit(5)
        .end();

      expect(parents.length).to.equal(5);

    });

    it('Should where without joining', async () => {

      let parents = await Parent.query()
        .where({children__id__lte: 70})
        .limit(5)
        .end();

      expect(parents.length).to.equal(5);

    });

    it('Should have Parent join many mutiple fields (Children, Pets) and parse properly', async () => {

      let parents = await Parent.query()
        .join('children')
        .join('pets')
        .limit(3)
        .end();

      expect(parents.length).to.equal(3);

      parents.forEach(parent => {
        expect(parent.joined('children').length).to.equal(10);
        expect(parent.joined('pets').length).to.equal(3);
      });


    });

    it('Should have Parent join Incoming + Outgoing Friendships', async () => {

      let parents = await Parent.query()
        .join('incomingFriendships')
        .join('outgoingFriendships')
        .orderBy('id', 'ASC')
        .end();

      parents.forEach((parent, i) => {
        expect(parent.joined('incomingFriendships').length).to.equal(9 - i);
        expect(parent.joined('outgoingFriendships').length).to.equal(i);
      });

    });

    it('Should get all Friendships and their Parents', async () => {

      let friendships = await Friendship.query()
        .join('fromParent')
        .join('toParent')
        .end();

      expect(friendships.length).to.equal(45);

      friendships.forEach((friendship, i) => {
        expect(friendship.joined('fromParent')).to.not.be.undefined;
        expect(friendship.joined('toParent')).to.not.be.undefined;
      });

    });

    it('Should get all Friendships belonging to a parent', async () => {

      let friendships = await Friendship.query()
        .join('fromParent')
        .join('toParent')
        .where({fromParent__id: 5}, {toParent__id: 5})
        .end();

      expect(friendships.length).to.equal(9);

      friendships.forEach(friendship => {
        expect(
          friendship.joined('fromParent').get('id') === 5 ||
          friendship.joined('toParent').get('id') === 5
        ).to.equal(true);
      });

    });

    it('Should AND icontains with an Array', async () => {

      // 'Albert',
      // 'Derek',
      // 'Dingleberry',
      // 'James',
      // 'Joe',
      // 'Sally',
      // 'Samantha',
      // 'Samuel',
      // 'Suzy',
      // 'Zoolander'

      let parents = await Parent.query()
        .where({name__icontains: ['a', 'e']})
        .end();

      expect(parents).to.exist;
      expect(parents.length).to.equal(4);
      expect(parents.map(p => p.get('name'))).to.contain('Albert');
      expect(parents.map(p => p.get('name'))).to.contain('James');
      expect(parents.map(p => p.get('name'))).to.contain('Samuel');
      expect(parents.map(p => p.get('name'))).to.contain('Zoolander');

    });

    it('Should be able to filter multiple join types', async () => {

      let parents = await Parent.query()
        .join('partner', {job: 'Plumber', full_time: true}, {job: 'Nurse', full_time: true})
        .join('pets', {name: 'Ruby'})
        .end();

      expect(parents).to.exist;
      expect(parents.length).to.equal(10);
          for (let i = 0; i < 10; i++) {
            let parent = parents[i];
            expect(parent.joined('pets').length).to.equal(1);
            expect(parent.joined('pets')[0].get('name')).to.equal('Ruby');
            if (parent.joined('partner')) {
              expect(['Plumber', 'Nurse']).to.include(parent.joined('partner').get('job'));
              expect(parent.joined('partner').get('full_time')).to.equal(true);
            }
          }

    });

    it('Should get correct pets on an OR join', async () => {

      let parents = await Parent.query()
        .join('pets', {name: 'Ruby'}, {name: 'Oliver'})
        .end();

      expect(parents).to.exist;
      expect(parents.length).to.equal(10);
          for (let i = 0; i < parents.length; i++) {
            let parent = parents[i];
            expect(parent.joined('pets').length).to.equal(2);
          }

    });

    it('Should LIMIT properly with an OR join', async () => {

      let parents = await Parent.query()
        .join('pets')
        .where({pets__name: 'Ruby'}, {pets__name: 'Oliver'})
        .orderBy('created_at', 'DESC')
        .limit(0, 5)
        .end();

      expect(parents).to.exist;
      expect(parents.length).to.equal(5);

    });

    it('Should LIMIT properly with an OR join and limit in OR', async () => {

      let parents = await Parent.query()
        .join('pets')
        .where({pets__name: 'Ruby', __offset: 0, __count: 5}, {pets__name: 'Oliver', __offset: 0, __count: 5})
        .orderBy('created_at', 'DESC')
        .end();

      expect(parents).to.exist;
      expect(parents.length).to.equal(5);

    });

    it('Should filter a joined model properly', async () => {

      let children = await Child.query()
        .join('parent', {name: 'Albert'})
        .join('parent__pets')
        .join('parent__partner')
        .where({id__in: [1, 11, 22]})
        .end();

          let parentCount = 0;

      expect(children).to.exist;
      expect(children.length).to.equal(3);
      for (let i = 0; i < children.length; i++) {
        let child = children[i];
        let parent = child.joined('parent');
        parentCount = parentCount + (parent ? 1 : 0);
        parent && expect(parent.get('name')).to.equal('Albert');
      }
      expect(parentCount).to.equal(1);

    });

    it('Should OR numerous nested fields together comprehensively', async () => {

      let parents = await Parent.query()
        .join('children')
        .join('pets')
        .join('careers')
        .where([
          {
            children__is_favorite: true,
            children__license: null,
            pets__name: 'Oliver',
            pets__alive: true,
            name: 'Zoolander',
            pets__animal__in: ['Cat']
          },
          {
            children__is_favorite: true,
            children__license__not_null: true,
            pets__name: 'Oliver',
            pets__alive: true,
            name: 'Zoolander',
            pets__animal__in: ['Cat']
          },
          {
            careers__title: 'Freelancer',
            careers__is_active: true,
            pets__name: 'Oliver',
            pets__alive: true,
            name: 'Zoolander',
            pets__animal__in: ['Cat']
          },
        ])
        .limit(20)
        .end();

      expect(parents.length).to.equal(1);
      expect(parents[0].get('name')).to.equal('Zoolander');

    });

    /**
    *
    *  ADDING AND INSERTING RECORDS
    *     DO NOT DEPEND ON UPSTREAM SET VALUES
    *
    */

    it('Should update all parents names', async () => {

      let parents = await Parent.query()
        .update({name: 'Dave'});

      expect(parents.length).to.equal(10);

      parents.forEach(parent => {
        expect(parent.get('name')).to.equal('Dave');
      });

    });

    it('Should update all childrens ages', async () => {

      let children = await Child.query().orderBy('id').end();

      let ages = children.map(c => c.get('age'));

      children = await Child.query()
        .orderBy('id')
        .update({age: age => `${age} + 10`});

      children.forEach((child, i) => {
        expect(child.get('age')).to.equal(ages[i] + 10);
      });

    });

    it('Should update all childrens ages and license', async () => {

      let children = await Child.query().orderBy('id').end();
      let ages = children.map(c => c.get('age'));

      children = await Child.query()
        .orderBy('id')
        .update({license: 'DL_APPROVED_HOORAY', age: age => `${age} + 10`});

      children.forEach((child, i) => {
        expect(child.get('age')).to.equal(ages[i] + 10);
        expect(child.get('license')).to.equal('DL_APPROVED_HOORAY');
      });

    });

    it('Should query pets by datetime', async () => {

      let compareDate = new Date(`2020-01-01T00:00:13.370Z`);

      let pets = await Pet.query()
        .where({added_at__gt: compareDate})
        .end();

      expect(pets.length).to.equal(20);
      pets.forEach(pet => {
        expect(pet.get('added_at')).to.be.greaterThan(compareDate);
      });

    });

    it('Should update all parents names and join children', async () => {

      let parents = await Parent.query()
        .join('children')
        .update({name: 'Bertrand'});

      expect(parents.length).to.equal(10);

      parents.forEach(parent => {
        expect(parent.joined('children').length).to.equal(10);
        expect(parent.get('name')).to.equal('Bertrand');
      });

    });

    it('Should update all parents names and join children, and order by id DESC', async () => {

      let parents = await Parent.query()
        .join('children')
        .orderBy('id', 'DESC')
        .update({name: 'Bertrand'});

      expect(parents.length).to.equal(10);

      parents.forEach((parent, i) => {
        expect(parent.joined('children').length).to.equal(10);
        expect(parent.get('name')).to.equal('Bertrand');
        expect(parent.get('id')).to.equal(10 - i);
      });

    });

    it('Should query the readonly and see all parents with their original names', async () => {

      let parents = await Parent.query(readonlyDb)
        .orderBy('name', 'ASC')
        .end();

      expect(parents.length).to.equal(10);

      parents.forEach((parent, i) => {
        expect(parent.get('name')).to.equal(originalParentNames[i]);
      });

    });

    it('Should throw an error when trying to update with a readonly database', async () => {

      try {
        await Parent.query(readonlyDb).update({name: 'Cobb'});
      } catch (e) {
        expect(e).to.exist;
      }

    });

    it('Should join children to pets', async () => {

      let pet = await Pet.query()
        .join('parent__children')
        .first();

      expect(pet).to.exist;
      expect(pet.joined('parent').joined('children')).to.exist;
      expect(pet.joined('parent').joined('children').length).to.equal(10);

    });

    it('Should join pets to children', async () => {

      let child = await Child.query()
        .join('parent__pets')
        .first();

      expect(child).to.exist;
      expect(child.joined('parent').joined('pets')).to.exist;
      expect(child.joined('parent').joined('pets').length).to.equal(3);

    });

    it('Should join parent and children to pets', async () => {

      let pet = await Pet.query()
        .join('parent')
        .join('parent__children')
        .first();

      expect(pet).to.exist;
      expect(pet.joined('parent').joined('children')).to.exist;
      expect(pet.joined('parent').joined('children').length).to.equal(10);
      expect(pet.joined('parent')).to.exist;

    });

    it('Should join parent and children to pets with only lowest join', async () => {

      let pet = await Pet.query()
        .join('parent__children')
        .first();

      expect(pet).to.exist;
      expect(pet.joined('parent').joined('children')).to.exist;
      expect(pet.joined('parent').joined('children').length).to.equal(10);
      expect(pet.joined('parent')).to.exist;

    });

    it('Should query pet by children', async () => {

      let pets = await Pet.query()
        .where({parent__children__id__lte: 50})
        .end();

      expect(pets).to.exist;
      expect(pets.length).to.equal(15);

    });

    it('Should query pet by parent and by pet value', async () => {

      let pets = await Pet.query()
        .where({parent__id__gt: 1, created_at__lte: new Date()})
        .end();

      expect(pets).to.exist;
      expect(pets.length).to.equal(27);

    });

    it('Should query a pet based on json key existance', async () => {

      let pets = await Pet.query()
        .where({details__jsoncontains: 'language'})
        .end();

      expect(pets.length).to.equal(30);

    });

    it('Should query a pet based on json key value', async () => {

      let pets = await Pet.query()
        .where({details__json: {language: true}})
        .end();

      expect(pets.length).to.equal(10);

    });

    it('Should query a pet based on json entry, match nothing', async () => {

      let pets = await Pet.query()
        .where({details__json: {}})
        .end();

      expect(pets.length).to.equal(30);

    });

    it('Should join multiple properties from a deeply joined property', async () => {

      let parent = await Parent.query()
        .join('incomingFriendships')
        .join('incomingFriendships__fromParent')
        .join('incomingFriendships__fromParent__pets')
        .join('incomingFriendships__fromParent__children')
        .first();

      expect(parent).to.exist;
      expect(parent.joined('incomingFriendships')[0].joined('fromParent').joined('pets')).to.exist;
      expect(parent.joined('incomingFriendships')[0].joined('fromParent').joined('children')).to.exist;

    });

    it('Should group by shirt', async () => {

      let groups = await Parent.query()
        .groupBy('shirt')
        .end();

      expect(groups.length).to.equal(3);

    });

    it('Should group and order by shirt', async () => {

      let groups = await Parent.query()
        .groupBy('shirt')
        .orderBy('shirt', 'ASC')
        .end();

      expect(groups.length).to.equal(3);
      expect(groups[0].shirt).to.equal('blue');

    });

    it('Should group by shirt, and get a count alias and another mapping', async () => {

      let groups = await Parent.query()
        .groupBy('shirt')
        .aggregate('count', id => `COUNT(${id})`)
        .aggregate('red_or_blue', shirt => `CASE WHEN ${shirt} IN ('red', 'blue') THEN TRUE ELSE FALSE END`)
        .orderBy('shirt', 'ASC')
        .end();

      expect(groups.length).to.equal(3);
      expect(groups[0].shirt).to.equal('blue');
      expect(groups[0].count).to.equal(3);
      expect(groups[0].red_or_blue).to.equal(true);

    });

    it('Should group by shirt, and get a count alias, order by transformation', async () => {

      let groups = await Parent.query()
        .groupBy('shirt')
        .aggregate('count', id => `COUNT(${id})`)
        .orderBy(id => `COUNT(${id})`, 'DESC')
        .end();

      expect(groups.length).to.equal(3);
      expect(groups[0].count).to.equal(4);

    });

    it('Should apply filter, group by shirt, and get a count alias, order by transformation', async () => {

      let groups = await Parent.query()
        .where({id__gt: 2})
        .groupBy('shirt')
        .aggregate('count', id => `COUNT(${id})`)
        .orderBy(id => `COUNT(${id})`, 'DESC')
        .end();

      expect(groups.length).to.equal(3);
      expect(groups[0].count).to.equal(3);

    });

    it('Should apply filter, group by shirt and pantaloons', async () => {

      let groups = await Parent.query()
        .groupBy('shirt')
        .groupBy('pantaloons')
        .aggregate('count', id => `COUNT(${id})`)
        .orderBy(id => `COUNT(${id})`, 'DESC')
        .end();

      expect(groups.length).to.equal(6);
      expect(groups[0]).to.haveOwnProperty('shirt');
      expect(groups[0]).to.haveOwnProperty('pantaloons');
      expect(groups[0]).to.haveOwnProperty('count');

    });

    it('Should not fetch parents if they don\'t exist', async () => {

      await Child.create({name: 'Ada'});

      let child = await Child.query()
        .join('parent')
        .where({name: 'Ada'})
        .first();

    });

    it('Should AND nested subfields together from tables', async () => {

      let parents = await Parent.query()
        .join('pets')
        .where({pets__name: 'Ruby', pets__animal: 'Cat'})
        .end();

      expect(parents).to.exist;
      expect(parents.length).to.equal(0);

    });

    it('Should add nested subfield correctly', async () => {

      let parents = await Parent.query()
        .join('partner')
        .where({shirt: 'red', partner__job: 'Plumber'})
        .end();

      expect(parents).to.exist;
      expect(parents.length).to.equal(1);
      expect(parents[0].get('id')).to.equal(1);

    });

    it('Should AND nested subfields together from tables', async () => {

      let parents = await Parent.query()
        .join('pets')
        .where({pets__name: 'Ruby', pets__animal: 'Cat'})
        .end();

      expect(parents).to.exist;
      expect(parents.length).to.equal(0);

    });

    it('Should join two models adequately', async () => {

      let parents = await Parent.query()
        .join('children')
        .join('partner')
        .join('pets')
        .end();

      expect(parents).to.exist;
      expect(parents.length).to.equal(10);

    });

    it('Should start a transaction, insert a child, then select for that child', async () => {

      let txn = Instant.database().createTransaction();
      let createdChild = await Child.create({name: 'Alec'}, txn);
      let child = await Child.query()
        .transact(txn)
        .where({id: createdChild.get('id')})
        .first();

      let childrenA = await Child.query()
        .where({id: createdChild.get('id')})
        .limit(1)
        .end();

      await txn.commit();

      let childrenB = await Child.query()
        .where({id: createdChild.get('id')})
        .limit(1)
        .end();

      expect(child).to.exist;
      expect(child.get('name')).to.equal('Alec');
      expect(childrenA.length).to.equal(0);
      expect(childrenB.length).to.equal(1);
      expect(childrenB[0].get('name')).to.equal('Alec');

    });

    // IMPORTANT: Do npt place any tests after the `Should do a destroy cascade`
    // test since all models will be gone

    it('Should do a destroy cascade', async () => {

      let parents = await Parent.query().end();
      await parents.destroyCascade();

    });


  });

};
