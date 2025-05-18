import { Page, TestType, PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions } from '@playwright/test';
import { SupabaseClient, AdminUserAttributes, User } from '@supabase/supabase-js';
import { GenericSchema } from '@supabase/supabase-js/dist/module/lib/types';
import { Configuration } from 'ts-postgres';

type GenericDatabase = Record<string, GenericSchema>;
type SchemaOf<Database extends GenericDatabase> = string & keyof Database;
type TableIn<Database extends GenericDatabase, Schema extends SchemaOf<Database>> = string & keyof Database[Schema]['Tables'];
type Select<Database extends GenericDatabase, Schema extends SchemaOf<Database>, Table extends TableIn<Database, Schema>> = Database[Schema]['Tables'][Table]['Row'];
type Insert<Database extends GenericDatabase, Schema extends SchemaOf<Database>, Table extends TableIn<Database, Schema>> = Database[Schema]['Tables'][Table]['Insert'];
type Fixture<Database extends GenericDatabase, Schema extends SchemaOf<Database>, Table extends TableIn<Database, Schema>> = {
    schema: string;
    table: Table;
    data: Select<Database, Schema, Table>;
};
type SomePostgresType = 'integer' | 'bigint' | 'smallint' | 'decimal' | 'numeric' | 'real' | 'double' | 'double precision' | 'money' | 'character' | 'varchar' | 'text' | 'bytea' | 'character varying' | 'timestamp' | 'timestamp with time zone' | 'timestamp without time zone' | 'date' | 'time' | 'time with time zone' | 'time without time zone' | 'interval' | 'boolean' | 'uuid' | 'json' | 'jsonb' | 'ARRAY' | 'USER-DEFINED';
type PostgresType = SomePostgresType | (Omit<string, SomePostgresType> & string);
type SupabaseClientCredentials = {
    supabaseUrl: string;
    serviceRoleKey: string;
};

type Generator<Database extends GenericDatabase, Schema extends SchemaOf<Database>> = (() => unknown) | ((table: TableIn<Database, Schema>, column: string) => unknown);
type Generators<Database extends GenericDatabase, Schema extends SchemaOf<Database>> = Partial<Record<PostgresType, Generator<Database, Schema>>>;
type Creator<Database extends GenericDatabase, Schema extends SchemaOf<Database>, Table extends TableIn<Database, Schema>> = (params: {
    supawright: Supawright<Database, Schema>;
    data: Partial<Insert<Database, Schema, Table>>;
    supabase: SupabaseClient<Database, Schema>;
    generators: Generators<Database, Schema>;
}) => Promise<Fixture<Database, Schema | 'auth', TableIn<Database, Schema> | 'users'>[]>;
type UserCreator<Database extends GenericDatabase, Schema extends SchemaOf<Database>> = (params: {
    supawright: Supawright<Database, Schema>;
    data: AdminUserAttributes;
    supabase: SupabaseClient<Database, Schema>;
    generators: Generators<Database, Schema>;
}) => Promise<Fixture<Database, Schema | 'auth', TableIn<Database, Schema> | 'users'>[]>;
type SupawrightOptions<Database extends GenericDatabase, Schema extends SchemaOf<Database>> = {
    generators?: Generators<Database, Schema>;
    overrides?: {
        [S in Schema]?: {
            [Table in TableIn<Database, S>]?: Creator<Database, Schema, Table>;
        };
    } & {
        auth?: {
            users?: UserCreator<Database, Schema>;
        };
    };
    supabase?: SupabaseClientCredentials;
    database?: Configuration;
};
/**
 * Supawright class.
 *
 * This class provides public methods for creating and accessing records required
 * for testing. It also provides a teardown method which removes all records
 * created during the lifecycle of the Supawright instance.
 *
 * Note that the teardown method respects foreign key constraints, so records
 * are removed in an order which respects FK constraints.
 */
declare class Supawright<Database extends GenericDatabase, Schema extends SchemaOf<Database>> {
    private schemas;
    private tables;
    private enums;
    private readonly options?;
    private dependencyGraph;
    private _fixtures;
    static new<Database extends GenericDatabase, Schema extends SchemaOf<Database>>(schemas: [Schema, ...Schema[]], options?: SupawrightOptions<Database, Schema>): Promise<Supawright<Database, Schema>>;
    private constructor();
    record<Table extends TableIn<Database, Schema>>(fixture: Fixture<Database, Schema, Table>): void;
    fixtures(): Fixture<Database, Schema, TableIn<Database, Schema>>[];
    fixtures<S extends Schema, Table extends TableIn<Database, S>>(schema: S, table: Table): Fixture<Database, Schema, Table>[];
    /**
     * Refreshes the current object from the database and updates the Supawright
     * instance's internal store
     * @param schema The schema name of the object to refresh
     * @param table The table name of the object to refresh
     * @param current The current object to refresh
     * @param by What column to search by
     * @returns The updated object
     */
    refresh<S extends Schema, Table extends TableIn<Database, S>, Data extends Select<Database, S, Table>>(schema: S, table: Table, current: Data, by: string & keyof Data): Promise<Data>;
    private getRootTables;
    /**
     * Search the database from the root tables and discover all records
     * associated with the fixtures.
     *
     * Discovered records are recorded against the Supawright instance for
     * later use.
     */
    discoverRecords(): Promise<void>;
    /**
     * Creates a test-ready Supabase client for the given schema.
     * @param schema The schema to use for the client
     * @returns A supabase client for the given schema
     */
    supabase(schema?: Schema): SupabaseClient<Database, Schema>;
    private createDependencyGraph;
    /**
     * Use topology sort to create an ordering of tables in which they can be
     * deleted without violating foreign key constraints.
     * @returns An array of table names in the order they can be deleted.
     */
    private createRecordTypeOrdering;
    /**
     * Remove all records added to the database during the Supawright instance's
     * lifecycle.
     *
     * Handles dependencies between fixtures i.e. removes fixtures in an order
     * which respects foreign key constraints.
     */
    teardown(): Promise<void>;
    /**
     * Creates a new user using `supabase.auth.admin.createUser` and records
     * it in Supawright.
     * @param attributes The user attributes usually passed to
     * `supabase.auth.admin.createUser`
     * @throws If the user could not be created
     */
    createUser(attributes?: AdminUserAttributes): Promise<User>;
    /**
     * Creates a new record in the database.
     * @param schema The schema name of the record to create. Defaults to 'public'
     * @param table The table name of the record to create
     * @param data The data to create the record with
     * @returns The created record
     * @throws If the record could not be created
     * @throws If the record could not be found after creation
     */
    create<S extends 'public' extends Schema ? 'public' : never, Table extends TableIn<Database, 'public'>>(table: S extends 'public' ? Table : never, data?: S extends 'public' ? Partial<Insert<Database, S, Table>> : never): Promise<Select<Database, S, Table>>;
    create<S extends Schema, Table extends TableIn<Database, S>>(schema: S, table: Table, data?: Partial<Insert<Database, S, Table>>): Promise<Select<Database, S, Table>>;
    /**
     * Generate data for the column. First try the user-defined generators,
     * then fall back to built-in generators. If the column is a USER-DEFINED
     * enum, fall back to using a random enum value instead.
     *
     * `type` will be an object if it's a user-defined type, and a string
     * otherwise.
     */
    private getGeneratedValueForType;
}

type ExtensionOptions<Database extends GenericDatabase, Schema extends SchemaOf<Database>> = {
    beforeTeardown?: (params: {
        supawright: Supawright<Database, Schema>;
        page: Page;
    }) => Promise<void>;
};
/**
 * Factory for a test extension that provides a Supawright harness
 * @param schemas Schemas you'd like Supawright to use
 * @param options Options for Supawright
 * @returns A test extension that provides a Supawright harness
 */
declare function withSupawright<Database extends GenericDatabase, Schema extends SchemaOf<Database>>(schemas: [Schema, ...Schema[]], options?: SupawrightOptions<Database, Schema> & ExtensionOptions<Database, Schema>): TestType<PlaywrightTestArgs & PlaywrightTestOptions & {
    supawright: Supawright<Database, Schema>;
}, PlaywrightWorkerArgs & PlaywrightWorkerOptions>;

export { type Creator, Supawright, withSupawright };
