# Instant.dev (Beta release)

## JavaScript ORM and Migrations for Postgres

Instant.dev provides a fast, reliable, and heavily battle-tested
Object-Relational Mapper and Migration Management system for Postgres 13+ built
in JavaScript. For those familiar with Ruby on Rails, you can think of
Instant.dev like ActiveRecord for the Node.js, Deno and Bun ecosystems. We’ve
been using it since 2016 in production at [Autocode](https://autocode.com) where
it has managed over 1 billion records in a 4TB AWS Aurora Postgres instance.

Instant.dev is built for nimble development teams that;

1. Are using Postgres (AWS RDS, Railway, Render, Supabase, Vercel Postgres,
   Neon) to manage their data and are working with one or more JavaScript
   backends.

2. Need to execute quickly on new product features without in-depth SQL
   authoring and optimization knowledge.

3. Need table structure, index and foreign key guarantees between multiple local
   dev environments, staging and prod.

## Features

1. **CRUD operations**: Create, Read, Update and Destroy records easily.

2. **Query composition**: Build complex SELECT and UPDATE queries with many
   layers of nested joins and conditional statements.

3. **Transactions**: Ensure data consistency within logical transaction blocks
   that can be rolled back to prevent writing orphaned data.

4. **Input validation**: Synchronously validate object fields to ensure the
   right data is being stored.

5. **Relationship verification**: Asynchronously validate relationships between
   one or more fields and external resources before saving.

6. **Calculated fields**: Automatically populate object fields based on existing
   data.

7. **Lifecycle callbacks**: Execute custom logic beforeSave(), afterSave(),
   beforeDestroy() and afterDestroy() to perform necessary build and teardown
  steps inside of transactions.

8. **Migrations**: Manage local database state via the filesystem to make
  branched git development a breeze.

9. **Seeding**: Provide custom JSON files so that all developers can share the
   same test data across development, testing and staging environments.

## Table of Contents

Stay tuned!

# Getting Started

Instant.dev consists of two main components:

1. The [Instant CLI](https://github.com/instant-dev/cli) (npm: instant.dev),
   a tool for managing Postgres migrations and scaffolding new Instant.dev
   projects.

2. The Instant ORM (npm: [@instant.dev/orm]), an Object-Relational Mapper for
   easy CRUD operations, query composition, transactions and more.

We'll first walk you through how to set up Postgres locally, then

## Setting up Postgres

// Postgres.app instructions

## Initializing Instant with the CLI

To get started with Instant.dev, you'll first install the CLI:

```shell
$ npm i instant.dev --save
```

Now, visit your main project directory for your Node.js, Deno or Bun project:

```shell
$ cd ~/projects/my-awesome-project
```

Run `instant init`. You'll be asked for the Postgres connection details you set
up previously with Postgres.app or your own Postgres workflow.

```shell
$ instant init
> Initialized `Instant` in "./instant/" ...

> Enter your local Postgres host
> instant/config.json["local"]["host"]:

> [...]
```

Once entered, the `init` function will connect to and introspect your database
to figure out the existing schema (if any).

```shell
> Introspecting "database" as "user"...
> Introspection complete! Creating initial migration...
> MigrationManager: Saved migration "./instant/migrations/xxxxxx.json"
```

Voila! You now have an initial migration saved to your filesystem that will
enable any other developers who work on this branch to keep up to date with
your database schema changes.

## Modifying your Database structure with Migrations

Migrations are instruction sets that tell our database how to update its
structure or. Typically they provide two directions of execution, "up"
(migration) and "down" (rollback). They allow us ensure data consistency between
the database and multiple different constantly-changing development branches.

### What are Migrations?

Say, for example, you're working on your own local development branch and you
add a table called `receipts`. Your co-worker Nick is working on a different
branch and has added a table called `orders`. You're both writing logic that
depends on your migrations, but your database won't have `orders` in it and
Nick's won't have `receipts`. When you finally go to merge Nick's code in to
your branch, none of his code will work! In fact your whole app might crash
because your database state is missing the `orders` table.

Migrations make this problem disappear. Once you merge in Nick's code, you'll
get his migration in your filesystem. If his migration was made after yours,
when you try to run your code or take any action, you'll get a notification
that your local filesystem has migrations your database is missing
(`local_ahead`). If his migration has an earlier timestamp, you'll be warned
of an `unsynced` state. Both can be easily rectified by the CLI, which will
rollback migrations to the last synchronized state, and then re-run migrations
as expected.

### How do Migrations work?

Migrations work like this;

- The database keeps a record of all migrations it has applied in the
  `_instant_migrations` table.

- Your local filesystem, usually checked into version control, keeps a record of
  all migrations in the `./instant/migrations/` directory.

- When the Instant ORM starts up, either in code or when you use the CLI, the
  database's record of migrations and the filesystems are compared.

- If the migrations don't match, you'll get an error and be asked to run
  commands to synchronize the database and local branch state.

- Every migration you generate will automatically populate a reverse direction
  so they can be rolled back without issue. eg `createTable` will have a
  `dropTable` call added for the rollback.

### Creating your first table

To create your first table, simply use the command line:

```shell
$ instant new migration
> Which command would you like to add?
> o createTable
>   dropTable
>   addColumn
>   alterColumn
>   dropColumn
> [...]
```

We'll pick `createTable`:

```shell
$ instant new migration
> Which command would you like to add?: createTable
> Table name:
```

I recommend adding a table `users` with the column `username`, type `string`.
Note that you can have multiple commands in a single migration. Once you
complete the CLI instructions, you should get a file that looks something like
`./instant/migrations/xxxxxxxxxxxxxx__create_users.json`. If you open it up
you'll see:

```json
{
  "some_migration": "cool"
}
```

This migration file contains everything your database needs to know to both
run and rollback the migration.

To apply the migration, simply run;

```shell
$ instant migrate
```

And voila, you now have a `users` table!

## Using the Instant ORM

Now that you have a `users` table, you can import the Instant ORM anywhere
in your JavaScript project.

```javascript
const Instant = require('@instant.dev/orm')();

// defaults to using instant/config.json[process.env.NODE_ENV || 'local']
await Instant.connect();

// Get the user model.
// Instant automatically maps CamelCase singular to tableized snake_case plural
const User = Instant.Model('User');

// Create a user
let user = await User.create({username: 'Billy'});

// log user JSON
// {id: 1, username: 'Billy', created_at: '...', updated_at: '...'}
console.log(user.toJSON());

let user2 = await User.create({username: 'Sharon'});
let users = await User.query().select(); // queries all users

// [{username: 'Billy', ...}, {username: 'Sharon', ...}]
console.log(users.toJSON());
```

Full documentation for the ORM can be found at [link here](#link-here).

# Feature breakdown

## Crud operations

## Query composition

## Transactions

## Input validation

## Relationship verification

## Calculated fields

## Lifecycle callbacks

## Migrations

## Seeding

# Sample projects

Stay tuned!

# Roadmap

Stay tuned!

# Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

# Acknowledgements

Thanks!
