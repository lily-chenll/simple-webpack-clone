/*
 * This version couldn't handle circular dependencies
 */

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const { Module, Dependency } = require("./Classes");

const FILE_EXTENSIONS = [".js", ".ts", "json"];
const FILES = [
  "index.js",
  "main.js",
  "index.ts",
  "main.ts",
  "index.json",
  "main.json",
];

const visitedFiles = {};

const buildDependencyGraph = (entryFile) => {
  const entryModule = getModule(entryFile, true);
  return entryModule;
};

const getFileWithoutExt = (filePath) => {
  for (let i = 0; i < FILE_EXTENSIONS.length; i++) {
    const newFilePath = filePath + FILE_EXTENSIONS[i];
    if (fs.existsSync(newFilePath)) return newFilePath;
  }
  return "";
};

const getFileInFolder = (folderPath) => {
  for (let i = 0; i < FILES.length; i++) {
    const newFilePath = path.join(folderPath, FILES[i]);
    if (fs.existsSync(newFilePath)) return newFilePath;
  }
  return "";
};

const getFileInNodeModuleFolder = (folderPath) => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(folderPath, "package.json"))
  );
  const entryFile = packageJson.main;
  return path.join(folderPath, entryFile);
};

const getFinalFilePath = (filePath) => {
  // file with extension
  if (path.extname(filePath)) return filePath;

  // check whether it's file without extension
  const fileWithoutExt = getFileWithoutExt(filePath);
  if (fileWithoutExt) return fileWithoutExt;

  // check whether it's a folder (except for node_modules folder)
  if (fs.existsSync(filePath)) {
    const fileInFolder = getFileInFolder(filePath);
    if (fileInFolder) return fileInFolder;
  }
  // check whether it's a folder under node_modules
  //TODO: if no node_modules in the device
  const folderName = path.basename(filePath);
  let newFolderPath = filePath;
  let folderPath = path.resolve(newFolderPath, folderName);
  let upwardFolderLevel = 1;
  while (!fs.existsSync(newFolderPath) || !fs.existsSync(folderPath)) {
    const relativePath = "../".repeat(upwardFolderLevel) + "node_modules";
    newFolderPath = path.resolve(filePath, relativePath);
    folderPath = path.resolve(newFolderPath, folderName);
    upwardFolderLevel++;
  }

  return getFileInNodeModuleFolder(folderPath);
};

const getImportedExports = (node) => {
  const exports = [];
  const specifiers = node.specifiers;

  specifiers.forEach((specifier) => {
    switch (specifier.type) {
      case "ImportDefaultSpecifier":
        exports.push("default");
        break;
      case "ImportSpecifier":
        exports.push(specifier.imported.name);
        break;
      case "ImportNamespaceSpecifier":
      case "ExportNamespaceSpecifier":
        exports.push("*");
        break;
      case "ExportSpecifier":
        exports.push(specifier.local.name);
        break;
      default:
        break;
    }
  });

  if (node.type === "ExportAllDeclaration") exports.push("*");
  return exports;
};

const getAbsolutePath = (absoluteFrom, relativeTo) =>
  path.resolve(path.dirname(absoluteFrom), relativeTo);

const getDependency = (node, filePath) => {
  const importedFilePath = node.source.value;
  const importFileAbsolutePath = getAbsolutePath(filePath, importedFilePath);
  const finalPath = getFinalFilePath(importFileAbsolutePath);

  const curExports = getImportedExports(node);
  let curDependency = visitedFiles[finalPath];
  if (!curDependency) {
    const module = getModule(finalPath);
    curDependency = new Dependency(module, []);
    visitedFiles[finalPath] = curDependency;
  }
  const newExports = Array.from(
    new Set([...curDependency.exports, ...curExports])
  );
  curDependency.exports = newExports;

  return curDependency;
};

const getModule = (filePath, isEntryFile = false) => {
  const sourceCode = String(fs.readFileSync(filePath));
  const fileAST = babel.parseSync(sourceCode);
  const importNodes = fileAST.program.body.filter((node) => node.source);

  const dependencies = importNodes.map((importNode) =>
    getDependency(importNode, filePath)
  );

  const curModule = new Module(filePath, isEntryFile, dependencies);
  return curModule;
};

module.exports = buildDependencyGraph;
