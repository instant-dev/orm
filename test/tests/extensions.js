const fs = require('fs');
const OpenAI = require('openai');

module.exports = (InstantORM, Databases) => {

  const expect = require('chai').expect;

  const Instant = new InstantORM();
  const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
  // Instant.enableLogs(4);

  describe('InstantORM.Core.DB.Database Extensions', async () => {

    before(async () => {
      await Instant.disconnect();
      await Instant.connect(Databases['main'], null);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.disableExtension('vector');
      Instant.Migrator.Dangerous.filesystem.clear();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      await Instant.disconnect();
    });

    after(async () => {
      await Instant.disconnect();
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      await Instant.Migrator.Dangerous.disableExtension('vector');
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      await Instant.disconnect();
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
          {name: 'title', type: 'string'},
          {name: 'body', type: 'string'},
          {name: 'embedding', type: 'vector', properties: {length: 1536}}
        ]
      );

      await Instant.Migrator.Dangerous.commit(migration);

      expect(migration.toJSON().name).to.equal('my_first_migration');

      expect(Instant.Model('BlogComment')).to.exist;
      expect(Instant.Model('BlogComment').columnNames()).to.deep.equal(['id', 'title', 'body', 'embedding', 'created_at', 'updated_at']);
      expect(Instant.Model('BlogComment').columnLookup()['embedding'].type).to.equal('vector');
      expect(Instant.Model('BlogComment').columnLookup()['embedding'].properties.length).to.equal(1536);

    });

    it('Should fail to vectorize the body field on BlogComment without vector engine', async () => {

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
      let error;

      try {
        const blogComment = await BlogComment.create({body: testPhrase});
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.contain('Could not vectorize: vector engine did not return a valid vector for input "I am extremely happy"');

    });

    it('Should succeed at vectorizing the body field on BlogComment when vector engine is set properly', async function () {

      this.timeout(5000);

      const testPhrase = `I am extremely happy`;
      let testVector;

      Instant.Vectors.setEngine(async (values) => {
        const embedding = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: values,
        });
        const vectors = embedding.data.map((entry, i) => {
          let embedding = entry.embedding.map(v => v || 0); // +0 / -0 issue...
          if (values[i] === testPhrase) {
            testVector = embedding;
          }
          return embedding;
        });
        return vectors;
      });
      
      const BlogComment = Instant.Model('BlogComment');
      const blogComment = await BlogComment.create({body: testPhrase});

      expect(blogComment.get('body')).to.equal(testPhrase);
      expect(blogComment.get('embedding')).to.deep.equal(testVector);

    });

    it('Should not change vector if a field not related to the vector is changed', async () => {
      
      const BlogComment = Instant.Model('BlogComment');
      const blogComment = await BlogComment.query().first();

      const embedding = blogComment.get('embedding');
      blogComment.set('title', 'Some other title');
      await blogComment.save();
      
      expect(blogComment.get('embedding')).to.deep.equal(embedding);

    });

    it('Should change vector if a field related to the vector is changed', async function () {

      this.timeout(5000);
      
      const BlogComment = Instant.Model('BlogComment');
      const blogComment = await BlogComment.query().first();

      const embedding = blogComment.get('embedding');
      blogComment.set('body', 'I am extremely happy!');
      await blogComment.save();
      
      expect(blogComment.get('embedding')).to.not.deep.equal(embedding);

    });

    it('Should create more vectorized entries', async function () {

      this.timeout(5000);

      const vectorMap = {};

      Instant.Vectors.setEngine(async (values) => {
        const embedding = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: values,
        });
        return embedding.data.map((entry, i) => {
          vectorMap[values[i]] = entry.embedding.map(v => v || 0); // +0 / -0 issue...
          return vectorMap[values[i]];
        });
      });

      const BlogCommentFactory = Instant.ModelFactory('BlogComment');
      let blogComments = await BlogCommentFactory.create([
        {title: `title1`, body: `I am feeling awful`},
        {title: `title1`, body: `I am in extreme distress`},
        {title: `title2`, body: `I am feeling pretty good`},
        {title: `title3`, body: `I am feeling alright`}
      ]);

      expect(blogComments).to.exist;
      expect(blogComments.length).to.equal(4);
      for (const blogComment of blogComments) {
        expect(blogComment.get('embedding')).to.deep.equal(vectorMap[blogComment.get('body')]);
      }

    });

    it('Should perform a vector search (cosine similarity) for related entries', async function () {

      this.timeout(5000);

      // Instant.enableLogs(4);

      const query = `i am having tons of fun!`;
      const expectedResults = [
        `I am extremely happy!`,
        `I am feeling pretty good`,
        `I am feeling alright`,
        `I am feeling awful`,
        `I am in extreme distress`
      ];

      const BlogComment = Instant.Model('BlogComment');
      
      const blogComments = await BlogComment.query()
        .similarity('embedding', query)
        .select();
      
      expect(blogComments).to.exist;
      expect(blogComments.length).to.equal(5);
      blogComments.forEach((blogComment, i) => {
        expect(blogComment.get('body')).to.equal(expectedResults[i]);
        expect(blogComment.getMetafield('embedding_similarity')).to.exist;
        expect(blogComment.getMetafield('embedding_similarity')).to.be.greaterThan(0.2);
        let json = blogComment.toJSON();
        expect(json['_metafields']).to.exist;
        expect(json['_metafields']['embedding_similarity']).to.equal(blogComment.getMetafield('embedding_similarity'));
      });

    });

    it('Should perform a vector search (dot product similarity) for related entries', async function () {

      this.timeout(5000);

      const query = `i am having tons of fun!`;
      const expectedResults = [
        `I am extremely happy!`,
        `I am feeling pretty good`,
        `I am feeling alright`,
        `I am feeling awful`,
        `I am in extreme distress`
      ];

      const BlogComment = Instant.Model('BlogComment');

      const blogComments = await BlogComment.query()
        .search('embedding', query)
        .select();

      expect(blogComments).to.exist;
      expect(blogComments.length).to.equal(5);
      blogComments.forEach((blogComment, i) => {
        expect(blogComment.get('body')).to.equal(expectedResults[i]);
        expect(blogComment.getMetafield('embedding_product')).to.exist;
        expect(blogComment.getMetafield('embedding_product')).to.be.greaterThan(0.2);
        let json = blogComment.toJSON();
        expect(json['_metafields']).to.exist;
        expect(json['_metafields']['embedding_product']).to.equal(blogComment.getMetafield('embedding_product'));
      });

    });

    it('Should perform two-way classification on vectors', async function () {

      this.timeout(5000);

      const clusters = ['positive', 'negative'];
      const expectedResults = {
        'I am extremely happy!': 'positive',
        'I am feeling pretty good': 'positive',
        'I am feeling alright': 'positive',
        'I am feeling awful': 'negative',
        'I am in extreme distress': 'negative'
      };

      const BlogComment = Instant.Model('BlogComment');

      const blogComments = await BlogComment.query()
        .classify('embedding', clusters)
        .select();

      expect(blogComments).to.exist;
      expect(blogComments.length).to.equal(5);
      blogComments.forEach((blogComment, i) => {
        let json = blogComment.toJSON();
        expect(blogComment.getMetafield('embedding_classification')).to.exist;
        expect(blogComment.getMetafield('embedding_classification').value).to.equal(expectedResults[blogComment.get('body')]);
        expect(json['_metafields']).to.exist;
        expect(json['_metafields']['embedding_classification'].value).to.equal(blogComment.getMetafield('embedding_classification').value);
        expect(json['_metafields']['embedding_classification'].similarity['positive']).to.exist;
        expect(json['_metafields']['embedding_classification'].similarity['negative']).to.exist;
      });

    });

    it('Should perform three-way classification on vectors', async function () {

      this.timeout(5000);

      const clusters = ['positive', 'neutral', 'negative'];
      const expectedResults = {
        'I am extremely happy!': 'positive',
        'I am feeling pretty good': 'positive',
        'I am feeling alright': 'neutral',
        'I am feeling awful': 'negative',
        'I am in extreme distress': 'negative'
      };

      const BlogComment = Instant.Model('BlogComment');

      const blogComments = await BlogComment.query()
        .classify('embedding', clusters)
        .select();

      expect(blogComments).to.exist;
      expect(blogComments.length).to.equal(5);
      blogComments.forEach((blogComment, i) => {
        let json = blogComment.toJSON();
        expect(blogComment.getMetafield('embedding_classification')).to.exist;
        expect(blogComment.getMetafield('embedding_classification').value).to.equal(expectedResults[blogComment.get('body')]);
        expect(json['_metafields']).to.exist;
        expect(json['_metafields']['embedding_classification'].value).to.equal(blogComment.getMetafield('embedding_classification').value);
        expect(json['_metafields']['embedding_classification'].similarity['positive']).to.exist;
        expect(json['_metafields']['embedding_classification'].similarity['negative']).to.exist;
        expect(json['_metafields']['embedding_classification'].similarity['neutral']).to.exist;
      });

    });

    it('Should perform a vector search on a subset of entries', async function () {

      this.timeout(5000);

      // Instant.enableLogs(4);

      const query = `i am having tons of fun!`;
      const expectedResults = [
        `I am feeling awful`,
        `I am in extreme distress`
      ];

      const BlogComment = Instant.Model('BlogComment');
      
      const blogComments = await BlogComment.query()
        .where({title: 'title1'})
        .similarity('embedding', query)
        .select();
      
      expect(blogComments).to.exist;
      expect(blogComments.length).to.equal(2);
      blogComments.forEach((blogComment, i) => {
        expect(blogComment.get('body')).to.equal(expectedResults[i]);
        expect(blogComment.getMetafield('embedding_similarity')).to.exist;
        expect(blogComment.getMetafield('embedding_similarity')).to.be.greaterThan(0.2);
        let json = blogComment.toJSON();
        expect(json['_metafields']).to.exist;
        expect(json['_metafields']['embedding_similarity']).to.equal(blogComment.getMetafield('embedding_similarity'));
      });

    });

    it('Should succeed at setting empty body and not create a vector entry', async () => {
      
      const BlogComment = Instant.Model('BlogComment');
      let blogComment;
      let error;

      try {
        blogComment = await BlogComment.create({});
      } catch (e) {
        error = e;
      }

      expect(error).to.not.exist;
      expect(blogComment).to.exist;
      expect(blogComment.get('embedding')).to.equal(null);

    });

    it('Should make vector engine defunct again', async () => {

      Instant.Vectors.setEngine(async (values) => {
        // do nothing
      });
      
      let error;

      try {
        await Instant.Vectors.create(`I am extremely happy`);
      } catch (e) {
        error = e;
      }

      expect(error).to.exist;
      expect(error.message).to.contain('Could not vectorize: vector engine did not return a valid vector for input "I am extremely happy"');

    });

    it ('Should set vector engine via plugin', async function () {

      this.timeout(5000);

      await Instant.disconnect();
      Instant.Plugins.__createDirectory__();

      let filename = Instant.Plugins.pathname(`000_set_vector_engine.mjs`);
      const filedata = [
        `import OpenAI from 'openai';`,
        `const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});`,
        ``,
        `export const plugin = async (Instant) => {`,
        `  Instant.Vectors.setEngine(async (values) => {`,
        `    const embedding = await openai.embeddings.create({`,
        `      model: 'text-embedding-3-small',`,
        `      input: values,`,
        `    });`,
        `    return embedding.data.map((entry, i) => entry.embedding);`,
        `  });`,
        `};`
      ].join('\n');

      // write file
      fs.writeFileSync(filename, filedata);

      await Instant.connect(Databases['main'], null);
      const vector = await Instant.Vectors.create(`I am extremely happy`);

      expect(vector.length).to.equal(1536);

      // cleanup
      fs.unlinkSync(filename);
      
    });

    it('Should fail to disable "vector" extension when there are dependencies', async () => {

      Instant.Migrator.enableDangerous();

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
