import { expect } from '@playwright/test'
import { withSupawright } from "../src"
import { Database } from "./database"

let calls: string[] = []
const test = withSupawright<Database, 'public'>(['public'], {
  beforeAll: async ({ supawright, page }) => {
    calls.push('beforeAll')
  }
})

test('beforeAll is called once ', async ({ supawright }) => {
  expect(calls).toEqual(['beforeAll'])
})

test('beforeAll is called really once', async ({ supawright }) => {
    expect(calls).toEqual(['beforeAll'])
  })