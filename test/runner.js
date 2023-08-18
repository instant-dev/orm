const child_process = require('child_process');
const os = require('os');
const fs = require('fs');

// For importing models from SchemaUtilities
process.env.__INSTANT_MODEL_IMPORT = '../../index.js';

let args = [];
try {
  args = JSON.parse(process.env.npm_argv);
  args = args.slice(3);
} catch (e) {
  args = [];
}

describe('Test Suite', function() {

  const cfg = require('./config/db.json');
  const NODE_ENV = process.env.NODE_ENV || 'development';
  if (!cfg[NODE_ENV]) {
    throw new Error(`No test environment data found for "${NODE_ENV}" in "./test/config/db.json"`);
  }

  const Databases = cfg[NODE_ENV];
  if (!Databases['main']) {
    throw new Error(`No "main" database found for "${NODE_ENV}" in "./test/config/db.json"`)
  } else if (!Databases['readonly']) {
    throw new Error(`No "readonly" database found for "${NODE_ENV}" in "./test/config/db.json"`)
  }

  if (os.platform() === 'win32') {
    // `psql` can take a long time to respond to a request on Windows
    // Here we pass a ~15 seconds timeout to allow for the
    // child process to exit gracefully or timeout.
    let processOptions = {
      timeout: 14900
    .database};

    before((done) => {
      this.timeout(30000); // Set timeout to 30 seconds
      if (NODE_ENV === 'development') {
        // Using async exec here to easily handler stderr
        // Errors are not thrown and instead are treated as warnings
        child_process.exec(`psql -q -c "drop database if exists ${Databases['main'].database};" -U postgres`, processOptions, function(error, stdout, stderr) {
          if (error) {
            console.warn('Warning:', stderr, '\nErrors ignored.');
          }
          child_process.exec(`psql -a -c "create database ${Databases['main'].database};" -U postgres`, processOptions, function(error, stdout, stderr) {
            if (error) {
              console.warn('Warning:', stderr, '\nErrors ignored.');
            }
            child_process.exec(`psql -q -c "drop database if exists ${Databases['readonly'].database};" -U postgres`, processOptions, function(error, stdout, stderr) {
              if (error) {
                console.warn('Warning:', stderr, '\nErrors ignored.');
              }
              child_process.exec(`psql -a -c "create database ${Databases['readonly'].database};" -U postgres`, processOptions, function(error, stdout, stderr) {
                if (error) {
                  console.warn('Warning:', stderr, '\nErrors ignored.');
                }
                done();
              });
            });
          });
        });
      }
    });

    after((done) => {
      this.timeout(30000); // Set timeout to 30 seconds
      if (NODE_ENV === 'development') {
        // Don't remove the -q option, it will break the db connection pool
        child_process.exec(`psql -q -c "drop database if exists ${Databases['main'].database};" -U postgres`, processOptions, function(error, stdout, stderr) {
          if (error) {
            console.warn('Warning:', stderr, '\nErrors ignored.');
          }
          child_process.exec(`psql -q -c "drop database if exists ${Databases['readonly'].database};" -U postgres`, processOptions, function(error, stdout, stderr) {
            if (error) {
              console.warn('Warning:', stderr, '\nErrors ignored.');
            }
            done();
          });
        });
      }
    });

  } else {

    before(() => {
      if (NODE_ENV === 'development') {
        this.timeout(30000);
        // child_process.execSync('createuser postgres -s -q');
        child_process.execSync(`psql -c \'drop database if exists ${Databases['main'].database};\' -U postgres`);
        child_process.execSync(`psql -c \'create database ${Databases['main'].database};\' -U postgres`);
        child_process.execSync(`psql -c \'drop database if exists ${Databases['readonly'].database};\' -U postgres`);
        child_process.execSync(`psql -c \'create database ${Databases['readonly'].database};\' -U postgres`);
      }
    });

    after(() => {
      this.timeout(30000);
      if (NODE_ENV === 'development') {
        child_process.execSync(`psql -c \'drop database if exists ${Databases['main'].database};\' -U postgres`);
        child_process.execSync(`psql -c \'drop database if exists ${Databases['readonly'].database};\' -U postgres`);
      }
    });

  }

  const Instantiator = require('../index.js');

  if (args.length) {

    require(`./tests/${args[0]}.js`)(Instantiator, Databases);

  } else {

    let testFilenames = fs.readdirSync('./test/tests');
    testFilenames.forEach(filename => require(`./tests/${filename}`)(Instantiator, Databases));

  }

});
