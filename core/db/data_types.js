const NOOP_CONVERTER = {
  convert: v => v
};
const INT_CONVERTER = {
  convert: v => {
    return Math.max(Math.min(parseInt(v) || 0, Number.MAX_SAFE_INTEGER), Number.MIN_SAFE_INTEGER);
  }
};
const FLOAT_CONVERTER = {
  convert: v => {
    return parseFloat(v) || 0;
  }
};
const STRING_CONVERTER = {
  convert: v => {
    return v === null ? '' : (v + '');
  }
};
const TIMESTAMP_CONVERTER = {
  convert: v => {
    if (!(v instanceof Date)) {
      v = new Date(v);
      if (v.toString() === 'Invalid Date') {
        v = new Date(0);
      }
    }
    return v;
  }
};
const BOOLEAN_CONVERTER = {
  convert: v => {
    return typeof v === 'string' ? [true, false][({'f':1,'false':1,'n':1,'no':1,'off':1,'0':1,'':1}[v]|0)] : !!v;
  }
};
const JSON_CONVERTER = {
  convert: v => {
    return typeof v === 'string' ? JSON.parse(v) : v;
  }
};

const VECTOR_CONVERTER = {
  convert: v => {
    if (Array.isArray(v)) {
      return v.map(v => parseFloat(v) || 0);
    } else if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch (e) {
        return [];
      }
    } else {
      return [];
    }
  }
};

module.exports = {

  /* aliased types */
  'serial': INT_CONVERTER,
  'int': INT_CONVERTER,
  'currency': INT_CONVERTER,
  'float': FLOAT_CONVERTER,
  'string': STRING_CONVERTER,
  'text': STRING_CONVERTER,
  'datetime': TIMESTAMP_CONVERTER,
  'boolean': BOOLEAN_CONVERTER,
  'json': JSON_CONVERTER,

  /* all other SQL types */
  'bigint': INT_CONVERTER,
    'int8': INT_CONVERTER,
  'bigserial': INT_CONVERTER,
    'serial8': INT_CONVERTER,
  'bit': INT_CONVERTER,
  'bit varying': INT_CONVERTER,
    'varbit': INT_CONVERTER,
  'bool': BOOLEAN_CONVERTER,
  'box': NOOP_CONVERTER,
  'bytea': NOOP_CONVERTER,
  'character': STRING_CONVERTER,
  'char': STRING_CONVERTER,
  'character varying': STRING_CONVERTER,
    'varchar': STRING_CONVERTER,
  'cidr': STRING_CONVERTER,
  'circle': NOOP_CONVERTER,
  'date': TIMESTAMP_CONVERTER,
  'double precision': FLOAT_CONVERTER,
    'float8': FLOAT_CONVERTER,
  'inet': NOOP_CONVERTER,
  'integer': INT_CONVERTER,
    'int': INT_CONVERTER,
    'int4': INT_CONVERTER,
  'interval': STRING_CONVERTER,
  'jsonb': JSON_CONVERTER,
  'line': NOOP_CONVERTER,
  'lseg': NOOP_CONVERTER,
  'macaddr': NOOP_CONVERTER,
  'macaddr8': NOOP_CONVERTER,
  'money': FLOAT_CONVERTER,
  'numeric': FLOAT_CONVERTER,
  'path': NOOP_CONVERTER,
  'pg_lsn': NOOP_CONVERTER,
  'pg_snapshot': NOOP_CONVERTER,
  'point': NOOP_CONVERTER,
  'polygon': NOOP_CONVERTER,
  'real': FLOAT_CONVERTER,
    'float4': FLOAT_CONVERTER,
  'smallint': INT_CONVERTER,
    'int2': INT_CONVERTER,
  'smallserial': INT_CONVERTER,
    'serial2': INT_CONVERTER,
  'serial4': INT_CONVERTER,
  'text': STRING_CONVERTER,
  'time': TIMESTAMP_CONVERTER,
    'time without time zone': TIMESTAMP_CONVERTER,
  'time with time zone': TIMESTAMP_CONVERTER,
  'timestamp': TIMESTAMP_CONVERTER,
    'timestamp without time zone': TIMESTAMP_CONVERTER,
  'timestamp with time zone': TIMESTAMP_CONVERTER,
  'tsquery': NOOP_CONVERTER,
  'tsvector': NOOP_CONVERTER,
  'txid_snapshot': NOOP_CONVERTER,
  'uuid': STRING_CONVERTER,
  'xml': STRING_CONVERTER,

  'vector': VECTOR_CONVERTER

};
