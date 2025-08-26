import '@testing-library/jest-dom';

// Mock electron API for testing
global.electronAPI = {
  invoke: jest.fn(),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
  sendMessage: jest.fn(),
  onMessage: jest.fn(),
  offMessage: jest.fn(),
  onProgress: jest.fn(),
  offProgress: jest.fn(),
  getSystemInfo: jest.fn(),
  getAssetPath: jest.fn(),
  shell: {
    openExternal: jest.fn(),
  },
  fs: {
    exists: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    unlink: jest.fn(),
  },
  path: {
    join: jest.fn(),
    dirname: jest.fn(),
    basename: jest.fn(),
    extname: jest.fn(),
    resolve: jest.fn(),
  },
  app: {
    getPath: jest.fn(),
    getVersion: jest.fn(),
  },
  browser: {
    openInBrowser: jest.fn(),
  },
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    showMessageBox: jest.fn(),
  },
  clipboard: {
    writeText: jest.fn(),
    readText: jest.fn(),
  },
  settings: {
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
  },
};