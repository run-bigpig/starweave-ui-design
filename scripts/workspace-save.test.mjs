import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { reactive } from 'vue'
import { createAutosave } from '../src/app/document/autosave/create.ts'
import { workspaceWriteURL, writeWorkspaceFile } from '../src/app/document/io/workspace.ts'

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
afterEach(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow })
const binding = () => ({ documentId: 'document-1', path: 'designs/Test.fig', writeURL: `/design-workspace/${'a'.repeat(43)}` })

test('workspace writes require a same-origin capability URL', () => {
  globalThis.window = { location: { origin: 'http://127.0.0.1:1234' } }
  assert.equal(workspaceWriteURL(binding().writeURL), `http://127.0.0.1:1234${binding().writeURL}`)
  for (const url of ['https://example.com/design-workspace/abc', '/design-workspace/short', `${binding().writeURL}?path=other`]) {
    assert.throws(() => workspaceWriteURL(url), /Invalid/)
  }
})

test('failed disk writes remain visible and can be retried without a picker', async () => {
  globalThis.window = { location: { origin: 'http://127.0.0.1:1234' } }
  const file = binding()
  globalThis.fetch = async () => new Response('access denied', { status: 403 })
  await assert.rejects(writeWorkspaceFile(file, new Uint8Array([1])), /access denied/)
  assert.match(file.error, /403/)
  assert.equal(file.saving, false)
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'PUT')
    assert.deepEqual([...options.body], [2])
    return new Response('{}')
  }
  await writeWorkspaceFile(file, new Uint8Array([2]))
  assert.equal(file.error, undefined)
})

test('autosave queues newer edits while saving and does not advance saved version on failure', async () => {
  const state = reactive({ sceneVersion: 1, autosaveEnabled: true })
  let savedVersion = 0
  let release
  const versions = []
  const autosave = createAutosave({
    state, getSavedVersion: () => savedVersion, hasWritableSource: () => true,
    saveCurrentDocument: async version => {
      versions.push(version)
      if (version === 1) await new Promise(resolve => { release = resolve })
      if (version === 3) throw new Error('disk full')
      savedVersion = version
    }
  })
  try {
    const first = autosave.requestSave(1)
    const second = autosave.requestSave(2)
    release()
    await Promise.all([first, second])
    assert.deepEqual(versions, [1, 2])
    assert.equal(savedVersion, 2)
    await assert.rejects(autosave.requestSave(3), /disk full/)
    assert.equal(savedVersion, 2)
  } finally { autosave.disposeAutosave() }
})
