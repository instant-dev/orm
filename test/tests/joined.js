module.exports = (InstantORM, Databases) => {

  const expect = require('chai').expect;

  const Instant = new InstantORM();

  describe('InstantORM.Core.DB.Composer (joined)', async () => {

    let db = new InstantORM.Core.DB.Database();

    let schemaUser = {
      name: 'users',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'username', type: 'string'},
        {name: 'organization_location_id', type: 'int'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let schemaMembership = {
      name: 'memberships',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'user_id', type: 'int'},
        {name: 'organization_id', type: 'int'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    let schemaOrganizationLocations = {
      name: 'organization_locations',
      columns: [
        {name: 'id', type: 'serial'},
        {name: 'organization_id', type: 'int'},
        {name: 'organization_authorization_access_code', type: 'string'},
        {name: 'location', type: 'string'},
        {name: 'created_at', type: 'datetime'},
        {name: 'updated_at', type: 'datetime'}
      ]
    };

    class User extends InstantORM.Core.Model {}

    User.setDatabase(db);
    User.setTableSchema(schemaUser);

    class Membership extends InstantORM.Core.Model {}

    Membership.setDatabase(db);
    Membership.setTableSchema(schemaMembership);
    Membership.joinsTo(User, {multiple: true, as: 'memberships'});
    Membership.joinsTo(User, {multiple: true, via: 'organization_id', name: 'organization', as: 'members'});

    class OrganizationLocations extends InstantORM.Core.Model {}

    OrganizationLocations.setDatabase(db);
    OrganizationLocations.setTableSchema(schemaOrganizationLocations);
    OrganizationLocations.joinsTo(User, {multiple: true, via: 'organization_id', name: 'organization', as: 'organizationLocations'});

    User.joinsTo(OrganizationLocations, {multiple: true, via: 'organization_location_id', name: 'organizationLocation', as: 'engineeringStaffMembers'});

    before(async () => {

      await db.connect(Databases['main']);

      await db.transact(
        [schemaUser, schemaMembership, schemaOrganizationLocations].map(schema => {
          return [
            db.adapter.generateDropTableQuery(schema.name, true),
            db.adapter.generateCreateTableQuery(schema.name, schema.columns)
          ].join(';');
        }).join(';')
      );

      let users = InstantORM.Core.ModelArray.from([
        new User({username: 'francis'}),
        new User({username: 'felicia'}),
        new User({username: 'gregory'}),
        new User({username: 'georgia'}),
        new User({username: 'gilliam'}),
        new User({username: 'facebook'}),
        new User({username: 'google'}),
        new User({username: 'sergey', organization_location_id: 1}),
      ]);

      let memberships = InstantORM.Core.ModelArray.from([
        new Membership({user_id: 1, organization_id: 6}),
        new Membership({user_id: 2, organization_id: 6}),
        new Membership({user_id: 3, organization_id: 7}),
        new Membership({user_id: 4, organization_id: 7}),
        new Membership({user_id: 5, organization_id: 7})
      ]);

      let organizationLocations = InstantORM.Core.ModelArray.from([
        new OrganizationLocations({organization_id: 7, organization_authorization_access_code: 'secret_password', location: 'Mountain View'})
      ]);

      await users.saveAll();
      await memberships.saveAll();
      await organizationLocations.saveAll();

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

    it('Should query all users (8)', async () => {

      let users = await User.query()
        .select();

      expect(users).to.be.an.instanceOf(InstantORM.Core.ModelArray);
      expect(users.length).to.equal(8);

    });

    it('Should find Georgia as a member of Google', async () => {

      let memberships = await Membership.query()
        .join('user')
        .join('organization')
        .where({
          user__username: 'georgia',
          organization__username: 'google'
        })
        .select();

      expect(memberships).to.be.an.instanceOf(InstantORM.Core.ModelArray);
      expect(memberships.length).to.equal(1);
      expect(memberships[0].joined('user').get('username')).to.equal('georgia');
      expect(memberships[0].joined('organization').get('username')).to.equal('google');

    });

    it('Should truncate joined model names when querying', async () => {

      let users = await User.query()
        .join('memberships')
        .join('memberships__organization')
        .join('memberships__organization__organizationLocations')
        .join('memberships__organization__organizationLocations__engineeringStaffMembers')
        .where({
          username: 'georgia',
          memberships__organization__username: 'google'
        })
        .select();

      expect(users).to.be.an.instanceOf(InstantORM.Core.ModelArray);
      expect(users.length).to.equal(1);
      expect(users[0].joined('memberships').length).to.equal(1);
      expect(users[0].joined('memberships')[0].joined('organization').get('username')).to.equal('google');
      let hq = users[0].joined('memberships')[0].joined('organization').joined('organizationLocations')[0];
      expect(hq).to.exist;
      expect(hq.get('location')).to.equal('Mountain View');
      expect(hq.get('organization_authorization_access_code')).to.equal('secret_password');
      expect(hq.joined('engineeringStaffMembers').length).to.equal(1);
      expect(hq.joined('engineeringStaffMembers')[0].get('username')).to.equal('sergey');

    });

    it('Should filter comparisons in nested join statements properly', async () => {

      let organizations = await User.query()
        .join('members')
        .join('members__user', {username: 'georgia'}, {username: 'gregory'})
        .where({username: 'google'})
        .select();

      expect(organizations).to.be.an.instanceOf(InstantORM.Core.ModelArray);
      expect(organizations.length).to.equal(1);
      expect(organizations[0].joined('members').length).to.equal(3);
      expect(organizations[0].joined('members').find((member) => {
        return member.joined('user') && member.joined('user').get('username') === 'georgia';
      })).to.exist;
      expect(organizations[0].joined('members').find((member) => {
        return member.joined('user') && member.joined('user').get('username') === 'gregory';
      })).to.exist;
      expect(organizations[0].joined('members').find((member) => {
        return member.joined('user') && member.joined('user').get('username') === 'gilliam';
      })).to.not.exist;

    });

    it('Should filter on comparisons containing joined fields within join statements properly', async () => {

      let organizations = await User.query()
        .join('members', {user__username: 'georgia'}, {user__username: 'gilliam'})
        .join('members__user')
        .where({username: 'google'})
        .select();

      expect(organizations).to.be.an.instanceOf(InstantORM.Core.ModelArray);
      expect(organizations.length).to.equal(1);
      expect(organizations[0].joined('members').length).to.equal(2);
      expect(organizations[0].joined('members').find((member) => {
        return member.joined('user') && member.joined('user').get('username') === 'georgia';
      })).to.exist;
      expect(organizations[0].joined('members').find((member) => {
        return member.joined('user') && member.joined('user').get('username') === 'gilliam';
      })).to.exist;

    });

  });

};
