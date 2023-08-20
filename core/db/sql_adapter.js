class SQLAdapter {

  name = 'GenericSQL';

  constructor () {
    this.typeProperties = Object.keys(this.typePropertyDefaults);
  }
  close () {}

  readErrorCode () {}

  createTransaction () {}
  createSerializableTransaction () {}

  async beginClient () {}
  async beginSerializableClient () {}
  async queryClient () {}
  async rollbackClient () {}
  async commitClient () {}

  async query () {}
  async transact () {}

  async drop () {}
  async create () {}

  async introspect () {} // retrieves schema

  generateConnectionString (host, port, database, user, password) {}
  parseConnectionString (str) {}

  generateArray () {}

  generateClearDatabaseQuery () {}
  generateCreateDatabaseQuery () {}
  generateDropDatabaseQuery () {}

  generateIndex () {}
  generateConstraint () {}

  generateColumn (columnName, type, properties) {}
  generateAlterColumn (columnName, type, properties) {}
  generateAlterColumnSetNull (columnName, type, properties) {}
  generatePrimaryKey (columnName, type, properties) {}
  generateUniqueKey (columnName, type, properties) {}

  generateAlterTableRename (table, newTableName) {}

  generateAlterTableColumnType (table, columnName, columnType, columnProperties) {}
  generateAlterTableAddPrimaryKey (table, columnName) {}
  generateAlterTableDropPrimaryKey (table, columnName) {}
  generateAlterTableAddUniqueKey (table, columnName) {}
  generateAlterTableDropUniqueKey (table, columnName) {}

  generateAlterTableAddColumn (table, columnName, columnType, columnProperties) {}
  generateAlterTableDropColumn (table, columnName) {}
  generateAlterTableRenameColumn (table, columnName, newColumnName) {}

  generateCreateIndex (table, columnName, indexType) {}
  generateDropIndex (table, columnName) {}

  generateForeignKeyQuery (table, referenceTable) {}
  generateDropForeignKeyQuery (table, referenceTable) {}

  sanitize (type, value) {

    let fnSanitize = this.sanitizeType[type];
    return fnSanitize ? fnSanitize(value) : value;

  }

  escapeField (name) {
    return ['', name, ''].join(this.escapeFieldCharacter);
  }

  getTypeProperties (typeName, optionalValues) {

    let type = this.simpleTypes[typeName];
    let typeProperties = type ? (type.properties || {}) : {};

    optionalValues = optionalValues || {};

    let outputType = Object.create(this.typePropertyDefaults);
    this.typeProperties.forEach(function(v) {
      if (optionalValues.hasOwnProperty(v)) {
        outputType[v] = optionalValues[v];
      } else if(typeProperties.hasOwnProperty(v)) {
        outputType[v] = typeProperties[v];
      }
    });

    return outputType;

  }

  getTypeDbName (typeName) {
    let type = this.simpleTypes[typeName];
    return type ? type.dbName : typeName;
  }

  generateColumnsStatement (table, columns) {
    let self = this;
    return columns
      .map(function(columnData) {
        return self.generateColumn(columnData.name, self.getTypeDbName(columnData.type), self.getTypeProperties(columnData.type, columnData.properties));
      })
      .join(',');
  }

  getAutoIncrementKeys (columns) {

    let self = this;
    return columns.filter(function(columnData) {
      return self.getTypeProperties(columnData.type, columnData.properties).auto_increment;
    });

  };

  getPrimaryKeys (columns) {

    let self = this;
    return columns
      .filter(function(columnData) {
        return self.getTypeProperties(columnData.type, columnData.properties).primary_key;
      });


  }

  getUniqueKeys (columns) {

    let self = this;
    return columns
      .filter(function(columnData) {
        let type = self.getTypeProperties(columnData.type, columnData.properties);
        return (!type.primary_key && type.unique);
      });

  }

  generatePrimaryKeysStatement (table, columns) {
    let self = this;
    return this.getPrimaryKeys(columns)
      .map(function(columnData) {
        return self.generatePrimaryKey(table, columnData.name);
      })
      .join(',');
  }

  generateUniqueKeysStatement (table, columns) {

    return this.getUniqueKeys(columns)
      .map(columnData => this.generateUniqueKey(table, columnData.name))
      .join(',');

  }

  generateCreateTableQuery (table, columns) {

    return [
      'CREATE TABLE ',
        this.escapeField(table),
      '(',
        [
          this.generateColumnsStatement(table, columns),
          this.generatePrimaryKeysStatement(table, columns),
          this.generateUniqueKeysStatement(table, columns)
        ].filter(function(v) { return !!v; }).join(','),
      ')'
    ].join('');

  }

  generateDropTableQuery (table, ifExists) {

    return `DROP TABLE ${ifExists?'IF EXISTS ':''}${this.escapeField(table)}`;

  }

  generateTruncateTableQuery (table) {

    return `TRUNCATE TABLE ${this.escapeField(table)} RESTART IDENTITY`;

  }

  generateUnionQuery (queries) {
    return queries.map(q => `(${q})`).join(' UNION ');
  }

  generateSelectQuery (subQuery, table, columns, multiFilter, joinArray, groupByArray, orderByArray, limitObj, paramOffset) {

    let formatTableField = (table, column) => `${this.escapeField(table)}.${this.escapeField(column)}`;
    let joinNames = joinArray ? joinArray.map(j => j.shortAlias) : null;

    if (typeof subQuery === 'object' && subQuery !== null) {
      subQuery = this.escapeField(subQuery.table);
    } else {
      subQuery = subQuery ? `(${subQuery})` : table;
    }

    groupByArray = groupByArray || [];
    orderByArray = orderByArray || [];

    return [
      'SELECT ',
        columns === '*'
          ? '*'
          : columns.map(field => {
            let defn;
            field = typeof field !== 'string' ? field : {columnNames: [field], alias: field, transformation: v => v};
            if (!joinNames || !field.joined || joinNames.indexOf(field.identifier) > -1) {
              defn = field.transformation.apply(null, field.columnNames.map(columnName => {
                return formatTableField(field.identifier || field.table || table, columnName);
              }));
            } else {
              defn = this.generateNullField(field.type);
            }
            return `(${defn}) AS ${this.escapeField(field.shortAlias || field.alias)}`;
          }).join(','),
      ' FROM ',
        subQuery,
        ' AS ',
        this.escapeField(table),
        this.generateJoinClause(table, joinArray, paramOffset),
        this.generateWhereClause(table, multiFilter, paramOffset),
        this.generateGroupByClause(table, groupByArray),
        this.generateOrderByClause(table, orderByArray, groupByArray, joinArray),
        this.generateLimitClause(limitObj)
    ].join('');

  }

  generateNullField (type) {
    return `NULL::${this.getTypeDbName(type)}`;
  };

  generateCountQuery (subQuery, table) {

    return [
      `SELECT COUNT(*) `,
      `AS __total__ FROM `,
      subQuery ? `(${subQuery}) AS ` : '',
      `${this.escapeField(table)}`
    ].join('');

  }

  generateUpdateQuery (table, columnNames) {

    return this.generateUpdateAllQuery(table, columnNames[0], columnNames.slice(1), [], 1);

  }

  generateUpdateAllQuery (table, pkColumn, columnNames, columnFunctions, offset, subQuery) {

    let fields = columnNames
      .map(this.escapeField.bind(this))
      .concat(columnFunctions.map(f => this.escapeField(f[0])));

    let params = columnNames
      .map((v, i) => '$' + (i + offset + 1))
      .concat(columnFunctions.map(f => {
        let fn = f[2];
        let fields = f[1];
        fields = fields instanceof Array ? fields : [fields];
        return fn.apply(null, fields.map(field => this.escapeField(field)));
      }));

    return [
      `UPDATE ${this.escapeField(table)}`,
      ` SET (${fields.join(',')}) = ROW(${params.join(',')})`,
      ` WHERE (`,
        this.escapeField(pkColumn),
        subQuery ? ` IN (${subQuery})` : ` = $1`,
      `) RETURNING *`
    ].join('');

  }

  generateDeleteQuery (table, columnNames) {

    return [
      'DELETE FROM ',
        this.escapeField(table),
      ' WHERE (',
        columnNames.map(this.escapeField.bind(this)).join(','),
      ') = (',
        columnNames.map(function(v, i) { return '$' + (i + 1); }).join(','),
      ') RETURNING *'
    ].join('');

  }

  generateDeleteAllQuery (table, columnName, values, joins) {

    let subQuery;

    if (!joins) {

      subQuery = `${values.map((v, i) => '\$' + (i + 1))}`;

    } else {

      subQuery = [
        `SELECT ${this.escapeField(table)}.${this.escapeField(columnName)} FROM ${this.escapeField(table)}`
      ];

      subQuery = subQuery.concat(
        joins.slice().reverse().map((j, i) => {
          return [
            `INNER JOIN ${this.escapeField(j.prevTable)} ON `,
            `${this.escapeField(j.prevTable)}.${this.escapeField(j.prevColumn)} = `,
            `${this.escapeField(j.joinTable)}.${this.escapeField(j.joinColumn)}`,
            i === joins.length - 1 ?
              ` AND ${this.escapeField(j.prevTable)}.${this.escapeField(j.prevColumn)} IN (${values.map((v, i) => '\$' + (i + 1))})` : ''
          ].join('')
        })
      ).join(' ');

    }

    return [
      `DELETE FROM ${this.escapeField(table)}`,
      `WHERE ${this.escapeField(table)}.${this.escapeField(columnName)}`,
      `IN (${subQuery})`
    ].join(' ');

  }

  generateInsertQuery (table, columnNames) {
    return [
      'INSERT INTO ',
        this.escapeField(table),
      '(',
        columnNames.map(this.escapeField.bind(this)).join(','),
      ') VALUES(',
        columnNames.map(function(v, i) { return '$' + (i + 1); }).join(','),
      ') RETURNING *'
    ].join('');
  }

  generateAlterTableQuery (table, columnName, type, properties) {

    let queries = [];

    if (type) {
      queries.push(
        this.generateAlterTableColumnType(
          table,
          columnName,
          this.getTypeDbName(type),
          this.getTypeProperties(type, properties)
        )
      );
    }

    if (properties.hasOwnProperty('primary_key')) {
      queries.push(
        [
          this.generateAlterTableDropPrimaryKey,
          this.generateAlterTableAddPrimaryKey
        ][properties.primary_key | 0].call(this, table, columnName)
      );
    } else if (properties.hasOwnProperty('unique')) {
      queries.push(
        [
          this.generateAlterTableDropUniqueKey,
          this.generateAlterTableAddUniqueKey
        ][properties.unique | 0].call(this, table, columnName)
      );
    }

    return queries.join(';');

  }

  generateAlterTableAddColumnQuery (table, columnName, type, properties) {

    return this.generateAlterTableAddColumn(
      table,
      columnName,
      this.getTypeDbName(type),
      this.getTypeProperties(type, properties)
    );

  }

  generateAlterTableDropColumnQuery (table, columnName) {

    return this.generateAlterTableDropColumn(table, columnName);

  }

  generateAlterTableRenameColumnQuery (table, columnName, newColumnName) {

    return this.generateAlterTableRenameColumn(table, columnName, newColumnName);

  }

  generateCreateIndexQuery (table, columnName, indexType) {

    indexType = indexType || 'btree';

    return this.generateCreateIndex(table, columnName, indexType);

  }

  generateDropIndexQuery (table, columnName) {

    return this.generateDropIndex(table, columnName);

  }

  preprocessWhereObj (table, whereObj) {
    return whereObj;
  }

  parseWhereObj (table, whereObj) {

    return whereObj.map((where, i) => {
      return {
        table: where.table,
        alias: where.alias,
        columnName: where.columnName,
        refName: [this.escapeField(where.table || table), this.escapeField(where.columnName)].join('.'),
        comparator: where.comparator,
        value: (
          where.valueFunction ?
            where.valueFunction.apply(
              null,
              where.valueColumnNames.map(columnName => {
                return [this.escapeField(where.table || table), this.escapeField(columnName)].join('.');
              })
            ) :
            where.value
        ),
        sanitize: !where.valueFunction,
        ignoreValue: !!this.comparatorIgnoresValue[where.comparator],
        joined: where.joined,
        joins: where.joins
      };
    });

  }

  createMultiFilter (table, whereObjArray) {

    return whereObjArray
      .filter(v => v)
      .sort((a, b) => a.joined === b.joined ? a.table > b.table : a.joined > b.joined) // important! must be sorted.
      .map(v => this.preprocessWhereObj(table, v))
      .filter(v => v && v.length > 0)
      .map(v => this.parseWhereObj(table, v));

  }

  generateWhereClause (table, multiFilter, paramOffset) {

    paramOffset = Math.max(0, parseInt(paramOffset) || 0);

    if (
      !multiFilter ||
      !multiFilter.length
    ) {
      return '';
    }

    return ` WHERE ${this.generateOrClause(table, multiFilter, paramOffset)}`;

  }

  generateOrClause (table, multiFilter, paramOffset) {

    paramOffset = Math.max(0, parseInt(paramOffset) || 0);

    if (!multiFilter || !multiFilter.length) {
      return '';
    }

    return ('(' + multiFilter.map((whereObj) => {
      let andClause = this.generateAndClause(table, whereObj, paramOffset);
      paramOffset = andClause.offset;
      return andClause.sql;
    }).join(') OR (') + ')');

  }

  generateAndClause (table, whereObjArray, paramOffset) {

    paramOffset = Math.max(0, parseInt(paramOffset) || 0);

    let comparators = this.comparators;

    if (!whereObjArray.length) {
      return {
        sql: '',
        offset: paramOffset
      };
    }

    let lastTable = null;
    let clauses = [];
    let joinedTables = {};
    let joinedClauses = [];

    for (let i = 0; i < whereObjArray.length; i++) {

      let whereObj = whereObjArray[i];
      let joined = whereObj.joined;
      let table = whereObj.table;
      let alias = whereObj.alias;
      let clause = whereObj.sanitize
        ? comparators[whereObj.comparator](whereObj.refName, whereObj.value).replace(
            /__VAR__/gi,
            () => {
              return `\$${1 + paramOffset++}`;
            }
          )
          : comparators[whereObj.comparator](whereObj.refName, whereObj.value).replace(/__VAR__/gi, whereObj.value)

      if (!joined) {

        clauses.push(clause);

      } else {

        if (joinedTables[alias]) {
          joinedTables[alias].clauses.push(clause);
        } else {
          let joinedClause = {
            table: table,
            joins: whereObj.joins,
            clauses: [clause]
          };
          joinedTables[alias] = joinedClause;
          joinedClauses.push(joinedClause);
          clauses.push(null);
        }

      }

    }

    joinedClauses = joinedClauses.map(jc => {

      return [
        `(`,
          `SELECT ${this.escapeField(jc.table)}.${this.escapeField('id')} `,
          `FROM ${this.escapeField(jc.table)} `,
          jc.joins.map((join, i) => {
            return [
              `INNER JOIN ${this.escapeField(join.joinTable)} AS ${this.escapeField(join.shortAlias || join.joinAlias)} ON `,
              `${this.escapeField(join.shortAlias || join.joinAlias)}.${this.escapeField(join.joinColumn)} = `,
              `${this.escapeField(join.prevTable || table)}.${this.escapeField(join.prevColumn)}`,
              i === jc.joins.length - 1 ?
                [
                  ` AND `,
                  `${this.escapeField(join.shortAlias || join.joinAlias)}.${this.escapeField(join.joinColumn)} = `,
                  `${this.escapeField(jc.table)}.${this.escapeField(join.joinColumn)} `,
                  `AND (${jc.clauses.join(' AND ')}) `
                ].join('') : ''
            ].join('')
          }).join(' '),
          `LIMIT 1`,
        `) IS NOT NULL`
      ].join('');

    });

    clauses = clauses.map(c => {
      if (!c) {
        return joinedClauses.shift();
      }
      return c;
    });

    return {
      sql: clauses.join(' AND '),
      offset: paramOffset
    };

  }

  getParamsFromMultiFilter (multiFilter) {
    return [].concat.apply([], multiFilter)
      .filter(whereObj => !whereObj.ignoreValue && whereObj.sanitize)
      .map(whereObj => whereObj.value);
  }

  generateOrderByClause (table, orderByArray, groupByArray, joinArray) {

    let columnEscapedOrderByArray = orderByArray.map(v => {
      v.escapedColumns = v.columnNames.map((columnName) => {
        let columnNameComponents = columnName.split('__');
        if (columnNameComponents.length === 1) {
          return `${this.escapeField(table)}.${this.escapeField(columnName)}`;
        } else if (joinArray) {
          let join = joinArray.find((join) => join.joinAlias === columnNameComponents.slice(0, -1).join('__'));
          if (!join) {
            return `${this.escapeField(table)}.${this.escapeField(columnName)}`;
          }
          return `${this.escapeField(join.shortAlias)}.${this.escapeField(columnNameComponents[columnNameComponents.length - 1])}`
        } else {
          return null;
        }
      }).filter((columnName) => {
        return !!columnName;
      });
      return v;
    }).filter((v) => {
      return v.escapedColumns.length;
    });

    return !columnEscapedOrderByArray.length ? '' : ' ORDER BY ' + columnEscapedOrderByArray.map(v => {
      return `${(v.transformation || (v => v)).apply(null, v.escapedColumns)} ${v.direction}`;
    }).join(', ');

  }

  generateJoinClause (table, joinArray, paramOffset) {

    paramOffset = Math.max(0, parseInt(paramOffset) || 0);
    let joinedAlready = {};

    if (!joinArray || !joinArray.length) {
      return '';
    }

    //let joinData = joinArray.filter(join => !joinedAlready[join.joinAlias]);

    return joinArray.map((join, i) => {

      joinedAlready[join.joinAlias] = true;

      let joinColumns = join.joinColumn instanceof Array ? join.joinColumn : [join.joinColumn]
      let prevColumns = join.prevColumn instanceof Array ? join.prevColumn : [join.prevColumn]

      let statements = [];

      joinColumns.forEach(joinColumn => {
        prevColumns.forEach(prevColumn => {
          statements.push(
            `${this.escapeField(join.shortAlias)}.${this.escapeField(joinColumn)} = ` +
            `${this.escapeField(join.prevShortAlias || table)}.${this.escapeField(prevColumn)}`
          );
        });
      });

      let filterClause = this.generateOrClause(join.shortAlias, join.multiFilter, paramOffset);
      join.multiFilter && join.multiFilter.forEach(arr => {
        paramOffset += arr.filter(where => !where.ignoreValue).length;
      });

      return [
        ` LEFT JOIN ${this.escapeField(join.joinTable)}`,
        ` AS ${this.escapeField(join.shortAlias)}`,
        ` ON (${statements.join(' OR ')}`,
        filterClause ? ` AND (${filterClause})` : '',
        ')'
      ].join('');

    }).join('')

  }

  generateGroupByClause (table, groupByArray) {

    return !groupByArray.length ? '' : ' GROUP BY ' + groupByArray.map(v => {
      let columns = v.columnNames.map(column => `${this.escapeField(table)}.${this.escapeField(column)}`);
      return v.transformation.apply(null, columns);
    }).join(', ');

  }

  generateLimitClause (limitObj) {

    return (!limitObj) ? '' : [
      ' LIMIT ',
      limitObj.offset,
      ', ',
      limitObj.count
    ].join('');

  }

  aggregate (aggregator) {

    return typeof aggregator === 'function' ? aggregator : (
      (this.aggregates.hasOwnProperty(aggregator) ?
        this.aggregates[aggregator] :
        this.aggregates[this.defaultAggregate])
    );

  }

}

SQLAdapter.prototype.typePropertyDefaults = {
  // maxLength: null,
  nullable: true,
  unique: false,
  primary_key: false,
  auto_increment: false,
  array: false
};

SQLAdapter.prototype.indexTypes = [];

SQLAdapter.prototype.comparators = {
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
  not_in: field => `NOT (ARRAY[${field}] <@ __VAR__)`
};

SQLAdapter.prototype.comparatorIgnoresValue = {
  is_null: true,
  is_true: true,
  is_false: true,
  not_null: true,
  not_true: true,
  not_false: true
};

SQLAdapter.prototype.comparatorExpectsArray = {
  in: true,
  not_in: true
};

SQLAdapter.prototype.documentTypes = [];

SQLAdapter.prototype.aggregates = {
  'sum': field => `SUM(${field})`,
  'avg': field => `AVG(${field})`,
  'min': field => `MIN(${field})`,
  'max': field => `MAX(${field})`,
  'count': field => `COUNT(${field})`,
  'distinct': field => `COUNT(DISTINCT(${field}))`,
  'none': field => `NULL`,
  'min_date': field => `MIN(DATE_TRUNC('day', ${field}))`,
  'max_date': field => `MAX(DATE_TRUNC('day', ${field}))`,
  'count_true': field => `COUNT(CASE WHEN ${field} THEN 1 ELSE NULL END)`
};

SQLAdapter.prototype.defaultAggregate = 'none';

SQLAdapter.prototype.simpleTypes = {};
// SQL Spec: See note on https://www.postgresql.org/docs/current/datatype.html
SQLAdapter.prototype.allTypes = [
  'bigint',
  'bit',
  'bit varying',
  'boolean',
  'char', 'character',
  'character varying', 'varchar',
  'date',
  'double precision',
  'integer',
  'interval',
  'numeric',
  'decimal',
  'real',
  'smallint',
  'time', 'time without time zone',
  'time with time zone',
  'timestamp', 'timestamp without time zone',
  'timestamp with time zone',
  'xml'
];
SQLAdapter.prototype.sanitizeType = {};
SQLAdapter.prototype.escapeFieldCharacter = '';
SQLAdapter.prototype.columnDepthDelimiter = '';
SQLAdapter.prototype.whereDepthDelimiter = '';

SQLAdapter.prototype.supportsForeignKey = false;

module.exports = SQLAdapter;
