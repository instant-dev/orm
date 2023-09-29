const OpenAI = require('openai');
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

module.exports = (InstantORM, Databases) => {

  const expect = require('chai').expect;

  const Instant = new InstantORM();
  // Instant.enableLogs(4);

  describe('InstantORM.Core.DB.Database Extensions', async () => {

    before(async () => {
      Instant.disconnect();
      await Instant.connect(Databases['main'], null);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.disableExtension('vector');
      Instant.Migrator.Dangerous.filesystem.clear();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    after(async () => {
      Instant.disconnect();
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.disableExtension('vector');
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    it('Should find available extensions', async () => {

      await Instant.connect(Databases['main'], null);
      Instant.Migrator.enableDangerous();
      const extensions = await Instant.Migrator.Dangerous.listExtensions();

      expect(extensions).to.exist;
      expect(extensions).to.be.an('array');
     
    });

    it('Should find "vector" extension disabled', async () => {

      const extension = await Instant.Migrator.Dangerous.getExtension('vector');

      expect(extension).to.exist;
      expect(extension.name).to.equal('vector');
      expect(extension.installed_version).to.equal(null);
     
    });

    it('Should enable "vector" extension', async () => {

      const extension = await Instant.Migrator.Dangerous.enableExtension('vector');

      expect(extension).to.exist;
      expect(extension.name).to.equal('vector');
      expect(extension.installed_version).to.not.equal(null);
      expect(extension.installed_version).to.equal(extension.default_version);
     
    });

    it('Should find "vector" extension', async () => {

      const extension = await Instant.Migrator.Dangerous.getExtension('vector');

      expect(extension).to.exist;
      expect(extension.name).to.equal('vector');
      expect(extension.installed_version).to.not.equal(null);
      expect(extension.installed_version).to.equal(extension.default_version);
     
    });


    it('should fail to create when vector not provided a length value', async () => {

      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.prepare();
      await Instant.Migrator.Dangerous.initialize();
      const migration = await Instant.Migrator.create();

      let error;

      try {
        await migration.createTable('blog_comments', [{name: 'embedding', type: 'vector'}]);
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.contain('Invalid column["properties"]["length"] for column type "vector": must be an integer greater than 0');

    });

    it('Should create a table with a vector embedding', async () => {
      
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.prepare();
      await Instant.Migrator.Dangerous.initialize();
      const migration = await Instant.Migrator.create(null, 'my_first_migration');

      await migration.createTable(
        'blog_comments',
        [
          {name: 'body', type: 'string'},
          {name: 'embedding', type: 'vector', properties: {length: 1536}}
        ]
      );

      await Instant.Migrator.Dangerous.commit(migration);

      expect(migration.toJSON().name).to.equal('my_first_migration');

      expect(Instant.Model('BlogComment')).to.exist;
      expect(Instant.Model('BlogComment').columnNames()).to.deep.equal(['id', 'body', 'embedding', 'created_at', 'updated_at']);
      expect(Instant.Model('BlogComment').columnLookup()['embedding'].type).to.equal('vector');
      expect(Instant.Model('BlogComment').columnLookup()['embedding'].properties.length).to.equal(1536);

    });

    it('Should fail to vectorize the body field on BlogComment without vectorizer', async () => {

      const testPhrase = `I am extremely happy`;

      const BlogComment = Instant.Model('BlogComment');
      BlogComment.vectorizes('embedding', body => body);

      let error;

      try {
        const blogComment = await BlogComment.create({body: testPhrase});
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.contain('Could not vectorize: no vector engine has been set');

    });

    it('Should fail to vectorize the body field on BlogComment with a bad vector engine', async () => {

      const testPhrase = `I am extremely happy`;

      Instant.Vectors.setEngine(async (values) => {
        // do nothing
      });
      
      const BlogComment = Instant.Model('BlogComment');

      try {
        const blogComment = await BlogComment.create({body: testPhrase});
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.contain('Could not vectorize: vector engine did not return a valid vector for input "I am extremely happy"');

    });

    it('Should succeed at vectorizing the body field on BlogComment when vector engine is set properly', async () => {

      const testPhrase = `I am extremely happy`;
      let testVector;

      Instant.Vectors.setEngine(async (values) => {
        const embedding = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: values,
        });
        const vectors = embedding.data.map((entry, i) => {
          if (values[i] === testPhrase) {
            testVector = entry.embedding;
          }
          return entry.embedding;
        });
        return vectors;
      });
      
      const BlogComment = Instant.Model('BlogComment');
      const blogComment = await BlogComment.create({body: testPhrase});

      expect(blogComment.get('body')).to.equal(testPhrase);
      expect(blogComment.get('embedding')).to.deep.equal(testVector);

    });

    it('Should create more vectorized entries', async () => {

      Instant.Vectors.setEngine(async (values) => {
        const embedding = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: values,
        });
        return embedding.data.map(entry => entry.embedding);
      });

      const BlogCommentFactory = Instant.ModelFactory('BlogComment');
      let blogComments = await BlogCommentFactory.create([
        {body: `I am feeling awful`},
        {body: `I am in extreme distress`},
        {body: `I am feeling pretty good`},
        {body: `I am so-so`}
      ]);

      expect(blogComments).to.exist;
      expect(blogComments.length).to.equal(4);

    });

    it('Should fail to disable "vector" extension when there are dependencies', async () => {

      let extension;
      let error;
      
      try {
        extension = await Instant.Migrator.Dangerous.disableExtension('vector');
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.contain('cannot drop extension vector because other objects depend on it');
     
    });

    it('Should disable "vector" extension once table dropped', async () => {

      await Instant.database().query(`DROP TABLE blog_comments`, []);

      const extension = await Instant.Migrator.Dangerous.disableExtension('vector');

      expect(extension).to.exist;
      expect(extension.name).to.equal('vector');
      expect(extension.installed_version).to.equal(null);
     
    });

  });

};
