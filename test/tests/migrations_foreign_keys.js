module.exports = (Instantiator, Databases) => {

  const expect = require('chai').expect;
  const fs = require('fs');
  const path = require('path');

  const Instant = Instantiator();
  // Instant.enableLogs(4);

  describe('InstantORM.Core.DB.MigrationManager (Foreign Keys)', async () => {

    before(async () => {
      await Instant.connect(Databases['main']);
      Instant.Migrator.enableDangerous();
      Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
    });

    after(async () => {
      Instant.Migrator.enableDangerous();
      Instant.Migrator.Dangerous.reset();
      await Instant.Migrator.Dangerous.annihilate();
      Instant.Migrator.disableDangerous();
      Instant.disconnect();
    });

    describe('Foreign Key management', async () => {

      it('should successfully create a foreign key', async () => {

        Instant.Migrator.enableDangerous();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );
        migrationA.addForeignKey('blog_posts', 'user_id', 'users', 'id');
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        await Instant.Migrator.Dangerous.migrate();

        expect(Instant.Schema.schema).to.haveOwnProperty('tables');
        expect(Instant.Schema.schema.tables).to.haveOwnProperty('blog_posts');
        expect(Instant.Schema.schema.tables.blog_posts).to.haveOwnProperty('columns');
        expect(Instant.Schema.schema.tables.blog_posts['columns']).to.be.an('array');
        expect(Instant.Schema.schema.tables.blog_posts['columns']).to.have.length(5);
        expect(Instant.Schema.schema.tables.blog_posts['columns'][0]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][0].name).to.equal('id');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][1]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][1].name).to.equal('title');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][2]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][2].name).to.equal('user_id');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][3]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][3].name).to.equal('created_at');
        expect(Instant.Schema.schema.tables.blog_posts['columns'][4]).to.exist;
        expect(Instant.Schema.schema.tables.blog_posts['columns'][4].name).to.equal('updated_at');
        expect(Instant.Schema.schema.foreign_keys).to.exist;
        expect(Instant.Schema.schema.foreign_keys).to.be.an('array');
        expect(Instant.Schema.schema.foreign_keys).to.have.length(1);
        expect(Instant.Schema.schema.foreign_keys[0]).to.exist;
        expect(Instant.Schema.schema.foreign_keys[0].table).to.equal('blog_posts');
        expect(Instant.Schema.schema.foreign_keys[0].column).to.equal('user_id');
        expect(Instant.Schema.schema.foreign_keys[0].parentTable).to.equal('users');
        expect(Instant.Schema.schema.foreign_keys[0].parentColumn).to.equal('id');

      });

      it('should successfully drop a foreign key', async () => {

        const migrationB = await Instant.Migrator.create(200);
        migrationB.dropForeignKey('blog_posts', 'user_id');
        Instant.Migrator.Dangerous.filesystem.write(migrationB);

        await Instant.Migrator.Dangerous.migrate();

        expect(Instant.Schema.schema.foreign_keys).to.exist;
        expect(Instant.Schema.schema.foreign_keys).to.be.an('array');
        expect(Instant.Schema.schema.foreign_keys).to.have.length(0);

      });

      it('should fail to create a foreign key when table invalid', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );

        let error;

        try {
          migrationA.addForeignKey('blog_postx', 'user_id', 'users', 'id');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.include('"blog_postx"');

      });

      it('should fail to create a foreign key when column invalid', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );

        let error;

        try {
          migrationA.addForeignKey('blog_posts', 'user_idx', 'users', 'id');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.include('"blog_posts"');
        expect(error.message).to.include('"user_idx"');

      });

      it('should fail to create a foreign key when parent table invalid', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );

        let error;

        try {
          migrationA.addForeignKey('blog_posts', 'user_id', 'userx', 'id');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.include('"userx"');

      });

      it('should fail to create a foreign key when parent column invalid', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );

        let error;

        try {
          migrationA.addForeignKey('blog_posts', 'user_id', 'users', 'idx');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.include('"users"');
        expect(error.message).to.include('"idx"');

      });

      it('should fail to create a foreign key with a circular reference', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );

        let error;

        try {
          migrationA.addForeignKey('blog_posts', 'user_id', 'users', 'id');
          migrationA.addForeignKey('users', 'id', 'blog_posts', 'user_id');
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.include('Foreign key circular reference');
        expect(error.message).to.satisfy(m => m.endsWith('\n"users"."id" -> "blog_posts"."user_id" -> "users"."id"'));

      });

    });

    describe('Foreign Key simple joins', async () => {

      it('should successfully join blog_posts to user', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'create_blog_posts');
        migrationA.createTable('users',[{name: 'username', type: 'string'}]);
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );
        migrationA.addForeignKey('blog_posts', 'user_id', 'users', 'id');
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        await Instant.Migrator.Dangerous.migrate();

        let User = Instant.Model('User');
        let BlogPost = Instant.Model('BlogPost');

        let userA = await User.create({username: 'Arnold'});
        let blogPostA = await BlogPost.create({title: 'Hello World!', user_id: userA.get('id')});
        let userB = await User.create({username: 'Bernard'});
        let blogPostB = await BlogPost.create({title: 'Goodbye Moon!', user_id: userB.get('id')});

        let user1 = await User.query()
          .join('blogPost')
          .first();

        expect(user1).to.exist;
        expect(user1.get('username')).to.equal('Arnold');
        expect(user1.joined('blogPost')).to.exist;
        expect(user1.joined('blogPost').get('title')).to.equal('Hello World!');

        let user2 = await User.query()
          .join('blogPost')
          .where({blogPost__title__icontains: 'moon'})
          .first();

        expect(user2).to.exist;
        expect(user2.get('username')).to.equal('Bernard');
        expect(user2.joined('blogPost')).to.exist;
        expect(user2.joined('blogPost').get('title')).to.equal('Goodbye Moon!');

      });

      it('should fail to destroy user when foreign_key is set', async () => {

        let User = Instant.Model('User');
        let user = await User.query()
          .join('blogPost')
          .first();

        let error;

        try {
          await user.destroy();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('violates foreign key constraint');

      });

      it('should succeed at destroying user when foreign_key is set with destroyCascade', async () => {

        let User = Instant.Model('User');
        let user = await User.query()
          .join('blogPost')
          .first();

        let userDeleted = await user.destroyCascade();

        expect(userDeleted).to.exist;

      });

    });

    describe('Foreign Key complex joins', async () => {

      let seed = [
        {
          accounts: [
            {email: 'bernard@test.com'},
            {email: 'kevin@test.com'}
          ]
        },
        {
          users: [
            {username: 'dancer', account_id: 1},
            {username: 'fireball', account_id: 2}
          ]
        },
        {
          blog_posts: [
            {title: 'So you think you can dance?', user_id: 1},
            {title: 'Do the robot dance', user_id: 1},
            {title: 'A friend in need is a friend indeed', user_id: 1},
            {title: 'New photography', user_id: 2},
            {title: 'Hoodies and shorts are great', user_id: 2}
          ]
        },
        {
          image_domains: [
            {url: 'domain.site'},
            {url: 'image.host'},
            {url: 'bentley.car'}
          ],
        },
        {
          images: [
            {filename: 'roy_kent.jpg', blog_post_id: 1, image_domain_url: 'domain.site'},
            {filename: 'disco.png', blog_post_id: 1, image_domain_url: 'image.host'},
            {filename: 'inferno.png', blog_post_id: 1, image_domain_url: 'image.host'},
            {filename: 'ted_lasso.jpg', blog_post_id: 2, image_domain_url: 'domain.site'},
            {filename: 'destructo.png', blog_post_id: 2, image_domain_url: 'bentley.car'},
            {filename: 'bender.png', blog_post_id: 2, image_domain_url: 'bentley.car'},
            {filename: 'dragon.jpg', blog_post_id: 3, image_domain_url: 'domain.site'},
            {filename: 'friends.png', blog_post_id: 3, image_domain_url: 'image.host'},
            {filename: 'enemies.png', blog_post_id: 3, image_domain_url: 'image.host'},
            {filename: 'butterflies.jpg', blog_post_id: 4, image_domain_url: 'domain.site'},
            {filename: 'sunset.png', blog_post_id: 4, image_domain_url: 'bentley.car'},
            {filename: 'reservoir.png', blog_post_id: 4, image_domain_url: 'bentley.car'},
            {filename: 'carhartt.jpg', blog_post_id: 5, image_domain_url: 'domain.site'},
            {filename: 'dickies.png', blog_post_id: 5, image_domain_url: 'image.host'},
            {filename: 'party.png', blog_post_id: 5, image_domain_url: 'image.host'}
          ]
        }
      ];

      it('should successfully migrate and seed', async () => {

        Instant.Migrator.enableDangerous();
        Instant.Migrator.Dangerous.reset();
        await Instant.Migrator.Dangerous.annihilate();
        await Instant.Migrator.Dangerous.prepare();
        await Instant.Migrator.Dangerous.initialize();

        const migrationA = await Instant.Migrator.create(100, 'all_the_things');
        migrationA.createTable(
          'accounts',
          [
            {name: 'email', type: 'string'}
          ]
        );
        migrationA.createTable(
          'users',
          [
            {name: 'username', type: 'string'},
            {name: 'account_id', type: 'int'}
          ]
        );
        migrationA.createTable(
          'blog_posts',
          [
            {name: 'title', type: 'string'},
            {name: 'user_id', type: 'int'}
          ]
        );
        migrationA.createTable(
          'images',
          [
            {name: 'filename', type: 'string'},
            {name: 'blog_post_id', type: 'int'},
            {name: 'image_domain_url', type: 'string'}
          ]
        );
        migrationA.createTable(
          'image_domains',
          [
            {name: 'url', type: 'string', properties: {unique: true}}
          ]
        );
        migrationA.addForeignKey('users', 'account_id', 'accounts', 'id');
        migrationA.addForeignKey('blog_posts', 'user_id', 'users', 'id', {multiple: true});
        migrationA.addForeignKey('images', 'blog_post_id', 'blog_posts', 'id', {multiple: true});
        migrationA.addForeignKey('images', 'image_domain_url', 'image_domains', 'url',  {multiple: true});
        Instant.Migrator.Dangerous.filesystem.write(migrationA);

        await Instant.Migrator.Dangerous.migrate();
        await Instant.Migrator.Dangerous.seed(seed);

        let Account = Instant.Model('Account');
        let User = Instant.Model('User');
        let BlogPost = Instant.Model('BlogPost');
        let ImageDomain = Instant.Model('ImageDomain');
        let Image = Instant.Model('Image');

        let accounts = await Account.query().end();
        let users = await User.query().end();
        let blogPosts = await BlogPost.query().end();
        let imageDomains = await ImageDomain.query().end();
        let images = await Image.query().end();

        expect(accounts.length).to.equal(2);
        expect(users.length).to.equal(2);
        expect(blogPosts.length).to.equal(5);
        expect(imageDomains.length).to.equal(3);
        expect(images.length).to.equal(15);

      });

      it('should successfully join user to account and query by joined element', async () => {

        let Account = Instant.Model('Account');
        let accounts = await Account.query()
          .join('user')
          .where({user__username: 'fireball'})
          .end();

        expect(accounts.length).to.equal(1);
        expect(accounts[0].get('email')).to.equal('kevin@test.com');
        expect(accounts[0].joined('user')).to.exist;
        expect(accounts[0].joined('user').get('username')).to.equal('fireball');

      });

      it('should successfully join blogPost to user and user to account and query by 2nd joined element', async () => {

        let Account = Instant.Model('Account');
        let accounts = await Account.query()
          .join('user')
          .join('user__blogPosts')
          .where({user__blogPosts__title__contains: 'photography'})
          .end();

        expect(accounts.length).to.equal(1);
        expect(accounts[0].get('email')).to.equal('kevin@test.com');
        expect(accounts[0].joined('user')).to.exist;
        expect(accounts[0].joined('user').get('username')).to.equal('fireball');
        expect(accounts[0].joined('user').joined('blogPosts')).to.exist;
        expect(accounts[0].joined('user').joined('blogPosts')).to.have.length(2);

      });

      it('should successfully join 2 layers, but join with restriction', async () => {

        let Account = Instant.Model('Account');
        let accounts = await Account.query()
          .join('user')
          .join('user__blogPosts', {title__contains: 'dance'})
          .where({user__blogPosts__title__contains: 'robot dance'})
          .end();

        expect(accounts.length).to.equal(1);
        expect(accounts[0].get('email')).to.equal('bernard@test.com');
        expect(accounts[0].joined('user')).to.exist;
        expect(accounts[0].joined('user').get('username')).to.equal('dancer');
        expect(accounts[0].joined('user').joined('blogPosts')).to.exist;
        expect(accounts[0].joined('user').joined('blogPosts')).to.have.length(2);

      });

      it('should successfully join all layers', async () => {

        let Account = Instant.Model('Account');
        let accounts = await Account.query()
          .join('user')
          .join('user__blogPosts')
          .join('user__blogPosts__images')
          .join('user__blogPosts__images__imageDomain')
          .orderBy('email', 'DESC')
          .end();

        expect(accounts.length).to.equal(2);
        expect(accounts[1].get('email')).to.equal('bernard@test.com');
        expect(accounts[1].joined('user')).to.exist;
        expect(accounts[1].joined('user').get('username')).to.equal('dancer');
        expect(accounts[1].joined('user').joined('blogPosts')).to.exist;
        expect(accounts[1].joined('user').joined('blogPosts')).to.have.length(3);
        expect(accounts[1].joined('user').joined('blogPosts')[0].joined('images')).to.exist;
        expect(accounts[1].joined('user').joined('blogPosts')[0].joined('images')).to.have.length(3);
        expect(accounts[1].joined('user').joined('blogPosts')[0].joined('images')[0].joined('imageDomain')).to.exist;
        expect(accounts[1].joined('user').joined('blogPosts')[0].joined('images')[0].joined('imageDomain').get('url')).to.equal(
          accounts[0].joined('user').joined('blogPosts')[0].joined('images')[0].get('image_domain_url')
        );

      });

      it('should successfully join all layers shorthand', async () => {

        let Account = Instant.Model('Account');
        let accounts = await Account.query()
          .join('user__blogPosts__images__imageDomain')
          .orderBy('email', 'DESC')
          .end();

        expect(accounts.length).to.equal(2);
        expect(accounts[1].get('email')).to.equal('bernard@test.com');
        expect(accounts[1].joined('user')).to.exist;
        expect(accounts[1].joined('user').get('username')).to.equal('dancer');
        expect(accounts[1].joined('user').joined('blogPosts')).to.exist;
        expect(accounts[1].joined('user').joined('blogPosts')).to.have.length(3);
        expect(accounts[1].joined('user').joined('blogPosts')[0].joined('images')).to.exist;
        expect(accounts[1].joined('user').joined('blogPosts')[0].joined('images')).to.have.length(3);
        expect(accounts[1].joined('user').joined('blogPosts')[0].joined('images')[0].joined('imageDomain')).to.exist;
        expect(accounts[1].joined('user').joined('blogPosts')[0].joined('images')[0].joined('imageDomain').get('url')).to.equal(
          accounts[0].joined('user').joined('blogPosts')[0].joined('images')[0].get('image_domain_url')
        );

      });

      it('should fail to delete an Account based on foreign key constraints', async () => {

        let Account = Instant.Model('Account');
        let account = await Account.query()
          .orderBy('email', 'ASC')
          .first();

        expect(account).to.exist;
        expect(account.get('email')).to.equal('bernard@test.com');

        let error;

        try {
          await account.destroy();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('violates foreign key constraint');
        expect(error.message).to.contain('"accounts"');
        expect(error.message).to.contain('"users"');

      });

      it('should fail to delete an ImageDomain based on foreign key constraints', async () => {

        let ImageDomain = Instant.Model('ImageDomain');
        let imageDomain = await ImageDomain.query()
          .orderBy('url', 'ASC')
          .first();

        expect(imageDomain).to.exist;
        expect(imageDomain.get('url')).to.equal('bentley.car');

        let error;

        try {
          await imageDomain.destroy();
        } catch (e) {
          error = e;
        }

        expect(error).to.exist;
        expect(error.message).to.contain('violates foreign key constraint');
        expect(error.message).to.contain('"image_domains"');
        expect(error.message).to.contain('"images"');

      });

      it('should succeed at account.destroyCascade', async () => {

        let Account = Instant.Model('Account');
        let account = await Account.query()
          .orderBy('email', 'ASC')
          .first();

        expect(account).to.exist;
        expect(account.get('email')).to.equal('bernard@test.com');

        let accountResult = await account.destroyCascade();

        expect(accountResult).to.exist;

        let User = Instant.Model('User');
        let BlogPost = Instant.Model('BlogPost');
        let ImageDomain = Instant.Model('ImageDomain');
        let Image = Instant.Model('Image');

        let accounts = await Account.query().end();
        let users = await User.query().end();
        let blogPosts = await BlogPost.query().end();
        let imageDomains = await ImageDomain.query().end();
        let images = await Image.query().end();

        expect(accounts.length).to.equal(1);
        expect(users.length).to.equal(1);
        expect(blogPosts.length).to.equal(2);
        expect(imageDomains.length).to.equal(3);
        expect(images.length).to.equal(6);

      });

    });

  });

};
