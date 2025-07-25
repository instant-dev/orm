const ItemArray = require('./item_array.js');
const ModelArray = require('./model_array.js');
const Transaction = require('../db/transaction.js');
const Database = require('../db/database.js');

const utilities = require('./utilities.js');

/**
* The query composer (ORM)
* @class
*/
class Composer {

  /**
  * Created by Model#query, used for composing SQL queries based on Models
  * @param {import('./model')} Model The model class the composer is querying from
  * @param {?Composer} parent Composer parent (another composer instance)
  * @param {?Database} readonlyDb Provide a readonly database to query from
  */
  constructor (Model, parent, readonlyDb) {

    /**
     * @private
     */
    this.db = readonlyDb || (parent && parent.db) || Model.prototype.db;
    if (!(this.db instanceof Database)) {
      throw new Error(`Composer must have a valid Database`);
    }
    /**
     * @private
     */
    this.Model = Model;
    /**
     * @private
     */
    this._parent = parent || null;
    /**
     * @private
     */
    this._readonly = !!(readonlyDb || (parent && parent._readonly));
    /**
     * @private
     */
    this._command = null;
    /**
     * @private
     */
    this._shortAliasMap = {};
    /**
     * @private
     */
    this._joinCount = 0;

  }

  /**
  * Given rows with repeated data (due to joining in multiple children), return only parent models (but include references to their children)
  * @private
  * @param {Array} rows Rows from sql result
  * @param {boolean} grouped Are these models grouped, if so, different procedure
  * @returns {ModelArray}
  */
  __parseModelsFromRows__ (rows, grouped) {

    if (grouped) {
      return ItemArray.from(rows);
    }

    if (!rows.length) {
      return new ModelArray(this.Model);
    }

    let keys = Object.keys(rows[0]);
    let cache = {};
    let mainCache = {};
    cache[this.Model.name] = mainCache;

    let columns = keys
      .filter(k => k[0] !== '$');

    let columnsObject = columns
      .reduce((columns, k) => {
        columns[k] = null;
        return columns;
      }, {});

    let shortAliasResolver = Object.keys(this._shortAliasMap).reduce((shortAliasResolver, alias) => {
      shortAliasResolver[this._shortAliasMap[alias]] = alias;
      return shortAliasResolver;
    }, {});

    let joinsObject = keys
      .filter(k => k[0] === '$')
      .reduce((joinsObject, k) => {

        let shortAliasMid = k.indexOf('$', 1);
        let shortAlias = k.substring(1, shortAliasMid);
        let resolved = k.split('$').map(c => c.split('__').map(v => shortAliasResolver[v] || v).join('__')).join('$');
        let resolvedMid = resolved.indexOf('$', 1);
        let resolvedName = resolved.substring(1, resolvedMid);
        let field = resolved.substring(resolvedMid + 1);
        let relationship = this.Model.relationship(resolvedName);

        joinsObject[resolvedName] = joinsObject[resolvedName] || {};

        let rModel = relationship.getModel()
        joinsObject[resolvedName].Model = rModel;
        cache[rModel.name] = {};

        joinsObject[resolvedName].shortAlias = shortAlias;
        joinsObject[resolvedName].resolvedName = resolvedName;
        joinsObject[resolvedName].key = k;
        joinsObject[resolvedName].multiple = relationship.immediateMultiple();

        joinsObject[resolvedName].columns = joinsObject[resolvedName].columns || [];
        joinsObject[resolvedName].columns.push(field);

        joinsObject[resolvedName].columnsObject = joinsObject[resolvedName].columnsObject || {};
        joinsObject[resolvedName].columnsObject[field] = null;

        joinsObject[resolvedName].cachedModel = null;

        return joinsObject;

      }, {});

    let joins = Object
      .keys(joinsObject)
      .sort((a, b) => a.length > b.length ? 1 : -1)
      .map(k => joinsObject[k]);

    let models = new ModelArray(this.Model);

    rows.forEach(row => {

      let model = mainCache[row.id];

      if (!model) {

        model = mainCache[row.id] = new this.Model(columns.reduce((obj, k) => {
          obj[k] = row[k];
          return obj;
        }, columnsObject), true);
        models.push(model);

      }

      joins.forEach(join => {

        let id = row[`\$${join.shortAlias}\$id`];

        let resolvedName = join.resolvedName;
        let resolvedNames = resolvedName.split('__');
        let joinName = resolvedNames.pop();
        let parentName = resolvedNames.join('__');

        let parentModel = parentName ? joinsObject[parentName].cachedModel : model;

        if (join.multiple) {
          parentModel && (parentModel.joined(joinName) || parentModel.setJoined(joinName, new ModelArray(join.Model)));
        }

        if (!id) {
          return;
        }

        let joinCache = cache[join.Model.name];
        let joinModel = join.cachedModel = joinCache[id];

        if (!joinModel) {
          joinModel = join.cachedModel = joinCache[id] = new join.Model(join.columns.reduce((obj, k) => {
            obj[k] = row[`\$${join.shortAlias}\$${k}`];
            return obj;
          }, join.columnsObject), true)
        }


        if (join.multiple) {
          let modelArray = parentModel.joined(joinName);
          !modelArray.has(joinModel) && modelArray.push(joinModel);
        } else {
          parentModel.joined(joinName) || parentModel.setJoined(joinName, joinModel);
        }

      });

    });

    return models;

  }

  /**
  * If commands are provided as functions because they have dynamically generated data, like
  * vectorizing a search term, execute them
  * @private
  * @returns {Array}
  */
  async __cacheCommands__ () {
    let composer = this;
    while (composer) {
      if (typeof composer._command === 'function') {
        composer._command = await composer._command();
      }
      composer = composer._parent;
    }
    return this;
  }

  /**
  * Collapses linked list of queries into an array (for .reduce, .map etc)
  * @private
  * @returns {Array}
  */
  __collapse__ () {
    let composerArray = [];
    let composer = this;
    while (composer) {
      composerArray.unshift(composer);
      composer = composer._parent;
    }
    return composerArray;
  }

  /**
  * Removes last limit command from a collapsed array of composer commands
  * @private
  * @param {Array} composerArray Array of composer commands
  * @returns {Array}
  */
  __removeLastLimitCommand__ (composerArray) {

    let found = composerArray.map(c => c._command && c._command.type).lastIndexOf('limit');
    (found !== -1) && composerArray.splice(found, 1);
    return composerArray;

  }

  /**
  * Gets last limit command from a collapsed array of composer commands
  * @private
  * @param {Array} composerArray Array of composer commands
  * @returns {Array}
  */
  __getLastLimitCommand__ (composerArray) {

    let found = composerArray.map(c => c._command && c._command.type).lastIndexOf('limit');
    return found >= 0 ? composerArray.splice(found, 1)[0] : null;

  }

  /**
  * Determines whether this composer query represents a grouped query or not
  * @private
  * @returns {boolean}
  */
  __isGrouped__ () {
    return this.__collapse__().filter(c => c._command && c._command.type === 'groupBy').length > 0;
  }

  /**
  * Adds shortened aliases to joins
  * @private
  * @param {object} joinData Information about a join
  * @returns {object} The input join data with an added short alias
  */
  __addShortAliasToJoinData__ (joinData) {

    let shortAliasComponents = joinData.joinAlias.split('__').map((aliasComponent) => {
      this._shortAliasMap[aliasComponent] = this._shortAliasMap[aliasComponent] || ('j' + this._joinCount++);
      return this._shortAliasMap[aliasComponent];
    });

    joinData.shortAlias = shortAliasComponents.join('__');
    joinData.prevShortAlias = shortAliasComponents.slice(0, shortAliasComponents.length - 1).join('__');

    joinData.multiFilter = (joinData.multiFilter || []).map((comparisonArray) => {
      return comparisonArray.map((comparison) => {
        if (comparison.joins && comparison.joins.length) {
          comparison.shortAlias = comparison.joins[comparison.joins.length - 1].joinAlias;
        } else {
          comparison.shortAlias = joinData.shortAlias;
          comparison.refName = [this.db.adapter.escapeField(comparison.shortAlias), this.db.adapter.escapeField(comparison.columnName)].join('.');
        }
        return comparison;
      });
    });

    return joinData;

  }

  /**
  * Reduces an array of composer queries to a single query information object
  * @private
  * @param {array} composerArray
  * @returns {object} Looks like {commands: [], joins: []}
  */
  __reduceToQueryInformation__ (composerArray) {

    let joins = {};

    let commands = composerArray.reduce((p, c) => {

      let composerCommand = c._command || {type: 'where', data: {comparisons: []}};

      if (composerCommand.type === 'join') {

        let joinName = composerCommand.data.name;
        let joinData = composerCommand.data.joinData.slice();
        joins[joinName] = {data: this.__addShortAliasToJoinData__(joinData.pop())};
        while (joinData.length) {
          let data = this.__addShortAliasToJoinData__(joinData.pop());
          joins[data.joinAlias] = joins[data.joinAlias] || {data: data};
          joins[joinName].prev = data.joinAlias;
          joinName = data.joinAlias;
        }

        return p;

      }

      let lastCommand = p[p.length - 1];
      let command = {
        where: null,
        limit: null,
        alias: [],
        orderBy: [],
        groupBy: [],
        aggregate: []
      };
      p.push(command);

      if (
        lastCommand && (
          !lastCommand[composerCommand.type] ||
          lastCommand[composerCommand.type] instanceof Array
        )
      ) {

        command = lastCommand;
        p.pop();

      }

      if (command[composerCommand.type] instanceof Array) {

        command[composerCommand.type].push(
          Object.keys(composerCommand.data).reduce((p, c) => {
            return (p[c] = composerCommand.data[c], p);
          }, {})
        );

      } else {

        command[composerCommand.type] = Object.keys(composerCommand.data).reduce((p, c) => {
          return (p[c] = composerCommand.data[c], p);
        }, {});

      }

      return p;

    }, []);

    joins = Object.keys(joins).map(joinName => {
      let list = [];
      while (joinName) {
        list.unshift(joins[joinName].data);
        joinName = joins[joinName].prev;
      }
      return list;
    });

    return {
      commands: commands,
      joins: joins
    }

  }

  /**
  * Reduces an array of commands from query informtion to a SQL query
  * @private
  * @param {Array} commandArray
  * @param {Array} includeColumns Which columns to include, includes all by default
  * @returns {object} Looks like {sql: [], params: []}
  */
  __reduceCommandsToQuery__ (commandArray, includeColumns) {

    let lastAggregate = null;

    const query = commandArray.reduce((prev, command, i) => {

      if (command.aggregate.length && command.groupBy.length) {
        lastAggregate = command.aggregate;
      }

      let table = `t${i}`;

      let multiFilter = this.db.adapter.createMultiFilter(table, command.where ? command.where.comparisons : []);
      let params = this.db.adapter.getParamsFromMultiFilter(multiFilter);
      let aliases = [];

      let joins = null;
      let columns = includeColumns || lastAggregate || this.Model.columnNames();

      columns = columns
        .map(c => typeof c !== 'string' ? c : {columnNames: [c], alias: c, transformation: v => v})
        .map(c => ({...c}));

      !command.groupBy.length && columns.forEach(c => {
        c.transformation = v => v;
        c.columnNames = [c.alias];
      });

      command.alias.forEach(alias => {
        let offset = (prev ? prev.params.length : 0) + params.length;
        alias.offset = offset;
        if (alias.params) {
          params = params.concat(alias.params);
        }
        columns.push({
          columnNames: alias.columnNames,
          transformation: alias.transformation,
          params: alias.params || [],
          alias: `__${alias.alias}`,
          offset: alias.offset
        });
        aliases.push(`__${alias.alias}`);
      });

      command.orderBy.forEach(orderBy => {
        let offset = (prev ? prev.params.length : 0) + params.length;
        orderBy.offset = offset;
        if (orderBy.params) {
          params = params.concat(orderBy.params);
        }
        if (orderBy.alias) {
          columns.push({
            columnNames: orderBy.columnNames,
            transformation: orderBy.transformation,
            params: orderBy.params || [],
            alias: `__${orderBy.alias}`,
            offset: orderBy.offset
          });
          aliases.push(`__${orderBy.alias}`);
        }
      });

      // Make sure we keep referencing previous aliases
      prev.aliases.forEach(alias => {
        columns.push({
          columnNames: [alias],
          alias: alias,
          transformation: v => v
        });
      });

      return {
        sql: this.db.adapter.generateSelectQuery(
          prev.sql || {table: this.Model.table()},
          table,
          columns,
          multiFilter,
          joins,
          command.groupBy,
          command.orderBy,
          command.limit,
          prev.params.length
        ),
        params: prev.params.concat(params),
        aliases: prev.aliases.concat(aliases)
      };

    }, {sql: null, params: [], aliases: []});

    return query;

  }

  /**
  * Retrieve all joined column data for a given join
  * @private
  * @param {string} joinName The name of the join relationship
  * @param {string} shortAlias The shortened name of the join relationship
  */
  __joinedColumns__ (joinName, shortAlias) {
    let relationship = this.Model.relationships().findExplicit(joinName);
    return relationship.getModel().columnQueryInfo().map(column => {
      column.identifier = shortAlias;
      column.table = relationship.getModel().table();
      column.alias = `\$${joinName}\$${column.name}`;
      column.shortAlias = `\$${shortAlias}\$${column.name}`;
      column.joined = true;
      return column;
    });
  }

  /**
  * Generate a SQL query and its associated parameters from the current composer instance
  * @private
  * @param {Array} [includeColumns=*] Which columns to include, includes all by default
  * @param {boolean} [disableJoins=false] Disable joins if you just want a subset of data
  * @returns {object} Has "params" and "sql" properties.
  */
  __generateQuery__ (includeColumns, disableJoins) {

    disableJoins = disableJoins || this.__isGrouped__();

    let queryInfo = this.__reduceToQueryInformation__(this.__collapse__());
    let query = this.__reduceCommandsToQuery__(queryInfo.commands, includeColumns);

    return disableJoins ? query : this.__addJoinsToQuery__(
      query,
      queryInfo,
      includeColumns
    );

  }

  /**
  * Generate a SQL count query
  * @private
  * @param {boolean} useLimit Generates COUNT using limit command as well
  * @returns {object} Has "params" and "sql" properties.
  */
  __generateCountQuery__ (useLimit = false) {

    let collapsed = this.__collapse__();
    collapsed = useLimit ? collapsed : this.__removeLastLimitCommand__(collapsed);
    let queryInfo = this.__reduceToQueryInformation__(collapsed);
    let query = this.__reduceCommandsToQuery__(queryInfo.commands);
    query.sql = this.db.adapter.generateCountQuery(query.sql, 'c');
    return query;

  }

  /**
  * Generate a SQL update query
  * @private
  * @param {object} fields A list of field / value pairs to set
  * @returns {Object} has "params" and "sql" properties
  */
  __generateUpdateQuery__ (fields) {

    let query = this.__generateQuery__(['id'], true);
    let columns = Object.keys(fields);
    let params = columns.map(c => fields[c]);

    let columnNames = columns.filter((v, i) => typeof params[i] !== 'function');
    let columnFunctions = columns
      .map((v, i) => {
        if (typeof params[i] === 'function') {
          return [v, utilities.getFunctionParameters(params[i]), params[i]];
        } else {
          return null;
        }
      })
      .filter((v) => !!v);

    params = params.filter(v => typeof v !== 'function');

    query.sql = this.db.adapter.generateUpdateAllQuery(
      this.Model.table(),
      'id',
      columnNames,
      columnFunctions,
      query.params.length,
      query.sql
    );

    query.params = query.params.concat(params);

    return query;

  }

  /**
  * Add Joins to a query from queryInfo
  * @private
  * @param {object} query Must be format {sql: '', params: []}
  * @param {object} queryInfo Must be format {commands: [], joins: []}
  * @param {Array} [includeColumns=*] Which columns to include, includes all by default
  * @returns {object} Has "params" and "sql" properties.
  */
  __addJoinsToQuery__ (query, queryInfo, includeColumns) {

    let columns = [].concat(
      this.Model.columnQueryInfo(includeColumns),
      this.Model.aliasedColumnQueryInfo(query.aliases)
    );
    let joins = queryInfo.joins;

    // Set join OrderBys... in reverse order
    let orderBy = queryInfo.commands.reduce((arr, command) => {
      command.orderBy && (arr = command.orderBy.concat(arr));
      return arr;
    }, []);

    Object.keys(joins).forEach(joinName => {
      joins[joinName].forEach(j => {
        columns = columns.concat(this.__joinedColumns__(j.joinAlias, j.shortAlias));
      });
    });

    // When doing joins, we count paramOffset as the last where parameter length
    // Because we add in a bunch of parameters at the end.
    let params = query.params.slice();
    let joinSQL = this.db.adapter.generateUnionQuery(
      Object.keys(queryInfo.joins).map((name, i) => {
        let join = queryInfo.joins[name];
        let sql = this.db.adapter.generateSelectQuery(
          query.sql,
          `j`,
          columns,
          null,
          join,
          null,
          orderBy,
          null,
          params.length
        );
        join.forEach(j => { params = params.concat(this.db.adapter.getParamsFromMultiFilter(j.multiFilter)); });
        return sql;
      })
    );

    return {
      sql: this.db.adapter.generateSelectQuery(
        joinSQL || query.sql,
        'm',
        joinSQL ? '*' : columns.concat(query.aliases),
        null,
        null,
        null,
        orderBy,
        null,
        params.length
      ),
      params: params
    };

  }

  /**
  * When using Composer#where, format all provided comparisons
  * @private
  * @param {object} comparisons Comparisons object. {age__lte: 27}, for example.
  * @param {import('./model)} Model the model to use as the basis for comparison. Default to current model.
  * @returns {Array}
  */
  __parseComparisons__ (comparisons, Model) {

    Model = Model || this.Model;

    let comparators = this.db.adapter.comparators;
    let columnLookup = Model.columnLookup();

    return Object.keys(comparisons)
      .map(comparison => {

        let column = comparison.split('__');
        let rel = null;
        let joinName;

        let comparator = column.pop();
        if (!comparators[comparator]) {
          column.push(comparator);
          comparator = 'is';
        }

        if (column.length > 1) {
          joinName = column.slice(0, column.length - 1).join('__');
          rel = Model.relationship(joinName);
          column = column.slice(column.length - 1);
        }

        let table = null;
        let joined = false;
        let joins = null;

        if (rel) {

          // if it's not found, return null...
          if (!rel.getModel().hasColumn(column[0])) {
            return null;
          }

          table = rel.getModel().table();
          joined = true;
          joins = rel.joins('w');

        }

        let columnName = column[0];

        // block out bad column names
        if (!rel && !Model.hasColumn(columnName)) {
          return null;
        }

        let value = comparisons[comparison];
        let valueFunction = null;
        let valueColumnNames = null;

        if (typeof value === 'function') {
          valueFunction = value;
          valueColumnNames = utilities.getFunctionParameters(valueFunction);
          value = null;
        } else if (comparator === 'is') {
          if (value === null) {
            comparator = 'is_null';
          } else if (value === true) {
            comparator = 'is_true';
          } else if (value === false) {
            comparator = 'is_false';
          }
        } else if (comparator === 'not') {
          if (value === null) {
            comparator = 'not_null';
          } else if (value === true) {
            comparator = 'not_true';
          } else if (value === false) {
            comparator = 'not_false';
          }
        }

        return {
          table: table,
          alias: joinName,
          columnName: columnName,
          comparator: comparator,
          value: value,
          valueFunction: valueFunction,
          valueColumnNames: valueColumnNames,
          joined: joined,
          joins: joins
        };

      })
      .filter(v => {
        return !!v;
      });

  }

  /**
   * Filters hidden models
   * @private
   */
  __filterHidden__ (Model, comparisonsArray) {

    comparisonsArray = (comparisonsArray || []).filter(c => c);

    let comparators = this.db.adapter.comparators;

    return comparisonsArray.map(comparisons => {

      let order = null;

      if ('__order' in comparisons) {
        order = comparisons.__order.split(' ');
        delete comparisons.__order;
        let cModel = Model;
        let column = order[0].split('__');
        let field = column.pop();
        let relName = column.join('__');
        if (relName) {
          let rel = cModel.relationship(relName);
          if (!rel) {
            return;
          }
          cModel = rel.getModel();
        }
        if (cModel.isHidden(field)) {
          order = null;
        }
      }

      Object.keys(comparisons).forEach(comparison => {

        let cModel = Model;

        let column = comparison.split('__');
        let comparator = column.pop();
        !comparators[comparator] && column.push(comparator);
        let field = column.pop();
        let relName = column.join('__');
        if (relName) {
          let rel = cModel.relationship(relName);
          if (!rel) {
            return;
          }
          cModel = rel.getModel();
        }

        if (cModel.isHidden(field)) {
          delete comparisons[comparison];
        }

      });

      if (order) {
        comparisons.__order = order.join(' ');
      }

      if (Object.keys(comparisons).length === 0) {
        return null;
      }

      return comparisons;

    }).filter(comparisons => comparisons);

  }

  /**
  * Add comparisons to SQL WHERE clause. Does not allow filtering if Model.hides() has been called.
  * @param {object} comparisons Comparisons object. {age__lte: 27}, for example.
  * @returns {Composer} new Composer instance
  */
  safeWhere (comparisonsArray) {

    if (!(comparisonsArray instanceof Array)) {
      comparisonsArray = [].slice.call(arguments);
    }

    return this.where(
      this.__filterHidden__(
        this.Model,
        comparisonsArray
      )
    );

  }

  /**
  * Join in a relationship. Filters out hidden fields from comparisons.
  * @param {string} joinName The name of the joined relationship
  * @param {array} comparisonsArray comparisons to perform on this join (can be overloaded)
  * @returns {Composer} new Composer instance
  */
  safeJoin (joinName, comparisonsArray) {

    if (!(comparisonsArray instanceof Array)) {
      comparisonsArray = [].slice.call(arguments, 1);
    }

    let relationship = this.Model.relationship(joinName);
    if (!relationship) {
      return this;
    }

    return this.join(
      joinName,
      this.__filterHidden__(
        relationship.getModel(),
        comparisonsArray
      )
    );

  }

  /**
  * Add comparisons to SQL WHERE clause.
  * @param {object} comparisons Comparisons object. {age__lte: 27}, for example.
  * @returns {Composer} new Composer instance
  */
  where (comparisons) {

    let comparisonsArray = comparisons;
    if (!(comparisonsArray instanceof Array)) {
      comparisonsArray = [].slice.call(arguments);
    }

    comparisonsArray = comparisonsArray.map(comparisons => {
      return Object.keys(comparisons).reduce((p, c) => { return (p[c] = comparisons[c], p); }, {});
    });

    let order = null;
    let offset = null;
    let count = null;

    comparisonsArray.forEach(comparisons => {

      if ('__order' in comparisons) {
        order = comparisons.__order.split(' ');
        delete comparisons.__order;
      }

      if ('__offset' in comparisons || '__count' in comparisons) {
        offset = comparisons.__offset;
        count = comparisons.__count;
        delete comparisons.__offset;
        delete comparisons.__count;
      }

    });

    if (order || offset || count) {
      let composer = this;
      order && (composer = composer.orderBy(order[0], order[1]));
      (offset || count) && (composer = composer.limit(offset || 0, count || 0));
      return composer.where(comparisonsArray);
    }

    this._command = {
      type: 'where',
      data: {
        comparisons: comparisonsArray
          .map(comparisons => this.__parseComparisons__(comparisons))
          .filter(f => f.length)
      }
    };

    return new Composer(this.Model, this);

  }

  /**
  * Search a vector field by dot product similarity to a string or object
  * This method is ideal when using normalized vectors, eg using OpenAI embeddings
  * This is an alias for an orderBy function that orders by dot product similarity
  * @param {string} field Field to search
  * @param {string} value Value to search for
  * @param {?string} direction Orders by dot product, default is DESC (largest to smallest product)
  * @returns {Composer} new Composer instance
  */
  search (field, value, direction = 'DESC') {

    const vectorManager = this.Model.prototype._vectorManager;

    if (!vectorManager) {
      throw new Error(`Could not dot product search "${field}" for "${this.Model.name}": no VectorManager instance set`);
    }
    const fieldData = this.Model.columnLookup()[field];
    if (!fieldData || fieldData.type !== 'vector') {
      throw new Error(`Could not dot product search "${field}" for "${this.Model.name}": not a valid vector`);
    }

    this._command = async () => {
      let vector = await vectorManager.create(value);
      return {
        type: 'orderBy',
        data: {
          columnNames: [field],
          params: [`[${vector.join(',')}]`],
          transformation: (v, $1) => `-1 * (${v} <#> ${$1})`,
          direction: ({'asc': 'ASC', 'desc': 'DESC'}[(direction + '').toLowerCase()] || 'DESC'),
          alias: `${field}_product`
        }
      }
    };

    return new Composer(this.Model, this);

  }

  /**
  * Search a vector field by cosine similarity to a string or object
  * This is an alias for an orderBy function that orders by cosine similarity
  * @param {string} field Field to search
  * @param {string} value Value to search for
  * @param {?string} direction Orders by similarity, default is DESC (most to least similar)
  * @returns {Composer} new Composer instance
  */
  similarity (field, value, direction = 'DESC') {

    const vectorManager = this.Model.prototype._vectorManager;

    if (!vectorManager) {
      throw new Error(`Could not similarity search "${field}" for "${this.Model.name}": no VectorManager instance set`);
    }
    const fieldData = this.Model.columnLookup()[field];
    if (!fieldData || fieldData.type !== 'vector') {
      throw new Error(`Could not similarity search "${field}" for "${this.Model.name}": not a valid vector`);
    }

    this._command = async () => {
      let vector = await vectorManager.create(value);
      return {
        type: 'orderBy',
        data: {
          columnNames: [field],
          params: [`[${vector.join(',')}]`],
          transformation: (v, $1) => `1 - (${v} <=> ${$1})`,
          direction: ({'asc': 'ASC', 'desc': 'DESC'}[(direction + '').toLowerCase()] || 'DESC'),
          alias: `${field}_similarity`
        }
      }
    };

    return new Composer(this.Model, this);

  }

  /**
  * Classifies results based on cosine similarity to provided terms
  * @param {string} field Field to search
  * @param {Array<string>} values Classification values
  * @returns {Composer} new Composer instance
  */
  classify (field, values = []) {

    const vectorManager = this.Model.prototype._vectorManager;

    if (!vectorManager) {
      throw new Error(`Could not classify "${field}" for "${this.Model.name}": no VectorManager instance set`);
    }
    const fieldData = this.Model.columnLookup()[field];
    if (!fieldData || fieldData.type !== 'vector') {
      throw new Error(`Could not classify "${field}" for "${this.Model.name}": not a valid vector`);
    }
    if (!Array.isArray(values) || values.length <= 1) {
      throw new Error(`Could not classify "${field}" for "${this.Model.name}": values must be an array with more than one value`);
    }
    for (const value of values) {
      if (typeof value !== 'string') {
        throw new Error(`Could not classify "${field}" for "${this.Model.name}": values must be an array of strings`);
      }
    }

    this._command = async () => {
      let vectors = await vectorManager.batchCreate(values);
      return {
        type: 'alias',
        data: {
          columnNames: [field],
          params: [vectors.map(vector => `[${vector.join(',')}]`)],
          transformation: (v, $1) => {
            const minStatement = [
              `LEAST(`,
                vectors.map((_, i) => {
                  return `${v} <=> (${$1}::vector[])[${i + 1}]`;
                }).join(', '),
              `)`
            ].join('');
            return [
              `JSON_BUILD_OBJECT(`,
                `'value',`,
                (
                  values.length === 2
                    ? [
                        `(CASE`,
                          `WHEN (${v} <=> (${$1}::vector[])[1]) - (${v} <=> (${$1}::vector[])[2]) < 0 THEN '${values[0]}'`,
                          `ELSE '${values[1]}'`,
                        `END),`
                      ].join(' ')
                    : [
                        `(CASE`,
                          values.map((value, i) => {
                            return `WHEN ${v} <=> (${$1}::vector[])[${i + 1}] = ${minStatement} THEN '${value}'`
                          }).join(' '),
                          `ELSE NULL`,
                        `END),`
                      ].join(' ')
                ),
                `'similarity',`,
                `JSON_BUILD_OBJECT(`,
                  values.map((value, i) => {
                    return `'${value}', 1 - (${v} <=> (${$1}::vector[])[${i + 1}])`;
                  }).join(', '),
                `)`,
              `)`
            ].join('');
          },
          alias: `${field}_classification`
        }
      }
    };

    return new Composer(this.Model, this);

  }

  /**
  * Creates an aliased field that is returned in the model's metafields
  * @param {string} name The name of the alias
  * @param {function} transformation The transformation function to use
  * @param {array} params The parameters to pass in to the transformation function
  * @returns {Composer} new Composer instance
  */
  alias (name, transformation, params = []) {

    if (typeof transformation !== 'function') {
      throw new Error(`transformation must be a function`);
    } else if (transformation.constructor.name !== 'Function') {
      throw new Error(`transformation can not be an async function or a generator`);
    }

    let fields = utilities.getFunctionParameters(transformation);
    let paramIndex = fields.findIndex(field => field.startsWith('$'));
    if (paramIndex > -1) {
      let paramFields = fields.slice(paramIndex);
      fields = fields.slice(0, paramIndex);
      if (paramFields.length !== params.length) {
        throw new Error(
          `Invalid arguments in transformation, mismatch in provided params vs. arguments used:\n` +
          `Expecting arguments (${fields.concat(params.map((_, i) => `$${i + 1}`)).join(', ')})\n` +
          `Received arguments (${fields.concat(paramFields).join(', ')})`
        );
      }
      paramFields.forEach((paramField, i) => {
        if (paramField !== `$${i + 1}`) {
          throw new Error(
            `Invalid arguments in transformation:\n` +
            `Expecting arguments (${fields.concat(paramFields.map((_, i) => `$${i + 1}`)).join(', ')})\n` +
            `Received arguments (${fields.concat(paramFields).join(', ')})`
          );
        }
      });
    }

    this._command = {
      type: 'alias',
      data: {
        columnNames: fields,
        params: params,
        transformation: transformation,
        alias: name
      }
    };

    return new Composer(this.Model, this);

  }

  /**
  * Order by field belonging to the current Composer instance's model.
  * @param {string} field Field to order by
  * @param {?string} direction Must be 'ASC' or 'DESC',
  * @param {?array} params params to query for transformation function: specify with ($0, $1, $2, ...) in function arguments
  * @returns {Composer} new Composer instance
  */
  orderBy (field, direction = 'ASC', params = []) {

    let transformation;
    let fields = [];

    if (typeof field === 'function') {
      fields = utilities.getFunctionParameters(field);
      transformation = field;
    } else {
      fields = [field];
      transformation = v => `${v}`;
    }

    if (!Array.isArray(params)) {
      throw new Error(`orderBy expected params to be an array`);
    }

    if (params.length) {
      let paramFieldIndex = fields.findIndex(field => field.startsWith('$'));
      if (paramFieldIndex > -1) {
        let paramFields = fields.slice(paramFieldIndex);
        if (paramFields.length > params.length) {
          throw new Error(`orderBy function has ${paramFields.length} parameters, but only ${params.length} parameters supplied.`);
        }
        paramFields.forEach((field, i) => {
          const value = parseInt(field.slice(1));
          if (value !== (i + 1)) {
            throw new Error(
              `orderBy function with parameters expected: ${paramsFields.map((_, i) => `$${i + 1}`).join(', ')}\n` +
              `but received: ${paramsFields.map((field) => field).join(', ')}`
            );
          }
        });
      }
    }

    this._command = {
      type: 'orderBy',
      data: {
        columnNames: fields,
        transformation: transformation,
        params: params,
        direction: ({'asc': 'ASC', 'desc': 'DESC'}[(direction + '').toLowerCase()] || 'ASC')
      }
    };

    return new Composer(this.Model, this);

  }

  /**
  * Limit to an offset and count
  * @param {number} offset The offset at which to set the limit. If this is the only argument provided, it will be the count instead.
  * @param {?number} count The number of results to be returned. Can be omitted, and if omitted, first argument is used for count.
  * @returns {Composer} new Composer instance
  */
  limit (offset, count) {

    if (this._command) {
      return new Composer(this.Model, this).limit(offset, count);
    }

    if (count === undefined) {
      count = offset;
      offset = 0;
    }

    count = parseInt(count) || 0;
    offset = parseInt(offset) || 0;

    this._command = {
      type: 'limit',
      data: {
        count: count,
        offset: offset
      }
    };

    return new Composer(this.Model, this);

  }

  /**
  * Join in a relationship.
  * @param {string} joinName The name of the joined relationship
  * @param {object|array} comparisons comparisons to perform on this join
  */
  join (joinName, comparisons, orderBy, count, offset) {

    // TODO: Add in support
    orderBy = orderBy || '';
    count = Math.max(0, count | 0);
    offset = Math.max(0, offset | 0);

    let comparisonsArray = comparisons;
    if (!(comparisonsArray instanceof Array)) {
      comparisonsArray = [].slice.call(arguments, 1);
    }

    const Model = this.Model;
    const relationships = this.Model.relationships();
    const relationship = relationships.findExplicit(joinName);
    if (!relationship) {
      const validNames = relationships.edges.map(edge => {
        if (edge.parent.Model === Model) {
          return edge.options.as;
        } else if (edge.child.Model === Model) {
          return edge.options.name;
        } else {
          return ''; // should never happen
        }
      });
      throw new Error(
        `Model ${this.Model.name} does not have relationship "${joinName}".\n` +
        `Valid relationships are: "${validNames.join('", "')}"`
      );
    }

    let composer = this;
    while (composer) {
      if (composer._command && composer._command.type === 'join' && composer._command.data.name === joinName) {
        return this;
      }
      composer = composer._parent;
    }

    let joinData = relationship.joins();
    joinData = joinData.map((joinItem, i) => {
      let joinNameComponents = joinName.split('__');
      joinItem.joinAlias = joinNameComponents.slice(0, i + 1).join('__');
      joinItem.prevAlias = joinNameComponents.slice(0, i).join('__');
      return joinItem;
    });

    joinData[joinData.length - 1].multiFilter = this.db.adapter.createMultiFilter(
      joinName,
      comparisonsArray
        .map(comparisons => this.__parseComparisons__(comparisons, relationship.getModel()))
        .filter(f => f.length)
    );

    // FIXME: implement properly
    joinData[joinData.length - 1].orderBy = orderBy;
    joinData[joinData.length - 1].offset = offset;
    joinData[joinData.length - 1].count = count;

    this._command = {
      type: 'join',
      data: {
        name: joinName,
        joinData: joinData
      }
    };

    return new Composer(this.Model, this);

  }

  /**
  * Groups by a specific field, or a transformation on a field
  * @param {string} column The column to group by
  * @returns {Composer} new Composer instance
  */
  groupBy (column) {

    let columns;
    let transformation;

    if (typeof column === 'function') {
      columns = utilities.getFunctionParameters(column);
      transformation = column;
    } else {
      columns = [column];
      transformation = v => `${v}`;
    }

    this._command = {
      type: 'groupBy',
      data: {
        columnNames: columns,
        transformation: transformation
      }
    };

    return new Composer(this.Model, this).aggregate(column);

  }

  /**
  * Aggregates a field
  * @param {string} alias The alias for the new aggregate field
  * @param {function} transformation The transformation to apply to create the aggregate
  * @returns {Composer} new Composer instance
  */
  aggregate (alias, transformation) {

    let columns;

    if (typeof alias === 'function') {
      columns = utilities.getFunctionParameters(alias);
      transformation = alias;
      alias = columns.join('___');
    } else if (typeof transformation === 'function') {
      columns = utilities.getFunctionParameters(transformation);
    } else {
      columns = [alias]
      transformation = v => v;
    }

    this._command = {
      type: 'aggregate',
      data: {
        alias: alias,
        columnNames: columns,
        transformation: transformation
      }
    };

    return new Composer(this.Model, this);

  }

  /**
  * Processes results and errors from a terminal call
  * @private
  */
  __endProcessor__ (r) {
    if (!r || !r.countResult || !r.result) {
      throw new Error('End Query Expects object containing "count" and "results"');
    }
    let limitCommand = this.__getLastLimitCommand__(this.__collapse__());
    let offset = limitCommand ? limitCommand._command.data.offset : 0;
    let total = (((r.countResult && r.countResult.rows) || [])[0] || {}).__total__ || 0;
    let rows = r.result ? (r.result.rows || []).slice() : [];
    let models = this.__parseModelsFromRows__(rows, this.__isGrouped__());
    if (r.updateResult && r.updateResult.rows) {
      let cache = r.updateResult.rows.reduce((cache, obj) => {
        cache[obj.id] = obj;
        return cache;
      }, {});
      models.forEach(m => {
        let data = cache[m.get('id')];
        data && m.read(data);
      });
    }
    models.setMeta({offset: offset, total: total});
    return models;
  }

  /**
  * Counts the results in the query
  * @param {Transaction} txn Optional: the transaction to use for the count query
  * @returns {Promise<number>}
  */
  async count (txn) {
    if (txn) {
      if (!(txn instanceof Transaction)) {
        throw new Error('Must provide valid transaction to Composer#transact');
      }
      if (txn.adapter.db !== this.db) {
        throw new Error('Transaction must belong to Model Database');
      }
    }
    await this.__cacheCommands__();
    let countQuery = this.__generateCountQuery__(true);
    let source = txn ? txn : this.db;
    let result = await source.query(countQuery.sql, countQuery.params);
    return (((result && result.rows) || [])[0] || {}).__total__ || 0;
  }

  /**
  * Run a SELECT query you've been composing
  * @param {Transaction} txn Optional: the transaction to use for the count query
  * @returns {Promise<ModelArray>}
  */
  async select (txn) {
    if (txn) {
      if (!(txn instanceof Transaction)) {
        throw new Error('Must provide valid transaction to Composer#transact');
      }
      if (txn.adapter.db !== this.db) {
        throw new Error('Transaction must belong to Model Database');
      }
    }
    await this.__cacheCommands__();
    let query = this.__generateQuery__();
    let countQuery = this.__generateCountQuery__();
    let source = txn ? txn : this.db;
    let countResult = await source.query(countQuery.sql, countQuery.params);
    let result = await source.query(query.sql, query.params);
    return this.__endProcessor__({countResult, result})
  }

  /**
  * Shortcut for .limit(1).select() that only returns a model object or error if not found
  * @param {Transaction} txn Optional: the transaction to use for the count query
  * @returns {Promise<import('./model')>}
  */
  async first (txn) {
    let models = await this.limit(1).select(txn);
    if (!models.length) {
      const error = new Error(`No records for ${this.Model.name} found in your query`);
      error.statusCode = 404;
      throw error;
    }
    return models[0];
  }

  /**
  * Execute query as an update query, changed all fields specified.
  * @param {object} fields The object containing columns (keys) and associated values you'd like to update
  * @param {Transaction} txn Optional: the transaction to use for the count query
  * @returns {Promise<ModelArray>}
  */
  async update (fields, txn) {
    if (txn) {
      if (!(txn instanceof Transaction)) {
        throw new Error('Must provide valid transaction to Composer#transact');
      }
      if (txn.adapter.db !== this.db) {
        throw new Error('Transaction must belong to Model Database');
      }
    }
    await this.__cacheCommands__();
    if (this._readonly) {
      return callback(new Error('Cannot use update in a readonly query.'));
    }
    if (this.__isGrouped__()) {
      throw new Error('Cannot update grouped queries');
    }
    let query = this.__generateQuery__();
    let countQuery = this.__generateCountQuery__();
    let updateQuery = this.__generateUpdateQuery__(fields);
    let source = txn ? txn : this.db;
    let countResult = await source.query(countQuery.sql, countQuery.params);
    let result = await source.query(query.sql, query.params);
    let updateResult = await source.query(updateQuery.sql, updateQuery.params);
    return this.__endProcessor__({countResult, result, updateResult});
  }

}

module.exports = Composer;
