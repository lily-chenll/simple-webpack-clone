/*

interface Module {
  filepath: string;
  isEntryFile: boolean;
  dependencies: Array<Dependency>;
}

interface Dependency {
  module: Module;
  exports: Array<string>;
}

*/

export class Dependency {
  constructor(module, exports) {
    this.module = module;
    this.exports = exports;
  }
}

export class Module {
  constructor(filePath, isEntryFile, dependencies) {
    this.filePath = filePath;
    this.isEntryFile = isEntryFile;
    this.dependencies = dependencies;
  }
}
