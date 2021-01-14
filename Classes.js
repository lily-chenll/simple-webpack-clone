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

class Module {
  constructor(filePath, isEntryFile, dependencies) {
    this.filepath = filePath;
    this.isEntryFile = isEntryFile;
    this.dependencies = dependencies;
  }
}

class Dependency {
  constructor(module, exports) {
    this.module = module;
    this.exports = exports;
  }
}

module.exports = { Module, Dependency };
