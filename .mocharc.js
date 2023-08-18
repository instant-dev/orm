process.env.npm_argv = JSON.stringify(process.argv.slice(0));

(async () => {

  return;

  const Instant = require('...')();
  await Instant.connect(cfg);
  await Instant.loadSchema(url);

  await Instant.connect(db, schema);

})();
