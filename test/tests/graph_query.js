module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;

  const Instant = Instantiator();

  describe('InstantORM.Core.GraphQuery', async () => {

    let db = new Instantiator.InstantORM.Core.DB.Database();

    let schemaUser = {
      name: 'users',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'username', type: 'string'},
        {name: 'skill', type: 'string'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let schemaThread = {
      name: 'threads',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'user_id', type: 'int'},
        {name: 'title', type: 'string'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let schemaPost = {
      name: 'posts',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'user_id', type: 'int'},
        {name: 'thread_id', type: 'int'},
        {name: 'body', type: 'string'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let schemaVote = {
      name: 'votes',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'user_id', type: 'int'},
        {name: 'thread_id', type: 'int'},
        {name: 'weight', type: 'int'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    class User extends Instantiator.InstantORM.Core.Model {}

    User.setDatabase(db);
    User.setSchema(schemaUser);

    class Thread extends Instantiator.InstantORM.Core.Model {}

    Thread.setDatabase(db);
    Thread.setSchema(schemaThread);
    Thread.joinsTo(User, {multiple: true});

    class Post extends Instantiator.InstantORM.Core.Model {}

    Post.setDatabase(db);
    Post.setSchema(schemaPost);
    Post.joinsTo(User, {multiple: true});
    Post.joinsTo(Thread, {multiple: true});

    class Vote extends Instantiator.InstantORM.Core.Model {};

    Vote.setDatabase(db);
    Vote.setSchema(schemaVote);
    Vote.joinsTo(User, {multiple: true});
    Vote.joinsTo(Thread, {multiple: true});

    before(async () => {

      db.connect(Databases['main']);

      await db.transact(
        [schemaUser, schemaThread, schemaPost, schemaVote].map(schema => {
          return [
            db.adapter.generateDropTableQuery(schema.name, true),
            db.adapter.generateCreateTableQuery(schema.name, schema.columns)
          ].join(';');
        }).join(';')
      );

      let users = [
        'Alpha',
        'Beta',
        'Gamma'
      ].map((username, i) => new User({
        username: username,
        skill: ['JavaScript', 'Python', 'Ruby'][i % 3]
      }));

      users = Instantiator.InstantORM.Core.ModelArray.from(users);

      users.forEach((user, i) => {

        let uid = i + 1;

        let threads = [
          'Hello, World',
          'I like turtles',
          'Upvote this pls'
        ].map((title) => new Thread({title: title, user_id: uid}));

        user.setJoined('threads', Instantiator.InstantORM.Core.ModelArray.from(threads));

        let posts = [];
        let votes = [];
        let n = 27;
        while (n--) {
          posts.push({user_id: uid, thread_id: n % 9, body: 'Random Post ' + String.fromCharCode(65 + n)});
          votes.push({user_id: uid, thread_id: n % 9, weight: [1, -1][n & 1]});
        }

        posts = posts.map(post => new Post(post));
        votes = votes.map(vote => new Vote(vote));

        user.setJoined('posts', Instantiator.InstantORM.Core.ModelArray.from(posts));
        user.setJoined('votes', Instantiator.InstantORM.Core.ModelArray.from(votes));


      });

      await users.saveAll();
      for (let i = 0; i < users.length; i++) {
        let user = users[i];
        await user.joined('threads').saveAll();
        await user.joined('posts').saveAll();
        await user.joined('votes').saveAll();
      }

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

    const GraphQuery = Instantiator.InstantORM.Core.GraphQuery;

    it ('should parse properly', () => {

      let queries = [
        'parent { id, name, age, children { id, name }, shirt }',
        'parent{id,name,age,children{id,name},shirt}',
        ' parent  { id , name , age , children { id , name } , shirt }',
        'parent(id: 20, name: 30) { id, name, age, children(name: "Suzanne") { id , name }, shirt }',
        'parent { id, name, age, shirt, children { id, name } }',
        'parent{id,name,age,shirt,children{id,name}}',
        ' parent  { id , name , age , shirt , children { id , name } }',
        'parent(id: 20, name: 30) { id, name, age, shirt, children(name: "Suzanne") { id , name } }'
      ];

      queries.forEach(query => {

        query = GraphQuery.parse(query);
        let structure = query.structure;

        expect(structure).to.have.ownProperty('parent');
        expect(structure.parent).to.contain('id', 'name', 'age', 'shirt');
        expect(structure.parent.filter(p => typeof p === 'object').pop()).to.have.ownProperty('children');
        expect(structure.parent.filter(p => typeof p === 'object').pop().children).to.contain('id', 'name');

      });

    });

    it('Should query users properly', async () => {

      let gq = new GraphQuery('users { id, username }', 0, User);
      let users = await gq.query();

      expect(users.length).to.equal(3);
      expect(users[0]).to.have.ownProperty('id');
      expect(users[0]).to.have.ownProperty('username');

    });

    it('Should query users properly, join threads', async () => {

      let gq = new GraphQuery('users { id, username, threads { id } }', 0, User);
      let users = await gq.query();

      expect(users.length).to.equal(3);
      expect(users[0]).to.have.ownProperty('id');
      expect(users[0]).to.have.ownProperty('username');
      expect(users[0]).to.have.ownProperty('threads');
      expect(users[0].threads[0]).to.have.ownProperty('id');

    });

    it('Should query users properly with where, join threads', async () => {

      let gq = new GraphQuery('users(id: 1) { id, username, threads { id } }', 0, User);
      let users = await gq.query();

      expect(users.length).to.equal(1);
      expect(users[0].id).to.equal(1);
      expect(users[0]).to.have.ownProperty('id');
      expect(users[0]).to.have.ownProperty('username');
      expect(users[0]).to.have.ownProperty('threads');
      expect(users[0].threads.length).to.equal(3);
      expect(users[0].threads[0]).to.have.ownProperty('id');

    });

    it('Should query users properly with where, join threads with where', async () => {

      let gq = new GraphQuery('users(id: 1) { id, username, threads(id: 2) { id } }', 0, User);
      let users = await gq.query();

      expect(users.length).to.equal(1);
      expect(users[0].id).to.equal(1);
      expect(users[0]).to.have.ownProperty('id');
      expect(users[0]).to.have.ownProperty('username');
      expect(users[0]).to.have.ownProperty('threads');
      expect(users[0].threads.length).to.equal(1);
      expect(users[0].threads[0]).to.have.ownProperty('id');
      expect(users[0].threads[0].id).to.equal(2);

    });

    it('Should query users properly with where, join threads with where, add posts', async () => {

      let gq = new GraphQuery(`
        users(id: 1) {
          id,
          username,
          threads(id: 2) {
            id,
            posts {
              body
            }
          },
          posts {
            body
          }
        }
      `, 0, User);
      let users = await gq.query();

      expect(users.length).to.equal(1);
      expect(users[0].id).to.equal(1);
      expect(users[0]).to.have.ownProperty('id');
      expect(users[0]).to.have.ownProperty('username');
      expect(users[0]).to.have.ownProperty('threads');
      expect(users[0]).to.have.ownProperty('posts');
      expect(users[0].threads.length).to.equal(1);
      expect(users[0].threads[0]).to.have.ownProperty('id');
      expect(users[0].threads[0]).to.have.ownProperty('posts');
      expect(users[0].threads[0].id).to.equal(2);
      expect(users[0].threads[0].posts.length).to.equal(9);
      expect(users[0].threads[0].posts[0]).to.have.ownProperty('body');
      expect(users[0].posts.length).to.equal(27);
      expect(users[0].posts[0]).to.have.ownProperty('body');

    });

    it('Should join in mutiple tables on joined table', async () => {

      let gq = new GraphQuery(`
        users {
          id,
          username,
          threads {
            id,
            posts,
            votes
          }
        }
      `, 0, User);
      let users = await gq.query();

      expect(users.length).to.equal(3);
      expect(users[0]).to.have.ownProperty('id');
      expect(users[0]).to.have.ownProperty('username');
      expect(users[0]).to.have.ownProperty('threads');
      expect(users[0].threads.length).to.equal(3);
      expect(users[0].threads[0]).to.have.ownProperty('id');
      expect(users[0].threads[0]).to.have.ownProperty('posts');
      expect(users[0].threads[0]).to.have.ownProperty('votes');
      expect(users[0].threads[0].posts.length).to.equal(9);
      expect(users[0].threads[0].votes.length).to.equal(9);

    });

  });

};
