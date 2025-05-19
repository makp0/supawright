import { test } from '@playwright/test'
import type {
  Page,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType
} from '@playwright/test'
import { SupawrightOptions, Supawright } from './harness'
import { GenericDatabase, SchemaOf } from './types'

type ExtensionOptions<
  Database extends GenericDatabase,
  Schema extends SchemaOf<Database>
> = {
  beforeTeardown?: (params: {
    supawright: Supawright<Database, Schema>
    page: Page
  }) => Promise<void>
  beforeAll?: (params: { supawright: Supawright<Database, Schema>, page: Page }) => Promise<void> | void
}

/**
 * Factory for a test extension that provides a Supawright harness
 * @param schemas Schemas you'd like Supawright to use
 * @param options Options for Supawright
 * @returns A test extension that provides a Supawright harness
 */
export function withSupawright<
  Database extends GenericDatabase,
  Schema extends SchemaOf<Database>
>(
  schemas: [Schema, ...Schema[]],
  options?: SupawrightOptions<Database, Schema> & ExtensionOptions<Database, Schema>
): TestType<
  PlaywrightTestArgs &
    PlaywrightTestOptions & {
      supawright: Supawright<Database, Schema>
    },
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
> {
  let beforeAllHasRun = false;
  return test.extend<{
    supawright: Supawright<Database, Schema>
  }>({
    supawright: async ({ page }, use) => {
      const { beforeTeardown, beforeAll, ...supawrightOptions } = options ?? {}
      let supawright: Supawright<Database, Schema>
      
      try {
        supawright = await Supawright.new(schemas, supawrightOptions)
      } catch (error) {
        throw new Error(`Supawright setup failed`, { cause: error })
      }
      
      try {
        if (!beforeAllHasRun && beforeAll) {
          beforeAllHasRun = true;
          await beforeAll({ supawright, page })
        }
        await use(supawright)
        if (beforeTeardown) {
          await beforeTeardown({ supawright, page })
        }
      } finally {
        try {
          await supawright.teardown()
        } catch (error) {
          throw new Error(`Supawright teardown failed`, { cause: error })
        }
      }
    }
  })
}
