module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;

  const Instant = Instantiator();

  describe('InstantORM.Core.Model', async () => {

    let db;

    let schemaParent = {
      name: 'parents',
      columns: [
        {name: 'id', type: 'serial', properties: {primary_key: true}},
        {name: 'name', type: 'string', properties: { defaultValue: 'Keith'}},
        {name: 'age', type: 'int'},
        {name: 'secret', type: 'string'},
        {name: 'content', type: 'json'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };
    class Parent extends Instantiator.InstantORM.Core.Model {}
    Parent.hides('secret');
    Parent.setTableSchema(schemaParent);

    Parent.validates('name', 'should be at least four characters long', v => v && v.length >= 4);

    Parent.verifies(
      'should wait 10ms and have age be greater than 0',
      async (name, age) => {
        await new Promise(res => setTimeout(() => res(true), 10));
        return parseInt(age) > 0;
      }
    );

    let schemaHouse = {
      name: 'houses',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'material', type: 'string'},
        {name: 'color', type: 'string'},
        {name: 'content', type: 'json'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };
    class House extends Instantiator.InstantORM.Core.Model {}
    House.setTableSchema(schemaHouse);

    House.joinsTo(Parent);

    const schemaSpecialItem = {
      name: 'special_items',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'name', type: 'string', properties: {unique: true}}
      ]
    };
    class SpecialItem extends Instantiator.InstantORM.Core.Model {}
    SpecialItem.setTableSchema(schemaSpecialItem);

    class User extends Instantiator.InstantORM.Core.Model {}
    User.setTableSchema({
      name: 'users',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'username', type: 'string'}
      ]
    });

    class Post extends Instantiator.InstantORM.Core.Model {}
    Post.setTableSchema({
      name: 'posts',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'user_id', type: 'int'},
        {name: 'title', type: 'string'},
        {name: 'body', type: 'string'}
      ]
    });
    Post.joinsTo(User, {multiple: true});

    class Comment extends Instantiator.InstantORM.Core.Model {}
    Comment.setTableSchema({
      name: 'comments',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'post_id', type: 'int'},
        {name: 'body', type: 'string'}      ]
    });
    Comment.joinsTo(Post, {multiple: true});

    before(async () => {

      await Instant.connect(Databases['main'], null);
      db = Instant.database();
      // db.enableLogs(2);

      await db.transact(
        [schemaParent, schemaHouse, schemaSpecialItem].map(schema => {
          return db.adapter.generateCreateTableQuery(schema.name, schema.columns);
        }).join(';'),
      );

      Parent.setDatabase(db);
      House.setDatabase(db);
      SpecialItem.setDatabase(db);

    });

    after(async () => {
      Instant.disconnect();
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    it('should instantiate', () => {

      let parent = new Parent();
      expect(parent).to.be.instanceof(Instantiator.InstantORM.Core.Model);

    });

    it('should not be listed as in Storage', () => {

      let parent = new Parent();
      expect(parent.inStorage()).to.equal(false);

    });

    it('should have errors from validators with no params set', () => {

      let parent = new Parent();
      expect(parent.hasErrors()).to.equal(true);

    });

    it('should have correct validator error', () => {

      let parent = new Parent();
      expect(parent.errorObject()).to.not.equal(null);
      expect(parent.errorObject().details).to.have.property('name');
      expect(parent.errorObject().details.name[0]).to.equal('should be at least four characters long');

    });

    it('should not have errors if validations pass', () => {

      let parent = new Parent({name: 'abcd'});
      expect(parent.hasErrors()).to.equal(false);

    });

    it('should clear errors once validated properties set', () => {

      let parent = new Parent();
      expect(parent.hasErrors()).to.equal(true);
      parent.set('name', 'abcdef');
      expect(parent.hasErrors()).to.equal(false);

    });

    it('should return default value', () => {

      let parent = new Parent();
      expect(parent.fieldDefaultValue('name')).to.equal('Keith');
      expect(parent.fieldDefaultValue('secret')).to.equal(null);

    });

    it('should toObject with interface', () => {

      let parent = new Parent();
      let obj = parent.toJSON();

      expect(obj).to.have.ownProperty('id');
      expect(obj).to.have.ownProperty('name');
      expect(obj).to.have.ownProperty('age');
      expect(obj).to.have.ownProperty('content');
      expect(obj).to.have.ownProperty('created_at');
      expect(obj).to.have.ownProperty('updated_at');
      expect(obj).to.not.have.ownProperty('secret'); // hidden

      obj = parent.toJSON(['id', 'name', 'secret']);

      expect(obj).to.have.ownProperty('id');
      expect(obj).to.have.ownProperty('name');
      expect(obj).to.not.have.ownProperty('age');
      expect(obj).to.not.have.ownProperty('content');
      expect(obj).to.not.have.ownProperty('created_at');
      expect(obj).to.not.have.ownProperty('updated_at');
      expect(obj).to.not.have.ownProperty('secret'); // hidden

    });

    it('should toObject with interface, with joined', () => {

      let parent = new Parent({id: 1});
      let house = new House({id: 1});
      parent.setJoined('house', house);
      house.setJoined('parent', parent);

      let obj = parent.toJSON();

      expect(obj).to.have.ownProperty('id');
      expect(obj).to.have.ownProperty('name');
      expect(obj).to.have.ownProperty('age');
      expect(obj).to.have.ownProperty('content');
      expect(obj).to.have.ownProperty('created_at');
      expect(obj).to.have.ownProperty('updated_at');
      expect(obj).to.not.have.ownProperty('house');

      obj = parent.toJSON(['house']);

      expect(obj).to.have.ownProperty('house');
      expect(obj.house).to.have.ownProperty('id');
      expect(obj.house).to.have.ownProperty('material');
      expect(obj.house).to.have.ownProperty('color');
      expect(obj.house).to.have.ownProperty('content');
      expect(obj.house).to.have.ownProperty('created_at');
      expect(obj.house).to.have.ownProperty('updated_at');

      obj = parent.toJSON(['id', 'name']);

      expect(obj).to.have.ownProperty('id');
      expect(obj).to.have.ownProperty('name');
      expect(obj).to.not.have.ownProperty('age');
      expect(obj).to.not.have.ownProperty('content');
      expect(obj).to.not.have.ownProperty('created_at');
      expect(obj).to.not.have.ownProperty('updated_at');
      expect(obj).to.not.have.ownProperty('house');

      obj = parent.toJSON(['id', 'name', 'house']);

      expect(obj).to.have.ownProperty('id');
      expect(obj).to.have.ownProperty('name');
      expect(obj).to.not.have.ownProperty('age');
      expect(obj).to.not.have.ownProperty('content');
      expect(obj).to.not.have.ownProperty('created_at');
      expect(obj).to.not.have.ownProperty('updated_at');
      expect(obj).to.have.ownProperty('house');
      expect(obj.house).to.have.ownProperty('id');
      expect(obj.house).to.have.ownProperty('material');
      expect(obj.house).to.have.ownProperty('color');
      expect(obj.house).to.have.ownProperty('content');
      expect(obj.house).to.have.ownProperty('created_at');
      expect(obj.house).to.have.ownProperty('updated_at');

      obj = parent.toJSON(['id', 'name', {house: ['id', 'material']}]);

      expect(obj).to.have.ownProperty('id');
      expect(obj).to.have.ownProperty('name');
      expect(obj).to.not.have.ownProperty('age');
      expect(obj).to.not.have.ownProperty('content');
      expect(obj).to.not.have.ownProperty('created_at');
      expect(obj).to.not.have.ownProperty('updated_at');
      expect(obj).to.have.ownProperty('house');
      expect(obj.house).to.have.ownProperty('id');
      expect(obj.house).to.have.ownProperty('material');
      expect(obj.house).to.not.have.ownProperty('color');
      expect(obj.house).to.not.have.ownProperty('content');
      expect(obj.house).to.not.have.ownProperty('created_at');
      expect(obj.house).to.not.have.ownProperty('updated_at');

    });

    it('should toObject with interface from ModelArray', () => {

      let parents = new Instantiator.InstantORM.Core.ModelArray(Parent);

      parents.push(new Parent({name: 'Parent'}));

      let obj = parents.toJSON(['id', 'name'])
      expect(obj[0]).to.have.ownProperty('id');
      expect(obj[0]).to.have.ownProperty('name');
      expect(obj[0]).to.not.have.ownProperty('age');
      expect(obj[0]).to.not.have.ownProperty('content');
      expect(obj[0]).to.not.have.ownProperty('created_at');
      expect(obj[0]).to.not.have.ownProperty('updated_at');

    });

    it('should toObject with multiply-nested ModelArray', () => {

      let comments = Instantiator.InstantORM.Core.ModelArray.from([new Comment({body: 'Hello, World'})]);
      let posts = Instantiator.InstantORM.Core.ModelArray.from([new Post({title: 'Hello', body: 'Everybody'})]);
      let users =  Instantiator.InstantORM.Core.ModelArray.from([new User({username: 'Ruby'})]);

      posts[0].setJoined('comments', comments);
      users[0].setJoined('posts', posts);

      let obj = users.toJSON();

      expect(obj[0].posts).to.not.exist;

      obj = users.toJSON(['id', {posts: ['comments']}]);
      expect(obj[0].posts).to.exist;
      expect(obj[0].posts[0].comments).to.exist;

    });

    it('should clear joined models properly', () => {

      let comments = Instantiator.InstantORM.Core.ModelArray.from([new Comment({body: 'Hello, World'})]);
      let posts = Instantiator.InstantORM.Core.ModelArray.from([new Post({title: 'Hello', body: 'Everybody'})]);

      posts[0].setJoined('comments', comments);
      posts[0].clearJoined('comments');

      expect(posts[0].joined('comments')).to.not.exist;

      posts[0].clearJoined('comments');
      expect(posts[0].joined('comments')).to.not.exist;

      try {
        posts[0].clearJoined('badfield');
      } catch (e) {
        expect(e.message).to.equal('No relationship named "badfield" exists')
      }

    });

    describe('#save', () => {

      it('should refuse to save with validator error', async () => {

        let parent = new Parent();
        try {
          await parent.save();
        } catch (e) {
          expect(e).to.exist;
        }
        expect(parent.inStorage()).to.equal(false);

      });

      it('should refuse to save with verifier error', async () => {

        let parent = new Parent({name: 'abcdef'});
        try {
          await parent.save();
        } catch (e) {
          expect(e).to.exist;
        }
        expect(parent.inStorage()).to.equal(false);

      });

      it('should save with no errors', async () => {

        let parent = new Parent({name: 'abcdef', age: 2});
        await parent.save();
        expect(parent.inStorage()).to.equal(true);

      });

      it('should save initially and update afterwards', async () => {

        let parent = new Parent({name: '123456', age: 2});
        let model = await parent.save();

        expect(model).to.equal(parent);
        expect(model.inStorage()).to.equal(true);
        expect(model.get('name')).to.equal('123456');
        expect(model.get('age')).to.equal(2);

        model.set('name', 'infinity');
        model.set('age', 27);
        await model.save();

        expect(model).to.equal(parent);
        expect(model.inStorage()).to.equal(true);
        expect(model.get('name')).to.equal('infinity');
        expect(model.get('age')).to.equal(27);

      });

      it('should create Parent via Parent.create', async () => {

        let parent = await Parent.create({name: 'parent', age: 30});
        expect(parent).to.exist;
        expect(parent.inStorage()).to.equal(true);
        expect(parent.get('name')).to.equal('parent');
        expect(parent.get('age')).to.equal(30);

      });

      it('should create Parent via Parent.create, destroy via Parent.destroy', async () => {

        let parent = await Parent.create({name: 'parent', age: 30});

        expect(parent).to.exist;
        expect(parent.inStorage()).to.equal(true);

        let p2 = await Parent.destroy(parent.get('id'));

        expect(p2.inStorage()).to.equal(false);

      });

      it('should create Parent via Parent.create, find by Parent.find', async () => {

        let parent = await Parent.create({name: 'parent', age: 30});

        expect(parent).to.exist;
        expect(parent.inStorage()).to.equal(true);

        let p2 = await Parent.find(parent.get('id'));

        expect(p2).to.exist;
        expect(p2.inStorage()).to.equal(true);

      });

      it('should create Parent via Parent.create, find by Parent.findBy', async () => {

        let parent = await Parent.create({name: 'parent_findby', age: 35});

        expect(parent).to.exist;

        let p2 = await Parent.findBy('name', 'parent_findby');

        expect(p2.get('age')).to.equal(35);
        expect(p2.inStorage()).to.equal(true);

      });

      it('Should create via updateOrCreateBy', async () => {

        let parent = await Parent.updateOrCreateBy(
          'name',
          {name: 'parent_unique', age: 25}
        );

        expect(parent).to.exist;
        expect(parent.get('name')).to.equal('parent_unique');
        expect(parent.get('age')).to.equal(25);

      });

      it('Should find via updateOrCreateBy', async () => {

        let parent = await Parent.create({name: 'parent_unique_2', age: 30});

        expect(parent).to.exist;
        expect(parent.get('age')).to.equal(30);

        let p2 = await Parent.updateOrCreateBy('name', {name: 'parent_unique_2', age: 57});

        expect(p2).to.exist;
        expect(p2.get('name')).to.equal('parent_unique_2');
        expect(p2.get('age')).to.equal(57);

      });

      it('should save multiple parents', async () => {

        let parents = new Instantiator.InstantORM.Core.ModelArray(Parent);

        for (let i = 0; i < 10; i++) {
          parents.push(new Parent({name: 'Parent_' + i, age: 20}));
        }

        let modelArray = await parents.saveAll();

        expect(modelArray).to.exist;
        expect(modelArray).to.equal(parents);
        expect(modelArray.filter(m => m.inStorage()).length).to.equal(modelArray.length);

      });

      it('should delete multiple parents', async () => {

        let query = await Parent.query();
        let parents = await query.select();

        await parents.destroyAll();
        parents.forEach(parent => {
          expect(parent.inStorage()).to.equal(false);
        });

        let p2 = await query.select();
        expect(p2.length).to.equal(0);

      });

    });

    describe('ModelFactory', async () => {

      it('should create the factories', async () => {

        ParentFactory = new Instantiator.InstantORM.Core.ModelFactory(Parent);
        HouseFactory = new Instantiator.InstantORM.Core.ModelFactory(House);

      });

      it('should not save all parents with verification errors', async () => {

        let error;

        try {
          await ParentFactory.create([
            {name: 'Kate'},
            {name: 'Sayid'},
            {name: 'Jack'},
            {name: 'Sawyer'},
          ]);
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;

      });

      it('should save all parents', async () => {

        let models = await ParentFactory.create([
          {name: 'Kate', age: 20},
          {name: 'Sayid', age: 20},
          {name: 'Jack', age: 20},
          {name: 'Sawyer', age: 20},
        ]);

        expect(models.length).to.equal(4);

        let data = ['Kate', 'Sayid', 'Jack', 'Sawyer'];
        models.forEach(m => data.splice(data.indexOf(m.get('name')), 1));

        expect(data.length).to.equal(0);

      });

      it('should not save data from both Parents and Houses with verification errors', async () => {

        let results = null;
        let error;

        try {
          results = await Instantiator.InstantORM.Core.ModelFactory.createFromModels(
            {
              parents: Parent,
              houses: House
            },
            {
              parents: [
                {name: 'Hurley'},
                {name: 'Boone'}
              ],
              houses: [
                {material: 'straw'},
                {material: 'wood'}
              ]
            }
          );
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;

      });

      it('should save data from both Parents and Houses', async () => {

        let results = await Instantiator.InstantORM.Core.ModelFactory.createFromModels(
          {
            parents: Parent,
            houses: House
          },
          {
            parents: [
              {name: 'Hurley', age: 20},
              {name: 'Boone', age: 20}
            ],
            houses: [
              {material: 'straw'},
              {material: 'wood'}
            ]
          }
        );

        expect(results.length).to.equal(2);

        let parents = results[0];
        let houses = results[1];

        expect(parents.length).to.equal(2);
        expect(houses.length).to.equal(2);

      });

    });

    describe('Unique tests', async () => {

      it('Should create a special item', async () => {

        let specialItem = await SpecialItem.create({name: 'unique-name'});

        expect(specialItem).to.exist;
        expect(specialItem.get('name')).to.equal('unique-name');

      });

      it('Should refuse to create a duplicate special item', async () => {

        let specialItem;
        let error;

        try {
          await SpecialItem.create({name: 'unique-name'});
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.details).to.exist;
        expect(error.details._query).to.be.an('array');
        expect(error.details._query.length).to.equal(1);
        expect(error.details._query[0]).to.be.a('string');
        expect(error.details._query[0]).to.contain('violates unique constraint "special_items_name_unique"');
        expect(error.identifier).to.contain('violates unique constraint "special_items_name_unique"');

      });

    });

  });

};
