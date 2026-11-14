import { staticFileUrl } from './fs_utils';
import { createCodeRunnerWorker, WORKER_RELATIVE_PATH } from './codeRunnerWorker';

// QuestIDE code runs in a Web Worker (public/code_runner/worker.js); see
// docs/migration/code-runner-worker.md. The public surface is unchanged from
// the former BrowserWindow + IPC runner: `runCode(code, env)`, `terminate()`
// and `log` events carrying `{ logLevel, arguments }`.

// Export a singleton
const codeRunnerInstance = createCodeRunnerWorker({
  workerUrl: staticFileUrl(WORKER_RELATIVE_PATH),
});
export default codeRunnerInstance;
