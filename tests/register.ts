import { registerHooks } from 'node:module'
import ts from 'typescript'

// Node strips .ts itself. Only JSX and Vite's inline CSS need a test adapter.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css?inline')) return { format: 'module', source: 'export default ""', shortCircuit: true }
    if (!new URL(url).pathname.endsWith('.tsx')) return nextLoad(url, context)
    const loaded = nextLoad(url, { ...context, format: 'module' })
    return {
      format: 'module',
      source: ts.transpileModule(String(loaded.source), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
        fileName: url,
      }).outputText,
      shortCircuit: true,
    }
  },
})
