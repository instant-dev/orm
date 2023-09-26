# Instant ORM
![npm version](https://img.shields.io/npm/v/@instant.dev/orm?label=) ![Build Status](https://app.travis-ci.com/instant-dev/orm.svg?branch=main)

## JavaScript ORM for Postgres

This is the core ORM package for [**`instant.dev`**](https://github.com/instant-dev/instant).
It is recommended that you use it with the `instant` command line utility
available at [instant-dev/instant](https://github.com/instant-dev/instant) for
easy migration management, **however, it can be used as a standalone ORM**. By
default, upon connecting to a database, the Instant ORM will introspect your
Database schema and determine appropriate models and relationships.

## Table of Contents

1. [Getting Started](#getting-started)
1. [Connecting to a Database](#connecting-to-a-database)
   1. [Connecting to another Database](#connecting-to-another-database)
   1. [Querying your databases directly](#querying-your-databases-directly)
   1. [Disconnecting](#disconnecting)
1. [Loading a Schema](#loading-a-schema)
1. [Loading custom Model logic](#loading-custom-model-logic)
1. [Using Models](#using-models)
   1. [CRUD operations](#crud-operations)
      1. [Create](#create)
      1. [Read](#read)
      1. [Update](#update)
         1. [Incrementing values and custom SQL](#incrementing-values-and-custom-sql)
      1. [Destroy](#destroy)
   1. [Query composition](#query-composition)
      1. [Composer instance methods](#composer-instance-methods)
         1. [Composer#safeWhere](#composer-safewhere)
         1. [Composer#safeJoin](#composer-safejoin)
         1. [Composer#where](#composer-where)
            1. [Custom SQL](#custom-sql)
         1. [Composer#join](#composer-join)
            1. [One-to-many](#one-to-many)
            1. [One-to-one](#one-to-one)
            1. [Naming conventions](#naming-conventions)
         1. [Composer#orderBy](#composer-orderby)
         1. [Composer#limit](#composer-limit)
         1. [Composer#groupBy](#composer-groupby)
         1. [Composer#aggregate](#composer-aggregate)
   1. [Transactions](#transactions)
   1. [Input validation](#input-validation)
   1. [Relationship verification](#relationship-verification)
   1. [Calculated and hidden fields](#calculated-and-hidden-fields)
   1. [Lifecycle callbacks](#lifecycle-callbacks)
1. [Using Migrations, Seeding and Code Generation](#using-migrations-seeding-and-code-generation)
1. [Acknowledgements](#acknowledgements)

## Getting Started

Installing the Instant ORM:

```shell
npm i @instant.dev/orm@latest --save
```

Initializing (CommonJS):

```javascript
const InstantORM = require('@instant.dev/orm');
const Instant = new InstantORM();
```

Initializing (ESM):

```javascript
import InstantORM from '@instant.dev/orm';
const Instant = new InstantORM();
```

## Connecting to a Database

By default, the Instant ORM will attempt to load database credentials from
`_instant/db.json[process.env.NODE_ENV]["main"]`:

```javascript
await Instant.connect(); // connects based on _instant/db.json
```

However, you can also provide custom credentials to any database you'd like
by passing in a `cfg` configuration object with the credentials in the following
format:

```javascript
const cfg = {
  host: 'my.postgres.host',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'postgres',
  ssl: false, // optional: acceptable values are [true, false, "unauthorized"]
  in_vpc: false, // optional: if false, will use provided SSH tunnel when deployed
  tunnel: { // optional: use this if we need to SSH tunnel into database
    host: 'my.ssh.host.com',
    port: 22,
    user: 'ec2-user',
    private_key: 'path/to/private_key.pem'
  }
};
await Instant.connect(cfg); // now connected to custom Database
```

You can also opt to provide a `connectionString` instead:

```javascript
const cfg = {
  connectionString: 'postgres://postgres:mypass@my.postgres.host:5432/postgres?sslmode=true',
  in_vpc: false, // optional: if false, will use provided SSH tunnel when deployed
  tunnel: { // optional: use this if we need to SSH tunnel into database
    host: 'my.ssh.host.com',
    port: 22,
    user: 'ec2-user',
    private_key: 'path/to/private_key.pem'
  }
};
await Instant.connect(cfg); // now connected to custom Database
```

### Connecting to another database

By default, the `Instant.connect()` method will assign your initial database
connection the alias `"main"`. You can access your Database object directly
via:

```javascript
const db = Instant.database();
const mainDb = Instant.database('main');
console.log(db === mainDb); // true, "main" is an alias for your main db
```

To connect to another database, simply use:

```javascript
// connect
Instant.addDatabase(name, cfg);
// read
const otherDb = Instant.database(name);
```

### Querying your databases directly

Querying your database directly is easy. To run a standalone query;

```javascript
const db = Instant.database();
const result = await db.query(`SELECT * FROM my_table WHERE x = $1`, [27]);
```

To execute a batched transaction from prepared statements and queries;

```javascript
const db = Instant.database();
// Pass in an array of statements
const result = await db.transact([
  `SELECT * FROM my_table`,
  `INSERT INTO my_table(field) VALUES((1))`,
  // Parameterized statements can be passed in as well
  [`INSERT INTO my_other_table(other_field) VALUES(($1))`, [2]]
]);
```

And to create a transaction that you want to work with in real-time, potentially
querying third party services before deciding whether or not to commit the query:

```javascript
const db = Instant.database();
const txn = db.createTransaction();

let result = await txn.query(`SELECT * FROM my_table WHERE x = $1`, [27]);
let result2 = await txn.query(`INSERT INTO my_table(field) VALUES(($1))`, [5]);
let manyQueries = await txn.transact([
  `SELECT * FROM my_table`,
  `INSERT INTO my_table(field) VALUES((1))`,
]);
// to commit
await txn.commit();
// to rollback
await txn.rollback();
```

### Disconnecting

To disconnect from a specific database:

```javascript
Instant.closeDatabase(name);
```

And to disconnect from all open databases and reset your connection:

```javascript
Instant.disconnect();
```

## Loading a Schema

When you connect to a database, Instant ORM will attempt to determine the
schema of your database in a few ways.

- First, it will check to see if `_instant/cache/schema.json` exists
  - If it does, it will load the schema from this file
- Next, it will check to see if an `_instant_migrations` table exists in your
  database
  - This table holds all migrations applied to the database and is generated by
    the [instant.dev](https://github.com/instant-dev/instant) CLI automatically
  - If it does exist and has entries, it will load the schema from the latest
    migration
- Finally, it will introspect your database structure
  - All tables, columns, sequences and constraints will be inspected
  - Foreign keys and uniqueness will be used to determine one-to-one and
    one-to-many relationships

Additionally, you can also pass a custom `schema` object to the
`Instant.connect(cfg)` method as a second argument, but this is
**not recommended**. It is usually reserved for testing purposes.

## Loading custom Model logic

By default, the Instant ORM will load models from the `_instant/models`
directory.
**You do not need a model file for every, or even any, table in your database**.
These are only meant to extend models in the case you want to add
[Lifecycle callbacks](#lifecycle-callbacks), validations, verifications,
calculated fields or hide data. Each file should look something like this;

File: `_instant/models/sample_model.mjs`

```javascript
import InstantORM from '@instant.dev/orm';

class SampleModel extends Model {

  static tableName = 'sample_models';

  async beforeSave (txn) {}
  async afterSave (txn) {}
  async beforeDestroy (txn) {}
  async afterDestroy (txn) {}

}

SampleModel.calculates(/* ... */);
SampleModel.validates(/* ... */);
SampleModel.verifies(/* ... */);
SampleModel.hides(/* ... */);

export default SampleModel;
```

The Instant ORM will automatically associate each file with the appropriate
table in your database schema, provided `SampleModel.tableName` matches a table
on your Database. You can access your Models using;

```javascript
// Note that "SampleModels", "samplemodel", "sample_models" etc.
// will all work as well as long as there's no ambiguity
Instant.Model('SampleModel');
```

## Using Models

Models are accessible via the `Instant.Model(modelName)` method. This method
will automatically look up the most likely model based on the matching `table`
in your database schema.

```javascript
const User = Instant.Model('User');
```

This method would also accept the strings `Users`, `user`, `users`. If your
table has pluralization and underscores we recommend using the singular version,
but you can access using the table name as well. For example, the table name
`object_children` could be accessed via:

```javascript
const ObjectChild = Instant.Model('ObjectChild'); // recommended
```

However, the following would also work:

```javascript
Instant.Model('ObjectChildren');
Instant.Model('object_child');
Instant.Model('object_children');
```

In the case of ambiguity - multiple tables potentially matching the object name -
`Instant.Model()` will throw an error and ask you to use the specific table.

### CRUD Operations

#### Create

You can create new model instances and save them to the database with
`Model.create(data)` or `new Model(data)` and then a subsequent `model.save()`:

```javascript
const User = Instant.Model('User');

// Model.create() method creates a user:
let user1 = await User.create({email: 'keith@instant.dev', username: 'keith'});
console.log(user1.inStorage()); // true

// Can also use new Model() and then save it
let user2 = new User({email: 'scott@instant.dev'});
user2.set('username', 'scott'); // can set values independently
console.log(user2.inStorage()); // false
await user2.save();
console.log(user2.inStorage()); // true
```

#### Read

Reading model data can be done in a few ways: `Model.find()`, `Model.findBy()`
or via [Query composition](#query-composition) using the `query.select()`
method.

```javascript
let user1 = await User.find(1); // uses id
let user2 = await User.findBy('email', 'keith@instant.dev');
let user3 = await User.query()
  .where({email: 'keith@instant.dev'})
  .first(); // throws error if not found
let userList = await User.query()
  .where({email: 'keith@instant.dev'})
  .select(); // can return an empty list
let userCount = await User.query()
  .where({email: 'keith@instant.dev'})
  .count();
```

#### Update

Updating model data can be performed by (1) updating and saving individual
models, (2) update and saving ModelArrays, (3) `Model.updateOrCreateBy()` or
(4) [Query composition](#query-composition) using the `query.update()` method.

**Note:** `query.update()` will bypass model lifecycle methods `beforeSave()`
and `afterSave()` as well as all validations verifications. Read more in
[Lifecycle callbacks](#lifecycle-callbacks).

```javascript
let user = await user.findBy('username', 'keith');
user.set('username', 'keith_h');
await user.save();

// Update by reading from data
user.read({username: 'keith_h2'});
await user.save();

// Save many models at once using ModelArrays
// Let's make all our moderators superusers
let users = await User.query()
  .where({is_moderator: true})
  .select();
users.setAll('is_superuser', true);
await users.saveAll();

// Can also use `readAll`
users.readAll({free_credits: 100});
await users.saveAll();

// Can update models directly with new data if there's a matching entry
user = await User.updateOrCreateBy(
  'username',
  {username: 'keith_h2', email: 'keith+new@instant.dev'}
);

// Bypass lifecycle callbacks, validations and verifications
// Useful for updating many models at once and batch processing
users = await User.query()
  .where({username: 'keith_h2'})
  .update({username: 'keith'});
```

##### Incrementing values and custom SQL

You can run custom SQL when updating models using the `query.update()` method.
**This will bypass [Lifecycle callbacks](#lifecycle-callbacks)**. However it is
the most efficient way to do things like incrementing values.

```javascript
const user = User.findBy('email', 'keith@instant.dev');
await User.query()
  .where({user_id: user.get('id')})
  .update({post_count: (post_count) => `${post_count} + 1`});
```

In this case, the `post_count` variable will hold the query column reference.
You can reference multiple fields by including more fields in the function
arguments:

```javascript
const user = User.findBy('email', 'keith@instant.dev');
await User.query()
  .where({user_id: user.get('id')})
  .update({
    post_count: (post_count) => `${post_count} + 1`,
    karma: (karma, post_count) => `${karma} + LOG(${post_count})`
  });
```

Any valid SQL expression can be returned by these methods.

#### Destroy

We purposefully **do not** include a `delete` method in
[Query composition](#query-composition). In most application contexts,
permanently deleting records is bad practice from a security and monitoring
perspective. We usually recommend `is_archived` or `is_deleted` flags.
In the case you really do need to delete records, there is a `Model.destroy(id)`
method, a `model.destroy()` method and a `modelArray.destroyAll()` method.
We also provide `model.destroyCascade()` and `modelArray.destroyCascade()` for
a cascading delete if foreign key constraints prevent deleting a model directly.

```javascript
await User.destroy(100); // goodbye User(id=100)!

let user = await User.findBy('email', 'nouser@instant.dev');
await user.destroy();
let user2 = await User.findBy('email', 'nouser2@instant.dev');
await user2.destroyCascade(); // destroy model + children (useful for foreign keys)

/* ModelArray methods */
let bannedUsers = await User.query().where({is_banned: true}).select();
await bannedUsers.destroyAll();

let mutedUsers = await User.query().where({is_muted: true}).select();
await mutedUsers.destroyCascade();
```

### Query composition

Instant ORM provides a query composer that enables you to construct complex
SQL queries with multiple layers of nesting and joins easily. It is heavily
inspired by the
[Rails ActiveRecord ORM](https://guides.rubyonrails.org/active_record_querying.html#hash-conditions)
and the
[Django ORM](https://docs.djangoproject.com/en/4.2/topics/db/queries/#chaining-filters),
where you can filter using objects and chain multiple queries and statements
together. If you've worked with these ecosystems, querying with the Instant ORM
will come naturally to you. Otherwise, it's easy to pick up!

Here's a basic example that;
- Selects users with an id matching 7, 8, or 9
- Orders them by their username
- Retrieves a maximum of 2 results

```javascript
const User = Instant.Model('User');

// Basic querying
let users = await User.query()
  .where({id__in: [7, 8, 9]})
  .orderBy('username', 'ASC')
  .limit(2)
  .select();
```

A couple of things to note here
- `User.query()` returns an immutable [Composer](core/lib/composer.js) instance
- Each new chained command, like `.where()`, `.orderBy()` returns
  a new, immutable [Composer](core/lib/composer.js) instance
- Any of these instances can individually be queried
- `.select()` is an async function that executes the actual SQL query
- As such, **the query is not executed until `.select()` is called**

We could rewrite this like so:

```javascript
let query = User.query();
let idQuery = query.where({id__in: [7, 8, 9]});
let orderQuery = idQuery.orderBy('username', 'ASC')
let limitQuery = orderQuery.limit(2);
let users = await limitQuery.select();
```

Each query could be executed on its own. For readability, we suggest chaining
queries as we show in the docs, but for advanced composition and reusability
you can cache `Composer` instances.

#### Composer instance methods

##### Composer#safeWhere

Alias for `Composer#where` that prevents querying on fields that the model has
hidden via `Model.hides('field_name')`. This is useful for querying against
user-supplied data, e.g. if you pass in POST data from a web request directly
to the ORM.

##### Composer#safeJoin

Alias for `Composer#join` that prevents querying on fields that the model has
hidden via `Model.hides('field_name')`. This is useful for querying against
user-supplied data, e.g. if you pass in POST data from a web request directly
to the ORM.

##### Composer#where

```javascript
/**
* Add comparisons to SQL WHERE clause.
* @param {Object} comparisons Comparisons object. {age__lte: 27}, for example.
* @return {Nodal.Composer} new Composer instance
*/
where (comparisonsArray) { ... }
```

This method can be passed a `comparisons` object, multiple `comparisons`
objects, or an Array of `comparisons` object. If multiple `comparisons` are
passed to this method (via an Array or as different arguments), they will be
treated as an OR clause.

A comparison object follows the
format:

```javascript
{
  field__comparator: value
}
```

Where `field` is of the format:
- `field_name`,
- `joined_model__joined_model_field_name`
- `joined_model__other_joined_model__other_joined_model_field_name`
- ... and so on

And `comparator` is a comparator from `PostgresAdapter.prototype.comparators` in
[PostgresAdapter](core/db/adapters/postgres.js). If no comparator is provided,
the comparator will default to `is`.


```javascript
PostgresAdapter.prototype.comparators = {
  is: field => `${field} = __VAR__`,
  not: field => `${field} <> __VAR__`,
  lt: field => `${field} < __VAR__`,
  lte: field => `${field} <= __VAR__`,
  gt: field => `${field} > __VAR__`,
  gte: field => `${field} >= __VAR__`,
  contains: field => `${field} LIKE '%' || __VAR__ || '%'`,
  icontains: field => `${field} ILIKE '%' || __VAR__ || '%'`,
  startswith: field => `${field} LIKE __VAR__ || '%'`,
  istartswith: field => `${field} ILIKE __VAR__ || '%'`,
  endswith: field => `${field} LIKE '%' || __VAR__`,
  iendswith: field => `${field} ILIKE '%' || __VAR__`,
  like: field => `${field} LIKE __VAR__`,
  ilike: field => `${field} ILIKE __VAR__`,
  is_null: field => `${field} IS NULL`,
  is_true: field => `${field} IS TRUE`,
  is_false: field => `${field} IS FALSE`,
  not_null: field => `${field} IS NOT NULL`,
  not_true: field => `${field} IS NOT TRUE`,
  not_false: field => `${field} IS NOT FALSE`,
  in: field => `ARRAY[${field}] <@ __VAR__`,
  not_in: field => `NOT (ARRAY[${field}] <@ __VAR__)`,
  json: (field, value) => {
    return `${field.replace(/"/g,"")} = __VAR__`;
  },
  jsoncontains: (field) => {
    return `${field.replace(/"/g,"")} ? __VAR__`;
  }
};
```

So, if you had a `User` with `BlogPost`s and `Comment`s...

```javascript
// Select only for users that have comments on their blog posts matching "lol"
let users = await User.query()
  .join('blogPosts__comments') // joins in both blogPosts and comments
  .where({blogPosts__comments__body__contains: 'lol'})
```

###### Custom SQL

In your `comparisons` object instead of passing in a raw `value`, you can pass
in a synchronous function that returns a SQL statement. For example;

```javascript
// Fetch users with email being equal to [their username]@gmail.com
let gmailUsers = await User.query() // || is str_concat in Postgres
  .where({email: username => `${username} || '@gmail.com'`})
  .select();
```

You can compare to multiple fields on the model by adding more arguments;

```javascript
// Fetch users with email being equal to [firstname].[lastname]@gmail.com
let gmailUsers = await User.query() // || is str_concat in Postgres
  .where({
    email: (first_name, last_name) => {
      return `${first_name} || '.' || ${last_name} || '@gmail.com'`
    }
  })
  .select();
```

**Important:** Field names are aliased by the query composer during query
generation, so please use the above format to make sure the correct column
reference is used in comparisons. You **must** concatenate these fields when
trying to create strings.

##### Composer#join

```javascript
/**
* Join in a relationship.
* @param {string} joinName The name of the joined relationship
* @param {array} comparisons comparisons to perform on this join, similar to where
*/
join (joinName, comparisons) { ... }
```

Use `.join()` to join in related models.
Related models are determined by foreign keys and column uniqueness. Names are
automatically generate based on the field name. You can also join in based on
comparisons similar to the `where()` method. For example, to get a user and
join in all of their posts from the last 24 hours:

```javascript
let posts = await User.query()
  .join('posts', {created_at__gte: new Date(Date.now() - (24 * 60 * 60 * 1000))})
  .select();
```

You can also pass in an to `comparisons` to create an OR clause between the two
objects.

**Note:** Using this method, **all joins are `LEFT JOIN`s**. If you need to
perform a more complex join we recommend querying the database directly.

###### One-to-many

If a `User` has many `Post`s:

```
// pseudocode for SQL relationships
foreign_key("post"."user_id", "user".id")
NOT unique("post"."user_id")
```

You would query this with;

```javascript
let users = User.query()
  .join('posts') // plural
  .select();

users[0].joined('posts'); // returns ModelArray instance
```

###### One-to-one

If a `User` has just one `Profile`:

```
// pseudocode for SQL relationships
foreign_key("profile"."user_id", "user".id")
unique("profile"."user_id")
```

You would query this with;

```javascript
let users = User.query()
  .join('profile') // not plural
  .select();

users[0].joined('profile'); // returns Model instance
```

###### Naming conventions

The child table will join in the parent table based on the column name. So
if, instead of user_id, an `Account` has an `owner_id`...

```
// pseudocode for SQL relationships
foreign_key("account"."owner_id", "user".id")
unique("account"."owner_id")
```

You would query `Account` like this:

```javascript
let users = User.query()
  .join('account')
  .select();
users[0].joined('account');
```

But `Account` would be queried like so:

```javascript
let accounts = Account.query()
  .join('owner')
  .select()
accounts[0].joined('owner');
```

##### Composer#orderBy

```javascript
/**
* Order by field belonging to the current Composer instance's model
* @param {string} field Field to order by
* @param {string} direction Must be 'ASC' or 'DESC'
*/
orderBy (field, direction) { ... }
```

Orders the query by a specific field. These can be stacked to change order when
fields have the same value

##### Composer#limit

```javascript
/**
* Limit to an offset and count
* @param {number} offset The offset at which to set the limit. If this is the only argument provided, it will be the count instead.
* @param {number} count The number of results to be returned. Can be omitted, and if omitted, first argument is used for count
*/
limit (offset, count) { ... }
```

Limits the query to a specific number of results. If only the first argument
is provided it will be used as `count` and `offset` will be 0.

##### Composer#groupBy

```javascript

/**
* Groups by a specific field, or a transformation on a field
* @param {String} column The column to group by
*/
groupBy (column) { ... }
```

Creates a `GROUP BY` statement, aggregating results by a field. Note that
by default the only column returned in the grouped object response will be
the `column` specified here. You must use the `aggregate()` method to add
aggregate columns. `column` can also be a method, if you need to execute
SQL as part of the aggregation.

Here is an example query that groups `ActivityTimeEntry` entries by day and
returns the total entries and sum of the activity time, then orders by the day.

```javascript
let activityEntryData = await ActivityTimeEntry.query()
  .aggregate('total', (id) => `COUNT(${id})`)
  .aggregate('total_activity_time', (activity_time) => `SUM(COALESCE(${activity_time}, 0))`)
  .groupBy(created_at => `DATE_TRUNC('day', ${created_at})`)
  .orderBy(created_at => `DATE_TRUNC('day', ${created_at})`, 'ASC');
console.log(activityEntryData);
// [
//   {
//     "created_at": "2023-09-01T00:00:00.000Z"
//     "total": 7,
//     "total_activity_time": 221
//   },
//   {
//     "created_at": "2023-09-02T00:00:00.000Z"
//     "total": 23,
//     "total_activity_time": 1056
//   }
// ]
```

##### Composer#aggregate

```javascript
/**
* Aggregates a field
* @param {string} alias The alias for the new aggregate field
* @param {function} transformation The transformation to apply to create the aggregate
*/
aggregate (alias, transformation) { ... }
```

Use with `.groupBy()`, example is provided above.

### Transactions

Transactions can be used to ensure integrity of your data and prevent orphaned
rows from being inserted into your database. For example, if you need to create
a `User` and an `Account` at the same time but run some logic between them:

```javascript
const User = Instant.Model('User');
const Account = Instant.Model('Account');

const txn = Instant.database().createTransaction();

try {
  const user = await User.create({email: 'keith@instant.dev'}, txn);
  await sendUserEmail(user.get('email'), `Welcome to our website!`);
  const account = await Account.create({user_id: user.get('id')}, txn);
  await txn.commit();
} catch (e) {
  // If any step fails, including sending the welcome email,
  // we can just roll the whole thing back
  await txn.rollback();
}
```

Transactions can also be queried directly:

```javascript
let result = await txn.query(`SELECT * FROM my_table WHERE id = $1`, [100]);
```

And support the `.transact()` function to send in multiple statements:

```javascript
let result = await txn.transact([
  `SELECT * FROM my_table`,
  `INSERT INTO my_table(field) VALUES((1))`,
  // Parameterized statements can be passed in as well
  [`INSERT INTO my_other_table(other_field) VALUES(($1))`, [2]]
]);
```

Finally, they can be passed in to a number of existing query methods. This
gives you transaction-level control right in the ORM.
**When you pass a transaction object into an ORM method, you must remember to commit it to complete the queries.**

```javascript
// Can pass transactions to the following Class methods
await Model.find(id, txn);
await Model.findBy(field, value, txn);
await Model.create(data, txn);
await Model.update(id, data, txn);
await Model.updateOrCreateBy(field, data, txn);
await Model.query().count(txn);
await Model.query().first(txn);
await Model.query().select(txn);
await Model.query().update(fields, txn);
// Instance methods
await model.save(txn);
await model.destroy(txn);
await model.destroyCascade(txn);
// Instance Array methods
await modelArray.saveAll(txn);
await modelArray.destroyAll(txn);
await modelArray.destroyCascade(txn);
```

### Input validation

Validations allow you to ensure the right data is being added into the database.
Validations are performed **immediately** and synchronously, right as data
is being set in the model. You can check validation errors at any time
with `model.hasErrors()` and `model.getErrors()`. Validation errors will cause
`model.save()` to throw an error and prevent writing a row to your database.

You can use validations by creating a file
for your model in the directory `_instant/models`. Note that the
[`instant` command line utility](https://github.com/instant-dev/instant) can
automatically generate these files for you.

File: `_instant/models/user.mjs`

```javascript
import InstantORM from '@instant.dev/orm';

class User extends InstantORM.Core.Model {

  static tableName = 'users';

}

// Validates email and password before .save()
User.validates(
  'email',
  'must be valid',
  v => v && (v + '').match(/.+@.+\.\w+/i)
);
User.validates(
  'password',
  'must be at least 5 characters in length',
  v => v && v.length >= 5
);

export default User;
```

Now validations can be used;

```javascript
const User = Instant.Model('User');

try {
  await User.create({email: 'invalid'});
} catch (e) {
  // Will catch a validation error
  console.log(e.details);
  /*
    {
      "email": ["must be valid"],
      "password": ["must be at least 5 characters in length"]
    }
  */
}
```

You can also check errors before the model is saved:

```javascript
const User = Instant.Model('User');

let user = new User({email: 'invalid'});
if (user.hasErrors()) {
  console.log(user.getErrors());
  /*
    {
      "email": ["must be valid"],
      "password": ["must be at least 5 characters in length"]
    }
  */
}
await user.save(); // will throw an error
```

### Relationship verification

Verifications allow you to validate fields in your model **asynchronously**,
as opposed to validations which are only synchronous. Unlike validations,
**verifications are performed at `INSERT` time**, right before a model is saved
as a new row in its corresponding table.

You can use verifications by creating a file for your model in the directory
`_instant/models`. Note that the
[`instant` command line utility](https://github.com/instant-dev/instant) can
automatically generate these files for you.

File: `_instant/models/user.mjs`

```javascript
import InstantORM from '@instant.dev/orm';

class User extends InstantORM.Core.Model {

  static tableName = 'users';

}

// Before saving to the database, asynchronously compare fields to each other
User.verifies(
  'phone_number',
  'must correspond to country and be valid',
  async (phone_number, country) => {
    let phoneResult = await someAsyncPhoneValidationAPI(phone_number);
    return (phoneResult.valid === true && phoneResult.country === country);
  }
);

export default User;
```

Now verifications can be used;

```javascript
const User = Instant.Model('User');

try {
  await User.create({phone_number: '+1-416-555-1234', country: 'SE'});
} catch (e) {
  // Will catch a validation error
  console.log(e.details);
  /*
    {
      "phone_number": ["must correspond to country and be valid"],
    }
  */
}
```

### Calculated and hidden fields

Calculated fields will populate your model with fields that do not exist in your
table by can be computed **synchronously** at runtime. They are exposed via the
`model.get(field)` interface or `model.toJSON()`. Hidden fields prevent exposure
of sensitive data when using `model.toJSON()`; useful for hiding IDs, encrypted
fields and more when displaying results to a user.

You can use calculated and hidden fields by adding to your model file:

File: `_instant/models/user.mjs`

```javascript
import InstantORM from '@instant.dev/orm';

class User extends InstantORM.Core.Model {

  static tableName = 'users';

}

User.calculates(
  'formatted_name',
  (first_name, last_name) => `${first_name} ${last_name}`
);
User.hides('last_name');

export default User;
```

```javascript
const User = Instant.Model('User');

let user = await User.create({first_name: 'Steven', last_name: 'Nevets'});
let name = user.get('formatted_name') // Steven Nevets
let json = user.toJSON();
/*
  Last name is hidden from .hides()
  {
    first_name: 'Steven',
    formatted_name: 'Steven Nevets'
  }
*/
```

### Lifecycle callbacks

Lifecycle callbacks are used to execute custom logic inside of transaction
blocks associated with the creation and destruction of models. Four lifecycle
events are supported, `beforeSave()`, `afterSave()`, `beforeDestroy()` and
`afterDestroy()`. Each of these methods receives a transaction associated with
the model creation or destruction query and is performed either before or after
the associated event.
**If an error is thrown in a lifecycle callback, the transaction will be rolled back automatically.**

Lifecycle callbacks allow you to create multiple codependent resources
simultaneously and can help ensure consistency with third-party services. They
are manage directly inside your model files. Note that the
[`instant` command line utility](https://github.com/instant-dev/instant) can
automatically generate these files for you.

File: `_instant/models/user.mjs`

```javascript
import InstantORM from '@instant.dev/orm';

class User extends InstantORM.Core.Model {

  static tableName = 'users';

  async beforeSave (txn) {
    const NameBan = this.getModel('NameBan');
    const nameBans = NameBan.query()
      .where({username: this.get('username')})
      .limit(1)
      .select(txn);
    if (nameBans.length) {
      throw new Error(`Username "${this.get('username')}" is not allowed`);
    }
  }

  async afterSave (txn) {
    // Create an account after the user id is set
    // But only when first creating the user
    if (this.isCreating()) {
      const Account = this.getModel('Account');
      await Account.create({user_id: this.get('id')}, txn);
    }
  }

  async beforeDestroy (txn) { /* before we destroy */ }
  async afterDestroy (txn) { /* after we destroy */ }

}

export default User;
```

## Using Migrations, Seeding and Code Generation

Migrations, seeds and code generation can be managed via the
[instant.dev](https://github.com/instant-dev/instant) CLI.

## Acknowledgements

Special thank you to [Scott Gamble](https://x.com/threesided) who helps run all
of the front-of-house work for instant.dev!

| Destination | Link |
| ----------- | ---- |
| Home | [instant.dev](https://instant.dev) |
| GitHub | [github.com/instant-dev](https://github.com/instant-dev) |
| Discord | [discord.gg/puVYgA7ZMh](https://discord.gg/puVYgA7ZMh) |
| X / instant.dev | [x.com/instantdevs](https://x.com/instantdevs) |
| X / Keith Horwood | [x.com/keithwhor](https://x.com/keithwhor) |
| X / Scott Gamble | [x.com/threesided](https://x.com/threesided) |
