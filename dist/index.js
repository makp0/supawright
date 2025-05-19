"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  withSupawright: () => withSupawright
});
module.exports = __toCommonJS(src_exports);

// src/test.ts
var import_test = require("@playwright/test");

// src/harness.ts
var import_faker2 = require("@faker-js/faker");

// src/fixtures.ts
var Fixtures = class {
  _fixtures = [];
  get(schema, table) {
    if (!table || !schema) {
      return this._fixtures;
    }
    return this._fixtures.filter(
      (fixture) => fixture.table === table && fixture.schema === schema
    );
  }
  add(fixture) {
    this._fixtures.push(fixture);
  }
  update(schema, table, fixture, by) {
    const existingIdx = this._fixtures.findIndex(
      (existingFixture) => existingFixture.table === table && existingFixture.schema === schema && existingFixture.data[by] === fixture.data[by]
    );
    if (existingIdx === -1) {
      throw new Error("No existing fixture found");
    }
    this._fixtures[existingIdx] = fixture;
  }
  clear() {
    this._fixtures = [];
  }
};

// src/tree.ts
var import_faker = require("@faker-js/faker");
var import_ts_postgres = require("ts-postgres");
async function getClient(config) {
  return await (0, import_ts_postgres.connect)({
    host: "localhost",
    port: 54322,
    user: "postgres",
    database: "postgres",
    password: "postgres",
    ...config
  });
}
async function getEnums(schemas, config) {
  const client = await getClient(config);
  const schemasString = schemas.map((s) => `'${s}'`).join(", ");
  const enums = [
    ...await client.query(`
        select
            n.nspname as schema_name,
            t.typname as enum_name,
            e.enumlabel as enum_value
        from pg_type as t
            left join pg_enum as e
                on t.oid = e.enumtypid
            left join pg_catalog.pg_namespace as n
                on n.oid = t.typnamespace
        where n.nspname in (${schemasString})
            and e.enumlabel is not null
`)
  ];
  await client.end();
  const enumValues = {};
  for (const row of enums) {
    if (!enumValues[row.schema_name]) {
      enumValues[row.schema_name] = {};
    }
    if (!enumValues[row.schema_name][row.enum_name]) {
      enumValues[row.schema_name][row.enum_name] = {
        name: row.enum_name,
        schema: row.schema_name,
        values: []
      };
    }
    enumValues[row.schema_name][row.enum_name].values.push(row.enum_value);
  }
  return enumValues;
}
async function getSchemaTree(schemas, config) {
  const client = await getClient(config);
  const schemasString = schemas.map((s) => `'${s}'`).join(", ");
  const results = await client.query(`
        with foreign_keys as (
            select
                tc.table_name, 
                kcu.column_name, 
                tc.constraint_type = 'PRIMARY KEY' as is_primary_key,
                -- Only show foreign key information for foreign keys
                -- Otherwise, we'll get duplicate rows for primary keys
                case
                  when tc.constraint_type = 'FOREIGN KEY'
                    then ccu.table_schema 
                end as foreign_table_schema,
                case
                  when tc.constraint_type = 'FOREIGN KEY'
                    then ccu.table_name 
                end as foreign_table_name,
                case
                  when tc.constraint_type = 'FOREIGN KEY'
                    then ccu.column_name 
                end as foreign_column_name
            from information_schema.table_constraints as tc 
                left join information_schema.key_column_usage as kcu
                    on tc.constraint_name = kcu.constraint_name
                left join information_schema.constraint_column_usage as ccu
                    on ccu.constraint_name = tc.constraint_name
            where tc.constraint_type in ('FOREIGN KEY', 'PRIMARY KEY') and tc.table_schema in (${schemasString})
        )

        select
            cols.table_schema,
            cols.table_name,
            cols.column_name,
            cols.is_nullable,
            cols.column_default,
            cols.is_identity,
            cols.data_type,
            fk.foreign_table_schema,
            fk.foreign_table_name,
            fk.foreign_column_name,
            fk.is_primary_key,
            cols.udt_schema,
            cols.udt_name,
            null as enum_values
        from information_schema.columns as cols
        left join foreign_keys as fk
            on cols.table_name = fk.table_name
                and cols.column_name = fk.column_name
        where cols.table_schema in (${schemasString})
    `);
  await client.end();
  const rows = [...results].filter((row) => {
    const hasDefault = !!row.column_default || row.is_identity === "YES";
    if (!!row.foreign_table_schema || row.is_primary_key || row.is_nullable === "NO" && !hasDefault) {
      return true;
    }
    return false;
  });
  const tables = {};
  for (const row of rows) {
    if (!tables[row.table_schema]) {
      tables[row.table_schema] = {};
    }
    if (!tables[row.table_schema][row.table_name]) {
      tables[row.table_schema][row.table_name] = {
        name: row.table_name,
        schema: row.table_schema,
        requiredColumns: {},
        foreignKeys: {},
        primaryKeys: []
      };
    }
    if (row.foreign_table_schema && row.foreign_table_name) {
      if (!tables[row.foreign_table_schema]) {
        tables[row.foreign_table_schema] = {};
      }
      if (!tables[row.foreign_table_schema][row.foreign_table_name]) {
        tables[row.foreign_table_schema][row.foreign_table_name] = {
          name: row.foreign_table_name,
          schema: row.foreign_table_schema,
          requiredColumns: {},
          foreignKeys: {},
          primaryKeys: []
        };
      }
      tables[row.table_schema][row.table_name].foreignKeys[row.column_name] = {
        table: tables[row.foreign_table_schema][row.foreign_table_name],
        foreignColumnName: row.foreign_column_name,
        nullable: row.is_nullable === "YES"
      };
    }
    const hasDefault = row.column_default || row.is_identity === "YES";
    if (row.is_nullable === "NO" && !hasDefault) {
      tables[row.table_schema][row.table_name].requiredColumns[row.column_name] = row.data_type === "USER-DEFINED" ? { schema: row.udt_schema, name: row.udt_name } : row.data_type;
    }
    if (row.is_primary_key && !tables[row.table_schema][row.table_name].primaryKeys.includes(row.column_name)) {
      tables[row.table_schema][row.table_name].primaryKeys.push(row.column_name);
    }
  }
  return tables;
}
function randint() {
  return Math.floor(Math.random() * 1e3);
}
function randfloat() {
  return Math.random() * 1e3;
}
function randstring() {
  return import_faker.faker.lorem.word() + String((/* @__PURE__ */ new Date()).valueOf());
}
var fakeDataGenerators = {
  integer: randint,
  bigint: randint,
  smallint: randint,
  decimal: randfloat,
  numeric: randfloat,
  real: randfloat,
  double: randfloat,
  "double precision": randfloat,
  money: randfloat,
  character: randstring,
  varchar: randstring,
  text: randstring,
  bytea: randstring,
  "character varying": randstring,
  timestamp: () => (/* @__PURE__ */ new Date()).toISOString(),
  "timestamp with time zone": () => (/* @__PURE__ */ new Date()).toISOString(),
  "timestamp without time zone": () => (/* @__PURE__ */ new Date()).toISOString(),
  date: () => (/* @__PURE__ */ new Date()).toISOString(),
  time: () => (/* @__PURE__ */ new Date()).toISOString(),
  "time with time zone": () => (/* @__PURE__ */ new Date()).toISOString(),
  "time without time zone": () => (/* @__PURE__ */ new Date()).toISOString(),
  interval: () => (/* @__PURE__ */ new Date()).toISOString(),
  boolean: () => import_faker.faker.datatype.boolean(),
  uuid: () => import_faker.faker.string.uuid(),
  json: () => ({}),
  jsonb: () => ({}),
  ARRAY: () => []
};

// src/utils.ts
var import_supabase_js = require("@supabase/supabase-js");
function createSupabaseTestClient(credentials, schema) {
  return (0, import_supabase_js.createClient)(credentials.supabaseUrl, credentials.serviceRoleKey, {
    db: { schema },
    auth: { persistSession: false }
  });
}
var log = {
  debug(...args) {
    process.env.TEST_DEBUG && console.log(...args);
  },
  error(...args) {
    console.error(...args);
  }
};

// src/harness.ts
var DEFAULT_SUPABASE_URL = "http://localhost:54321";
var DEFAULT_SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
var Supawright = class _Supawright {
  schemas;
  tables;
  enums;
  options;
  dependencyGraph;
  _fixtures = new Fixtures();
  static async new(schemas, options) {
    if (!schemas.length) {
      throw new Error("No schemas provided");
    }
    const [tables, enums] = await Promise.all([
      getSchemaTree(schemas, options?.database).catch((e) => {
        throw new Error(`Failed to get schema tree`, { cause: e });
      }),
      getEnums(schemas, options?.database).catch((e) => {
        throw new Error(`Failed to get enums`, { cause: e });
      })
    ]);
    return new _Supawright(schemas, tables, enums, options);
  }
  constructor(schemas, tables, enums, options) {
    this.schemas = schemas;
    this.tables = tables;
    this.enums = enums;
    this.options = options;
    this.dependencyGraph = this.createDependencyGraph();
  }
  record(fixture) {
    this._fixtures.add(fixture);
  }
  fixtures(schema, table) {
    if (!table || !schema) {
      return this._fixtures.get();
    }
    return this._fixtures.get(schema, table);
  }
  /**
   * Refreshes the current object from the database and updates the Supawright
   * instance's internal store
   * @param schema The schema name of the object to refresh
   * @param table The table name of the object to refresh
   * @param current The current object to refresh
   * @param by What column to search by
   * @returns The updated object
   */
  async refresh(schema, table, current, by) {
    const supabase = this.supabase(schema);
    const { data, error } = await supabase.from(table).select().eq(by, current[by]).single();
    if (error) {
      log?.error("Failed to refresh fixture", { error });
      throw new Error("Failed to refresh fixture: " + error.message);
    }
    this._fixtures.update(
      schema,
      table,
      { schema, table, data },
      by
    );
    return data;
  }
  getRootTables() {
    return Object.entries(this.tables).flatMap(([, tables]) => {
      return Object.values(tables).filter((table) => Object.keys(table.foreignKeys).length === 0).map((table) => ({
        schema: table.schema,
        name: table.name
      }));
    });
  }
  /**
   * Search the database from the root tables and discover all records
   * associated with the fixtures.
   *
   * Discovered records are recorded against the Supawright instance for
   * later use.
   */
  async discoverRecords() {
    const tablesToVisit = this.getRootTables();
    log?.debug("Starting record discovery", { tablesToVisit });
    while (tablesToVisit.length) {
      const rootTable = tablesToVisit.shift();
      if (!rootTable) {
        continue;
      }
      const { schema: rootTableSchema, name: rootTableName } = rootTable;
      log?.debug(
        `Discovering records for dependents of ${rootTableSchema}.${rootTableName}`
      );
      const dependentTables = this.dependencyGraph[`${rootTableSchema}.${rootTableName}`];
      const rootTableFixtures = this.fixtures(rootTableSchema, rootTableName);
      for (const [dependentTable, dependencies] of Object.entries(dependentTables)) {
        const [dependentTableSchema, dependentTableName] = dependentTable.split(
          "."
        );
        const supabase = this.supabase(dependentTableSchema);
        let query = supabase.from(dependentTableName).select();
        const filterString = dependencies.map((dependency) => {
          return `${dependency.column}.in.(${rootTableFixtures.map(
            (fixture) => fixture.data[dependency.references]
          ).join(",")})`;
        }).join(", ");
        if (filterString) {
          query = query.or(filterString);
        }
        log?.debug(`Discovering records for ${dependentTable}`);
        const { data, error } = await query;
        if (error) {
          log?.error("Error discovering records", { error });
          throw new Error("Error discovering records: " + error.message);
        }
        data.length && log?.debug(`Discovered ${data.length} records for ${dependentTable}`);
        for (const record of data) {
          this.record({
            schema: dependentTableSchema,
            table: dependentTableName,
            data: record
          });
          tablesToVisit.push({
            schema: dependentTableSchema,
            name: dependentTableName
          });
        }
      }
    }
  }
  /**
   * Creates a test-ready Supabase client for the given schema.
   * @param schema The schema to use for the client
   * @returns A supabase client for the given schema
   */
  supabase(schema) {
    schema = schema ?? this.schemas[0];
    const credentials = {
      supabaseUrl: this.options?.supabase?.supabaseUrl ?? process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
      serviceRoleKey: this.options?.supabase?.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_SUPABASE_SERVICE_ROLE_KEY
    };
    return createSupabaseTestClient(
      credentials,
      schema
    );
  }
  createDependencyGraph() {
    const dependents = {};
    const schemas = [...this.schemas];
    if ("auth" in this.tables) {
      schemas.unshift("auth");
    }
    for (const schema of schemas) {
      if (!this.tables[schema])
        continue;
      for (const table of Object.keys(this.tables[schema] || {})) {
        const key = `${schema}.${table}`;
        if (!dependents[key]) {
          dependents[key] = {};
        }
        for (const [column, dependency] of Object.entries(
          this.tables[schema][table].foreignKeys
        )) {
          const dependencyKey = `${dependency.table.schema}.${dependency.table.name}`;
          if (dependencyKey === key) {
            continue;
          }
          if (!dependents[dependencyKey]) {
            dependents[dependencyKey] = {};
          }
          if (!dependents[dependencyKey][key]) {
            dependents[dependencyKey][key] = [];
          }
          dependents[dependencyKey][key].push({
            column,
            references: dependency.foreignColumnName
          });
        }
      }
    }
    return dependents;
  }
  /**
   * Use topology sort to create an ordering of tables in which they can be
   * deleted without violating foreign key constraints.
   * @returns An array of table names in the order they can be deleted.
   */
  createRecordTypeOrdering() {
    const visited = /* @__PURE__ */ new Set();
    const recordTypeOrdering = [];
    const visit = (table) => {
      if (visited.has(table)) {
        return;
      }
      visited.add(table);
      const dependencies = this.dependencyGraph[table];
      for (const dependency of Object.keys(dependencies)) {
        visit(dependency);
      }
      recordTypeOrdering.push(table);
    };
    for (const table of this.getRootTables()) {
      visit(`${table.schema}.${table.name}`);
    }
    return recordTypeOrdering;
  }
  /**
   * Remove all records added to the database during the Supawright instance's
   * lifecycle.
   *
   * Handles dependencies between fixtures i.e. removes fixtures in an order
   * which respects foreign key constraints.
   */
  async teardown() {
    log?.debug("Tearing down Supawright");
    await this.discoverRecords();
    const recordTypeOrdering = this.createRecordTypeOrdering();
    log?.debug("Deleting records in order", { recordTypeOrdering });
    for (const qualifiedTable of recordTypeOrdering) {
      if (qualifiedTable === "auth.users") {
        continue;
      }
      const [schema, table] = qualifiedTable.split(".");
      const fixtures = this.fixtures(schema, table);
      if (!fixtures.length) {
        continue;
      }
      log?.debug(`Deleting ${fixtures.length} records from ${qualifiedTable}`);
      const tableDefinition = this.tables[schema][table];
      if (!tableDefinition) {
        throw new Error(`Could not find table definition for ${qualifiedTable}`);
      }
      const supabase2 = this.supabase(schema);
      let deletionQuery = supabase2.from(table).delete();
      if (tableDefinition.primaryKeys.length > 0) {
        const filterStrings = [];
        for (const fixture of fixtures) {
          const filterString = tableDefinition.primaryKeys.map((key) => `${key}.eq.${fixture.data[key]}`).join(",");
          if (tableDefinition.primaryKeys.length > 1) {
            filterStrings.push(`and(${filterString})`);
          } else {
            filterStrings.push(filterString);
          }
        }
        deletionQuery = deletionQuery.or(filterStrings.join(","));
      } else {
        throw new Error(
          `Cannot delete records from table ${qualifiedTable} as it has no primary key`
        );
      }
      const { data, error } = await deletionQuery.select();
      if (error) {
        log?.error("Error deleting records", { error });
        throw new Error("Error deleting records: " + error.message);
      }
      log?.debug(`Deleted ${data?.length} records from ${qualifiedTable}`);
    }
    const authRecordsToRemove = this.fixtures("auth", "users").map(
      (fixture) => fixture.data.id
    );
    log?.debug("Deleting storage objects");
    const supabase = this.supabase(this.schemas[0]);
    await Promise.allSettled(
      (await supabase.storage.listBuckets()).data?.map(async (bucket) => {
        const { data: allObjects, error } = await supabase.storage.from(bucket.name).list();
        if (error) {
          log?.error("Error listing objects in bucket", { error, bucket });
          throw new Error("Error listing objects in bucket: " + error.message);
        }
        await supabase.storage.from(bucket.name).remove(
          allObjects?.filter((object) => authRecordsToRemove.includes(object.owner)).map((object) => object.name) ?? []
        );
      }) ?? []
    );
    log?.debug(`Removing ${authRecordsToRemove.length} auth records`);
    for (const authRecord of authRecordsToRemove) {
      const { error } = await supabase.auth.admin.deleteUser(authRecord);
      if (error) {
        log?.error("Error removing auth record", { error, authRecord });
        throw new Error(`Error removing auth record ${authRecord}: ` + error.message);
      }
    }
    this._fixtures.clear();
  }
  /**
   * Creates a new user using `supabase.auth.admin.createUser` and records
   * it in Supawright.
   * @param attributes The user attributes usually passed to
   * `supabase.auth.admin.createUser`
   * @throws If the user could not be created
   */
  async createUser(attributes) {
    const { data, error } = await this.supabase().auth.admin.createUser({
      email: import_faker2.faker.internet.email(),
      password: import_faker2.faker.internet.password(),
      ...attributes
    });
    if (error) {
      log.error("Error creating user", { error, attributes });
      throw new Error("Error creating user: " + error.message);
    }
    this.record({
      schema: "auth",
      table: "users",
      data: data.user
    });
    return data.user;
  }
  async create(schemaOrTable, tableOrData, data) {
    let schema;
    let table;
    if (typeof tableOrData === "string") {
      schema = schemaOrTable;
      table = tableOrData;
    } else {
      schema = "public";
      table = schemaOrTable;
      data = tableOrData;
    }
    log?.debug(`create('${table}', '${JSON.stringify(data)}')`);
    const dataGenerators = {
      ...fakeDataGenerators,
      ...this.options?.generators
    };
    if (schema === "auth" && table === "users" && !this.options?.overrides?.auth?.users) {
      return await this.createUser(data);
    }
    const supabase = this.supabase(schema);
    if (this.options?.overrides?.[schema]?.[table]) {
      const newFixtures = await this.options.overrides[schema][table]({
        supawright: this,
        data: data ?? {},
        supabase,
        generators: dataGenerators
      });
      for (const newFixture of newFixtures) {
        this.record(newFixture);
      }
      const fixtureForTable = newFixtures.find((fixture) => fixture.table === table);
      if (!fixtureForTable) {
        throw new Error(`No fixture for table ${table} returned by custom creator`);
      }
      return fixtureForTable.data;
    }
    if (!data) {
      data = {};
    }
    const row = this.tables[schema][table];
    for (const [column, type] of Object.entries(row.requiredColumns)) {
      if (data[column]) {
        continue;
      }
      if (row.foreignKeys[column] && !row.foreignKeys[column].nullable) {
        const newTable = row.foreignKeys[column].table.name;
        const newSchema = row.foreignKeys[column].table.schema;
        let newRecord;
        log.debug(`Looking for existing record for ${newSchema}.${newTable}`);
        log.debug(this._fixtures);
        const fixtures = this._fixtures.get(newSchema, newTable);
        if (fixtures.length > 0) {
          log.debug(`Found ${fixtures.length} existing records`);
          newRecord = fixtures[0].data;
        } else {
          log.debug("No existing records found, creating new record");
          newRecord = await this.create(newSchema, newTable, {});
        }
        data[column] = newRecord[row.foreignKeys[column].foreignColumnName];
      } else if (!row.foreignKeys[column]) {
        data[column] = this.getGeneratedValueForType(
          table,
          column,
          type
        );
      }
    }
    const { data: insertData, error } = await supabase.from(table).insert(data).select().single();
    if (error) {
      log?.error("Error inserting data", { error, table });
      throw new Error(
        `Error inserting data into ${table}: ` + error.message + "\nData: " + JSON.stringify(data)
      );
    }
    data = insertData;
    log.debug(`Recording ${schema}.${table}`);
    this.record({ schema, table, data });
    return data;
  }
  /**
   * Generate data for the column. First try the user-defined generators,
   * then fall back to built-in generators. If the column is a USER-DEFINED
   * enum, fall back to using a random enum value instead.
   *
   * `type` will be an object if it's a user-defined type, and a string
   * otherwise.
   */
  getGeneratedValueForType(table, column, type) {
    let val = null;
    if (typeof type === "string") {
      if ((type.includes("text") || type.includes("varchar")) && column.includes("email")) {
        return import_faker2.faker.internet.email();
      }
      const userDefinedGenerator = this.options?.generators?.[type];
      val = userDefinedGenerator?.(table, column);
      if (val !== null && val !== void 0) {
        return val;
      }
      const builtInGenerator = fakeDataGenerators[type];
      val = builtInGenerator?.();
      if (val !== null && val !== void 0) {
        return val;
      }
    } else {
      const enumType = this.enums[type.schema][type.name];
      if (this.options?.generators?.["USER-DEFINED"]) {
        val = this.options.generators["USER-DEFINED"](table, column);
        if (val !== null && val !== void 0) {
          return val;
        }
      }
      if (enumType) {
        val = enumType.values[Math.floor(Math.random() * enumType.values.length)];
        if (val !== null && val !== void 0) {
          return val;
        }
      }
    }
    if (!val) {
      throw new Error(`No generator for type ${JSON.stringify(type)}`);
    }
    return val;
  }
};

// src/test.ts
function withSupawright(schemas, options) {
  let beforeAllHasRun = false;
  return import_test.test.extend({
    supawright: async ({ page }, use) => {
      const { beforeTeardown, beforeAll, ...supawrightOptions } = options ?? {};
      let supawright;
      try {
        supawright = await Supawright.new(schemas, supawrightOptions);
      } catch (error) {
        throw new Error(`Supawright setup failed`, { cause: error });
      }
      try {
        if (!beforeAllHasRun && beforeAll) {
          beforeAllHasRun = true;
          if (Array.isArray(beforeAll)) {
            for (const fn of beforeAll) {
              await fn({ supawright, page });
            }
          } else {
            await beforeAll({ supawright, page });
          }
        }
        await use(supawright);
        if (beforeTeardown) {
          await beforeTeardown({ supawright, page });
        }
      } finally {
        try {
          await supawright.teardown();
        } catch (error) {
          throw new Error(`Supawright teardown failed`, { cause: error });
        }
      }
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  withSupawright
});
