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
      BlogComment.hides('embedding');

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

      const vectorMap = {};

      Instant.Vectors.setEngine(async (values) => {
        const embedding = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: values,
        });
        return embedding.data.map((entry, i) => {
          vectorMap[values[i]] = entry.embedding;
          return entry.embedding;
        });
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
      for (const blogComment of blogComments) {
        expect(blogComment.get('embedding')).to.deep.equal(vectorMap[blogComment.get('body')]);
      }

    });

    it('Should perform a vector search (cosine similarity) for related entries', async () => {

      const query = `i am having tons of fun!`;
      const expectedResults = [
        `I am extremely happy`,
        `I am feeling pretty good`,
        `I am so-so`,
        `I am feeling awful`,
        `I am in extreme distress`
      ];

      const BlogComment = Instant.Model('BlogComment');
      
      const blogComments = await BlogComment.query()
        .similarity('embedding', 'i am having tons of fun!')
        .select();

      expect(blogComments).to.exist;
      expect(blogComments.length).to.equal(5);
      blogComments.forEach((blogComment, i) => {
        expect(blogComment.get('body')).to.equal(expectedResults[i]);
      });

    });

    it('Should perform a vector search (dot product similarity) for related entries', async () => {

      const query = `i am having tons of fun!`;
      const expectedResults = [
        `I am extremely happy`,
        `I am feeling pretty good`,
        `I am so-so`,
        `I am feeling awful`,
        `I am in extreme distress`
      ];

      const BlogComment = Instant.Model('BlogComment');

      const blogComments = await BlogComment.query()
        .search('embedding', 'i am having tons of fun!')
        .select();

      expect(blogComments).to.exist;
      expect(blogComments.length).to.equal(5);
      blogComments.forEach((blogComment, i) => {
        expect(blogComment.get('body')).to.equal(expectedResults[i]);
      });

    });

    it('Should create many more vectorized entries (50 vectors, ~4 per batch)', async function () {

      this.timeout(10000);

      const BlogComment = Instant.Model('BlogComment');
      let existing = await BlogComment.query().select();
      await existing.destroyAll();

      const vectorMap = {};

      Instant.Vectors.maximumBatchSize = 1000;
      Instant.Vectors.setEngine(async (values) => {
        const embedding = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: values,
        });
        return embedding.data.map((entry, i) => {
          vectorMap[values[i]] = entry.embedding;
          return entry.embedding;
        });
      });

      const BlogCommentFactory = Instant.ModelFactory('BlogComment');
      let blogComments = await BlogCommentFactory.create(
        Array(50).fill(0).map((_, i) => {
          return {
            body: i + '_ ' + Array(50).fill(0).map(() => {
              return ['alpha', 'beta', 'gamma'][(Math.random() * 3) | 0]
            }).join(' ')}
        })
      );

      expect(blogComments).to.exist;
      expect(blogComments.length).to.equal(50);
      for (const blogComment of blogComments) {
        expect(blogComment.get('embedding')).to.deep.equal(vectorMap[blogComment.get('body')]);
      }

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
