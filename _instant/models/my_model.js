const { InstantORM } = require('../../index.js');

class MyModel extends InstantORM.Core.Model {

  static tableName = 'my_model';

  // Logic to execute BEFORE the model has been saved in the DB
  //   this is executed as part of a transaction (txn)
  async beforeSave (txn) {

    /**
     * Any errors in a single .create() or .save() flow
     * will trigger an automatic rollback

     * You should pass txn into any db calls that happen here to keep
     * queries scoped to the current transaction:

     * Instance examples:
     * model.save(txn);
     * model.destroy(txn);

     * Class examples:
     * let model = Model.create(data, txn);
     * let model = Model.update(id, data, txn);
     * let model = Model.updateOrCreateBy(field, data, txn);
     * let model = Model.destroy(id, txn);

     * Composer example:
     * let models = Model.query().transact(txn).[...].select();
     * let models = Model.query().transact(txn).[...].update();

     * Typically you should avoid commits and rollbacks here,
     *   the process that created the txn should handle that
     */

  }

  // Logic to execute AFTER the model has been saved in the DB
  //   same functionality as beforeSave()
  async afterSave (txn) {

  }

}

// validate a field synchronously when it is set
MyModel.validates(
  'my_field',
  'must be a string',
  v => typeof v === 'string'
);

// verify a field asynchronously before it is saved
MyModel.verifies(
  'my_field',
  'must be larger than my_other_field by 50',
  async (my_field, my_other_field) => {
    await new Promise(res => setTimeout(() => res(), 100));
    return my_field - my_other_field > 50
  }
);

// adds a calculated field, accessible via .get() or on output
MyModel.calculates(
  'field_sum',
  (my_field, my_other_field) => my_field + my_other_field
);

// hides a field: prevent output via .toJSON()
MyModel.hides('hidden_field');

module.exports = MyModel;