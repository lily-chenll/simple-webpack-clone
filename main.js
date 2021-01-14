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

// TODO: other smart way to get it?
const TEST_DIR = path.resolve(__dirname, "../rk-webpack-clone");

let visitedFiles;

const buildDependencyGraph = (entryFile) => {
  visitedFiles = {};

  try {
    const entryModule = getModule(entryFile, true);
    return entryModule;
  } catch (e) {
    throw e;
  }
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
  const folderName = path.basename(filePath);
  let newFolderPath = filePath;
  let folderPath = path.resolve(newFolderPath, folderName);
  let upwardFolderLevel = 1;
  while (!fs.existsSync(newFolderPath) || !fs.existsSync(folderPath)) {
    if (newFolderPath === "/node_modules")
      throw new Error("File doesn't exist");
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
  let finalPath = "";
  try {
    finalPath = getFinalFilePath(importFileAbsolutePath);
  } catch {
    throw new Error(
      `Unable to resolve "${importedFilePath}" from "path/to/.${path.relative(
        TEST_DIR,
        filePath
      )}"`
    );
  }

  const curExports = getImportedExports(node);
  if (!visitedFiles[finalPath]) {
    getModule(finalPath);
  }
  const curDependency = visitedFiles[finalPath];
  const newExports = Array.from(
    new Set([...curDependency.exports, ...curExports])
  );
  curDependency.exports = newExports;

  return curDependency;
};

const getModule = (filePath, isEntryFile = false) => {
  const curDependency = new Dependency(
    new Module(filePath, isEntryFile, []),
    []
  );
  visitedFiles[filePath] = curDependency;
  const sourceCode = String(fs.readFileSync(filePath));
  const fileAST = babel.parseSync(sourceCode);
  const importNodes = fileAST.program.body.filter((node) => node.source);

  let dependencies = [];
  try {
    dependencies = importNodes.map((importNode) =>
      getDependency(importNode, filePath)
    );
  } catch (e) {
    throw e;
  }

  curDependency.module.dependencies = dependencies;
  return curDependency.module;
};

module.exports = buildDependencyGraph;
